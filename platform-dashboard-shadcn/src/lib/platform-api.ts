import type {
  DeveloperProjectGovernanceReadModel,
  DeveloperProjectSummary,
  DeveloperRateLimit,
  PlatformApi,
  PlatformOverviewReadModel,
  PlatformServiceHealthReadModel,
  PlatformQueueOperationsReadModel,
  PlatformTenantsReadModel,
  PlatformTenantInspection,
  PlatformTenantCreditLot,
  PlatformUsersReadModel,
  PlatformUserDetails,
  PlatformAccountDeletionQueue,
  AccountDeletionTaskKind,
  PlatformAuditReadModel,
  PlatformBillingReadModel,
  PlatformModerationReadModel,
  PlatformSettingsReadModel,
  PlatformReleaseReadinessReadModel,
  PlatformViewerContext,
  SandboxCredentialResult,
  TenantEntitlementPreview,
  UserPasswordResetPreview,
  UserSessionRevokePreview,
  ReadModelModule,
  ReadModelMeta,
  PlatformDeveloperApiKey,
  PlatformDeveloperApiKeyReview,
} from "@/lib/platform-contracts"
import { platformAuth } from "@/lib/platform-auth"
import { resolvePlatformApiBaseUrl } from "@/lib/platform-api-url"

const API_BASE_URL = resolvePlatformApiBaseUrl(import.meta.env.VITE_API_URL, window.location.hostname, import.meta.env.DEV)

async function fetchWithSessionRefresh(request: () => Promise<Response>) {
  const response = await request()
  if (response.status !== 401) return response

  try {
    await platformAuth.refreshSession()
  } catch (error) {
    // A missing or invalid refresh cookie means the original request's 401
    // should drive the normal signed-out flow. Preserve other failures.
    if (error instanceof Error && "status" in error && [400, 401].includes(Number(error.status))) return response
    throw error
  }
  return request()
}

const meta = (scope: ReadModelMeta["scope"]): ReadModelMeta => ({
  requestId: `fixture-${scope}-001`,
  generatedAt: "2026-09-26T12:00:00.000Z",
  scope,
  environment: "all",
  schemaVersion: "platform-read-model.v1",
})

const available = <T>(data: T, scope: ReadModelMeta["scope"]): ReadModelModule<T> & { meta: ReadModelMeta } => ({
  state: "available",
  generatedAt: meta(scope).generatedAt,
  data,
  meta: meta(scope),
})

const overview: PlatformOverviewReadModel = {
  metrics: [
    { label: "Needs attention", value: "12", trend: "4 new since yesterday", trendTone: "attention" },
    { label: "Active tenants", value: "248", trend: "+6.4% this month", trendTone: "positive" },
    { label: "Queue health", value: "98.7%", trend: "+0.8% over 7 days", trendTone: "positive" },
    { label: "API projects", value: "36", trend: "8 awaiting approval", trendTone: "neutral" },
  ],
  attentionCount: 12,
  attentionItems: [
    { id: "approval-1", title: "8 tenants awaiting approval", detail: "Pending tenant approvals", area: "tenant", actionLabel: "Review", severity: "warning" },
    { id: "webhook-1", title: "3 webhook deliveries failed", detail: "Developer API · last 24 hours", area: "developer", actionLabel: "Action", severity: "critical" },
    { id: "suspension-1", title: "1 webhook receiver suspended", detail: "Developer API · active suspensions", area: "developer", actionLabel: "Action", severity: "critical" },
  ],
  activity: [
    { date: "Sep 13", events: 320, successfulEvents: 250 },
    { date: "Sep 15", events: 410, successfulEvents: 310 },
    { date: "Sep 17", events: 380, successfulEvents: 342 },
    { date: "Sep 19", events: 520, successfulEvents: 405 },
    { date: "Sep 21", events: 470, successfulEvents: 430 },
    { date: "Sep 23", events: 620, successfulEvents: 515 },
    { date: "Sep 26", events: 710, successfulEvents: 598 },
  ],
  recentActivity: [
    { id: "activity-1", event: "Production approval submitted", scope: "Acme Clinics", status: "review", occurredAt: "8 min ago" },
    { id: "activity-2", event: "Queue day reconciled", scope: "Luna Dental", status: "complete", occurredAt: "21 min ago" },
    { id: "activity-3", event: "Webhook delivery suspended", scope: "proj_7fd3", status: "action", occurredAt: "34 min ago" },
  ],
}

const projectGovernance: DeveloperProjectGovernanceReadModel = {
  projectId: "proj_7fd3",
  projectName: "GetPrio Sandbox Integration",
  owner: "Developer workspace owner",
  environments: [
    { name: "sandbox", readiness: "ready", lastObservedAt: "4 min ago" },
    { name: "production", readiness: "needs-review", lastObservedAt: "8 min ago" },
  ],
  sandboxAccounts: { active: 2, limit: 2, appleReview: "active", appleReviewAccount: { id: "test_account_1", username: "sb_review01", email: "sb-review01@test.getprio.invalid", status: "active", expiresAt: "2026-10-26T12:00:00.000Z", deviceCount: 0 } },
  webhookHealth: {
    state: "degraded",
    lastObservedAt: "4 min ago",
    suspension: null,
    registrations: [{ id: "webhook_1", name: "Production receiver", status: "active", events: ["queue.session.opened", "ticket.status.changed"], payloadVersion: 1 }],
    deliveryStats: { sent: 124, failed: 3, pending: 2 },
  },
  productionApproval: "in-review",
  productionApprovalDetail: { status: "pending_review", pendingSubmissionId: "submission_12", lastFeedback: null },
  rateLimits: {
    sandbox: { projectId: "proj_7fd3", environment: "sandbox", readLimitPerMinute: 600, writeLimitPerMinute: 120, updatedByUserId: null, updatedAt: null },
    production: { projectId: "proj_7fd3", environment: "production", readLimitPerMinute: 300, writeLimitPerMinute: 60, updatedByUserId: "user_1001", updatedAt: "2026-09-26T11:45:00.000Z" },
  },
}

const projects: DeveloperProjectSummary[] = [{ id: "proj_7fd3", name: "GetPrio Sandbox Integration", status: "active", productionApproval: "in-review" }]

const fixtureDeletionRequests: PlatformAccountDeletionQueue = { requests: [{
  id: "8d1b2ca3-85e6-4e4f-8c65-b4b52177a03f",
  userId: "user_2041",
  accountName: "Alex Morgan",
  accountEmail: "alex.morgan@example.test",
  status: "review_required",
  requestedAt: "2026-09-26T08:30:00.000Z",
  dueAt: "2026-10-26T08:30:00.000Z",
  completedAt: null,
  retentionNotice: null,
  policyVersion: "2026-09-07",
  attempts: 1,
  nextAttemptAt: "2026-09-26T08:35:00.000Z",
  lastErrorCode: "DELETION_PREREQUISITES_INCOMPLETE",
  acknowledgementSentAt: "2026-09-26T08:30:01.000Z",
  completionSentAt: null,
  tasks: [
    { kind: "personal_data_inventory", label: "Personal data inventory", status: "completed", evidence: "Inventory review INV-104", completedAt: "2026-09-26T09:00:00.000Z" },
    { kind: "object_storage_versions_and_caches", label: "Object storage, versions, and caches", status: "pending", evidence: null, completedAt: null },
    { kind: "supplier_data", label: "Supplier data", status: "pending", evidence: null, completedAt: null },
    { kind: "financial_and_legal_retention", label: "Financial and legal retention", status: "pending", evidence: null, completedAt: null },
    { kind: "backup_disposal", label: "Backup disposal", status: "pending", evidence: null, completedAt: null },
  ],
}] }

