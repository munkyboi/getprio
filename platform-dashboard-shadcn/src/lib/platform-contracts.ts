import type { QueueFeeSetting, SubscriptionPlan, SubscriptionPlanSlug } from "../../../shared/types"

export type ReadModelState = "available" | "unavailable" | "stale" | "denied" | "failed"

export type PlatformScope = "global" | "tenant" | "developer-project" | "environment"

export interface ReadModelMeta {
  requestId: string
  generatedAt: string
  scope: PlatformScope
  environment?: "sandbox" | "production" | "all"
  schemaVersion: string
}

export interface ReadModelModule<T> {
  state: ReadModelState
  status?: number
  code?: string
  generatedAt?: string
  staleAfterSeconds?: number
  data?: T
  message?: string
}

export interface PlatformViewerContext {
  user: { id: string; displayName: string; role: string }
  capabilities: string[]
  navigation: Array<"overview" | "operations" | "developer" | "billing" | "trust" | "settings">
  sessionExpiresAt: string
}

export interface PlatformMetric {
  label: string
  value: string
  trend: string
  trendTone: "positive" | "neutral" | "attention"
}

export interface PlatformAttentionItem {
  id: string
  title: string
  detail: string
  area: "developer" | "queue" | "tenant" | "billing" | "trust" | "mobile"
  actionLabel: string
  severity: "info" | "warning" | "critical"
}

export interface ActivityPoint {
  date: string
  events: number
  successfulEvents: number
}

export interface RecentActivity {
  id: string
  event: string
  scope: string
  status: "review" | "complete" | "action"
  occurredAt: string
}

export interface PlatformOverviewReadModel {
  metrics: PlatformMetric[]
  activity: ActivityPoint[]
  recentActivity: RecentActivity[]
  attentionCount: number
  attentionItems: PlatformAttentionItem[]
}

export type PlatformServiceState = "healthy" | "degraded" | "unknown"

export interface PlatformServiceHealthReadModel {
  services: Array<{
    id: string
    name: string
    description: string
    state: PlatformServiceState
    observedAt: string
    freshness: "live" | "recent" | "stale" | "not-observed"
    evidence: string
    metric: string
  }>
}

export interface PlatformQueueOperationsReadModel {
  metrics: Array<{ label: string; value: string; trend: string; trendTone: "positive" | "neutral" | "attention" }>
  queueDays: Array<{
    id: string
    tenantId: string
    tenantName: string
    locationId: string
    locationName: string
    businessDate: string
    state: string
    unresolvedTickets: number
    notificationBacklog: number
    reconciliationAttempts: number
    lastReconciliationError: string | null
    attention: "healthy" | "review" | "action"
  }>
}

export interface PlatformTenantsReadModel {
  metrics: Array<{ label: string; value: string; trend: string; trendTone: "positive" | "neutral" | "attention" }>
  tenants: Array<{
    id: string
    name: string
    slug: string
    owner: string
    active: boolean
    plan: string | null
    tickets: number
    vendorApproval: "approved" | "pending" | "rejected" | "unknown"
    createdAt: string
  }>
}

export interface PlatformTenantInspection {
  tenant: { id: string; name: string; slug: string }
  capacity: {
    planSlug: string | null
    subscriptionId: string | null
    lifecycleState: string | null
    resources: Record<string, { limit: number; used: number; creditRemaining: number; resetAt: string | null; source?: string; overrideId?: string | null }>
    lots: PlatformTenantCreditLot[]
  }
  overrides: Array<{ id: string; policyKey: string; value: unknown; expiresAt: string | null; revokedAt: string | null; reason: string | null }>
  tenantOverridesEnabled: boolean
  tenantCreditGrantsEnabled: boolean
}

export interface PlatformTenantCreditLot {
  id: string
  resourceKey: "queueTickets" | "queueEmailJourneys" | string
  remainingUnits: number
  expiresAt: string | null
  status: string
  sourceType: string
  grantedUnits: number
  consumedUnits: number
  revokedUnits: number
  frozenUnits: number
  reason: string | null
  createdAt: string | null
}

export interface TenantEntitlementPreview {
  action: "entitlement.override.publish" | "entitlement.override.revoke" | "credit.grant" | "credit.revoke" | "credit.refund.resolve" | "credit.dispute.resolve"
  targetId: string
  revision: string
  confirmationToken: string
}

