import { resolvePlatformApiBaseUrl } from "@/lib/platform-api-url"
import { requiresPlatformSignIn } from "@/lib/platform-session-recovery"

const API_BASE_URL = resolvePlatformApiBaseUrl(import.meta.env.VITE_API_URL, window.location.hostname, import.meta.env.DEV)
const CSRF_STORAGE_KEY = "prio_csrf"

export interface PlatformAuthUser {
  id: string
  name: string
  displayName: string
  roles: string[]
  username?: string
  email?: string
  emailVerified?: boolean
  phone?: string | null
  hasPassword?: boolean
  mfaEnabled?: boolean
  emailMfaEnabled?: boolean
  mfaRequired?: boolean
  lastLoginProvider?: string | null
}

export interface PlatformAuthSession {
  user: PlatformAuthUser
  sessionExpiresAt?: string | null
}

export type PlatformMfaMethod = "totp" | "recovery" | "email"

export interface PlatformMfaChallenge {
  mfaRequired: true
  challengeToken: string
  expiresAt?: string
  methods?: PlatformMfaMethod[]
}

export interface PlatformEmailMfaDelivery {
  challengeToken: string
  expiresAt: string
  deliveryTarget: string
}

export interface PlatformTotpEnrollment {
  secret: string
  otpAuthUri: string
}

export interface PlatformEmailChangeDelivery {
  challengeId: string
  step: "current_email" | "new_email"
  deliveryTarget: string
  expiresAt: string
}

export class PlatformAuthError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "PlatformAuthError"
    this.status = status
    this.code = code
  }
}

let refreshInFlight: Promise<void> | null = null

async function refreshBrowserSession() {
  try {
    const refresh = async () => {
      await request<{ csrfToken: string }>("/auth/csrf")
      await request<{ user: PlatformAuthUser }, Record<string, never>>("/auth/refresh", { method: "POST", body: {} })
    }
    await refresh()
  } catch (error) {
    if (!(error instanceof PlatformAuthError) || error.status !== 409 || error.code !== "REFRESH_ALREADY_ROTATED") throw error
    await new Promise((resolve) => window.setTimeout(resolve, 100))
    await request<{ csrfToken: string }>("/auth/csrf")
    await request<{ user: PlatformAuthUser }, Record<string, never>>("/auth/refresh", { method: "POST", body: {} })
  }
}

function readStoredCsrfToken() {
  try {
    return window.sessionStorage.getItem(CSRF_STORAGE_KEY) || ""
  } catch {
    return ""
  }
}

function rememberCsrfToken(data: unknown) {
  const token = (data as { csrfToken?: unknown })?.csrfToken
  if (typeof token !== "string" || !token) return

  try {
    window.sessionStorage.setItem(CSRF_STORAGE_KEY, token)
  } catch {
    // The browser cookie remains available when storage is restricted.
  }
}

function readCsrfToken() {
  const entry = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith("prio_csrf="))
  if (entry) return decodeURIComponent(entry.slice("prio_csrf=".length))
  return readStoredCsrfToken()
}

async function request<TResponse, TBody = unknown>(path: string, options: { method?: string; body?: TBody } = {}) {
  const method = (options.method || "GET").toUpperCase()
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method)
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}${path}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(unsafe && readCsrfToken() ? { "X-CSRF-Token": readCsrfToken() } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await response.json().catch(() => ({})) as TResponse & { message?: string; code?: string }
  rememberCsrfToken(data)
  if (!response.ok) throw new PlatformAuthError(data.message || "Authentication request failed.", response.status, data.code)
  return data
}

function assertPlatformAdmin(user: PlatformAuthUser) {
  if (!user.roles.includes("platform_admin")) {
    throw new PlatformAuthError("This account does not have Platform admin access.", 403)
  }
}