const fixtureDeveloperApiKeys: PlatformDeveloperApiKey[] = [
  { id: "key_prod_001", name: "Production server", environment: "production", keyPrefix: "gp_live_…a91f", scopes: ["queues:read", "queues:write"], status: "active", createdAt: "2026-08-12T10:00:00.000Z", lastUsedAt: "2026-09-28T10:12:00.000Z", revokedAt: null, revokeReason: null, activity: { keyId: "key_prod_001", requests: 286, reads: 224, writes: 62, clientErrors: 18, serverErrors: 0, rateLimited: 4, authFailures: 0, lastSeenAt: "2026-09-28T10:12:00.000Z" }, signal: "review" },
  { id: "key_sbx_002", name: "Sandbox integration", environment: "sandbox", keyPrefix: "gp_sbx_…c70b", scopes: ["queues:read"], status: "active", createdAt: "2026-09-10T11:00:00.000Z", lastUsedAt: "2026-09-27T15:10:00.000Z", revokedAt: null, revokeReason: null, activity: { keyId: "key_sbx_002", requests: 42, reads: 42, writes: 0, clientErrors: 0, serverErrors: 0, rateLimited: 0, authFailures: 0, lastSeenAt: "2026-09-27T15:10:00.000Z" }, signal: "normal" },
  { id: "key_old_003", name: "Previous production key", environment: "production", keyPrefix: "gp_live_…e22a", scopes: ["queues:read"], status: "revoked", createdAt: "2026-06-02T08:00:00.000Z", lastUsedAt: "2026-08-01T17:00:00.000Z", revokedAt: "2026-08-02T09:00:00.000Z", revokeReason: "Routine key rotation", activity: { keyId: "key_old_003", requests: 0, reads: 0, writes: 0, clientErrors: 0, serverErrors: 0, rateLimited: 0, authFailures: 0, lastSeenAt: null }, signal: "normal" },
]

const serviceHealth: PlatformServiceHealthReadModel = {
  services: [
    { id: "platform-api", name: "Platform API", description: "Authenticated control-plane read models", state: "healthy", observedAt: "Just now", freshness: "live", evidence: "Request served with database-backed aggregate", metric: "200 response" },
    { id: "queue-reconciliation", name: "Queue reconciliation", description: "Queue-day lifecycle and recovery workers", state: "healthy", observedAt: "2 min ago", freshness: "recent", evidence: "Recent queue days have no reconciliation errors", metric: "98.7% healthy" },
    { id: "developer-api", name: "Developer API", description: "Ticket issuance, queue snapshots, and webhooks", state: "degraded", observedAt: "4 min ago", freshness: "recent", evidence: "Webhook delivery failures observed in the last 24 hours", metric: "3 failed deliveries" },
    { id: "mobile-push", name: "Mobile push pipeline", description: "Notification outbox feeding vendor and sandbox clients", state: "unknown", observedAt: "Not observed", freshness: "not-observed", evidence: "No mobile heartbeat is included in this read model", metric: "Heartbeat required" },
  ],
}

const queueOperations: PlatformQueueOperationsReadModel = {
  metrics: [
    { label: "Open queue days", value: "42", trend: "Current operational scope", trendTone: "neutral" },
    { label: "Needs reconciliation", value: "1", trend: "Review before repair", trendTone: "attention" },
    { label: "Unresolved tickets", value: "86", trend: "Waiting, called, or skipped", trendTone: "neutral" },
    { label: "Notification backlog", value: "4", trend: "Pending or retrying jobs", trendTone: "attention" },
  ],
  queueDays: [
    { id: "queue-1842", tenantId: "tenant_7fa2", tenantName: "Acme Clinics", locationId: "loc_31a9", locationName: "Downtown Clinic", businessDate: "2026-09-26", state: "open", unresolvedTickets: 34, notificationBacklog: 0, reconciliationAttempts: 0, lastReconciliationError: null, attention: "healthy" },
    { id: "queue-1839", tenantId: "tenant_8c11", tenantName: "Luna Dental", locationId: "loc_19bb", locationName: "Central Clinic", businessDate: "2026-09-26", state: "open", unresolvedTickets: 18, notificationBacklog: 4, reconciliationAttempts: 0, lastReconciliationError: null, attention: "review" },
    { id: "queue-1827", tenantId: "tenant_4ea8", tenantName: "Northstar Wellness", locationId: "loc_2240", locationName: "Northstar Main", businessDate: "2026-09-25", state: "open", unresolvedTickets: 7, notificationBacklog: 0, reconciliationAttempts: 2, lastReconciliationError: "Queue close could not be reconciled after the provider response timed out.", attention: "action" },
  ],
}

const tenants: PlatformTenantsReadModel = {
  metrics: [
    { label: "Active tenants", value: "248", trend: "Current platform scope", trendTone: "positive" },
    { label: "Pending approval", value: "8", trend: "Review before activation", trendTone: "attention" },
    { label: "Without plan signal", value: "3", trend: "Needs billing review", trendTone: "attention" },
  ],
  tenants: [
    { id: "tenant_7fa2", name: "Acme Clinics", slug: "acme-clinics", owner: "ops@acme.example", active: true, plan: "pro", tickets: 1248, vendorApproval: "approved", createdAt: "2026-06-12T08:20:00.000Z" },
    { id: "tenant_8c11", name: "Luna Dental", slug: "luna-dental", owner: "owner@luna.example", active: true, plan: "free", tickets: 482, vendorApproval: "approved", createdAt: "2026-07-03T11:05:00.000Z" },
    { id: "tenant_4ea8", name: "Northstar Wellness", slug: "northstar-wellness", owner: "hello@northstar.example", active: false, plan: null, tickets: 0, vendorApproval: "pending", createdAt: "2026-09-18T15:42:00.000Z" },
  ],
}

const fixtureTenantOverrides: Record<string, PlatformTenantInspection["overrides"]> = {}
const fixtureTenantLots: Record<string, PlatformTenantCreditLot[]> = {}