export interface PlatformUsersReadModel {
  metrics: Array<{ label: string; value: string; trend: string; trendTone: "positive" | "neutral" | "attention" }>
  pagination: { page: number; pageSize: number; total: number; totalPages: number; search: string }
  users: Array<{
    id: string
    name: string
    roles: string[]
    state: "active" | "locked" | "suspended" | "deletion-requested" | "sandbox"
    emailVerified: boolean
    mfa: "required" | "enabled" | "not-enabled"
    lastLoginProvider: string | null
  }>
}

export interface PlatformUserDetails {
  id: string
  name: string
  displayName: string
  username: string
  email: string
  phone: string
  roles: string[]
  state: PlatformUsersReadModel["users"][number]["state"]
  emailVerified: boolean
  emailMfaEnabled: boolean
  mfaEnabled: boolean
  mfaRequired: boolean
  hasPassword: boolean
  lastLoginProvider: string | null
  activeSessions: number
  activeMfaFactors: number
  pendingMfaFactors: number
  unusedRecoveryCodes: number
  createdAt: string | null
  updatedAt: string | null
}

export type AccountDeletionTaskKind =
  | "application_relational_inventory"
  | "personal_data_inventory"
  | "object_storage_versions_and_caches"
  | "supplier_data"
  | "financial_and_legal_retention"
  | "backup_disposal"

export interface PlatformAccountDeletionTask {
  kind: AccountDeletionTaskKind
  label: string
  status: "pending" | "completed"
  evidence: string | null
  completedAt: string | null
  automationReport?: {
    version: number
    generatedAt: string
    scope: string
    sourceCount: number
    referenceCount: number
    sources: Array<{ source: string; recordCount: number }>
  } | null
}

export interface PlatformAccountDeletionScanReport {
  version: number
  generatedAt: string
  coverage: "partial" | "complete"
  scope: string
  referenceCount?: number
  sources?: Array<{ source: string; recordCount: number }>
  categories: Array<{
    id: string
    label: string
    status: "scanned" | "not_scanned" | "requires_review"
    sourceCount?: number
    referenceCount?: number
    reason?: string
    blockers?: Array<{ source: string; recordCount: number; deleteRules: string[]; items?: Array<{ id: string; ordinal: number }>; itemsComplete?: boolean }>
  }>
  inventory?: {
    version: number
    generatedAt: string
    scope: string
    sourceCount: number
    referenceCount: number
    sources: Array<{ source: string; recordCount: number; deleteRules?: string[]; items?: Array<{ id: string; ordinal: number; rowIdentity?: Record<string, string | null> }>; itemsComplete?: boolean }>
  }
}

export interface PlatformAccountDeletionCleanupSelection {
  reportVersion: number
  selected: Record<string, boolean>
  references: Record<string, string[]>
  exclusions: Record<string, string>
}

export interface PlatformAccountDeletionRequest {
  id: string
  userId: string | null
  accountName: string
  accountEmail: string
  status: "pending" | "processing" | "review_required" | "completed"
  requestedAt: string
  dueAt: string
  completedAt: string | null
  retentionNotice: string | null
  policyVersion: string
  attempts: number
  nextAttemptAt: string | null
  lastErrorCode: string | null
  acknowledgementSentAt: string | null
  completionSentAt: string | null
  scan: {
    status: "not_started" | "queued" | "running" | "report_ready" | "needs_attention"
    report: PlatformAccountDeletionScanReport | null
    requestedAt: string | null
    startedAt: string | null
    completedAt: string | null
    attempts: number
    errorCode: string | null
  }
  cleanup: {
    status: "not_started" | "queued" | "running" | "needs_attention" | "completed"
    selection: PlatformAccountDeletionCleanupSelection | null
    report: unknown
  }
  userReport: {
    status: "not_ready" | "ready" | "sending" | "sent" | "needs_attention"
    sentAt: string | null
    attempts: number
    errorCode: string | null
  }
  tasks: PlatformAccountDeletionTask[]
}

export interface PlatformAccountDeletionQueue {
  requests: PlatformAccountDeletionRequest[]
}

export interface PlatformAuditReadModel {
  metrics: Array<{ label: string; value: string; trend: string; trendTone: "positive" | "neutral" | "attention" }>
  events: Array<{
    id: string
    action: string
    resourceType: string
    resourceId: string | null
    outcome: "success" | "failed" | "denied" | "conflict" | "pending"
    actor: string
    scope: string
    requestId: string | null
    reason: string | null
    occurredAt: string
    digest: string
  }>
}

