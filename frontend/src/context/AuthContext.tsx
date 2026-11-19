import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Modal, Stack, Text, Title } from "@mantine/core";
import type {
  AuthActionResponse,
  AuthIntent,
  AuthLoginResponse,
  AuthResponse,
  CompleteVendorOnboardingRequest,
  EmailMfaChallengeResponse,
  LoginRequest,
  OAuthProviderAvailability,
  OAuthProviderId,
  OAuthProvidersResponse,
  PasswordChangeRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RegisterCustomerRequest,
  RegisterVendorRequest,
  UserSummary
} from "@shared";
import { API_BASE_URL, apiRequest, setAuthHandlers } from "../api/client";
import type { AuthContextValue } from "./AuthContext.types";
import { isCurrentAuthRevision } from "./authSessionRevision";

const AuthContext = createContext<AuthContextValue | null>(null);
const COOKIE_SESSION = "cookie-session";
const AUTH_SYNC_KEY = "prio-auth-session-sync";
const AUTH_SYNC_REVISION_KEY = "prio-auth-session-revision";
const AUTH_SYNC_CHANNEL = "prio-auth-session";
const EMPTY_OAUTH_PROVIDERS: OAuthProviderAvailability = {
  google: false,
  facebook: false,
  apple: false
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [oauthProviders, setOauthProviders] =
    useState<OAuthProviderAvailability>(EMPTY_OAUTH_PROVIDERS);
  const [oauthLoading, setOauthLoading] = useState(true);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [expiryWarningOpen, setExpiryWarningOpen] = useState(false);
  const sourceId = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now())
  );
  const revision = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const readRevision = () => {
    if (typeof window === "undefined") return revision.current;
    const value = Number(window.localStorage.getItem(AUTH_SYNC_REVISION_KEY));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  };
  const nextRevision = () => {
    const next = Math.max(revision.current, readRevision()) + 1;
    revision.current = next;
    try { window.localStorage.setItem(AUTH_SYNC_REVISION_KEY, String(next)); } catch { /* storage is optional */ }
    return next;
  };
  type SessionData = { user: UserSummary; sessionExpiresAt?: string | Date | null };
  const applySession = (data: SessionData) => {
    setToken(COOKIE_SESSION);
    setRefreshToken(COOKIE_SESSION);
    setUser(data.user);
    setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null);
  };
  const clearSession = () => {
    setToken("");
    setRefreshToken("");
    setUser(null);
    setSessionExpiresAt(null);
  };
  const publishAuthChange = (action: "signed-in" | "signed-out") => {
    const event = { source: sourceId.current, revision: nextRevision(), action };
    try { window.localStorage.setItem(AUTH_SYNC_KEY, JSON.stringify(event)); } catch { /* storage is optional */ }
    try {
      if (channelRef.current) channelRef.current.postMessage(event);
      else { const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL); channel.postMessage(event); channel.close(); }
    } catch { /* unsupported */ }
  };

  useEffect(() => {
    revision.current = readRevision();
    let active = true;
    const syncFromPeer = (event: unknown) => {
      const value = event as Partial<{ source: string; revision: number; action: "signed-in" | "signed-out" }>;
      if (!value || value.source === sourceId.current || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision)) return;
      const peerRevision: number = value.revision;
      if (peerRevision <= revision.current) return;
      revision.current = peerRevision;
      if (value.action === "signed-out") { clearSession(); return; }
      const observed = peerRevision;
      apiRequest<{ user: UserSummary; sessionExpiresAt?: string | Date | null }>("/auth/me", { skipAuthRefresh: true })
        .then((data) => { if (active && revision.current === observed) applySession(data); })
        .catch(() => { if (active && revision.current === observed) clearSession(); });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_SYNC_KEY || !event.newValue) return;
      try { syncFromPeer(JSON.parse(event.newValue)); } catch { /* ignore unrelated storage values */ }
    };
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel(AUTH_SYNC_CHANNEL); channelRef.current = channel; channel.onmessage = (event) => syncFromPeer(event.data); } catch { /* unsupported */ }
    window.addEventListener("storage", onStorage);
    return () => { active = false; window.removeEventListener("storage", onStorage); channel?.close(); channelRef.current = null; };
  }, []);

  useEffect(() => {
    apiRequest<OAuthProvidersResponse>("/auth/oauth/providers")
      .then((data) => {
        setOauthProviders({
          ...EMPTY_OAUTH_PROVIDERS,
          ...(data.providers || {})
        });
      })
      .catch(() => {
        setOauthProviders(EMPTY_OAUTH_PROVIDERS);
      })
      .finally(() => {
        setOauthLoading(false);
      });
  }, []);

  useEffect(() => {
    localStorage.removeItem("prio-auth");
    const observed = revision.current;
    apiRequest<{ user: UserSummary; sessionExpiresAt?: string | Date | null }>("/auth/me", { skipAuthRefresh: true })
      .then((data) => {
        if (revision.current !== observed) return;
        applySession(data);
      })
      .catch(() => {
        if (revision.current === observed) clearSession();
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!sessionExpiresAt || !user) { setExpiryWarningOpen(false); return; }
    const delay = Math.max(0, sessionExpiresAt - Date.now() - 5 * 60_000);
    const timer = window.setTimeout(() => setExpiryWarningOpen(true), delay);
    return () => window.clearTimeout(timer);
  }, [sessionExpiresAt, user]);

  useEffect(() => {
    async function refreshAccessToken() {
      if (!refreshToken) {
        return null;
      }

      const observed = nextRevision();
      try {
        const data = await apiRequest<AuthResponse, Record<string, never>>(
          "/auth/refresh",
          {
            method: "POST",
            body: {},
            skipAuthRefresh: true
          }
        );
        // A newer tab may already own the session. Retry with the shared cookie
        // instead of allowing apiRequest to clear that newer state.
        if (!isCurrentAuthRevision(revision.current, observed)) return COOKIE_SESSION;
        applySession(data);
        publishAuthChange("signed-in");
        setExpiryWarningOpen(false);
        return COOKIE_SESSION;
      } catch {
        if (!isCurrentAuthRevision(revision.current, observed)) return COOKIE_SESSION;
        clearSession();
        publishAuthChange("signed-out");
        return null;
      }
    }

    setAuthHandlers({
      refreshToken: refreshAccessToken,
      onAuthFailure: clearSession
    });

    return () => {
      setAuthHandlers({
        refreshToken: null,
        onAuthFailure: null
      });
    };
  }, [refreshToken]);

  const value: AuthContextValue = {
    token,
    refreshToken,
    user,
    loading,
    oauthProviders,
    oauthLoading,
    async login(credentials: LoginRequest): Promise<AuthLoginResponse> {
      const observed = nextRevision();
      const data = await apiRequest<AuthLoginResponse, LoginRequest>("/auth/login", {
        method: "POST",
        body: credentials
      });
      if ("mfaRequired" in data) {
        return data;
      }
      if (!isCurrentAuthRevision(revision.current, observed)) return data;
      applySession(data);
      publishAuthChange("signed-in");
      return data;
    },
    async verifyMfaChallenge(payload): Promise<AuthResponse> {
      const observed = nextRevision();
      const data = await apiRequest<AuthResponse, typeof payload>("/auth/mfa/verify", {
        method: "POST",
        body: payload
      });
      if (!isCurrentAuthRevision(revision.current, observed)) return data;
      applySession(data);
      publishAuthChange("signed-in");
      return data;
    },
    async sendEmailMfaCode(payload): Promise<EmailMfaChallengeResponse> {
      return apiRequest<EmailMfaChallengeResponse, typeof payload>("/auth/mfa/email/send", {
        method: "POST",
        body: payload
      });
    },
    async registerVendor(payload: RegisterVendorRequest): Promise<AuthResponse> {
      const observed = nextRevision();
      const data = await apiRequest<AuthResponse, RegisterVendorRequest>("/auth/register/vendor", {
        method: "POST",
        body: payload
      });
      if (!isCurrentAuthRevision(revision.current, observed)) return data;
      applySession(data);
      publishAuthChange("signed-in");
      return data;
    },
    async completeVendorOnboarding(
      payload: CompleteVendorOnboardingRequest
    ): Promise<AuthResponse> {
      const observed = nextRevision();
      const data = await apiRequest<AuthResponse, CompleteVendorOnboardingRequest>(
        "/auth/register/vendor/complete",
        {
          method: "POST",
          body: payload,
          token
        }
      );
      if (!isCurrentAuthRevision(revision.current, observed)) return data;
      applySession(data);
      publishAuthChange("signed-in");
      return data;
    },
    async registerCustomer(payload: RegisterCustomerRequest): Promise<AuthResponse> {
      const observed = nextRevision();
      const data = await apiRequest<AuthResponse, RegisterCustomerRequest>(
        "/auth/register/customer",
        {
          method: "POST",
          body: payload
        }
      );
      if (!isCurrentAuthRevision(revision.current, observed)) return data;
      applySession(data);
      publishAuthChange("signed-in");
      return data;
    },
    async requestPasswordReset(payload: PasswordResetRequest): Promise<AuthActionResponse> {
      return apiRequest<AuthActionResponse, PasswordResetRequest>("/auth/password-reset/request", {
        method: "POST",
        body: payload
      });
    },
    async confirmPasswordReset(payload: PasswordResetConfirmRequest): Promise<AuthActionResponse> {
      return apiRequest<AuthActionResponse, PasswordResetConfirmRequest>("/auth/password-reset/confirm", {
        method: "POST",
        body: payload
      });
    },
    async changePassword(payload: PasswordChangeRequest): Promise<AuthActionResponse> {
      const result = await apiRequest<AuthActionResponse, PasswordChangeRequest>("/account/password", {
        method: "POST",
        body: payload,
        token,
        skipAuthRefresh: true
      });
      clearSession();
      publishAuthChange("signed-out");
      return result;
    },
    async refreshUser(): Promise<UserSummary | null> {
      const observed = nextRevision();
      const data = await apiRequest<{ user: UserSummary; sessionExpiresAt?: string | Date | null }>("/auth/me", { token: undefined });
      if (!isCurrentAuthRevision(revision.current, observed)) return null;
      applySession(data);
      publishAuthChange("signed-in");
      return data.user;
    },
    acceptAuthToken(_nextToken: string, _nextRefreshToken: string) {
      nextRevision();
      setLoading(true);
      setToken(COOKIE_SESSION);
      setRefreshToken(COOKIE_SESSION);
      publishAuthChange("signed-in");
    },
    startOAuth(provider: OAuthProviderId, intent: AuthIntent, returnPath?: string) {
      if (!oauthProviders[provider]) {
        throw new Error(`${provider} sign-in is not available right now.`);
      }

      const startUrl = new URL(`${API_BASE_URL}/auth/oauth/${provider}/start`);
      startUrl.searchParams.set("intent", intent);
      if (returnPath) startUrl.searchParams.set("next", returnPath);
      window.location.assign(startUrl.toString());
    },
    async logout() {
      const observed = nextRevision();
      try {
        if (refreshToken) {
          await apiRequest<{ success: boolean }, Record<string, never>>("/auth/logout", {
            method: "POST",
            body: {},
            skipAuthRefresh: true
          });
        }
      } catch {
        // Ignore logout transport errors and clear local auth state anyway.
      } finally {
        if (isCurrentAuthRevision(revision.current, observed)) {
          clearSession();
          publishAuthChange("signed-out");
        }
      }
    }
  };

  return <AuthContext.Provider value={value}>{children}<Modal centered closeOnClickOutside={false} closeOnEscape={false} opened={expiryWarningOpen} onClose={() => undefined} title={<div><Text c="orange" fw={700} size="xs">SESSION SECURITY</Text><Title order={3}>Your session will expire soon</Title></div>}><Stack><Text>For your security, you’ll be signed out soon. Continue your session to keep working without losing your place.</Text><Button onClick={async () => { const observed = nextRevision(); const next = await apiRequest<AuthResponse, Record<string, never>>("/auth/refresh", { method: "POST", body: {}, skipAuthRefresh: true }); if (revision.current === observed) { applySession(next); publishAuthChange("signed-in"); setExpiryWarningOpen(false); } }}>Continue session</Button><Button variant="subtle" onClick={() => void value.logout()}>Sign out now</Button></Stack></Modal></AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