const users: PlatformUsersReadModel = {
  metrics: [
    { label: "Users in scope", value: "1,842", trend: "Platform-wide account view", trendTone: "neutral" },
    { label: "MFA required", value: "6", trend: "Privileged access boundary", trendTone: "positive" },
    { label: "Account attention", value: "3", trend: "Locked or deletion requested", trendTone: "attention" },
  ],
  users: [
    { id: "user_1001", name: "Carlo Abella", roles: ["platform_admin"], state: "active", emailVerified: true, mfa: "required", lastLoginProvider: "password" },
    { id: "user_1027", name: "Mara Santos", roles: ["vendor_admin"], state: "active", emailVerified: true, mfa: "enabled", lastLoginProvider: "google" },
    { id: "user_1148", name: "Sandbox Review Account", roles: ["customer"], state: "sandbox", emailVerified: true, mfa: "not-enabled", lastLoginProvider: "sandbox" },
    { id: "user_1193", name: "Pending account", roles: ["customer"], state: "deletion-requested", emailVerified: false, mfa: "not-enabled", lastLoginProvider: null },
  ],
}

const securityAudit: PlatformAuditReadModel = {
  metrics: [
    { label: "Events in view", value: "128", trend: "Latest security audit window", trendTone: "neutral" },
    { label: "Failed, denied, or conflicting", value: "4", trend: "Review before closing the window", trendTone: "attention" },
    { label: "Chain status", value: "Intact", trend: "Digest continuity observed", trendTone: "positive" },
  ],
  events: [
    { id: "audit-9012", action: "developer.production_approval.review", resourceType: "developer_project", resourceId: "proj_7fd3", outcome: "success", actor: "user_1001", scope: "global", requestId: "req_6e2f", reason: "Production review completed", occurredAt: "8 min ago", digest: "a4d1…8c9e" },
    { id: "audit-9011", action: "developer.webhooks.suspend", resourceType: "developer_project", resourceId: "proj_7fd3", outcome: "success", actor: "user_1001", scope: "global", requestId: "req_17b0", reason: "Repeated delivery failures", occurredAt: "34 min ago", digest: "39ae…1f04" },
    { id: "audit-9010", action: "platform.queue_lifecycle.repair", resourceType: "queue_day", resourceId: "queue-1827", outcome: "denied", actor: "user_1027", scope: "tenant_4ea8", requestId: "req_8bb1", reason: "Missing confirmation token", occurredAt: "1 hr ago", digest: "f2c0…6d12" },
  ],
}

const billing: PlatformBillingReadModel = {
  metrics: [
    { label: "Active subscriptions", value: "214", trend: "Current tenant billing state", trendTone: "positive" },
    { label: "Restricted billing", value: "7", trend: "Past due, unpaid, or suspended", trendTone: "attention" },
    { label: "Pending transitions", value: "3", trend: "Preview before execution", trendTone: "attention" },
    { label: "Credit cases", value: "2", trend: "Refunds or disputes needing review", trendTone: "attention" },
  ],
  counts: { subscriptions: 3, purchases: 2, refunds: 1, disputes: 1 },
  subscriptions: [
    { id: "sub_4812", tenant: "Acme Clinics", plan: "pro", status: "active", provider: "xendit", periodEnd: "2026-10-12T08:20:00.000Z" },
    { id: "sub_4798", tenant: "Luna Dental", plan: "free", status: "active", provider: "system", periodEnd: "2026-10-03T11:05:00.000Z" },
    { id: "sub_4771", tenant: "Northstar Wellness", plan: "pro", status: "past_due", provider: "paymongo", periodEnd: "2026-09-19T15:42:00.000Z" },
  ],
  creditPurchases: [
    { id: "purchase_812", tenant: "Acme Clinics", pack: "Queue 1,000", status: "fulfilled", amount: "PHP 1,250", provider: "xendit", createdAt: "12 min ago" },
    { id: "purchase_809", tenant: "Northstar Wellness", pack: "Journey 500", status: "refund_pending", amount: "PHP 650", provider: "paymongo", createdAt: "1 hr ago" },
  ],
  creditRefundsEnabled: true,
  creditDisputesEnabled: true,
  creditRefunds: [{ id: "refund_809", purchaseId: "purchase_809", tenant: "Northstar Wellness", purchaseStatus: "refund_pending", status: "requested", amount: "PHP 650.00", provider: "paymongo", reason: "Duplicate checkout", providerRefundId: null, createdAt: "1 hr ago" }],
  creditDisputes: [{ id: "dispute_806", purchaseId: "purchase_806", providerDisputeId: "dp_demo_806", tenant: "Acme Clinics", purchaseStatus: "disputed", status: "under_review", amount: "PHP 1,250.00", provider: "xendit", consumedExposureUnits: 8, openedAt: "2026-09-26T10:00:00.000Z", resolvedAt: null }],
}

const moderation: PlatformModerationReadModel = {
  metrics: [
    { label: "Open reports", value: "6", trend: "Needs triage", trendTone: "attention" },
    { label: "Rating disputes", value: "3", trend: "Awaiting resolution", trendTone: "attention" },
    { label: "Resolved this week", value: "18", trend: "Moderation throughput", trendTone: "positive" },
  ],
  campaignReports: [
    { id: "report_204", campaignId: "campaign_811", campaignTitle: "Emergency clinic booking", category: "misleading", status: "open", campaignStatus: "collecting", reporter: "user_1193", details: "Campaign details do not match the published booking context.", createdAt: "12 min ago" },
    { id: "report_201", campaignId: "campaign_804", campaignTitle: "Weekend wellness group", category: "spam", status: "reviewing", campaignStatus: "collecting", reporter: "user_1027", details: null, createdAt: "1 hr ago" },
    { id: "report_198", campaignId: "campaign_799", campaignTitle: "Northstar care drive", category: "other", status: "resolved", campaignStatus: "frozen", reporter: "user_1148", details: "Resolved with campaign freeze and audit record.", createdAt: "Yesterday" },
  ],
  ratingDisputes: [
    { id: "dispute_92", ratingType: "vendor_review", ratingId: "review_501", status: "open", reason: "Review contains a disputed service claim.", reporter: "user_1193", createdAt: "24 min ago" },
    { id: "dispute_88", ratingType: "user_trust", ratingId: "rating_228", status: "reviewing", reason: "Reporter requested a trust-rating review.", reporter: "user_1027", createdAt: "3 hr ago" },
  ],
}

const settings: PlatformSettingsReadModel = {
  settings: { enterpriseInquiryEmail: "carlo.abella@gmail.com", defaultTimezone: "Asia/Manila", mobileApprovedHosts: ["getprio.online", "sandbox.getprio.online"], maxImageUploadKb: 8192 },
  controls: [
    { label: "Enterprise inquiry routing", state: "configured", detail: "Platform email is configured for inbound enterprise requests." },
    { label: "Default timezone", state: "configured", detail: "Asia/Manila is used when a tenant or location does not override it." },
    { label: "Mobile approved hosts", state: "restricted", detail: "HTTPS host allowlist is maintained by Platform settings permissions." },
    { label: "Image upload limit", state: "configured", detail: "Maximum accepted image size is 8,192 KB." },
  ],
}