export interface PlatformBillingReadModel {
  metrics: Array<{ label: string; value: string; trend: string; trendTone: "positive" | "neutral" | "attention" }>
  counts: { subscriptions: number; purchases: number; refunds: number; disputes: number }
  subscriptions: Array<{
    id: string
    tenant: string
    plan: string
    status: "active" | "past_due" | "unpaid" | "suspended" | "expired" | "canceled"
    provider: string
    periodEnd: string | null
  }>
  creditPurchases: Array<{
    id: string
    tenant: string
    pack: string
    status: string
    amount: string
    provider: string
    createdAt: string
  }>
  creditRefundsEnabled: boolean
  creditDisputesEnabled: boolean
  creditRefunds: Array<{
    id: string
    purchaseId: string
    tenant: string
    purchaseStatus: string
    status: "requested" | "processing" | "confirmed" | "failed" | string
    amount: string
    provider: string
    reason: string | null
    providerRefundId: string | null
    createdAt: string
  }>
  creditDisputes: Array<{
    id: string
    purchaseId: string
    providerDisputeId: string
    tenant: string
    purchaseStatus: string
    status: "open" | "under_review" | "won" | "lost" | "closed" | string
    amount: string
    provider: string
    consumedExposureUnits: number
    openedAt: string
    resolvedAt: string | null
  }>
}

export interface PlatformModerationReadModel {
  metrics: PlatformMetric[]
  campaignReports: Array<{
    id: string
    campaignId: string
    campaignTitle: string
    category: string
    status: "open" | "reviewing" | "resolved" | "dismissed"
    campaignStatus: string
    reporter: string
    details: string | null
    createdAt: string
  }>
  ratingDisputes: Array<{
    id: string
    ratingType: "vendor_review" | "user_trust"
    ratingId: string
    status: "open" | "reviewing" | "resolved" | "dismissed"
    reason: string
    reporter: string
    createdAt: string
  }>
}

export interface PlatformSettingsReadModel {
  settings: {
    enterpriseInquiryEmail: string
    defaultTimezone: string
    mobileApprovedHosts: string[]
    maxImageUploadKb: number
  }
  controls: Array<{
    label: string
    state: "configured" | "restricted" | "observed"
    detail: string
  }>
}

export type PlatformReleaseSurfaceState = "ready" | "review" | "blocked" | "unknown"

export interface PlatformReleaseReadinessReadModel {
  metrics: PlatformMetric[]
  deploymentEvidence: {
    workflowRunId: string
    deploymentSha: string
    workflowUrl: string
    outcome: "success" | "failure"
    summary: string
    observedAt: string
  } | null
  surfaces: Array<{
    id: string
    surface: string
    environment: "production" | "sandbox" | "all"
    state: PlatformReleaseSurfaceState
    signal: string
    evidence: string
    nextAction: string
    observedAt: string
  }>
  controls: Array<{
    label: string
    environment: "production" | "sandbox"
    enabled: boolean
    detail: string
  }>
}

export interface HelpCenterReviewMetadata {
  owner: string
  timeZone: string
  cadenceDays: number
  appliesTo: Array<"web" | "mobile">
  lastReviewedAt: string | null
  reviewDueAt: string | null
  sourceReferences: string[]
}

export interface PlatformHelpCenterTopic {
  id: string
  title: string
  description: string
  archived?: boolean
}

export interface PlatformHelpCenterArticle {
  id: string
  topic: string
  title: string
  intro: string
  steps: string[]
  note: string
  link: string | null
  linkLabel: string | null
  archived?: boolean
  review: HelpCenterReviewMetadata
}

export interface PlatformHelpCenterFaq {
  id: string
  question: string
  answer: string
  relatedArticleId: string | null
  archived?: boolean
  review: HelpCenterReviewMetadata
}

export interface PlatformHelpCenterContent {
  topics: PlatformHelpCenterTopic[]
  articles: PlatformHelpCenterArticle[]
  faqs: PlatformHelpCenterFaq[]
}

export interface PlatformHelpCenterRevision {
  revision: number
  createdAt: string
  createdBy: string | number | null
  changeReason: string
  publishedAt: string | null
  publishedBy: string | number | null
}

export interface PlatformHelpCenterAdminReadModel {
  publishedRevision: number | null
  draftRevision: number | null
  content: PlatformHelpCenterContent
  revisions: PlatformHelpCenterRevision[]
}

