export type DeveloperUser = {
  id: string;
  name: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  emailMfaEnabled: boolean;
};

export type DeveloperAccount = { id: string; role: string; status: string };
export type Session = { user: DeveloperUser; developerAccount: DeveloperAccount; csrfToken: string };
export type RegistrationChallenge = { challengeId: string | null; step: "email_otp"; deliveryTarget: string; expiresAt: string };
export type MfaEnrollment = { secret: string; otpAuthUri: string };
export type MfaLoginMethod = "totp" | "email" | "recovery";
export type MfaLoginChallenge = { mfaRequired: true; challengeToken: string; expiresAt: string; methods: MfaLoginMethod[] };
export type DeveloperLoginResult = Session | MfaLoginChallenge;
export type Project = { id: string; name: string; status: string; accessRole?: string; createdAt: string; updatedAt: string };
export type ApiKey = { id: string; projectId: string; name: string; environment: "sandbox" | "production"; keyPrefix: string; scopes: string[]; profileAccess: "all" | "selected"; profileSlugs: string[]; status: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string; updatedAt: string };
export type Profile = { id: string; projectId: string; environment: "sandbox" | "production"; slug: string; displayName: string; directoryStatus: string; directoryContent: { description?: string; websiteUrl?: string }; createdAt: string; updatedAt: string };
export type Queue = { id: string; profileId: string; slug: string; displayName: string; sessionState: string; intakeEnabled: boolean; joiningEnabled: boolean; priorityRatio: number; queuePrefix: string; averageServiceMinutes: number; notificationThreshold: number; resourceVersion: number; createdAt: string; updatedAt: string };
export type DeveloperTicket = { id: string; projectId: string; environment: "sandbox" | "production"; profileId: string; queueId: string; ticketNumber: string; sequence: number; displayLabel: string | null; externalReference: string | null; status: string; statusReason: string | null; calledAt: string | null; servedAt: string | null; skippedAt: string | null; cancelledAt: string | null; unservedAt: string | null; terminalAt: string | null; resourceVersion: number; createdAt: string; updatedAt: string };
export type QueueSnapshot = { queue: Queue; stats: { waitingCount: number; calledCount: number }; current: DeveloperTicket | null; nextUp: DeveloperTicket[]; overflow: DeveloperTicket[]; skipped: DeveloperTicket[] };
export type Webhook = { id: string; projectId: string; environment: "sandbox" | "production"; name: string; url: string; payloadVersion: string; events: string[]; status: string; disabledAt: string | null; createdAt: string; updatedAt: string };
export type Delivery = { id: string; webhookId: string; projectId: string; environment: string; eventId: string; eventType: string; payloadVersion: string; status: string; attemptCount: number; expiresAt: string | null; retryUntil: string | null; lastError: string | null; responseStatus: number | null; sentAt: string | null; manualAttemptCount: number; lastManualAttemptAt: string | null; manualLastError: string | null; manualResponseStatus: number | null; createdAt: string; updatedAt: string };
export type SandboxAllowance = { limit: number; issuedTickets: number; remaining: number; resetAt: string };
export type SandboxTestAccount = { id: string; projectId: string; slot: number; purpose: "developer" | "apple_review"; username: string; email: string; status: "active" | "expired"; expiresAt: string; deviceCount: number; createdAt: string; updatedAt: string };
export type UsageReport = {
  project: Project;
  environment: "sandbox" | "production";
  allowance: SandboxAllowance;
  summary: { issuedTickets: number; activeTickets: number; completedTickets: number };
  daily: Array<{ date: string; issuedTickets: number }>;
  recentTickets: DeveloperTicket[];
};

type RequestOptions = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; csrfToken?: string };

export class DeveloperApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "DeveloperApiError";
    this.status = status;
    this.code = code;
  }
}