const releaseReadiness: PlatformReleaseReadinessReadModel = {
  metrics: [
    { label: "Surfaces in view", value: "5", trend: "Web, API, Sandbox, and mobile signals", trendTone: "neutral" },
    { label: "Ready to review", value: "4", trend: "Configuration or observed contract available", trendTone: "positive" },
    { label: "Needs evidence", value: "2", trend: "Deployment or heartbeat proof is still separate", trendTone: "attention" },
  ],
  surfaces: [
    { id: "platform-web", surface: "Platform web dashboard", environment: "production", state: "review", signal: "Dashboard build available", evidence: "Frontend read model and theme contract are verified locally.", nextAction: "Deploy and verify the authenticated public flow.", observedAt: "Just now" },
    { id: "platform-api", surface: "Platform API", environment: "production", state: "review", signal: "Authenticated read models implemented", evidence: "Permissioned read models are implemented; deployed authenticated smoke evidence has not been observed.", nextAction: "Run authenticated smoke against the deployed API.", observedAt: "Just now" },
    { id: "sandbox-ios", surface: "Sandbox iOS", environment: "sandbox", state: "review", signal: "TestFlight distribution configured", evidence: "Sandbox distribution contract is represented without exposing invite URLs.", nextAction: "Confirm build availability and install on a physical device.", observedAt: "4 min ago" },
    { id: "sandbox-android", surface: "Sandbox Android", environment: "sandbox", state: "review", signal: "Google Play testing track configured", evidence: "Sandbox package and distribution contract are represented.", nextAction: "Confirm tester access and install on a physical device.", observedAt: "4 min ago" },
    { id: "mobile-push", surface: "Mobile push pipeline", environment: "all", state: "unknown", signal: "Heartbeat required", evidence: "No delivery heartbeat is included in this read model.", nextAction: "Add a safe heartbeat and verify push on vendor and Sandbox clients.", observedAt: "Not observed" },
  ],
  controls: [
    { label: "Production approval", environment: "production", enabled: false, detail: "Approval remains a separate review state from deployment." },
    { label: "Usage-credit checkout", environment: "production", enabled: false, detail: "Release control is currently disabled in the fixture." },
    { label: "Sandbox distribution", environment: "sandbox", enabled: true, detail: "Distribution links are configured without returning private credentials." },
  ],
}

const fixtureCapabilities = [
  "platform.tenants.read",
  "platform.queue_lifecycle.read",
  "platform.users.read",
  "platform.user_sessions.revoke",
  "platform.user_password_reset.send",
  "platform.account_deletion.manage",
  "platform.developer_api.manage",
  "platform.billing.read",
  "platform.subscription_lifecycle.manage",
  "platform.security_audit.read",
  "platform.settings.manage",
]