export interface PlatformPlanMatrix {
  plans: SubscriptionPlan[]
  queueFees: QueueFeeSetting[]
  activeSubscribersByPlan: Partial<Record<SubscriptionPlanSlug, number>>
  planPolicyMutations: boolean
}

export interface PlanPolicyPreview {
  revision: string
  confirmationToken: string
}

export interface DeveloperProjectGovernanceReadModel {
  projectId: string
  projectName: string
  owner: string
  environments: Array<{
    name: "sandbox" | "production"
    readiness: "ready" | "needs-review" | "blocked"
    lastObservedAt: string
  }>
  sandboxAccounts: { active: number; limit: number; appleReview: "active" | "missing" | "expiring"; appleReviewAccount: { id: string; username: string; email: string; status: "active" | "expired"; expiresAt: string | null; deviceCount: number } | null }
  webhookHealth: {
    state: "healthy" | "degraded" | "suspended" | "unknown"
    lastObservedAt: string
    suspension: { reason: string; suspendedAt: string | null } | null
    registrations: Array<{ id: string; name: string; status: string; events: string[]; payloadVersion: number }>
    deliveryStats: { sent: number; failed: number; pending: number }
  }
  productionApproval: "not-submitted" | "in-review" | "approved" | "changes-requested"
  productionApprovalDetail: { status: string; pendingSubmissionId: string | null; lastFeedback: string | null }
  rateLimits: { sandbox: DeveloperRateLimit; production: DeveloperRateLimit }
}

export interface DeveloperApiKeyActivity {
  keyId: string
  requests: number
  reads: number
  writes: number
  clientErrors: number
  serverErrors: number
  rateLimited: number
  authFailures: number
  lastSeenAt: string | null
}

export interface PlatformDeveloperApiKey {
  id: string
  name: string
  environment: "sandbox" | "production"
  keyPrefix: string
  scopes: string[]
  status: "active" | "revoked"
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
  revokeReason: string | null
  activity: DeveloperApiKeyActivity
  signal: "normal" | "review"
}

export interface PlatformDeveloperApiKeyReview {
  project: { id: string; name: string; status: "active" | "archived" }
  keys: PlatformDeveloperApiKey[]
}

export interface DeveloperRateLimit {
  projectId: string | null
  environment: "sandbox" | "production"
  readLimitPerMinute: number
  writeLimitPerMinute: number
  updatedByUserId: string | null
  updatedAt: string | null
}

export interface SandboxCredentialResult {
  credentials: { username: string; email: string; password: string; expiresAt: string }
  warning: string
}

export interface UserSessionRevokePreview {
  action: string
  targetId: string
  revision: string
  confirmationToken: string
  activeSessions: number
}

export interface UserPasswordResetPreview {
  action: "platform.user.password_reset.send"
  targetId: string
  revision: string
  confirmationToken: string
}

export interface UserRolesUpdatePreview {
  action: "platform.user.roles.update"
  targetId: string
  roles: string[]
  revision: string
  confirmationToken: string
}

export interface UserRolesUpdateResult {
  roles: string[]
  mfaRequired: boolean
  revokedSessions: number
  notificationSent: boolean
}

export interface UserMfaResetPreview {
  action: "platform.user.mfa.reset"
  targetId: string
  revision: string
  confirmationToken: string
}

export interface UserAccessUpdatePreview {
  action: "platform.user.access.suspend" | "platform.user.access.reactivate"
  targetId: string
  suspended: boolean
  revision: string
  confirmationToken: string
}

export type PlatformUserAccountState = "active" | "suspended" | "locked" | "sandbox" | "deletion-requested"

export interface DeveloperProjectSummary {
  id: string
  name: string
  status: "active" | "archived"
  productionApproval: "not-submitted" | "in-review" | "approved" | "changes-requested"
}