export const platformAuth = {
  async refreshSession(): Promise<void> {
    if (!refreshInFlight) {
      refreshInFlight = refreshBrowserSession().finally(() => { refreshInFlight = null })
    }
    return refreshInFlight
  },

  async getSession(): Promise<PlatformAuthSession> {
    let response: { user: PlatformAuthUser; sessionExpiresAt?: string | null }
    try {
      response = await request<{ user: PlatformAuthUser; sessionExpiresAt?: string | null }>("/auth/me")
    } catch (error) {
      if (!(error instanceof PlatformAuthError) || error.status !== 401) throw error
      try {
        await this.refreshSession()
      } catch (refreshError) {
        // No refresh cookie (400) and an invalid/revoked refresh session (401)
        // both mean this browser needs to sign in again.
        if (requiresPlatformSignIn(refreshError)) {
          throw new PlatformAuthError("Your Platform session could not be renewed. Please sign in again.", 401)
        }
        throw refreshError
      }
      response = await request<{ user: PlatformAuthUser; sessionExpiresAt?: string | null }>("/auth/me")
    }
    assertPlatformAdmin(response.user)
    return { user: response.user, sessionExpiresAt: response.sessionExpiresAt }
  },

  async login(identifier: string, password: string): Promise<PlatformAuthSession | PlatformMfaChallenge> {
    const response = await request<PlatformAuthSession & { mfaRequired?: false } | PlatformMfaChallenge, { identifier: string; password: string }>("/auth/login", {
      method: "POST",
      body: { identifier, password },
    })
    if ("mfaRequired" in response && response.mfaRequired) return response
    assertPlatformAdmin(response.user)
    return response
  },

  async sendEmailMfa(challengeToken: string): Promise<PlatformEmailMfaDelivery> {
    const response = await request<{ token: string; expiresAt: string; deliveryTarget: string }, { challengeToken: string }>("/auth/mfa/email/send", {
      method: "POST",
      body: { challengeToken },
    })
    return { challengeToken: response.token, expiresAt: response.expiresAt, deliveryTarget: response.deliveryTarget }
  },

  async verifyMfa(challengeToken: string, code: string, method: PlatformMfaMethod): Promise<PlatformAuthSession> {
    const response = await request<PlatformAuthSession, { challengeToken: string; code: string; method: PlatformMfaMethod }>("/auth/mfa/verify", {
      method: "POST",
      body: { challengeToken, code, method },
    })
    assertPlatformAdmin(response.user)
    return response
  },

  async updateProfile(name: string, displayName: string) {
    return request<{ success: true; message: string; user: unknown }, { name: string; displayName: string }>("/account/profile", {
      method: "PATCH",
      body: { name, displayName },
    })
  },

  async startEmailChange(newEmail: string): Promise<PlatformEmailChangeDelivery> {
    return request<PlatformEmailChangeDelivery, { newEmail: string; method: "current_email" }>("/account/email-change/start", {
      method: "POST",
      body: { newEmail, method: "current_email" },
    })
  },

  async verifyCurrentEmailChange(challengeId: string, code: string): Promise<PlatformEmailChangeDelivery> {
    return request<PlatformEmailChangeDelivery, { challengeId: string; code: string }>("/account/email-change/verify-current", {
      method: "POST",
      body: { challengeId, code },
    })
  },

  async verifyNewEmailChange(challengeId: string, code: string) {
    return request<{ success: true; message: string; user: unknown }, { challengeId: string; code: string }>("/account/email-change/verify-new", {
      method: "POST",
      body: { challengeId, code },
    })
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return request<{ success: true; message: string }, { currentPassword: string; newPassword: string }>("/account/password", {
      method: "POST",
      body: { currentPassword, newPassword },
    })
  },

  async startAuthenticatorEnrollment(currentCode?: string): Promise<PlatformTotpEnrollment> {
    return request<PlatformTotpEnrollment, { currentCode?: string }>("/auth/mfa/enrollment/start", {
      method: "POST",
      body: { ...(currentCode ? { currentCode } : {}) },
    })
  },

  async confirmAuthenticatorEnrollment(code: string): Promise<{ recoveryCodes: string[]; message: string }> {
    return request<{ recoveryCodes: string[]; message: string }, { code: string }>("/auth/mfa/enrollment/confirm", {
      method: "POST",
      body: { code },
    })
  },

  async cancelAuthenticatorEnrollment() {
    return request<{ success: boolean; canceled: boolean }, Record<string, never>>("/auth/mfa/enrollment/cancel", {
      method: "POST",
      body: {},
    })
  },

  async enableEmailOtp() {
    return request<{ success: true; message: string; user: unknown }, Record<string, never>>("/auth/mfa/email/enable", {
      method: "POST",
      body: {},
    })
  },

  async disableEmailOtp(password: string) {
    return request<{ success: true; message: string; user: unknown }, { password: string }>("/auth/mfa/email/disable", {
      method: "POST",
      body: { password },
    })
  },

  async logout() {
    await request<{ success: boolean }>("/auth/logout", { method: "POST", body: {} })
    try {
      window.sessionStorage.removeItem(CSRF_STORAGE_KEY)
    } catch {
      // Ignore storage restrictions; the server session has already been revoked.
    }
  },
}