export const fixturePlatformApi: PlatformApi = {
  async getViewerContext() {
    const data: PlatformViewerContext = {
      user: { id: "platform-admin-1", displayName: "Carlo Abella", role: "Platform Admin" },
      capabilities: fixtureCapabilities,
      navigation: ["overview", "operations", "developer", "billing", "trust", "settings"],
      sessionExpiresAt: "2026-09-26T20:00:00.000Z",
    }
    return available(data, "global")
  },
  async getOverview() {
    return available(overview, "global")
  },
  async getServiceHealth() {
    return available(serviceHealth, "global")
  },
  async getQueueOperations() {
    return available(queueOperations, "global")
  },
  async getTenants() {
    return available(tenants, "global")
  },
  async inspectTenant(tenantId: string): Promise<PlatformTenantInspection> {
    const tenant = tenants.tenants.find((item) => item.id === tenantId) || tenants.tenants[0]
    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      capacity: { planSlug: tenant.plan, subscriptionId: tenant.active ? `sub_${tenant.id}` : null, lifecycleState: tenant.active ? "active" : "inactive", resources: { queueTickets: { limit: 1000, used: tenant.tickets, creditRemaining: 240, resetAt: "2026-10-01T00:00:00.000Z", source: "plan" }, serviceBookings: { limit: 120, used: 42, creditRemaining: 0, resetAt: "2026-10-01T00:00:00.000Z", source: "plan" } }, lots: fixtureTenantLots[tenant.id] || [{ id: `lot_${tenant.id}`, resourceKey: "queueTickets", remainingUnits: 240, expiresAt: "2026-10-31T00:00:00.000Z", status: "active", sourceType: "promotional", grantedUnits: 500, consumedUnits: 220, revokedUnits: 20, frozenUnits: 20, reason: "Launch support", createdAt: "2026-09-20T10:00:00.000Z" }] },
      overrides: fixtureTenantOverrides[tenant.id] || (tenant.id === "tenant_7fa2" ? [{ id: "override_demo", policyKey: "allowance.queueTickets", value: 2500, expiresAt: "2026-10-31T00:00:00.000Z", revokedAt: null, reason: "Launch support window" }] : []),
      tenantOverridesEnabled: true,
      tenantCreditGrantsEnabled: true,
    }
  },
  async previewTenantEntitlement(action, targetId) {
    return { action, targetId, revision: "tenant-entitlement-v1", confirmationToken: "fixture-confirmation-token" }
  },
  async executeTenantEntitlement(tenantId, overrideId, payload, reason) {
    const { tenantOverridesEnabled, ...inspection } = await this.inspectTenant(tenantId)
    void tenantOverridesEnabled
    if (overrideId) {
      inspection.overrides = inspection.overrides.map((override) => override.id === overrideId ? { ...override, revokedAt: new Date().toISOString() } : override)
    } else {
      inspection.overrides = [{ id: `override_${Date.now()}`, policyKey: String(payload.policyKey), value: payload.value, expiresAt: payload.expiresAt ? String(payload.expiresAt) : null, revokedAt: null, reason }, ...inspection.overrides]
    }
    fixtureTenantOverrides[tenantId] = inspection.overrides
  },
  async grantTenantCredits(tenantId, ticketUnits, journeyUnits, expiresAt, reason) {
    const current = (await this.inspectTenant(tenantId)).capacity.lots
    const now = new Date().toISOString()
    if (ticketUnits) current.unshift({ id: `lot_${Date.now()}_tickets`, resourceKey: "queueTickets", remainingUnits: ticketUnits, expiresAt, status: "active", sourceType: "promotional", grantedUnits: ticketUnits, consumedUnits: 0, revokedUnits: 0, frozenUnits: 0, reason, createdAt: now })
    if (journeyUnits) current.unshift({ id: `lot_${Date.now()}_journeys`, resourceKey: "queueEmailJourneys", remainingUnits: journeyUnits, expiresAt, status: "active", sourceType: "promotional", grantedUnits: journeyUnits, consumedUnits: 0, revokedUnits: 0, frozenUnits: 0, reason, createdAt: now })
    fixtureTenantLots[tenantId] = current
  },
  async revokeTenantCredits(lotId, units) {
    for (const tenant of tenants.tenants) {
      const lots = fixtureTenantLots[tenant.id] || (tenant.active ? [{ id: `lot_${tenant.id}`, resourceKey: "queueTickets", remainingUnits: 240, expiresAt: "2026-10-31T00:00:00.000Z", status: "active", sourceType: "promotional", grantedUnits: 500, consumedUnits: 220, revokedUnits: 20, frozenUnits: 20, reason: "Launch support", createdAt: "2026-09-20T10:00:00.000Z" }] : [])
      fixtureTenantLots[tenant.id] = lots.map((lot) => lot.id === lotId ? { ...lot, revokedUnits: lot.revokedUnits + units, remainingUnits: Math.max(0, lot.remainingUnits - units), status: units >= lot.remainingUnits ? "revoked" : lot.status } : lot)
    }
  },
  async getUsers() {
    return available(users, "global")
  },
  async getAccountDeletionRequests() {
    return fixtureDeletionRequests
  },
  async completeAccountDeletionTask(requestId: string, taskKind: AccountDeletionTaskKind, evidence: string, reason: string, retentionNotice?: string) {
    const request = fixtureDeletionRequests.requests.find((item) => item.id === requestId)
    if (!request) throw new Error("Account-deletion request not found.")
    const task = request.tasks.find((item) => item.kind === taskKind)
    if (!task || task.status === "completed") throw new Error("This prerequisite is not available to complete.")
    task.status = "completed"
    task.evidence = evidence
    task.completedAt = new Date().toISOString()
    if (taskKind === "financial_and_legal_retention") request.retentionNotice = retentionNotice || null
    const ready = request.tasks.length === 5 && request.tasks.every((item) => item.status === "completed") && Boolean(request.retentionNotice)
    request.status = ready ? "pending" : "review_required"
    void reason
    return { request: { id: request.id, status: request.status, dueAt: request.dueAt, readyForErasure: ready, task } }
  },
  async getUserDetails(userId: string): Promise<PlatformUserDetails> {
    const row = users.users.find((user) => user.id === userId)
    if (!row) throw new Error("User not found.")
    return {
      id: row.id,
      name: row.name,
      displayName: row.name,
      username: row.id === "user_1001" ? "carlo.abella" : row.id === "user_1027" ? "mara.santos" : row.id === "user_1148" ? "sandbox.review" : "pending.user",
      email: row.id === "user_1001" ? "carlo.abella@example.com" : row.id === "user_1027" ? "mara.santos@example.com" : row.id === "user_1148" ? "sandbox@example.com" : "pending@example.com",
      phone: row.id === "user_1001" ? "+639171234567" : "",
      roles: row.roles,
      state: row.state,
      emailVerified: row.emailVerified,
      emailMfaEnabled: false,
      mfaEnabled: row.mfa !== "not-enabled",
      mfaRequired: row.mfa === "required",
      hasPassword: row.lastLoginProvider === "password",
      lastLoginProvider: row.lastLoginProvider,
      activeSessions: row.id === "user_1001" ? 1 : 2,
      activeMfaFactors: row.mfa === "not-enabled" ? 0 : 1,
      pendingMfaFactors: 0,
      unusedRecoveryCodes: row.mfa === "not-enabled" ? 0 : 5,
      createdAt: "2026-01-12T10:00:00.000Z",
      updatedAt: "2026-09-27T10:00:00.000Z",
    }
  },
  async getSecurityAudit() {
    return available(securityAudit, "global")
  },
  async getBilling() {
    return available(billing, "global")
  },
  async getModeration() {
    return available(moderation, "global")
  },
  async getSettings() {
    return available(settings, "global")
  },
  async getReleaseReadiness() {
    return available(releaseReadiness, "global")
  },
  async getDeveloperProjects() {
    return available({ projects }, "global")
  },
  async getDeveloperProjectGovernance() {
    return available(projectGovernance, "developer-project")
  },
  async getDeveloperApiKeys(projectId: string): Promise<PlatformDeveloperApiKeyReview> {
    const project = projects.find((item) => item.id === projectId)
    if (!project) throw new Error("Developer project not found.")
    return { project: { id: project.id, name: project.name, status: project.status }, keys: fixtureDeveloperApiKeys }
  },
  async revokeDeveloperApiKey(projectId: string, keyId: string, reason: string) {
    if (projectId !== projectGovernance.projectId) throw new Error("Developer project not found.")
    const key = fixtureDeveloperApiKeys.find((item) => item.id === keyId)
    if (!key || key.status !== "active") throw new Error("This API key is not active.")
    key.status = "revoked"
    key.revokedAt = new Date().toISOString()
    key.revokeReason = reason
    return { key: { id: key.id, status: key.status, revokedAt: key.revokedAt, revokeReason: key.revokeReason } }
  },
  async suspendDeveloperWebhooks(_projectId: string, _reason: string) {
    projectGovernance.webhookHealth = { ...projectGovernance.webhookHealth, state: "suspended", suspension: { reason: _reason, suspendedAt: new Date().toISOString() } }
  },
  async reinstateDeveloperWebhooks(_projectId: string, _reason: string) {
    projectGovernance.webhookHealth = { ...projectGovernance.webhookHealth, state: "healthy", suspension: null }
  },
  async reviewDeveloperApproval(_projectId: string, _submissionId: string, status: "approved" | "changes_requested" | "rejected", feedback: string) {
    projectGovernance.productionApproval = status === "approved" ? "approved" : "changes-requested"
    projectGovernance.productionApprovalDetail = { status, pendingSubmissionId: null, lastFeedback: feedback || null }
  },
  async createAppleReviewAccount(_projectId: string) {
    projectGovernance.sandboxAccounts.appleReviewAccount = { id: "test_account_demo", username: "sb_demo01", email: "sb-demo01@test.getprio.invalid", status: "active", expiresAt: "2026-10-26T12:00:00.000Z", deviceCount: 0 }
    projectGovernance.sandboxAccounts.active = Math.max(projectGovernance.sandboxAccounts.active, 1)
    projectGovernance.sandboxAccounts.appleReview = "active"
    return { credentials: { username: "sb_demo01", email: "sb-demo01@test.getprio.invalid", password: "Demo-only-password", expiresAt: "2026-10-26T12:00:00.000Z" }, warning: "Copy these credentials now. The password will not be shown again in the live Platform flow." }
  },
  async resetAppleReviewAccount(_projectId: string, _accountId: string) {
    return { credentials: { username: "sb_review01", email: "sb-review01@test.getprio.invalid", password: "Demo-reset-password", expiresAt: "2026-10-26T12:00:00.000Z" }, warning: "Copy these credentials now. The previous password was invalidated in the live Platform flow." }
  },
  async getDeveloperRateLimit(_projectId: string, environment: "sandbox" | "production") {
    return projectGovernance.rateLimits[environment]
  },
  async updateDeveloperRateLimit(_projectId: string, environment: "sandbox" | "production", readLimitPerMinute: number, writeLimitPerMinute: number) {
    projectGovernance.rateLimits[environment] = { ...projectGovernance.rateLimits[environment], readLimitPerMinute, writeLimitPerMinute, updatedByUserId: "platform-admin-1", updatedAt: new Date().toISOString() }
  },
  async previewSubscriptionSuspend(subscriptionId: string, _reason: string) {
    return { action: "subscription.suspend", targetId: subscriptionId, revision: "subscription-suspend-v1", confirmationToken: "fixture-confirmation-token" }
  },
  async executeSubscriptionSuspend(subscriptionId: string, _reason: string, _revision: string, _confirmationToken: string) {
    const subscription = billing.subscriptions.find((item) => item.id === subscriptionId)
    if (subscription) subscription.status = "suspended"
  },
  async previewCreditCase(action: "credit.refund.resolve" | "credit.dispute.resolve", targetId: string) {
    return { action, targetId, revision: "credit-case-v1", confirmationToken: "fixture-confirmation-token" }
  },
  async resolveCreditRefund(purchaseId: string, outcome: "confirmed" | "failed", providerRefundId: string | null) {
    const refund = billing.creditRefunds.find((item) => item.purchaseId === purchaseId)
    if (refund) {
      refund.status = outcome
      refund.purchaseStatus = outcome === "confirmed" ? "refunded" : "fulfilled"
      refund.providerRefundId = providerRefundId || refund.providerRefundId
    }
    const purchase = billing.creditPurchases.find((item) => item.id === purchaseId)
    if (purchase) purchase.status = outcome === "confirmed" ? "refunded" : "fulfilled"
  },
  async resolveCreditDispute(providerDisputeId: string, outcome: "won" | "lost") {
    const dispute = billing.creditDisputes.find((item) => item.providerDisputeId === providerDisputeId)
    if (dispute) {
      dispute.status = outcome
      dispute.purchaseStatus = outcome === "won" ? "fulfilled" : "failed"
      dispute.resolvedAt = new Date().toISOString()
    }
    const purchase = billing.creditPurchases.find((item) => item.id === dispute?.purchaseId)
    if (purchase) purchase.status = outcome === "won" ? "fulfilled" : "failed"
  },
  async previewModerationAction(action: "moderation.campaign_report.status" | "moderation.rating_dispute.resolve", targetId: string, _payload: Record<string, string>, _reason: string) {
    return { action, targetId, revision: "moderation-action-v1", confirmationToken: "fixture-confirmation-token" }
  },
  async updateCampaignReportStatus(reportId: string, status: "reviewing" | "resolved" | "dismissed") {
    const report = moderation.campaignReports.find((item) => item.id === reportId)
    if (report) report.status = status
  },
  async resolveRatingDispute(disputeId: string, status: "resolved" | "dismissed") {
    const dispute = moderation.ratingDisputes.find((item) => item.id === disputeId)
    if (dispute) dispute.status = status
  },
  async previewQueueRepair(action: "reconcile_overdue_queue_day" | "requeue_notification", targetId: string, _reason: string) {
    return { action, targetId, revision: "queue-repair-v1", confirmationToken: "fixture-confirmation-token", requiresMfa: true, mutatesCustomerIdentity: false }
  },
  async executeQueueRepair(_action: string, _targetId: string, _reason: string, _revision: string, _confirmationToken: string) {
    return undefined
  },
  async previewUserSessionRevoke(userId: string, _reason: string): Promise<UserSessionRevokePreview> {
    return { action: "platform.user_sessions.revoke", targetId: userId, revision: "user-sessions-revoke-v1", confirmationToken: "fixture-confirmation-token", activeSessions: 2 }
  },
  async executeUserSessionRevoke(_userId: string, _reason: string, _revision: string, _confirmationToken: string) {
    return { revokedSessions: 2 }
  },
  async previewUserPasswordReset(userId: string, _reason: string): Promise<UserPasswordResetPreview> {
    return { action: "platform.user.password_reset.send", targetId: userId, revision: "user-password-reset-v1", confirmationToken: "fixture-confirmation-token" }
  },
  async executeUserPasswordReset(_userId: string, _reason: string, _revision: string, _confirmationToken: string) {
    return undefined
  },
}