// Local development keeps requests same-origin so Vite can proxy `/api` to the
// local developer service. The standalone production portal is hosted on a
// separate origin, so its default must point at the public API service.
const defaultApiOrigin = import.meta.env.DEV ? "" : "https://api.getprio.online";
const apiBase = (import.meta.env.VITE_DEVELOPER_API_ORIGIN || defaultApiOrigin).replace(/\/$/, "");
let csrfTokenCache: string | undefined;
let refreshInFlight: Promise<string | undefined> | undefined;

async function request<T>(path: string, options: RequestOptions = {}, allowRefresh = true): Promise<T> {
  const method = options.method || "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  // The API's CSRF middleware validates the content type for every unsafe
  // request, including body-less POST and DELETE requests such as logout and
  // key revocation. Keep those requests explicitly JSON as well.
  if (options.body !== undefined || !["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers["Content-Type"] = "application/json";
  }
  const csrfToken = options.csrfToken || csrfTokenCache;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const response = await fetch(`${apiBase}/api/developer${path}`, {
    method,
    headers,
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const requestError = new DeveloperApiError(response.status, payload.message || "The request could not be completed.", payload.code || payload.error);
    if (response.status === 401 && allowRefresh && path !== "/refresh") {
      try {
        if (!refreshInFlight) {
          refreshInFlight = request<{ csrfToken?: string }>("/refresh", { method: "POST" }, false)
            .then((refreshed) => {
              if (refreshed.csrfToken) csrfTokenCache = refreshed.csrfToken;
              return refreshed.csrfToken;
            })
            .finally(() => { refreshInFlight = undefined; });
        }
        const refreshedCsrf = await refreshInFlight;
        return request<T>(path, { ...options, csrfToken: refreshedCsrf || csrfToken }, false);
      } catch {
        // Preserve the original error so callers can decide whether to sign out.
      }
    }
    throw requestError;
  }
  if (payload?.csrfToken) csrfTokenCache = payload.csrfToken;
  return payload as T;
}

function sessionFrom(value: { user: DeveloperUser; developerAccount: DeveloperAccount; csrfToken?: string }, prior?: string): Session {
  if (!value.csrfToken && !prior) throw new DeveloperApiError(401, "Your session needs to be refreshed. Please sign in again.");
  if (value.csrfToken) csrfTokenCache = value.csrfToken;
  return { user: value.user, developerAccount: value.developerAccount, csrfToken: value.csrfToken || prior! };
}

function isMfaLoginChallenge(value: DeveloperLoginResult): value is MfaLoginChallenge {
  return Boolean((value as MfaLoginChallenge)?.mfaRequired && (value as MfaLoginChallenge)?.challengeToken);
}

export const developerApi = {
  async me(priorCsrf?: string) { return sessionFrom(await request<{ user: DeveloperUser; developerAccount: DeveloperAccount; csrfToken?: string }>("/me"), priorCsrf); },
  async login(email: string, password: string): Promise<DeveloperLoginResult> {
    const result = await request<{ user: DeveloperUser; developerAccount: DeveloperAccount; csrfToken: string } | MfaLoginChallenge>("/login", { method: "POST", body: { email, password } });
    return isMfaLoginChallenge(result) ? result : sessionFrom(result);
  },
  async sendLoginEmailOtp(challengeToken: string) { return request<{ token: string; expiresAt: string; deliveryTarget: string }>("/mfa/email/send", { method: "POST", body: { challengeToken } }); },
  async verifyMfaLogin(challengeToken: string, method: MfaLoginMethod, code: string, recoveryCode = "") { return sessionFrom(await request<{ user: DeveloperUser; developerAccount: DeveloperAccount; csrfToken: string }>("/mfa/verify", { method: "POST", body: { challengeToken, method, code, recoveryCode } })); },
  async startRegistration(name: string, email: string, password: string) { return request<RegistrationChallenge>("/register/otp", { method: "POST", body: { name, email, password } }); },
  async verifyRegistration(challengeId: string, code: string) { return sessionFrom(await request<{ user: DeveloperUser; developerAccount: DeveloperAccount; csrfToken: string }>("/register/otp/verify", { method: "POST", body: { challengeId, code } })); },
  async resendRegistration(challengeId: string) { return request<RegistrationChallenge>("/register/otp/resend", { method: "POST", body: { challengeId } }); },
  async logout(csrfToken: string) { return request<void>("/logout", { method: "POST", csrfToken }); },
  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string, csrfToken: string) { return request<{ success: boolean; message: string }>("/password", { method: "POST", body: { currentPassword, newPassword, confirmPassword }, csrfToken }); },
  async startMfaEnrollment(currentCode: string, csrfToken: string) { return request<MfaEnrollment>("/mfa/enrollment/start", { method: "POST", body: { currentCode }, csrfToken }); },
  async confirmMfaEnrollment(code: string, csrfToken: string) { return request<{ success: boolean; recoveryCodes: string[]; user: DeveloperUser; message: string }>("/mfa/enrollment/confirm", { method: "POST", body: { code }, csrfToken }); },
  async cancelMfaEnrollment(csrfToken: string) { return request<{ success: boolean; canceled: boolean; message: string }>("/mfa/enrollment/cancel", { method: "POST", csrfToken }); },
  async enableEmailMfa(csrfToken: string) { return request<{ success: boolean; user: DeveloperUser; message: string }>("/mfa/email/enable", { method: "POST", csrfToken }); },
  async disableEmailMfa(password: string, csrfToken: string) { return request<{ success: boolean; user: DeveloperUser; message: string }>("/mfa/email/disable", { method: "POST", body: { password }, csrfToken }); },
  async disableMfa(password: string, code: string, recoveryCode: string, csrfToken: string) { return request<{ success: boolean; user: DeveloperUser; message: string }>("/mfa/disable", { method: "POST", body: { password, code, recoveryCode }, csrfToken }); },
  async projects() { return request<{ projects: Project[] }>("/projects"); },
  async sandboxAllowance(projectId: string) { return request<{ project: Project; allowance: SandboxAllowance }>(`/projects/${projectId}/sandbox/allowance`); },
  async testAccounts(projectId: string) { return request<{ project: Project; testAccounts: SandboxTestAccount[]; limit: number }>(`/projects/${projectId}/sandbox/test-accounts`); },
  async createTestAccount(projectId: string, csrfToken: string) { return request<{ testAccount: SandboxTestAccount; credentials: { username: string; email: string; password: string; expiresAt: string }; warning: string }>(`/projects/${projectId}/sandbox/test-accounts`, { method: "POST", csrfToken }); },
  async resetTestAccount(projectId: string, accountId: string, csrfToken: string) { return request<{ testAccount: SandboxTestAccount; credentials: { username: string; email: string; password: string; expiresAt: string }; warning: string }>(`/projects/${projectId}/sandbox/test-accounts/${accountId}/reset`, { method: "POST", csrfToken }); },
  async usage(projectId: string) { return request<UsageReport>(`/projects/${projectId}/usage?environment=sandbox`); },
  async createProject(name: string, csrfToken: string) { return request<{ project: Project }>("/projects", { method: "POST", body: { name }, csrfToken }); },
  async archiveProject(id: string, csrfToken: string) { return request<{ project: Project }>(`/projects/${id}`, { method: "DELETE", csrfToken }); },
  async keys(projectId: string) { return request<{ project: Project; keys: ApiKey[] }>(`/projects/${projectId}/keys`); },
  async createKey(projectId: string, body: { name: string; environment: "sandbox"; scopes: string[]; profileAccess: "all" | "selected"; profileSlugs: string[] }, csrfToken: string) { return request<{ key: ApiKey; secret: string; warning: string }>(`/projects/${projectId}/keys`, { method: "POST", body, csrfToken }); },
  async revokeKey(projectId: string, keyId: string, csrfToken: string) { return request<{ key: ApiKey }>(`/projects/${projectId}/keys/${keyId}`, { method: "DELETE", csrfToken }); },
  async profiles(projectId: string) { return request<{ project: Project; environment: string; profiles: Profile[] }>(`/projects/${projectId}/profiles?environment=sandbox`); },
  async createProfile(projectId: string, body: { slug: string; displayName: string }, csrfToken: string) { return request<{ profile: Profile }>(`/projects/${projectId}/profiles`, { method: "POST", body: { ...body, environment: "sandbox" }, csrfToken }); },
  async updateProfile(projectId: string, profileSlug: string, body: { displayName?: string; directoryContent?: { description: string; websiteUrl: string } }, csrfToken: string) { return request<{ profile: Profile }>(`/projects/${projectId}/profiles/${encodeURIComponent(profileSlug)}`, { method: "PATCH", body: { ...body, environment: "sandbox" }, csrfToken }); },
  async deleteProfile(projectId: string, profileSlug: string, csrfToken: string) { return request<{ profile: Profile }>(`/projects/${projectId}/profiles/${encodeURIComponent(profileSlug)}?environment=sandbox`, { method: "DELETE", csrfToken }); },
  async queues(projectId: string, profileSlug: string) { return request<{ profile: Profile; queues: Queue[]; snapshots?: QueueSnapshot[] }>(`/projects/${projectId}/profiles/${encodeURIComponent(profileSlug)}/queues?environment=sandbox`); },
  async createQueue(projectId: string, profileSlug: string, body: { slug: string; displayName: string; sessionState: string; intakeEnabled: boolean; queuePrefix?: string; averageServiceMinutes: number; notificationThreshold: number }, csrfToken: string) { return request<{ queue: Queue }>(`/projects/${projectId}/profiles/${encodeURIComponent(profileSlug)}/queues`, { method: "POST", body: { ...body, environment: "sandbox" }, csrfToken }); },
  async updateQueue(projectId: string, profileSlug: string, queueSlug: string, body: { displayName?: string; sessionState?: string; intakeEnabled?: boolean; queuePrefix?: string; averageServiceMinutes?: number; notificationThreshold?: number; resourceVersion?: number }, csrfToken: string) { return request<{ queue: Queue }>(`/projects/${projectId}/profiles/${encodeURIComponent(profileSlug)}/queues/${encodeURIComponent(queueSlug)}`, { method: "PATCH", body: { ...body, environment: "sandbox" }, csrfToken }); },
  async deleteQueue(projectId: string, profileSlug: string, queueSlug: string, csrfToken: string) { return request<{ queue: Queue }>(`/projects/${projectId}/profiles/${encodeURIComponent(profileSlug)}/queues/${encodeURIComponent(queueSlug)}?environment=sandbox`, { method: "DELETE", csrfToken }); },
  async webhooks(projectId: string) { return request<{ project: Project; webhooks: Webhook[] }>(`/projects/${projectId}/webhooks`); },
  async createWebhook(projectId: string, body: { name: string; url: string; events: string[] }, csrfToken: string) { return request<{ webhook: Webhook; secret: string; warning: string }>(`/projects/${projectId}/webhooks`, { method: "POST", body: { ...body, environment: "sandbox", payloadVersion: 1 }, csrfToken }); },
  async disableWebhook(projectId: string, webhookId: string, csrfToken: string) { return request<{ webhook: Webhook }>(`/projects/${projectId}/webhooks/${webhookId}`, { method: "DELETE", csrfToken }); },
  async rotateWebhook(projectId: string, webhookId: string, csrfToken: string, immediate = false) { return request<{ webhook: Webhook; secret: string; warning: string }>(`/projects/${projectId}/webhooks/${webhookId}/rotate-secret${immediate ? "/compromised" : ""}`, { method: "POST", csrfToken }); },
  async deliveries(projectId: string, webhookId: string) { return request<{ webhook: Webhook; deliveries: Delivery[] }>(`/projects/${projectId}/webhooks/${webhookId}/deliveries?limit=20`); },
  async replayDelivery(projectId: string, webhookId: string, deliveryId: string, csrfToken: string) { return request<{ replay: { status: string; responseStatus?: number; error?: string }; delivery: Delivery }>(`/projects/${projectId}/webhooks/${webhookId}/deliveries/${deliveryId}/replay`, { method: "POST", csrfToken }); }
};