export interface PlatformApi {
  getViewerContext(): Promise<ReadModelModule<PlatformViewerContext> & { meta: ReadModelMeta }>
  getOverview(): Promise<ReadModelModule<PlatformOverviewReadModel> & { meta: ReadModelMeta }>
  getServiceHealth(): Promise<ReadModelModule<PlatformServiceHealthReadModel> & { meta: ReadModelMeta }>
  getQueueOperations(): Promise<ReadModelModule<PlatformQueueOperationsReadModel> & { meta: ReadModelMeta }>
  getTenants(): Promise<ReadModelModule<PlatformTenantsReadModel> & { meta: ReadModelMeta }>
  getUsers(page?: number, search?: string): Promise<ReadModelModule<PlatformUsersReadModel> & { meta: ReadModelMeta }>
  getAccountDeletionRequests(): Promise<PlatformAccountDeletionQueue>
  beginAccountDeletionScan(requestId: string, reason: string): Promise<{ scan: { id: string; scanStatus: PlatformAccountDeletionRequest["scan"]["status"]; alreadyQueued: boolean } }>
  previewAccountDeletionAction(requestId: string, action: "cleanup.begin" | "report.send", payload: Record<string, unknown>, reason: string): Promise<{ revision: string; confirmationToken: string }>
  beginAccountDeletionCleanup(requestId: string, reportVersion: number, selection: Record<string, boolean>, references: Record<string, string[]>, exclusions: Record<string, string>, reason: string, revision: string, confirmationToken: string): Promise<{ cleanup: { id: string; cleanupStatus: PlatformAccountDeletionRequest["cleanup"]["status"]; alreadyQueued: boolean } }>
  sendAccountDeletionReport(requestId: string, reason: string, revision: string, confirmationToken: string): Promise<{ report: { id: string; reportStatus: PlatformAccountDeletionRequest["userReport"]["status"]; alreadyQueued: boolean } }>
  completeAccountDeletionTask(requestId: string, taskKind: AccountDeletionTaskKind, evidence: string, reason: string, retentionNotice?: string): Promise<{ request: { id: string; status: PlatformAccountDeletionRequest["status"]; dueAt: string; readyForErasure: boolean; task: PlatformAccountDeletionTask } }>
  getUserDetails(userId: string): Promise<PlatformUserDetails>
  getSecurityAudit(): Promise<ReadModelModule<PlatformAuditReadModel> & { meta: ReadModelMeta }>
  getBilling(): Promise<ReadModelModule<PlatformBillingReadModel> & { meta: ReadModelMeta }>
  getPlanMatrix(): Promise<PlatformPlanMatrix>
  previewPlanPolicy(action: "plan.defaults.publish" | "queue.fees.publish", target: string, payload: Record<string, unknown>, reason: string, previewRevision: string): Promise<PlanPolicyPreview>
  publishPlan(plan: SubscriptionPlan, reason: string, preview: PlanPolicyPreview): Promise<SubscriptionPlan>
  publishQueueFees(queueFees: Array<Pick<QueueFeeSetting, "planSlug" | "enabled" | "amountCents">>, reason: string, preview: PlanPolicyPreview): Promise<QueueFeeSetting[]>
  getModeration(): Promise<ReadModelModule<PlatformModerationReadModel> & { meta: ReadModelMeta }>
  getSettings(): Promise<ReadModelModule<PlatformSettingsReadModel> & { meta: ReadModelMeta }>
  updateSettings(settings: PlatformSettingsReadModel["settings"], reason: string, expectedSettings: PlatformSettingsReadModel["settings"]): Promise<PlatformSettingsReadModel["settings"]>
  getReleaseReadiness(): Promise<ReadModelModule<PlatformReleaseReadinessReadModel> & { meta: ReadModelMeta }>
  getHelpCenterAdmin(): Promise<PlatformHelpCenterAdminReadModel>
  saveHelpCenterDraft(content: PlatformHelpCenterContent, reason: string): Promise<{ draft: { revision: number } }>
  publishHelpCenterRevision(revision: number, reason: string): Promise<{ publish: { publishedRevision: number; previousPublishedRevision: number | null } }>
  restoreHelpCenterRevision(revision: number, reason: string): Promise<{ draft: { revision: number; restoredFromRevision: number } }>
  getDeveloperProjects(): Promise<ReadModelModule<{ projects: DeveloperProjectSummary[] }> & { meta: ReadModelMeta }>
  getDeveloperProjectGovernance(projectId: string): Promise<ReadModelModule<DeveloperProjectGovernanceReadModel> & { meta: ReadModelMeta }>
  getDeveloperApiKeys(projectId: string): Promise<PlatformDeveloperApiKeyReview>
  revokeDeveloperApiKey(projectId: string, keyId: string, reason: string): Promise<{ key: Pick<PlatformDeveloperApiKey, "id" | "status" | "revokedAt" | "revokeReason"> }>
  suspendDeveloperWebhooks(projectId: string, reason: string): Promise<void>
  reinstateDeveloperWebhooks(projectId: string, reason: string): Promise<void>
  reviewDeveloperApproval(projectId: string, submissionId: string, status: "approved" | "changes_requested" | "rejected", feedback: string): Promise<void>
  createAppleReviewAccount(projectId: string): Promise<SandboxCredentialResult>
  resetAppleReviewAccount(projectId: string, accountId: string): Promise<SandboxCredentialResult>
  getDeveloperRateLimit(projectId: string, environment: "sandbox" | "production"): Promise<DeveloperRateLimit>
  updateDeveloperRateLimit(projectId: string, environment: "sandbox" | "production", readLimitPerMinute: number, writeLimitPerMinute: number, reason: string): Promise<void>
  previewSubscriptionSuspend(subscriptionId: string, reason: string): Promise<{ action: string; targetId: string; revision: string; confirmationToken: string }>
  executeSubscriptionSuspend(subscriptionId: string, reason: string, revision: string, confirmationToken: string): Promise<void>
  previewModerationAction(action: "moderation.campaign_report.status" | "moderation.rating_dispute.resolve", targetId: string, payload: Record<string, string>, reason: string): Promise<{ action: string; targetId: string; revision: string; confirmationToken: string }>
  updateCampaignReportStatus(reportId: string, status: "reviewing" | "resolved" | "dismissed", reason: string, revision: string, confirmationToken: string): Promise<void>
  resolveRatingDispute(disputeId: string, status: "resolved" | "dismissed", moderationStatus: "active" | "hidden", reason: string, revision: string, confirmationToken: string): Promise<void>
  previewQueueRepair(action: "reconcile_overdue_queue_day" | "requeue_notification", targetId: string, reason: string): Promise<{ action: string; targetId: string; revision: string; confirmationToken: string; requiresMfa: boolean; mutatesCustomerIdentity: boolean }>
  executeQueueRepair(action: string, targetId: string, reason: string, revision: string, confirmationToken: string): Promise<void>
  previewUserSessionRevoke(userId: string, reason: string): Promise<UserSessionRevokePreview>
  executeUserSessionRevoke(userId: string, reason: string, revision: string, confirmationToken: string): Promise<{ revokedSessions: number }>
  previewUserPasswordReset(userId: string, reason: string): Promise<UserPasswordResetPreview>
  executeUserPasswordReset(userId: string, reason: string, revision: string, confirmationToken: string): Promise<void>
  previewUserRolesUpdate(userId: string, roles: string[], reason: string): Promise<UserRolesUpdatePreview>
  executeUserRolesUpdate(preview: UserRolesUpdatePreview, reason: string): Promise<UserRolesUpdateResult>
  previewUserMfaReset(userId: string, reason: string): Promise<UserMfaResetPreview>
  executeUserMfaReset(preview: UserMfaResetPreview, reason: string): Promise<{ mfaRequired: boolean; revokedSessions: number; notificationSent: boolean }>
  previewUserAccessUpdate(userId: string, suspended: boolean, reason: string): Promise<UserAccessUpdatePreview>
  executeUserAccessUpdate(preview: UserAccessUpdatePreview, reason: string): Promise<{ suspended: boolean; state: PlatformUserAccountState; revokedSessions: number; notificationSent: boolean }>
  inspectTenant(tenantId: string): Promise<PlatformTenantInspection>
  previewTenantEntitlement(action: TenantEntitlementPreview["action"], targetId: string, payload: Record<string, unknown>, reason: string): Promise<TenantEntitlementPreview>
  executeTenantEntitlement(tenantId: string, overrideId: string | null, payload: Record<string, unknown>, reason: string, preview: TenantEntitlementPreview): Promise<void>
  grantTenantCredits(tenantId: string, ticketUnits: number, journeyUnits: number, expiresAt: string | null, reason: string, preview: TenantEntitlementPreview): Promise<void>
  revokeTenantCredits(lotId: string, units: number, reason: string, preview: TenantEntitlementPreview): Promise<void>
  previewCreditCase(action: "credit.refund.resolve" | "credit.dispute.resolve", targetId: string, payload: Record<string, unknown>, reason: string): Promise<TenantEntitlementPreview>
  resolveCreditRefund(purchaseId: string, outcome: "confirmed" | "failed", providerRefundId: string | null, reason: string, preview: TenantEntitlementPreview): Promise<void>
  resolveCreditDispute(providerDisputeId: string, outcome: "won" | "lost", reason: string, preview: TenantEntitlementPreview): Promise<void>
}