type HttpReadModel<T> = {
  data?: T
  meta?: ReadModelMeta
  errors?: Array<{ code?: string; message?: string }>
}

function fallbackMeta(scope: ReadModelMeta["scope"]): ReadModelMeta {
  return {
    requestId: "unavailable",
    generatedAt: new Date().toISOString(),
    scope,
    environment: "all",
    schemaVersion: "platform-read-model.v1",
  }
}

function readCsrfToken() {
  const entry = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith("prio_csrf="))
  if (entry) return decodeURIComponent(entry.slice("prio_csrf=".length))

  try {
    const stored = window.sessionStorage.getItem("prio_csrf")
    if (stored) return stored
  } catch {
    // The cookie remains available when storage is restricted.
  }
  return ""
}

async function writePlatform<TResponse>(baseUrl: string, path: string, body: unknown, idempotencyKey: string, method = "POST", extraHeaders: Record<string, string> = {}): Promise<TResponse> {
  const response = await fetchWithSessionRefresh(() => fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      ...(readCsrfToken() ? { "X-CSRF-Token": readCsrfToken() } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }))
  const payload = await response.json().catch(() => ({})) as TResponse & { message?: string; code?: string }
  if (!response.ok) throw Object.assign(new Error(payload.message || "The Platform action could not be completed."), { status: response.status, code: payload.code })
  return payload
}

