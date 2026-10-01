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
  UserRolesUpdatePreview,
  UserRolesUpdateResult,
  UserMfaResetPreview,
  UserAccessUpdatePreview,
  UserSessionRevokePreview,
  ReadModelModule,
  ReadModelMeta,
  PlatformDeveloperApiKey,
  PlatformDeveloperApiKeyReview,
  PlatformPlanMatrix,
  PlanPolicyPreview,
  PlatformHelpCenterContent,
  PlatformHelpCenterAdminReadModel,
} from "@/lib/platform-contracts"
import type { QueueFeeSetting, SubscriptionPlan } from "../../../shared/types"
import helpCenterSeed from "../../../shared/helpCenterSeed.json"
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

let fixtureHelpCenterContent = helpCenterSeed as unknown as PlatformHelpCenterContent
let fixtureHelpCenterPublishedRevision = 1
let fixtureHelpCenterDraftRevision: number | null = null
let fixtureHelpCenterRevision = 1
const fixtureHelpCenterRevisions: PlatformHelpCenterAdminReadModel["revisions"] = []

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
  scan: {
    status: "report_ready",
    requestedAt: "2026-09-26T08:45:00.000Z",
    startedAt: "2026-09-26T08:45:01.000Z",
    completedAt: "2026-09-26T08:45:02.000Z",
    attempts: 1,
    errorCode: null,
    report: {
      version: 1,
      generatedAt: "2026-09-26T08:45:02.000Z",
      coverage: "partial",
      scope: "Numeric relational references to users.id or user-ID-named columns only.",
      categories: [
        { id: "relational_references", label: "Application relational references", status: "scanned", sourceCount: 3, referenceCount: 8 },
        { id: "copied_identifiers", label: "Copied identifiers and JSON payloads", status: "not_scanned", reason: "The current scan does not inspect copied text or JSON values." },
        { id: "object_storage", label: "Object storage and caches", status: "not_scanned", reason: "Provider-wide object and cache inventory is not connected to this scan." },
        { id: "supplier_data", label: "Supplier data", status: "not_scanned", reason: "Supplier-side inventory and deletion receipts are not connected." },
        { id: "financial_and_legal_retention", label: "Financial and legal retention", status: "requires_review", reason: "Retention disposition requires an approved category-level rule." },
        { id: "backup_disposal", label: "Backups and restore replay", status: "not_scanned", reason: "Backup lifecycle and restore-replay evidence are not connected." }
      ],
      inventory: { version: 1, generatedAt: "2026-09-26T08:45:02.000Z", scope: "Numeric relational references to users.id or user-ID-named columns only.", sourceCount: 3, referenceCount: 8, sources: [{ source: "public.bookings.customer_user_id", recordCount: 2, items: [{ id: "fixture-booking-1", ordinal: 1 }, { id: "fixture-booking-2", ordinal: 2 }], itemsComplete: true }, { source: "public.tickets.user_id", recordCount: 5, items: Array.from({ length: 5 }, (_, index) => ({ id: `fixture-ticket-${index + 1}`, ordinal: index + 1 })), itemsComplete: true }, { source: "public.users.id", recordCount: 1, items: [{ id: "fixture-user-1", ordinal: 1 }], itemsComplete: true }] }
    }
  },
  cleanup: { status: "not_started", selection: null, report: null },
  userReport: { status: "not_ready", sentAt: null, attempts: 0, errorCode: null },
  tasks: [
    { kind: "application_relational_inventory", label: "Automated application relational inventory", status: "completed", evidence: "Automated relational inventory: 3 sources and 8 user-ID references.", completedAt: "2026-09-26T09:00:00.000Z", automationReport: { version: 1, generatedAt: "2026-09-26T09:00:00.000Z", scope: "Numeric relational references to users.id or user-ID-named columns only; copied identifiers, JSON payloads, object storage, suppliers, and backups are outside this automated scan.", sourceCount: 3, referenceCount: 8, sources: [{ source: "public.bookings.customer_user_id", recordCount: 2 }, { source: "public.tickets.user_id", recordCount: 5 }, { source: "public.users.id", recordCount: 1 }] } },
    { kind: "personal_data_inventory", label: "Copied identifiers and non-relational review", status: "pending", evidence: null, completedAt: null },
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
  pagination: { page: 1, pageSize: 50, total: 4, totalPages: 1, search: "" },
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
  deploymentEvidence: null,
  metrics: [
    { label: "Surfaces in scope", value: "5", trend: "Web, API, Sandbox, and mobile signals", trendTone: "neutral" },
    { label: "Verified ready", value: "0", trend: "Requires current verification evidence", trendTone: "attention" },
    { label: "Review required", value: "2", trend: "Configured surfaces still need checks", trendTone: "attention" },
    { label: "Blocked", value: "0", trend: "Known release blockers", trendTone: "positive" },
    { label: "Not observed", value: "3", trend: "Deployment or operational evidence unavailable", trendTone: "attention" },
  ],
  surfaces: [
    { id: "platform-web", surface: "Platform web dashboard", environment: "production", state: "unknown", signal: "Production deployment not observed", evidence: "No verified production deployment observation is connected. Development URLs are not used to determine production status.", nextAction: "Connect production deployment evidence, then verify the authenticated public flow.", observedAt: "Not observed" },
    { id: "platform-api", surface: "Platform API", environment: "production", state: "unknown", signal: "Production deployment not observed", evidence: "Authenticated production smoke evidence has not been observed; local read-model availability does not establish a deployed production API.", nextAction: "Connect production deployment evidence and run an authenticated smoke against the deployed API.", observedAt: "Not observed" },
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
  "platform.user_roles.manage",
  "platform.user_mfa.reset",
  "platform.user_access.manage",
  "platform.user_password_reset.send",
  "platform.account_deletion.manage",
  "platform.developer_api.manage",
  "platform.billing.read",
  "platform.subscription_lifecycle.manage",
  "platform.security_audit.read",
  "platform.settings.manage",
]

const fixturePlans: SubscriptionPlan[] = [
  { slug: "free", name: "Free", price: { currency: "PHP", monthlyAmountCents: 0, monthlyDisplay: "Free", annualAmountCents: 0, annualDisplay: "Free" }, bestFor: "Getting started", checkoutEnabled: false, sortOrder: 0, policyRevision: 1, features: { queue: true, branding: false, discovery: false, booking: false, campaigns: false }, allowances: { queueTickets: 500, queueEmailJourneys: 500, serviceBookings: 0 }, entitlements: { locations: 1, counters: 1, staffSeats: 1, monthlyTickets: 500, monthlyTransactionalEmails: 500, monthlyQueueEmailJourneys: 500, monthlyServiceBookings: 0, historyDays: 7, historyLabel: "7 days", emailAlerts: true, smsAllowance: 0, smsBundleType: "none", qrJoinPage: true, publicQueueBoard: true, basicDashboard: true, queueSettings: true, brandedQueuePages: false, analytics: false, csvExport: false, pdfExport: false, allowedHistoryExportRanges: ["today"], advancedRoles: false, slaSupport: false, supportLevel: "self_serve", customDomain: false, sso: false }, included: ["Queue management"] },
  { slug: "economical", name: "Economical", price: { currency: "PHP", monthlyAmountCents: 49900, monthlyDisplay: "PHP 499/mo", annualAmountCents: 498000, annualDisplay: "PHP 4,980/yr" }, bestFor: "Growing teams", checkoutEnabled: true, sortOrder: 1, policyRevision: 1, features: { queue: true, branding: false, discovery: true, booking: true, campaigns: false }, allowances: { queueTickets: 1000, queueEmailJourneys: 1000, serviceBookings: 100 }, entitlements: { locations: 2, counters: 3, staffSeats: 5, monthlyTickets: 1000, monthlyTransactionalEmails: 1000, monthlyQueueEmailJourneys: 1000, monthlyServiceBookings: 100, historyDays: 30, historyLabel: "30 days", emailAlerts: true, smsAllowance: 0, smsBundleType: "none", qrJoinPage: true, publicQueueBoard: true, basicDashboard: true, queueSettings: true, brandedQueuePages: false, analytics: true, csvExport: true, pdfExport: false, allowedHistoryExportRanges: ["today", "week", "month"], advancedRoles: false, slaSupport: false, supportLevel: "self_serve", customDomain: false, sso: false }, included: ["Expanded queue capacity"] },
  { slug: "pro", name: "Pro", price: { currency: "PHP", monthlyAmountCents: 149900, monthlyDisplay: "PHP 1,499/mo", annualAmountCents: 1499000, annualDisplay: "PHP 14,990/yr" }, bestFor: "Established businesses", checkoutEnabled: true, sortOrder: 2, policyRevision: 1, features: { queue: true, branding: true, discovery: true, booking: true, campaigns: false }, allowances: { queueTickets: 5000, queueEmailJourneys: 5000, serviceBookings: 1000 }, entitlements: { locations: 5, counters: 10, staffSeats: 20, monthlyTickets: 5000, monthlyTransactionalEmails: 5000, monthlyQueueEmailJourneys: 5000, monthlyServiceBookings: 1000, historyDays: 90, historyLabel: "90 days", emailAlerts: true, smsAllowance: 100, smsBundleType: "fixed", qrJoinPage: true, publicQueueBoard: true, basicDashboard: true, queueSettings: true, brandedQueuePages: true, analytics: true, csvExport: true, pdfExport: true, allowedHistoryExportRanges: ["today", "week", "month", "quarter"], advancedRoles: true, slaSupport: false, supportLevel: "standard", customDomain: true, sso: false }, included: ["Advanced operations"] },
  { slug: "enterprise", name: "Enterprise", price: { currency: "PHP", monthlyAmountCents: 699900, monthlyDisplay: "PHP 6,999/mo", annualAmountCents: 6999000, annualDisplay: "PHP 69,990/yr" }, bestFor: "Large organizations", checkoutEnabled: false, sortOrder: 3, policyRevision: 1, features: { queue: true, branding: true, discovery: true, booking: true, campaigns: false }, allowances: { queueTickets: 50000, queueEmailJourneys: 50000, serviceBookings: 10000 }, entitlements: { locations: 100, counters: 500, staffSeats: 1000, monthlyTickets: 50000, monthlyTransactionalEmails: 50000, monthlyQueueEmailJourneys: 50000, monthlyServiceBookings: 10000, historyDays: 365, historyLabel: "1 year", emailAlerts: true, smsAllowance: 1000, smsBundleType: "custom", qrJoinPage: true, publicQueueBoard: true, basicDashboard: true, queueSettings: true, brandedQueuePages: true, analytics: true, csvExport: true, pdfExport: true, allowedHistoryExportRanges: ["today", "week", "month", "quarter", "year"], advancedRoles: true, slaSupport: true, supportLevel: "sla", customDomain: true, sso: true }, included: ["Dedicated support"] },
]
const fixtureQueueFees: QueueFeeSetting[] = fixturePlans.map((plan) => ({ planSlug: plan.slug, enabled: plan.slug !== "free", amountCents: plan.slug === "pro" ? 1500 : plan.slug === "enterprise" ? 1000 : 2000, currency: "PHP", updatedAt: "2026-09-29T00:00:00.000Z" }))

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
  async getUsers(page = 1, search = "") {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    const matchingUsers = normalizedSearch ? users.users.filter((user) => `${user.name} ${user.roles.join(" ")}`.toLocaleLowerCase().includes(normalizedSearch)) : users.users
    return available({ ...users, pagination: { page, pageSize: 50, total: matchingUsers.length, totalPages: Math.ceil(matchingUsers.length / 50), search }, users: matchingUsers }, "global")
  },
  async getAccountDeletionRequests() {
    return fixtureDeletionRequests
  },
  async beginAccountDeletionScan(requestId: string) {
    const request = fixtureDeletionRequests.requests.find((item) => item.id === requestId)
    if (!request) throw new Error("Account-deletion request not found.")
    if (request.scan.status === "report_ready" || request.scan.status === "queued" || request.scan.status === "running") {
      return { scan: { id: request.id, scanStatus: request.scan.status, alreadyQueued: true } }
    }
    request.scan.status = "queued"
    request.scan.requestedAt = new Date().toISOString()
    return { scan: { id: request.id, scanStatus: "queued", alreadyQueued: false } }
  },
  async previewAccountDeletionAction(requestId: string) {
    return { revision: `fixture-deletion-${requestId}`, confirmationToken: "fixture-confirmation-token" }
  },
  async beginAccountDeletionCleanup(requestId: string, reportVersion: number, selection: Record<string, boolean>, references: Record<string, string[]>, exclusions: Record<string, string>) {
    const request = fixtureDeletionRequests.requests.find((item) => item.id === requestId)
    if (!request || request.scan.status !== "report_ready") throw new Error("A completed cleanup scan is required.")
    request.cleanup = { ...request.cleanup, status: "queued", selection: { reportVersion, selected: selection, references, exclusions }, report: null }
    return { cleanup: { id: request.id, cleanupStatus: "queued", alreadyQueued: false } }
  },
  async sendAccountDeletionReport(requestId: string) {
    const request = fixtureDeletionRequests.requests.find((item) => item.id === requestId)
    if (!request || request.cleanup.status !== "completed") throw new Error("Cleanup must complete before sending the report.")
    request.userReport = { ...request.userReport, status: "sent", sentAt: new Date().toISOString(), attempts: request.userReport.attempts + 1, errorCode: null }
    request.status = "completed"
    request.completedAt = new Date().toISOString()
    return { report: { id: request.id, reportStatus: "sent", alreadyQueued: false } }
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
      tenantMemberships: [],
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
  async getPlanMatrix() {
    return { plans: fixturePlans, queueFees: fixtureQueueFees, activeSubscribersByPlan: { free: 8, economical: 4, pro: 3, enterprise: 1 }, planPolicyMutations: false }
  },
  async previewPlanPolicy() {
    throw new Error("Plan policy mutations are disabled in fixture mode.")
  },
  async publishPlan() {
    throw new Error("Plan policy mutations are disabled in fixture mode.")
  },
  async publishQueueFees() {
    throw new Error("Plan policy mutations are disabled in fixture mode.")
  },
  async getModeration() {
    return available(moderation, "global")
  },
  async getSettings() {
    return available(settings, "global")
  },
  async updateSettings() {
    throw new Error("Platform settings changes are disabled in fixture mode.")
  },
  async getReleaseReadiness() {
    return available(releaseReadiness, "global")
  },
  async getHelpCenterAdmin() {
    return {
      publishedRevision: fixtureHelpCenterPublishedRevision,
      draftRevision: fixtureHelpCenterDraftRevision,
      content: structuredClone(fixtureHelpCenterContent),
      revisions: structuredClone(fixtureHelpCenterRevisions),
    }
  },
  async saveHelpCenterDraft(content, reason) {
    fixtureHelpCenterContent = structuredClone(content)
    fixtureHelpCenterDraftRevision = ++fixtureHelpCenterRevision
    fixtureHelpCenterRevisions.unshift({ revision: fixtureHelpCenterDraftRevision, createdAt: new Date().toISOString(), createdBy: "fixture-admin", changeReason: reason, publishedAt: null, publishedBy: null })
    return { draft: { revision: fixtureHelpCenterDraftRevision } }
  },
  async publishHelpCenterRevision(revision) {
    if (fixtureHelpCenterDraftRevision !== revision) throw new Error("This draft has changed. Refresh the Help Center before publishing.")
    const previousPublishedRevision = fixtureHelpCenterPublishedRevision
    fixtureHelpCenterPublishedRevision = revision
    fixtureHelpCenterDraftRevision = null
    return { publish: { publishedRevision: revision, previousPublishedRevision } }
  },
  async restoreHelpCenterRevision(revision, reason) {
    const snapshot = fixtureHelpCenterRevisions.find((item) => item.revision === revision)
    if (!snapshot) throw new Error("Help Center revision not found.")
    fixtureHelpCenterDraftRevision = ++fixtureHelpCenterRevision
    fixtureHelpCenterRevisions.unshift({ ...snapshot, revision: fixtureHelpCenterDraftRevision, createdAt: new Date().toISOString(), createdBy: "fixture-admin", changeReason: reason, publishedAt: null, publishedBy: null })
    return { draft: { revision: fixtureHelpCenterDraftRevision, restoredFromRevision: revision } }
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
  async previewUserRolesUpdate(userId: string, roles: string[], _reason: string): Promise<UserRolesUpdatePreview> {
    return { action: "platform.user.roles.update", targetId: userId, roles, revision: "user-roles-update-v1", confirmationToken: "fixture-confirmation-token" }
  },
  async executeUserRolesUpdate(preview: UserRolesUpdatePreview, _reason: string): Promise<UserRolesUpdateResult> {
    const user = users.users.find((item) => item.id === preview.targetId)
    if (user) user.roles = preview.roles
    return { roles: preview.roles, mfaRequired: preview.roles.includes("platform_admin") || preview.roles.includes("platform_release_observer"), revokedSessions: 2, notificationSent: true }
  },
  async previewUserTenantMembershipUpdate(userId, tenantId, role, active, _reason) {
    return { action: "platform.user.tenant_membership.update", targetId: userId, tenantId, tenantName: "Fixture tenant", role, active, previousRole: null, previouslyActive: null, revision: "tenant-membership-v1", confirmationToken: "fixture-confirmation-token" }
  },
  async executeUserTenantMembershipUpdate(preview, _reason) {
    return { mfaRequired: preview.active && ["owner", "admin"].includes(preview.role), revokedSessions: 2 }
  },
  async previewUserMfaReset(userId: string, _reason: string): Promise<UserMfaResetPreview> {
    return { action: "platform.user.mfa.reset", targetId: userId, revision: "user-mfa-reset-v1", confirmationToken: "fixture-confirmation-token" }
  },
  async executeUserMfaReset(_preview: UserMfaResetPreview, _reason: string) {
    return { mfaRequired: false, revokedSessions: 2, notificationSent: true }
  },
  async previewUserAccessUpdate(userId: string, suspended: boolean, _reason: string): Promise<UserAccessUpdatePreview> {
    return { action: suspended ? "platform.user.access.suspend" : "platform.user.access.reactivate", targetId: userId, suspended, revision: "user-access-update-v1", confirmationToken: "fixture-confirmation-token" }
  },
  async executeUserAccessUpdate(preview: UserAccessUpdatePreview, _reason: string) {
    const user = users.users.find((item) => item.id === preview.targetId)
    if (user) user.state = preview.suspended ? "suspended" : "active"
    const state = preview.suspended ? "suspended" : user?.state === "sandbox" || user?.state === "locked" ? user.state : "active"
    return { suspended: preview.suspended, state, revokedSessions: 2, notificationSent: true }
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
        return { state: response.status === 401 || response.status === 403 ? "denied" : "failed", status: response.status, code: payload.code, message: payload.message || "The Platform read model could not be loaded.", meta }
      }
      return { state: "available", generatedAt: meta.generatedAt, data: payload.data, meta }
    } catch (error) {
      const status = error instanceof Error && "status" in error ? Number(error.status) : undefined
      return {
        state: status === 401 || status === 403 ? "denied" : "failed",
        ...(status ? { status } : {}),
        ...(error instanceof Error && "code" in error && typeof error.code === "string" ? { code: error.code } : {}),
        message: error instanceof Error ? error.message : "The Platform API is unavailable.",
        meta: fallbackMeta(scope),
      }
    }
  }

  return {
    getViewerContext: () => read<PlatformViewerContext>("/platform/viewer-context", "global"),
    getOverview: () => read<PlatformOverviewReadModel>("/platform/overview/read-model", "global"),
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
    getUsers: (page = 1, search = "") => read<PlatformUsersReadModel>(`/platform/users/read-model?page=${page}&pageSize=50&search=${encodeURIComponent(search)}`, "global"),
    getAccountDeletionRequests: async () => {
      const response = await fetchWithSessionRefresh(() => fetch(`${baseUrl.replace(/\/$/, "")}/platform/account-deletion-requests`, { credentials: "include", headers: { Accept: "application/json" } }))
      const payload = await response.json().catch(() => ({})) as PlatformAccountDeletionQueue & { message?: string; code?: string }
      if (!response.ok) throw Object.assign(new Error(payload.message || "Account-deletion requests could not be loaded."), { status: response.status, code: payload.code })
      return payload
    },
    beginAccountDeletionScan: (requestId, reason) => writePlatform(baseUrl, `/platform/account-deletion-requests/${encodeURIComponent(requestId)}/begin-scan`, { reason }, crypto.randomUUID()),
    previewAccountDeletionAction: async (requestId, action, payload, reason) => {
      const actionName = action === "cleanup.begin" ? "platform.account_deletion.cleanup.begin" : "platform.account_deletion.report.send"
      const response = await writePlatform<{ preview: { revision: string }; confirmation: { token: string } }>(baseUrl, "/platform/privileged-actions/preview", { action: actionName, target: requestId, reason, payload }, crypto.randomUUID())
      return { revision: response.preview.revision, confirmationToken: response.confirmation.token }
    },
    beginAccountDeletionCleanup: (requestId, reportVersion, selection, references, exclusions, reason, revision, confirmationToken) => writePlatform(baseUrl, `/platform/account-deletion-requests/${encodeURIComponent(requestId)}/begin-cleanup`, { reportVersion, selection, references, exclusions, reason, previewRevision: revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": confirmationToken }),
    sendAccountDeletionReport: (requestId, reason, revision, confirmationToken) => writePlatform(baseUrl, `/platform/account-deletion-requests/${encodeURIComponent(requestId)}/send-report`, { reason, previewRevision: revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": confirmationToken }),
    completeAccountDeletionTask: (requestId, taskKind, evidence, reason, retentionNotice) => writePlatform(baseUrl, `/platform/account-deletion-requests/${encodeURIComponent(requestId)}/tasks/${encodeURIComponent(taskKind)}/complete`, { evidence, reason, ...(retentionNotice ? { retentionNotice } : {}) }, crypto.randomUUID()),
    getUserDetails: async (userId) => {
      const response = await read<{ user: PlatformUserDetails }>(`/platform/users/${encodeURIComponent(userId)}/details`, "global")
      if (response.state !== "available" || !response.data?.user) throw new Error(response.message || "The account details could not be loaded.")
      return response.data.user
    },
    getSecurityAudit: () => read<PlatformAuditReadModel>("/platform/security-audit/read-model", "global"),
    getBilling: () => read<PlatformBillingReadModel>("/platform/billing/read-model", "global"),
    getPlanMatrix: async (): Promise<PlatformPlanMatrix> => {
      const getJson = async <T,>(path: string): Promise<T> => {
        const response = await fetchWithSessionRefresh(() => fetch(`${baseUrl.replace(/\/$/, "")}${path}`, { credentials: "include", headers: { Accept: "application/json" } }))
        const payload = await response.json().catch(() => ({})) as T & { message?: string }
        if (!response.ok) throw Object.assign(new Error(payload.message || "The Plan Matrix could not be loaded."), { status: response.status })
        return payload
      }
      const [plans, queueFees, capabilities] = await Promise.all([
        getJson<{ plans: SubscriptionPlan[] }>("/platform/plans"),
        getJson<{ queueFees: QueueFeeSetting[] }>("/platform/queue-fees"),
        getJson<{ planMatrix: boolean; planPolicyMutations: boolean }>("/platform/capabilities"),
      ])
      if (!capabilities.planMatrix) throw new Error("Plan Matrix access is disabled by the server.")
      const overview = await getJson<{ analytics?: { subscriptionsByPlan?: Array<{ planSlug: SubscriptionPlan["slug"]; count: number }> } }>("/platform/overview")
      const activeSubscribersByPlan = Object.fromEntries((overview.analytics?.subscriptionsByPlan || []).map((item) => [item.planSlug, item.count]))
      return { plans: plans.plans, queueFees: queueFees.queueFees, activeSubscribersByPlan, planPolicyMutations: capabilities.planPolicyMutations }
    },
    previewPlanPolicy: async (action, target, payload, reason, previewRevision): Promise<PlanPolicyPreview> => {
      const response = await writePlatform<{ preview: { revision: string }; confirmation: { token: string } }>(baseUrl, "/platform/privileged-actions/preview", { action, target, payload, reason, previewRevision }, crypto.randomUUID())
      return { revision: response.preview.revision, confirmationToken: response.confirmation.token }
    },
    publishPlan: async (plan: SubscriptionPlan, reason: string, preview: PlanPolicyPreview): Promise<SubscriptionPlan> => {
      const response = await writePlatform<{ plan: SubscriptionPlan }>(baseUrl, `/platform/plans/${encodeURIComponent(plan.slug)}`, { plan, reason, previewRevision: preview.revision }, crypto.randomUUID(), "PATCH", { "X-Transaction-Confirmation": preview.confirmationToken })
      return response.plan
    },
    publishQueueFees: async (queueFees: Array<Pick<QueueFeeSetting, "planSlug" | "enabled" | "amountCents">>, reason: string, preview: PlanPolicyPreview): Promise<QueueFeeSetting[]> => {
      const response = await writePlatform<{ queueFees: QueueFeeSetting[] }>(baseUrl, "/platform/queue-fees", { queueFees, reason, previewRevision: preview.revision }, crypto.randomUUID(), "PATCH", { "X-Transaction-Confirmation": preview.confirmationToken })
      return response.queueFees
    },
    getModeration: () => read<PlatformModerationReadModel>("/platform/moderation/read-model", "global"),
    getSettings: () => read<PlatformSettingsReadModel>("/platform/settings/read-model", "global"),
    updateSettings: async (settings, reason, expectedSettings) => {
      const response = await writePlatform<{ settings: PlatformSettingsReadModel["settings"] }>(baseUrl, "/platform/settings", { ...settings, reason, expectedSettings }, crypto.randomUUID(), "PATCH")
      return response.settings
    },
    getReleaseReadiness: () => read<PlatformReleaseReadinessReadModel>("/platform/release-readiness/read-model", "global"),
    getHelpCenterAdmin: async () => {
      const response = await fetchWithSessionRefresh(() => fetch(`${baseUrl.replace(/\/$/, "")}/platform/help-center`, { credentials: "include", headers: { Accept: "application/json" } }))
      const payload = await response.json().catch(() => ({})) as PlatformHelpCenterAdminReadModel & { message?: string }
      if (!response.ok) throw Object.assign(new Error(payload.message || "Help Center content could not be loaded."), { status: response.status })
      return payload
    },
    saveHelpCenterDraft: (content, reason) => writePlatform(baseUrl, "/platform/help-center/drafts", { content, reason }, crypto.randomUUID()),
    publishHelpCenterRevision: (revision, reason) => writePlatform(baseUrl, "/platform/help-center/publish", { revision, reason }, crypto.randomUUID()),
    restoreHelpCenterRevision: (revision, reason) => writePlatform(baseUrl, `/platform/help-center/revisions/${revision}/restore`, { reason }, crypto.randomUUID()),
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
    previewUserRolesUpdate: async (userId, roles, reason) => {
      const response = await writePlatform<{ preview: { action: string; target: string; revision: string; payload: { roles?: string[] } }; confirmation: { token: string } }>(baseUrl, "/platform/privileged-actions/preview", { action: "platform.user.roles.update", target: userId, reason, payload: { userId, roles } }, crypto.randomUUID())
      return { action: "platform.user.roles.update", targetId: response.preview.target, roles: response.preview.payload.roles || roles, revision: response.preview.revision, confirmationToken: response.confirmation.token }
    },
    executeUserRolesUpdate: async (preview, reason) => {
      const response = await writePlatform<UserRolesUpdateResult>(baseUrl, `/platform/users/${encodeURIComponent(preview.targetId)}/roles`, { roles: preview.roles, reason, previewRevision: preview.revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": preview.confirmationToken })
      return { roles: response.roles || preview.roles, mfaRequired: Boolean(response.mfaRequired), revokedSessions: Number(response.revokedSessions || 0), notificationSent: Boolean(response.notificationSent) }
    },
    previewUserTenantMembershipUpdate: async (userId, tenantId, role, active, reason) => {
      const response = await writePlatform<{ preview: { target: string; revision: string; state: Array<{ tenant_id: string | number; tenant_name: string; role: "owner" | "admin" | "staff"; is_active: boolean }> }; confirmation: { token: string } }>(baseUrl, "/platform/privileged-actions/preview", { action: "platform.user.tenant_membership.update", target: userId, reason, payload: { userId, tenantId, role, active } }, crypto.randomUUID())
      const current = response.preview.state.find((item) => String(item.tenant_id) === tenantId)
      return { action: "platform.user.tenant_membership.update", targetId: response.preview.target, tenantId, tenantName: current?.tenant_name || "Selected tenant", role, active, previousRole: current?.role || null, previouslyActive: current ? current.is_active !== false : null, revision: response.preview.revision, confirmationToken: response.confirmation.token }
    },
    executeUserTenantMembershipUpdate: async (preview, reason) => {
      const response = await writePlatform<{ mfaRequired: boolean; revokedSessions: number }>(baseUrl, `/platform/users/${encodeURIComponent(preview.targetId)}/tenant-memberships`, { tenantId: preview.tenantId, role: preview.role, active: preview.active, reason, previewRevision: preview.revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": preview.confirmationToken })
      return { mfaRequired: Boolean(response.mfaRequired), revokedSessions: Number(response.revokedSessions || 0) }
    },
    previewUserMfaReset: async (userId, reason) => {
      const response = await writePlatform<{ preview: { action: string; target: string; revision: string }; confirmation: { token: string } }>(baseUrl, "/platform/privileged-actions/preview", { action: "platform.user.mfa.reset", target: userId, reason, payload: { userId } }, crypto.randomUUID())
      return { action: "platform.user.mfa.reset", targetId: response.preview.target, revision: response.preview.revision, confirmationToken: response.confirmation.token }
    },
    executeUserMfaReset: async (preview, reason) => {
      const response = await writePlatform<{ mfaRequired: boolean; revokedSessions: number; notificationSent: boolean }>(baseUrl, `/platform/users/${encodeURIComponent(preview.targetId)}/mfa/reset`, { reason, previewRevision: preview.revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": preview.confirmationToken })
      return { mfaRequired: Boolean(response.mfaRequired), revokedSessions: Number(response.revokedSessions || 0), notificationSent: Boolean(response.notificationSent) }
    },
    previewUserAccessUpdate: async (userId, suspended, reason) => {
      const action = suspended ? "platform.user.access.suspend" : "platform.user.access.reactivate"
      const response = await writePlatform<{ preview: { action: string; target: string; revision: string }; confirmation: { token: string } }>(baseUrl, "/platform/privileged-actions/preview", { action, target: userId, reason, payload: { userId, suspended } }, crypto.randomUUID())
      return { action: action as UserAccessUpdatePreview["action"], targetId: response.preview.target, suspended, revision: response.preview.revision, confirmationToken: response.confirmation.token }
    },
    executeUserAccessUpdate: async (preview, reason) => {
      const response = await writePlatform<{ suspended: boolean; state: import("@/lib/platform-contracts").PlatformUserAccountState; revokedSessions: number; notificationSent: boolean }>(baseUrl, `/platform/users/${encodeURIComponent(preview.targetId)}/access`, { suspended: preview.suspended, reason, previewRevision: preview.revision }, crypto.randomUUID(), "POST", { "X-Transaction-Confirmation": preview.confirmationToken })
      return { suspended: Boolean(response.suspended), state: response.state, revokedSessions: Number(response.revokedSessions || 0), notificationSent: Boolean(response.notificationSent) }
    },
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