function createHttpPlatformApi(baseUrl = API_BASE_URL): PlatformApi {
  async function read<T>(path: string, scope: ReadModelMeta["scope"]): Promise<ReadModelModule<T> & { meta: ReadModelMeta }> {
    try {
      const response = await fetchWithSessionRefresh(() => fetch(`${baseUrl.replace(/\/$/, "")}${path}`, { credentials: "include", headers: { Accept: "application/json" } }))
      const payload = await response.json() as HttpReadModel<T> & { message?: string; code?: string }
      const meta = payload.meta || fallbackMeta(scope)
      if (!response.ok) {
        return { state: response.status === 401 || response.status === 403 ? "denied" : "failed", status: response.status, message: payload.message || "The Platform read model could not be loaded.", meta }
      }
      return { state: "available", generatedAt: meta.generatedAt, data: payload.data, meta }
    } catch (error) {
      const status = error instanceof Error && "status" in error ? Number(error.status) : undefined
      return {
        state: status === 401 || status === 403 ? "denied" : "failed",
        ...(status ? { status } : {}),
        message: error instanceof Error ? error.message : "The Platform API is unavailable.",
        meta: fallbackMeta(scope),
      }
    }
  }

  return {
    getViewerContext: () => read<PlatformViewerContext>("/platform/viewer-context", "global"),
    getOverview: () => read<PlatformOverviewReadModel>("/platform/overview", "global"),
    getServiceHealth: () => read<PlatformServiceHealthReadModel>("/platform/service-health", "global"),
    getQueueOperations: () => read<PlatformQueueOperationsReadModel>("/platform/queues", "global"),
    getTenants: () => read<PlatformTenantsReadModel>("/platform/tenants/read-model", "global"),
    inspectTenant: async (tenantId) => {
      type CapacityResponse = { tenant: PlatformTenantInspection["tenant"]; capacity: PlatformTenantInspection["capacity"] }
      type OverrideRow = { id: string | number; policy_key: string; value: unknown; expires_at: string | null; revoked_at: string | null; reason: string | null }
      const getJson = async <T,>(path: string): Promise<T> => {
        const response = await fetchWithSessionRefresh(() => fetch(`${baseUrl.replace(/\/$/, "")}${path}`, { credentials: "include", headers: { Accept: "application/json" } }))
        const payload = await response.json().catch(() => ({})) as T & { message?: string }
        if (!response.ok) throw Object.assign(new Error(payload.message || "Tenant posture could not be loaded."), { status: response.status, code: (payload as { code?: string }).code })
        return payload
      }
      const [capacity, capabilities] = await Promise.all([
        getJson<CapacityResponse>(`/platform/tenants/${encodeURIComponent(tenantId)}/capacity`),
        getJson<{ tenantOverrides: boolean; usageCreditAdministration: boolean }>("/platform/capabilities"),
      ])
      const overridesEnabled = capabilities.tenantOverrides
      const overrideRows = overridesEnabled
        ? (await getJson<{ overrides: OverrideRow[] }>(`/platform/tenants/${encodeURIComponent(tenantId)}/entitlement-overrides`)).overrides
        : []
      return {
        tenant: capacity.tenant,
        capacity: capacity.capacity,
        overrides: overrideRows.map((item) => ({ id: String(item.id), policyKey: item.policy_key, value: item.value, expiresAt: item.expires_at, revokedAt: item.revoked_at, reason: item.reason })),
        tenantOverridesEnabled: overridesEnabled,
        tenantCreditGrantsEnabled: capabilities.usageCreditAdministration,
      }
    },
    getUsers: () => read<PlatformUsersReadModel>("/platform/users/read-model", "global"),
    getAccountDeletionRequests: async () => {
      const response = await fetchWithSessionRefresh(() => fetch(`${baseUrl.replace(/\/$/, "")}/platform/account-deletion-requests`, { credentials: "include", headers: { Accept: "application/json" } }))
      const payload = await response.json().catch(() => ({})) as PlatformAccountDeletionQueue & { message?: string; code?: string }
      if (!response.ok) throw Object.assign(new Error(payload.message || "Account-deletion requests could not be loaded."), { status: response.status, code: payload.code })
      return payload
    },
    completeAccountDeletionTask: (requestId, taskKind, evidence, reason, retentionNotice) => writePlatform(baseUrl, `/platform/account-deletion-requests/${encodeURIComponent(requestId)}/tasks/${encodeURIComponent(taskKind)}/complete`, { evidence, reason, ...(retentionNotice ? { retentionNotice } : {}) }, crypto.randomUUID()),
    getUserDetails: async (userId) => {
      const response = await read<{ user: PlatformUserDetails }>(`/platform/users/${encodeURIComponent(userId)}/details`, "global")
      if (response.state !== "available" || !response.data?.user) throw new Error(response.message || "The account details could not be loaded.")
      return response.data.user
    },
    getSecurityAudit: () => read<PlatformAuditReadModel>("/platform/security-audit/read-model", "global"),
    getBilling: () => read<PlatformBillingReadModel>("/platform/billing/read-model", "global"),
    getModeration: () => read<PlatformModerationReadModel>("/platform/moderation/read-model", "global"),
    getSettings: () => read<PlatformSettingsReadModel>("/platform/settings/read-model", "global"),
    getReleaseReadiness: () => read<PlatformReleaseReadinessReadModel>("/platform/release-readiness/read-model", "global"),
    getDeveloperProjects: () => read<{ projects: DeveloperProjectSummary[] }>("/platform/developer-projects/read-model", "global"),
    getDeveloperProjectGovernance: (projectId) => read<DeveloperProjectGovernanceReadModel>(`/platform/developer-projects/${encodeURIComponent(projectId)}/governance`, "developer-project"),
    getDeveloperApiKeys: async (projectId) => {
      const response = await fetchWithSessionRefresh(() => fetch(`${baseUrl.replace(/\/$/, "")}/platform/developer-projects/${encodeURIComponent(projectId)}/api-keys`, { credentials: "include", headers: { Accept: "application/json" } }))
      const payload = await response.json().catch(() => ({})) as PlatformDeveloperApiKeyReview & { message?: string; code?: string }
      if (!response.ok) throw Object.assign(new Error(payload.message || "Developer API-key activity could not be loaded."), { status: response.status, code: payload.code })
      return payload
    },
    revokeDeveloperApiKey: (projectId, keyId, reason) => writePlatform(baseUrl, `/platform/developer-projects/${encodeURIComponent(projectId)}/api-keys/${encodeURIComponent(keyId)}/revoke`, { reason }, crypto.randomUUID()),
    suspendDeveloperWebhooks: (projectId, reason) => writePlatform(baseUrl, `/platform/developer-projects/${encodeURIComponent(projectId)}/webhook-suspension`, { reason }, crypto.randomUUID()).then(() => undefined),
    reinstateDeveloperWebhooks: (projectId, reason) => writePlatform(baseUrl, `/platform/developer-projects/${encodeURIComponent(projectId)}/webhook-suspension/reinstate`, { reason }, crypto.randomUUID()).then(() => undefined),
    reviewDeveloperApproval: (projectId, submissionId, status, feedback) => writePlatform(baseUrl, `/platform/developer-projects/${encodeURIComponent(projectId)}/production-approval/${encodeURIComponent(submissionId)}/review`, { status, feedback }, crypto.randomUUID()).then(() => undefined),
    createAppleReviewAccount: (projectId) => writePlatform(baseUrl, `/platform/developer-projects/${encodeURIComponent(projectId)}/sandbox/test-accounts/apple-review`, {}, crypto.randomUUID()).then((response) => response as SandboxCredentialResult),
    resetAppleReviewAccount: (projectId, accountId) => writePlatform(baseUrl, `/platform/developer-projects/${encodeURIComponent(projectId)}/sandbox/test-accounts/${encodeURIComponent(accountId)}/reset`, {}, crypto.randomUUID()).then((response) => response as SandboxCredentialResult),
    getDeveloperRateLimit: async (projectId, environment) => {
      const response = await read<{ project: { id: string }; limits: DeveloperRateLimit }>(`/platform/developer-projects/${encodeURIComponent(projectId)}/rate-limit?environment=${environment}`, "developer-project")
      if (response.state !== "available" || !response.data) throw new Error(response.message || "The Developer API rate limit could not be loaded.")
      return response.data.limits
    },
    updateDeveloperRateLimit: (projectId, environment, readLimitPerMinute, writeLimitPerMinute, reason) => writePlatform(baseUrl, `/platform/developer-projects/${encodeURIComponent(projectId)}/rate-limit`, { environment, readLimitPerMinute, writeLimitPerMinute, reason }, crypto.randomUUID(), "PUT").then(() => undefined),
    previewSubscriptionSuspend: async (subscriptionId, reason) => {
      const response = await writePlatform<{ preview: { action: string; target: string; revision: string }; confirmation: { token: string } }>(baseUrl, "/platform/privileged-actions/preview", { action: "subscription.suspend", target: subscriptionId, reason, payload: {} }, crypto.randomUUID())
      return { action: response.preview.action, targetId: response.preview.target, revision: response.preview.revision, confirmationToken: response.confirmation.token }
    },
    executeSubscriptionSuspend: (subscriptionId, reason, revision, confirmationToken) => writePlatform(baseUrl, `/platform/subscriptions/${encodeURIComponent(subscriptionId)}/suspend`, { reason, previewRevision: revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": confirmationToken }).then(() => undefined),
    previewCreditCase: async (action, targetId, payload, reason) => {
      const response = await writePlatform<{ preview: { action: TenantEntitlementPreview["action"]; target: string; revision: string }; confirmation: { token: string } }>(baseUrl, "/platform/privileged-actions/preview", { action, target: targetId, payload, reason }, crypto.randomUUID())
      return { action: response.preview.action, targetId: response.preview.target, revision: response.preview.revision, confirmationToken: response.confirmation.token }
    },
    resolveCreditRefund: async (purchaseId, outcome, providerRefundId, reason, preview) => {
      await writePlatform(baseUrl, `/platform/credit-purchases/${encodeURIComponent(purchaseId)}/refunds/resolve`, { outcome, providerRefundId, reason, previewRevision: preview.revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": preview.confirmationToken })
    },
    resolveCreditDispute: async (providerDisputeId, outcome, reason, preview) => {
      await writePlatform(baseUrl, `/platform/credit-disputes/${encodeURIComponent(providerDisputeId)}/resolve`, { outcome, reason, previewRevision: preview.revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": preview.confirmationToken })
    },
    previewModerationAction: async (action, targetId, payload, reason) => {
      const response = await writePlatform<{ preview: { action: string; target: string; revision: string }; confirmation: { token: string } }>(baseUrl, "/platform/privileged-actions/preview", { action, target: targetId, payload, reason }, crypto.randomUUID())
      return { action: response.preview.action, targetId: response.preview.target, revision: response.preview.revision, confirmationToken: response.confirmation.token }
    },
    updateCampaignReportStatus: (reportId, status, reason, revision, confirmationToken) => writePlatform(baseUrl, `/platform/campaign-reports/${encodeURIComponent(reportId)}`, { status, reason, previewRevision: revision }, crypto.randomUUID(), "PATCH", { "X-Transaction-Confirmation": confirmationToken }).then(() => undefined),
    resolveRatingDispute: (disputeId, status, moderationStatus, reason, revision, confirmationToken) => writePlatform(baseUrl, `/platform/rating-disputes/${encodeURIComponent(disputeId)}`, { status, moderationStatus, reason, previewRevision: revision }, crypto.randomUUID(), "PATCH", { "X-Transaction-Confirmation": confirmationToken }).then(() => undefined),
      previewQueueRepair: async (action, targetId, reason) => {
        const response = await writePlatform<{ preview: { action: string; targetId: string; revision: string; requiresMfa: boolean; mutatesCustomerIdentity: boolean }; confirmation: { token: string } }>(baseUrl, "/platform/queue-lifecycle/repair/preview", { action, targetId, reason }, crypto.randomUUID())
        return { action: response.preview.action, targetId: response.preview.targetId, revision: response.preview.revision, confirmationToken: response.confirmation.token, requiresMfa: response.preview.requiresMfa, mutatesCustomerIdentity: response.preview.mutatesCustomerIdentity }
    },
    executeQueueRepair: (action, targetId, reason, revision, confirmationToken) => writePlatform(baseUrl, "/platform/queue-lifecycle/repair/execute", { action, targetId, reason, previewRevision: revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": confirmationToken }).then(() => undefined),
    previewUserSessionRevoke: async (userId, reason) => {
      const response = await writePlatform<{ preview: { action: string; target: string; revision: string; state?: Array<{ active_sessions?: number }> }; confirmation: { token: string } }>(baseUrl, "/platform/privileged-actions/preview", { action: "platform.user_sessions.revoke", target: userId, reason, payload: { userId } }, crypto.randomUUID())
      return { action: response.preview.action, targetId: response.preview.target, revision: response.preview.revision, confirmationToken: response.confirmation.token, activeSessions: Number(response.preview.state?.[0]?.active_sessions || 0) }
    },
    executeUserSessionRevoke: (userId, reason, revision, confirmationToken) => writePlatform<{ revokedSessions: number }>(baseUrl, `/platform/users/${encodeURIComponent(userId)}/sessions/revoke`, { reason, previewRevision: revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": confirmationToken }).then((response) => ({ revokedSessions: Number(response.revokedSessions || 0) })),
    previewUserPasswordReset: async (userId, reason) => {
      const response = await writePlatform<{ preview: { action: string; target: string; revision: string }; confirmation: { token: string } }>(baseUrl, "/platform/privileged-actions/preview", { action: "platform.user.password_reset.send", target: userId, reason, payload: { userId } }, crypto.randomUUID())
      return { action: "platform.user.password_reset.send", targetId: response.preview.target, revision: response.preview.revision, confirmationToken: response.confirmation.token }
    },
    executeUserPasswordReset: (userId, reason, revision, confirmationToken) => writePlatform(baseUrl, `/platform/users/${encodeURIComponent(userId)}/password-reset`, { reason, previewRevision: revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": confirmationToken }).then(() => undefined),
    previewTenantEntitlement: async (action, targetId, payload, reason) => {
      const response = await writePlatform<{ preview: { action: TenantEntitlementPreview["action"]; target: string; revision: string }; confirmation: { token: string } }>(baseUrl, "/platform/privileged-actions/preview", { action, target: targetId, reason, payload }, crypto.randomUUID())
      return { action: response.preview.action, targetId: response.preview.target, revision: response.preview.revision, confirmationToken: response.confirmation.token }
    },
    executeTenantEntitlement: async (tenantId, overrideId, payload, reason, preview) => {
      const path = overrideId
        ? `/platform/tenants/${encodeURIComponent(tenantId)}/entitlement-overrides/${encodeURIComponent(overrideId)}/revoke`
        : `/platform/tenants/${encodeURIComponent(tenantId)}/entitlement-overrides`
      await writePlatform(baseUrl, path, { ...payload, reason, previewRevision: preview.revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": preview.confirmationToken })
    },
    grantTenantCredits: async (tenantId, ticketUnits, journeyUnits, expiresAt, reason, preview) => {
      await writePlatform(baseUrl, `/platform/tenants/${encodeURIComponent(tenantId)}/credit-grants`, { tenantId, ticketUnits, journeyUnits, expiresAt, reason, previewRevision: preview.revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": preview.confirmationToken })
    },
    revokeTenantCredits: async (lotId, units, reason, preview) => {
      await writePlatform(baseUrl, `/platform/credit-lots/${encodeURIComponent(lotId)}/revoke`, { lotId, units, reason, previewRevision: preview.revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": preview.confirmationToken })
    },
  }
}

export const httpPlatformApi = createHttpPlatformApi()
export const platformApi: PlatformApi = import.meta.env.VITE_PLATFORM_DATA_SOURCE === "live" ? httpPlatformApi : fixturePlatformApi
