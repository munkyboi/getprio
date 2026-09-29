const db = require("../config/db");
const env = require("../config/env");
const releaseControls = require("../config/releaseControls");
const developerProjects = require("../repositories/developerProjects");
const developerTestAccounts = require("../repositories/developerTestAccounts");
const developerWebhooks = require("../repositories/developerWebhooks");
const developerWebhookSuspensions = require("../repositories/developerWebhookSuspensions");
const developerApiRateLimits = require("../repositories/developerApiRateLimits");
const platformReleaseReadinessEvidence = require("./platformReleaseReadinessEvidence");
const organizerCampaignRepository = require("../repositories/organizerCampaigns");
const ratingRepository = require("../repositories/ratings");
const platformRepository = require("../repositories/platform");
const { getGlobalPermissions } = require("./permissions");

const SCHEMA_VERSION = "platform-read-model.v1";
const MAX_SANDBOX_ACCOUNTS = developerTestAccounts.MAX_ACCOUNTS || 2;

function meta(req, scope, environment = "all") {
  return {
    requestId: req.context?.correlationId || "unavailable",
    generatedAt: new Date().toISOString(),
    scope,
    environment,
    schemaVersion: SCHEMA_VERSION
  };
}

function envelope(req, scope, data, environment = "all") {
  return { data, meta: meta(req, scope, environment), errors: [] };
}

function displayName(user) {
  return user?.displayName || user?.name || user?.username || user?.email || "Platform admin";
}

function attentionStatus(outcome) {
  if (outcome === "success") return "complete";
  if (outcome === "pending") return "review";
  return "action";
}

function approvalStatus(status) {
  if (status === "pending_review") return "in-review";
  if (status === "approved") return "approved";
  if (["changes_requested", "rejected"].includes(status)) return "changes-requested";
  return "not-submitted";
}

function readinessForApproval(status) {
  if (status === "approved") return "ready";
  if (["changes_requested", "rejected"].includes(status)) return "blocked";
  return "needs-review";
}

function approvalDetail(approval) {
  const pendingSubmission = approval?.submissions?.find((submission) => submission.status === "pending_review") || null;
  const reviewedSubmissions = (approval?.submissions || [])
    .filter((submission) => submission.reviewedAt)
    .sort((left, right) => new Date(right.reviewedAt).getTime() - new Date(left.reviewedAt).getTime());
  return {
    status: approval?.status || "not_submitted",
    pendingSubmissionId: pendingSubmission ? String(pendingSubmission.id) : null,
    lastFeedback: reviewedSubmissions[0]?.reviewFeedback || null
  };
}

async function getViewerContext(req) {
  const permissions = [...getGlobalPermissions(req.user)];
  const permissionSet = new Set(permissions);
  const navigation = [
    "overview",
    permissionSet.has("platform.tenants.read") || permissionSet.has("platform.queue_lifecycle.read") || permissionSet.has("platform.users.read") ? "operations" : null,
    permissionSet.has("platform.developer_api.manage") ? "developer" : null,
    permissionSet.has("platform.billing.read") ? "billing" : null,
    permissionSet.has("platform.security_audit.read") || permissionSet.has("platform.settings.manage") ? "trust" : null,
    permissionSet.has("platform.settings.manage") ? "settings" : null
  ].filter(Boolean);
  return envelope(req, "global", {
    user: { id: String(req.user._id), displayName: displayName(req.user), role: req.user.roles?.includes("platform_admin") ? "Platform Admin" : "Platform User" },
    capabilities: permissions,
    navigation,
    sessionExpiresAt: req.auth?.session?.inactivityExpiresAt || req.auth?.session?.expiresAt || null
  });
}

async function getOverview(req) {
  const [tenantCount, projectCount, queueHealth, attention, activity, recentActivity] = await Promise.all([
    db.pool.query("SELECT COUNT(*)::INTEGER AS count FROM tenants WHERE is_active = TRUE"),
    db.pool.query("SELECT COUNT(*)::INTEGER AS count FROM developer_projects WHERE status = 'active'"),
    db.pool.query(`
      SELECT COUNT(*) FILTER (WHERE state = 'open' AND last_reconciliation_error IS NULL)::INTEGER AS healthy,
             COUNT(*) FILTER (WHERE state = 'open')::INTEGER AS total
      FROM queue_days
      WHERE business_date >= ((NOW() AT TIME ZONE 'UTC')::date - 6)
        AND business_date <= (NOW() AT TIME ZONE 'UTC')::date
    `),
    db.pool.query(`
      SELECT 'tenant-approval' AS category, COUNT(*)::INTEGER AS count
      FROM tenants WHERE is_active = TRUE AND vendor_approval_status = 'pending'
      HAVING COUNT(*) > 0
      UNION ALL
      SELECT 'production-review', COUNT(*)::INTEGER
      FROM developer_project_production_applications WHERE status = 'pending_review'
      HAVING COUNT(*) > 0
      UNION ALL
      SELECT 'webhook-suspension', COUNT(*)::INTEGER
      FROM developer_project_webhook_suspensions WHERE status = 'active'
      HAVING COUNT(*) > 0
      UNION ALL
      SELECT 'webhook-failure', COUNT(*)::INTEGER
      FROM developer_webhook_deliveries WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '24 hours'
      HAVING COUNT(*) > 0
    `),
    db.pool.query(`
      SELECT TO_CHAR(day, 'Mon DD') AS date,
             COUNT(events.id)::INTEGER AS total_events,
             COUNT(events.id) FILTER (WHERE events.outcome = 'success')::INTEGER AS successful_events
      FROM generate_series(
        ((NOW() AT TIME ZONE 'UTC')::date - INTERVAL '13 days')::timestamp,
        (NOW() AT TIME ZONE 'UTC')::date::timestamp,
        INTERVAL '1 day'
      ) day
      LEFT JOIN security_audit_events events
        ON events.occurred_at >= (day AT TIME ZONE 'UTC')
       AND events.occurred_at < ((day + INTERVAL '1 day') AT TIME ZONE 'UTC')
      GROUP BY day
      ORDER BY day
    `),
    db.pool.query(`
      SELECT action_key, COALESCE(resource_id, resource_type) AS scope,
             outcome, occurred_at
      FROM security_audit_events
      ORDER BY occurred_at DESC, id DESC
      LIMIT 5
    `)
  ]);

  const healthy = Number(queueHealth.rows[0]?.healthy || 0);
  const total = Number(queueHealth.rows[0]?.total || 0);
  const queueValue = total ? `${Math.round((healthy / total) * 1000) / 10}%` : "—";
  const attentionItems = attention.rows.map((row) => {
    const count = Number(row.count || 0);
    const plural = count === 1 ? "" : "s";
    const details = {
      "tenant-approval": { title: `${count} tenant${plural} awaiting approval`, detail: "Pending tenant approvals", area: "tenant", severity: "warning", actionLabel: "Review" },
      "production-review": { title: `${count} production review${plural} pending`, detail: "Developer API · production access", area: "developer", severity: "warning", actionLabel: "Review" },
      "webhook-suspension": { title: `${count} webhook receiver${plural} suspended`, detail: "Developer API · active suspensions", area: "developer", severity: "critical", actionLabel: "Action" },
      "webhook-failure": { title: `${count} webhook deliver${count === 1 ? "y" : "ies"} failed`, detail: "Developer API · last 24 hours", area: "developer", severity: "critical", actionLabel: "Action" }
    }[row.category];
    return details ? { id: row.category, ...details } : null;
  }).filter(Boolean);
  const attentionCount = attention.rows.reduce((sum, row) => sum + Number(row.count || 0), 0);

  return envelope(req, "global", {
    metrics: [
      { label: "Needs attention", value: String(attentionCount), trend: "Live aggregate", trendTone: attentionCount ? "attention" : "positive" },
      { label: "Active tenants", value: String(tenantCount.rows[0]?.count || 0), trend: "Current platform scope", trendTone: "neutral" },
      { label: "Queue health", value: queueValue, trend: total ? `${healthy} of ${total} recent open queue days healthy` : "No recent queue-day observations", trendTone: !total ? "neutral" : healthy < total ? "attention" : "positive" },
      { label: "API projects", value: String(projectCount.rows[0]?.count || 0), trend: "Active Developer API projects", trendTone: "neutral" }
    ],
    attentionCount,
    attentionItems,
    activity: activity.rows.map((row) => ({ date: row.date, events: Number(row.total_events || 0), successfulEvents: Number(row.successful_events || 0) })),
    recentActivity: recentActivity.rows.map((row) => ({
      id: `${row.action_key}-${row.occurred_at}`,
      event: row.action_key,
      scope: row.scope,
      status: attentionStatus(row.outcome),
      occurredAt: row.occurred_at
    }))
  });
}

async function getModeration(req) {
  const [summary, campaignReports, ratingDisputes] = await Promise.all([
    db.pool.query(`
      SELECT
        (SELECT COUNT(*)::INTEGER FROM organizer_campaign_reports WHERE report_status IN ('open', 'reviewing')) AS open_reports,
        (SELECT COUNT(*)::INTEGER FROM rating_disputes WHERE dispute_status IN ('open', 'reviewing')) AS open_disputes,
        ((SELECT COUNT(*) FROM organizer_campaign_reports WHERE report_status = 'resolved' AND updated_at >= date_trunc('week', NOW()))
         + (SELECT COUNT(*) FROM rating_disputes WHERE dispute_status = 'resolved' AND resolved_at >= date_trunc('week', NOW())))::INTEGER AS resolved_this_week
    `),
    organizerCampaignRepository.listReports(),
    ratingRepository.listDisputes()
  ]);
  const mapStatus = (value) => ["open", "reviewing", "resolved", "dismissed"].includes(value) ? value : "open";
  const reports = campaignReports.map((row) => ({
    id: String(row.id),
    campaignId: String(row.campaign_id),
    campaignTitle: row.campaign_title || "Untitled campaign",
    category: row.category,
    status: mapStatus(row.report_status),
    campaignStatus: row.campaign_status,
    reporter: row.reporter_user_id == null ? "Anonymized account" : `user_${row.reporter_user_id}`,
    details: row.details || null,
    createdAt: row.created_at
  }));
  const disputes = ratingDisputes.map((row) => ({
    id: String(row.id),
    ratingType: row.rating_type,
    ratingId: String(row.rating_id),
    status: mapStatus(row.dispute_status),
    reason: row.reason,
    reporter: `user_${row.reporter_user_id}`,
    createdAt: row.created_at
  }));
  const totals = summary.rows[0] || {};
  const openReports = Number(totals.open_reports || 0);
  const openDisputes = Number(totals.open_disputes || 0);
  const resolvedThisWeek = Number(totals.resolved_this_week || 0);
  return envelope(req, "global", {
    metrics: [
      { label: "Open reports", value: String(openReports), trend: "Needs triage", trendTone: openReports ? "attention" : "positive" },
      { label: "Rating disputes", value: String(openDisputes), trend: "Awaiting resolution", trendTone: openDisputes ? "attention" : "positive" },
      { label: "Resolved this week", value: String(resolvedThisWeek), trend: "Moderation throughput", trendTone: "positive" }
    ],
    campaignReports: reports,
    ratingDisputes: disputes
  });
}

async function getSettings(req) {
  const settings = await platformRepository.getPlatformSettings();
  return envelope(req, "global", {
    settings,
    controls: [
      { label: "Enterprise inquiry routing", state: settings.enterpriseInquiryEmail ? "configured" : "restricted", detail: settings.enterpriseInquiryEmail ? "Platform email is configured for inbound enterprise requests." : "An enterprise inquiry address is required." },
      { label: "Default timezone", state: settings.defaultTimezone ? "configured" : "restricted", detail: settings.defaultTimezone ? `${settings.defaultTimezone} is the current Platform default.` : "No Platform default timezone is configured." },
      { label: "Mobile approved hosts", state: "restricted", detail: `${settings.mobileApprovedHosts.length} HTTPS host${settings.mobileApprovedHosts.length === 1 ? "" : "s"} are allowlisted for mobile flows.` },
      { label: "Image upload limit", state: settings.maxImageUploadKb ? "configured" : "restricted", detail: `${settings.maxImageUploadKb.toLocaleString()} KB maximum accepted image size.` }
    ]
  });
}

async function getReleaseReadiness(req) {
  const deploymentReport = await platformReleaseReadinessEvidence.getLatestReport();
  const sandboxIosConfigured = Boolean(env.sandboxTestFlightPublicUrl);
  const sandboxAndroidConfigured = Boolean(env.sandboxAndroidPackageName && env.sandboxAndroidGooglePlayPublicUrl);
  const sandboxPushConfigured = Boolean(env.fcmSandboxProjectId && env.fcmSandboxClientEmail && env.fcmSandboxPrivateKey);
  const surfaces = [
    {
      id: "platform-web",
      surface: "Platform web dashboard",
      environment: "production",
      state: "unknown",
      signal: "Production deployment not observed",
      evidence: "No verified production deployment observation is connected. This server's configured origin does not establish production deployment or availability.",
      nextAction: "Connect production deployment evidence, then verify the authenticated public flow.",
      observedAt: "Not observed"
    },
    {
      id: "platform-api",
      surface: "Platform API",
      environment: "production",
      state: "unknown",
      signal: "Production deployment not observed",
      evidence: "Authenticated production smoke evidence has not been observed; local read-model availability does not establish a deployed production API.",
      nextAction: "Connect production deployment evidence and run an authenticated smoke against the deployed API.",
      observedAt: "Not observed"
    },
    {
      id: "sandbox-ios",
      surface: "Sandbox iOS",
      environment: "sandbox",
      state: sandboxIosConfigured ? "review" : "blocked",
      signal: sandboxIosConfigured ? "TestFlight distribution configured" : "TestFlight distribution not configured",
      evidence: sandboxIosConfigured ? "A public distribution contract is configured; build availability and installation are not inferred." : "No public TestFlight distribution contract is configured.",
      nextAction: sandboxIosConfigured ? "Confirm build availability and install on a physical device." : "Configure the Sandbox TestFlight distribution contract.",
      observedAt: sandboxIosConfigured ? "Configured" : "Not configured"
    },
    {
      id: "sandbox-android",
      surface: "Sandbox Android",
      environment: "sandbox",
      state: sandboxAndroidConfigured ? "review" : "blocked",
      signal: sandboxAndroidConfigured ? "Google Play testing track configured" : "Google Play testing track not configured",
      evidence: sandboxAndroidConfigured ? "Sandbox package and distribution contract are configured; tester access is not inferred." : "No Sandbox Android distribution contract is configured.",
      nextAction: sandboxAndroidConfigured ? "Confirm tester access and install on a physical device." : "Configure the Sandbox Android distribution contract.",
      observedAt: sandboxAndroidConfigured ? "Configured" : "Not configured"
    },
    {
      id: "mobile-push",
      surface: "Mobile push pipeline",
      environment: "all",
      state: sandboxPushConfigured ? "review" : "unknown",
      signal: sandboxPushConfigured ? "Sandbox FCM configuration present" : "Heartbeat required",
      evidence: sandboxPushConfigured ? "Sandbox FCM credentials are configured; delivery success still requires a client heartbeat." : "No complete Sandbox FCM configuration is available in the server environment.",
      nextAction: sandboxPushConfigured ? "Verify push on vendor and Sandbox clients." : "Add a safe heartbeat and complete the Sandbox push configuration.",
      observedAt: sandboxPushConfigured ? "Configured" : "Not observed"
    }
  ];
  if (deploymentReport) {
    const outcome = deploymentReport.outcome === "success" ? "ready" : "review";
    const signal = deploymentReport.outcome === "success" ? "Authenticated post-deploy smoke passed" : "Post-deploy smoke needs review";
    const observedAt = new Date(deploymentReport.observed_at).toISOString();
    for (const surfaceId of ["platform-web", "platform-api"]) {
      const surface = surfaces.find((item) => item.id === surfaceId);
      surface.state = outcome;
      surface.signal = signal;
      surface.evidence = `${deploymentReport.summary} Deployed revision ${String(deploymentReport.deployment_sha).slice(0, 12)}.`;
      surface.nextAction = deploymentReport.outcome === "success"
        ? "Continue monitoring the deployed Platform flow."
        : "Review the post-deploy smoke result and rerun after resolving the issue.";
      surface.observedAt = observedAt;
    }
  }
  const countState = (state) => surfaces.filter((surface) => surface.state === state).length;
  const readyCount = countState("ready");
  const reviewCount = countState("review");
  const blockedCount = countState("blocked");
  const unknownCount = countState("unknown");
  return envelope(req, "global", {
    metrics: [
      { label: "Surfaces in scope", value: String(surfaces.length), trend: "Web, API, Sandbox, and mobile signals", trendTone: "neutral" },
      { label: "Verified ready", value: String(readyCount), trend: "Requires current verification evidence", trendTone: readyCount ? "positive" : "attention" },
      { label: "Review required", value: String(reviewCount), trend: "Configured surfaces still need checks", trendTone: reviewCount ? "attention" : "positive" },
      { label: "Blocked", value: String(blockedCount), trend: "Known release blockers", trendTone: blockedCount ? "attention" : "positive" },
      { label: "Not observed", value: String(unknownCount), trend: "Deployment or operational evidence unavailable", trendTone: unknownCount ? "attention" : "positive" }
    ],
    surfaces,
    deploymentEvidence: deploymentReport ? {
      workflowRunId: String(deploymentReport.workflow_run_id),
      deploymentSha: deploymentReport.deployment_sha,
      workflowUrl: deploymentReport.workflow_url,
      outcome: deploymentReport.outcome,
      summary: deploymentReport.summary,
      observedAt: new Date(deploymentReport.observed_at).toISOString()
    } : null,
    controls: [
      { label: "Usage-credit checkout", environment: "production", enabled: Boolean(releaseControls.usageCreditCheckout), detail: "Server release control for usage-credit checkout mutations." },
      { label: "Subscription lifecycle", environment: "production", enabled: Boolean(releaseControls.subscriptionLifecycle), detail: "Server release control for subscription lifecycle mutations." },
      { label: "Plan policy mutations", environment: "production", enabled: Boolean(releaseControls.planPolicyMutations), detail: "Server release control for plan policy changes." },
      { label: "Sandbox distribution links", environment: "sandbox", enabled: sandboxIosConfigured && sandboxAndroidConfigured, detail: "Configuration presence only; it does not prove tester access or installation." }
    ]
  });
}

async function getServiceHealth(req) {
  const [database, queueReconciliation, developerDeliveries] = await Promise.all([
    db.pool.query("SELECT NOW() AS observed_at"),
    db.pool.query(`
      SELECT COUNT(*) FILTER (WHERE state = 'open' AND last_reconciliation_error IS NULL)::INTEGER AS healthy,
             COUNT(*) FILTER (WHERE state = 'open')::INTEGER AS total,
             COUNT(*) FILTER (WHERE last_reconciliation_error IS NOT NULL)::INTEGER AS failed,
             MAX(COALESCE(last_reconciled_at, updated_at)) AS last_observed_at
      FROM queue_days
      WHERE business_date >= ((NOW() AT TIME ZONE 'UTC')::date - 6)
        AND business_date <= (NOW() AT TIME ZONE 'UTC')::date
    `),
    db.pool.query(`
      SELECT COUNT(*)::INTEGER AS total,
             COUNT(*) FILTER (WHERE d.status = 'failed')::INTEGER AS failed,
             MAX(d.updated_at) AS last_observed_at
      FROM developer_webhook_deliveries d
      WHERE d.updated_at >= NOW() - INTERVAL '24 hours'
    `)
  ]);

  const observedAt = database.rows[0]?.observed_at || new Date().toISOString();
  const queue = queueReconciliation.rows[0] || {};
  const developer = developerDeliveries.rows[0] || {};
  const queueHealthy = Number(queue.healthy || 0);
  const queueTotal = Number(queue.total || 0);
  const queueFailed = Number(queue.failed || 0);
  const developerTotal = Number(developer.total || 0);
  const developerFailed = Number(developer.failed || 0);

  return envelope(req, "global", {
    services: [
      {
        id: "platform-api",
        name: "Platform API",
        description: "Authenticated control-plane read models",
        state: "healthy",
        observedAt,
        freshness: "live",
        evidence: "Request served with database-backed aggregate",
        metric: "Database reachable"
      },
      {
        id: "queue-reconciliation",
        name: "Queue reconciliation",
        description: "Queue-day lifecycle and recovery workers",
        state: queueFailed > 0 ? "degraded" : queueTotal > 0 ? "healthy" : "unknown",
        observedAt: queue.last_observed_at || "Not observed",
        freshness: queue.last_observed_at ? "recent" : "not-observed",
        evidence: queueFailed > 0 ? `${queueFailed} queue days with reconciliation errors in the last 7 days` : queueTotal > 0 ? "No reconciliation errors among recent open queue days" : "No recent queue-day observations",
        metric: queueTotal ? `${Math.round((queueHealthy / queueTotal) * 1000) / 10}% healthy` : "No recent queue-day observations"
      },
      {
        id: "developer-api",
        name: "Developer API",
        description: "Ticket issuance, queue snapshots, and webhooks",
        state: developerFailed > 0 ? "degraded" : developerTotal > 0 ? "healthy" : "unknown",
        observedAt: developer.last_observed_at || observedAt,
        freshness: developer.last_observed_at ? "recent" : "not-observed",
        evidence: developerFailed > 0 ? `${developerFailed} failed webhook deliveries in the last 24 hours` : developerTotal > 0 ? "Webhook delivery activity observed in the last 24 hours" : "No webhook delivery activity observed in the last 24 hours",
        metric: developerTotal ? `${developerTotal} deliveries observed` : "No delivery observations"
      },
      {
        id: "mobile-push",
        name: "Mobile push pipeline",
        description: "Notification outbox feeding vendor and sandbox clients",
        state: "unknown",
        observedAt: "Not observed",
        freshness: "not-observed",
        evidence: "No mobile heartbeat is included in this read model",
        metric: "Heartbeat required"
      }
    ]
  });
}

async function getQueueOperations(req) {
  const [summary, result] = await Promise.all([
    db.pool.query(`
      SELECT
        (SELECT COUNT(*)::INTEGER FROM queue_days WHERE state = 'open') AS open_queue_days,
        (SELECT COUNT(*)::INTEGER FROM queue_days WHERE last_reconciliation_error IS NOT NULL) AS reconciliation_issues,
        (SELECT COUNT(*)::INTEGER
         FROM tickets t
         INNER JOIN queue_days q ON q.id = t.current_queue_day_id
         WHERE (q.state = 'open' OR q.last_reconciliation_error IS NOT NULL)
           AND t.status IN ('waiting', 'called', 'skipped')) AS unresolved_tickets,
        (SELECT COUNT(*)::INTEGER
         FROM queue_notification_outbox outbox
         INNER JOIN queue_days q ON q.id = outbox.queue_day_id
         WHERE (q.state = 'open' OR q.last_reconciliation_error IS NOT NULL)
           AND outbox.status IN ('pending', 'retry', 'dead')) AS notification_backlog
    `),
    db.pool.query(`
    SELECT q.id,
           q.tenant_id,
           tenants.name AS tenant_name,
           q.location_id,
           store_locations.name AS location_name,
           q.business_date::text AS business_date,
           q.state,
           q.reconciliation_attempt_count,
           q.last_reconciliation_error,
           (
             SELECT COUNT(*)::INTEGER
             FROM tickets t
             WHERE t.current_queue_day_id = q.id
               AND t.status IN ('waiting', 'called', 'skipped')
           ) AS unresolved_tickets,
           (
             SELECT COUNT(*)::INTEGER
             FROM queue_notification_outbox outbox
             WHERE outbox.queue_day_id = q.id
               AND outbox.status IN ('pending', 'retry', 'dead')
           ) AS notification_backlog
    FROM queue_days q
    LEFT JOIN tenants ON tenants.id = q.tenant_id
    LEFT JOIN store_locations
      ON store_locations.id = q.location_id
     AND store_locations.tenant_id = q.tenant_id
    WHERE q.state = 'open' OR q.last_reconciliation_error IS NOT NULL
    ORDER BY (q.last_reconciliation_error IS NOT NULL) DESC,
             q.business_date DESC,
             q.id DESC
    LIMIT 100
  `)
  ]);

  const queueDays = result.rows.map((row) => {
    const notificationBacklog = Number(row.notification_backlog || 0);
    const hasError = Boolean(row.last_reconciliation_error);
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      tenantName: row.tenant_name || `Tenant ${row.tenant_id}`,
      locationId: String(row.location_id),
      locationName: row.location_name || `Location ${row.location_id}`,
      businessDate: String(row.business_date).slice(0, 10),
      state: row.state,
      unresolvedTickets: Number(row.unresolved_tickets || 0),
      notificationBacklog,
      reconciliationAttempts: Number(row.reconciliation_attempt_count || 0),
      lastReconciliationError: row.last_reconciliation_error || null,
      attention: hasError ? "action" : notificationBacklog ? "review" : "healthy"
    };
  });
  const totals = summary.rows[0] || {};
  const openQueueDays = Number(totals.open_queue_days || 0);
  const reconciliationIssues = Number(totals.reconciliation_issues || 0);
  const unresolvedTickets = Number(totals.unresolved_tickets || 0);
  const notificationBacklog = Number(totals.notification_backlog || 0);

  return envelope(req, "global", {
    metrics: [
      { label: "Open queue days", value: String(openQueueDays), trend: "Current operational scope", trendTone: "neutral" },
      { label: "Needs reconciliation", value: String(reconciliationIssues), trend: reconciliationIssues ? "Review before repair" : "No reconciliation errors", trendTone: reconciliationIssues ? "attention" : "positive" },
      { label: "Unresolved tickets", value: String(unresolvedTickets), trend: "Waiting, called, or skipped", trendTone: "neutral" },
      { label: "Notification backlog", value: String(notificationBacklog), trend: "Pending, retrying, or dead jobs", trendTone: notificationBacklog ? "attention" : "positive" }
    ],
    queueDays
  });
}

async function getTenants(req) {
  const [summary, result] = await Promise.all([
    db.pool.query(`
      SELECT COUNT(*) FILTER (WHERE t.is_active = TRUE)::INTEGER AS active,
             COUNT(*) FILTER (WHERE t.vendor_approval_status = 'pending')::INTEGER AS pending_approval,
             COUNT(*) FILTER (WHERE active_subscription.plan_slug IS NULL)::INTEGER AS without_plan
      FROM tenants t
      LEFT JOIN LATERAL (
        SELECT plan_slug
        FROM tenant_subscriptions
        WHERE tenant_subscriptions.tenant_id = t.id
        ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'past_due' THEN 1 WHEN 'unpaid' THEN 2 ELSE 3 END,
                 updated_at DESC
        LIMIT 1
      ) active_subscription ON TRUE
    `),
    db.pool.query(`
    SELECT t.id,
           t.name,
           t.slug,
           t.is_active,
           t.vendor_approval_status,
           t.created_at,
           owner_account.username AS owner_username,
           active_subscription.plan_slug,
           COUNT(tickets.id)::INTEGER AS ticket_count
    FROM tenants t
    LEFT JOIN LATERAL (
      SELECT users.username
      FROM tenant_memberships memberships
      INNER JOIN users ON users.id = memberships.user_id
      WHERE memberships.tenant_id = t.id
        AND memberships.role = 'owner'
        AND memberships.is_active = TRUE
      ORDER BY memberships.id ASC
      LIMIT 1
    ) owner_account ON TRUE
    LEFT JOIN LATERAL (
      SELECT plan_slug
      FROM tenant_subscriptions
      WHERE tenant_subscriptions.tenant_id = t.id
      ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'past_due' THEN 1 WHEN 'unpaid' THEN 2 ELSE 3 END,
               updated_at DESC
      LIMIT 1
    ) active_subscription ON TRUE
    LEFT JOIN tickets ON tickets.tenant_id = t.id
    GROUP BY t.id, owner_account.username, active_subscription.plan_slug
    ORDER BY t.created_at DESC
    LIMIT 250
  `)
  ]);

  const tenants = result.rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    owner: row.owner_username || "No owner account",
    active: Boolean(row.is_active),
    plan: row.plan_slug || null,
    tickets: Number(row.ticket_count || 0),
    vendorApproval: ["approved", "pending", "rejected"].includes(row.vendor_approval_status) ? row.vendor_approval_status : "unknown",
    createdAt: row.created_at
  }));
  const totals = summary.rows[0] || {};
  const activeTenants = Number(totals.active || 0);
  const pendingApproval = Number(totals.pending_approval || 0);
  const withoutPlan = Number(totals.without_plan || 0);

  return envelope(req, "global", {
    metrics: [
      { label: "Active tenants", value: String(activeTenants), trend: "Current platform scope", trendTone: "positive" },
      { label: "Pending approval", value: String(pendingApproval), trend: pendingApproval ? "Review before activation" : "No pending approvals", trendTone: pendingApproval ? "attention" : "positive" },
      { label: "Without plan signal", value: String(withoutPlan), trend: withoutPlan ? "Needs billing review" : "All tenants have a plan signal", trendTone: withoutPlan ? "attention" : "positive" }
    ],
    tenants
  });
}

async function getUsers(req) {
  const [summary, result] = await Promise.all([
    db.pool.query(`
      SELECT COUNT(*)::INTEGER AS total,
             COUNT(*) FILTER (WHERE mfa_required = TRUE)::INTEGER AS mfa_required,
             COUNT(*) FILTER (
               WHERE COALESCE(is_sandbox_test_account, FALSE) = FALSE
                 AND (deletion_requested_at IS NOT NULL OR account_locked_until > NOW())
             )::INTEGER AS attention
      FROM users
    `),
    db.pool.query(`
    SELECT id,
           COALESCE(display_name, name, username, 'Platform user') AS display_name,
           roles,
           email_verified,
           mfa_enabled,
           mfa_required,
           last_login_provider,
           is_sandbox_test_account,
           deletion_requested_at,
           account_locked_until
    FROM users
    ORDER BY updated_at DESC, id DESC
    LIMIT 250
  `)
  ]);

  const users = result.rows.map((row) => {
    const locked = row.account_locked_until && new Date(row.account_locked_until).getTime() > Date.now();
    const state = row.is_sandbox_test_account
      ? "sandbox"
      : row.deletion_requested_at
        ? "deletion-requested"
        : locked
          ? "locked"
          : "active";
    return {
      id: String(row.id),
      name: row.display_name,
      roles: Array.isArray(row.roles) ? row.roles : [],
      state,
      emailVerified: Boolean(row.email_verified),
      mfa: row.mfa_required ? "required" : row.mfa_enabled ? "enabled" : "not-enabled",
      lastLoginProvider: row.last_login_provider || null
    };
  });
  const totals = summary.rows[0] || {};
  const mfaRequired = Number(totals.mfa_required || 0);
  const attention = Number(totals.attention || 0);

  return envelope(req, "global", {
    metrics: [
      { label: "Users in scope", value: String(totals.total || 0), trend: "Platform-wide account view", trendTone: "neutral" },
      { label: "MFA required", value: String(mfaRequired), trend: "Privileged access boundary", trendTone: "positive" },
      { label: "Account attention", value: String(attention), trend: attention ? "Locked or deletion requested" : "No account attention signals", trendTone: attention ? "attention" : "positive" }
    ],
    users
  });
}

async function getUserDetails(req, userId) {
  const result = await db.pool.query(`
    SELECT u.id,
           COALESCE(u.display_name, u.name, u.username, 'Platform user') AS display_name,
           u.name,
           u.display_name,
           u.username,
           u.email,
           u.phone,
           u.roles,
           u.email_verified,
           u.email_mfa_enabled,
           u.mfa_enabled,
           u.mfa_required,
           u.password_hash IS NOT NULL AS has_password,
           u.last_login_provider,
           u.is_sandbox_test_account,
           u.deletion_requested_at,
           u.account_locked_until,
           u.created_at,
           u.updated_at,
           (SELECT COUNT(*)::INTEGER FROM auth_sessions s WHERE s.user_id = u.id AND s.status = 'active' AND s.expires_at > NOW()) AS active_sessions,
           (SELECT COUNT(*)::INTEGER FROM auth_mfa_factors f WHERE f.user_id = u.id AND f.status = 'active') AS active_mfa_factors,
           (SELECT COUNT(*)::INTEGER FROM auth_mfa_factors f WHERE f.user_id = u.id AND f.status = 'pending') AS pending_mfa_factors,
           (SELECT COUNT(*)::INTEGER FROM auth_mfa_recovery_codes c WHERE c.user_id = u.id AND c.used_at IS NULL) AS unused_recovery_codes
    FROM users u
    WHERE u.id = $1
  `, [Number(userId)]);
  const row = result.rows[0];
  if (!row) return null;

  const locked = row.account_locked_until && new Date(row.account_locked_until).getTime() > Date.now();
  const state = row.is_sandbox_test_account
    ? "sandbox"
    : row.deletion_requested_at
      ? "deletion-requested"
      : locked
        ? "locked"
        : "active";
  return envelope(req, "global", {
    user: {
      id: String(row.id),
      name: row.name || "",
      displayName: row.display_name || "",
      username: row.username || "",
      email: row.email || "",
      phone: row.phone || "",
      roles: Array.isArray(row.roles) ? row.roles : [],
      state,
      emailVerified: Boolean(row.email_verified),
      emailMfaEnabled: Boolean(row.email_mfa_enabled),
      mfaEnabled: Boolean(row.mfa_enabled),
      mfaRequired: Boolean(row.mfa_required),
      hasPassword: Boolean(row.has_password),
      lastLoginProvider: row.last_login_provider || null,
      activeSessions: Number(row.active_sessions || 0),
      activeMfaFactors: Number(row.active_mfa_factors || 0),
      pendingMfaFactors: Number(row.pending_mfa_factors || 0),
      unusedRecoveryCodes: Number(row.unused_recovery_codes || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  });
}

async function getSecurityAudit(req) {
  const [summary, events] = await Promise.all([
    db.pool.query(`
      SELECT COUNT(*)::INTEGER AS total,
             COUNT(*) FILTER (WHERE outcome IN ('failed', 'denied', 'conflict'))::INTEGER AS attention,
             COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '24 hours')::INTEGER AS recent
      FROM security_audit_events
    `),
    db.pool.query(`
      SELECT id, action_key, resource_type, resource_id, outcome,
             actor_user_id, tenant_id, reason, metadata,
             event_digest, occurred_at
      FROM security_audit_events
      ORDER BY occurred_at DESC, id DESC
      LIMIT 100
    `)
  ]);

  const rows = events.rows.map((row) => ({
    id: String(row.id),
    action: row.action_key,
    resourceType: row.resource_type,
    resourceId: row.resource_id || null,
    outcome: row.outcome,
    actor: row.actor_user_id ? `user_${row.actor_user_id}` : "system",
    scope: row.tenant_id ? `tenant_${row.tenant_id}` : "global",
    requestId: row.metadata?.requestId || row.metadata?.correlationId || null,
    reason: row.reason || null,
    occurredAt: row.occurred_at,
    digest: row.event_digest
  }));
  const totals = summary.rows[0] || {};

  return envelope(req, "global", {
    metrics: [
      { label: "Events in view", value: String(rows.length), trend: `Latest ${rows.length} security audit events`, trendTone: "neutral" },
      { label: "Failed, denied, or conflicting", value: String(totals.attention || 0), trend: totals.attention ? "Review before closing the window" : "No failed, denied, or conflicting events", trendTone: totals.attention ? "attention" : "positive" },
      { label: "Last 24 hours", value: String(totals.recent || 0), trend: "New events across Platform scopes", trendTone: "neutral" }
    ],
    events: rows
  });
}

function formatMoney(cents, currency = "PHP") {
  return `${currency} ${(Number(cents || 0) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function getBilling(req) {
  const [subscriptionSummary, transitionSummary, caseSummary, subscriptions, purchases, refunds, disputes, countsResult] = await Promise.all([
    db.pool.query(`
      SELECT COUNT(*) FILTER (WHERE status = 'active')::INTEGER AS active,
             COUNT(*) FILTER (WHERE status IN ('past_due', 'unpaid', 'suspended'))::INTEGER AS restricted
      FROM tenant_subscriptions
    `),
    db.pool.query(`
      SELECT COUNT(*) FILTER (WHERE status IN ('scheduled', 'pending_payment'))::INTEGER AS pending
      FROM subscription_transitions
    `),
    db.pool.query(`
      SELECT (
        (SELECT COUNT(*) FROM usage_credit_refunds WHERE status IN ('requested', 'processing'))
        + (SELECT COUNT(*) FROM usage_credit_disputes WHERE status IN ('open', 'under_review'))
      )::INTEGER AS cases
    `),
    db.pool.query(`
      SELECT s.id, s.plan_slug, s.status, s.provider, s.current_period_end,
             t.name AS tenant_name
      FROM tenant_subscriptions s
      INNER JOIN tenants t ON t.id = s.tenant_id
      ORDER BY s.updated_at DESC, s.id DESC
      LIMIT 100
    `),
    db.pool.query(`
      SELECT p.id, p.status, p.amount_cents, p.currency, p.provider, p.created_at,
             t.name AS tenant_name, packs.name AS pack_name
      FROM usage_credit_purchases p
      INNER JOIN tenants t ON t.id = p.tenant_id
      INNER JOIN usage_credit_packs packs ON packs.id = p.pack_id
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 100
    `),
    db.pool.query(`
      SELECT r.id, r.purchase_id, r.status, r.reason, r.provider_refund_id, r.created_at,
             p.status AS purchase_status, p.amount_cents, p.currency, p.provider, t.name AS tenant_name
      FROM usage_credit_refunds r
      INNER JOIN usage_credit_purchases p ON p.id = r.purchase_id
      INNER JOIN tenants t ON t.id = p.tenant_id
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 200
    `),
    db.pool.query(`
      SELECT d.id, d.purchase_id, d.provider_dispute_id, d.status, d.consumed_exposure_units, d.opened_at,
             d.resolved_at, p.status AS purchase_status, p.amount_cents, p.currency, p.provider, t.name AS tenant_name
      FROM usage_credit_disputes d
      INNER JOIN usage_credit_purchases p ON p.id = d.purchase_id
      INNER JOIN tenants t ON t.id = p.tenant_id
      ORDER BY d.opened_at DESC, d.id DESC
      LIMIT 200
    `),
    db.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM tenant_subscriptions s INNER JOIN tenants t ON t.id = s.tenant_id) AS subscriptions,
        (SELECT COUNT(*) FROM usage_credit_purchases p INNER JOIN tenants t ON t.id = p.tenant_id INNER JOIN usage_credit_packs packs ON packs.id = p.pack_id) AS purchases,
        (SELECT COUNT(*) FROM usage_credit_refunds r INNER JOIN usage_credit_purchases p ON p.id = r.purchase_id INNER JOIN tenants t ON t.id = p.tenant_id) AS refunds,
        (SELECT COUNT(*) FROM usage_credit_disputes d INNER JOIN usage_credit_purchases p ON p.id = d.purchase_id INNER JOIN tenants t ON t.id = p.tenant_id) AS disputes
    `)
  ]);

  const subscriptionRow = subscriptionSummary.rows[0] || {};
  const transitionRow = transitionSummary.rows[0] || {};
  const caseRow = caseSummary.rows[0] || {};
  const countsRow = countsResult.rows[0] || {};
  const subscriptionsData = subscriptions.rows.map((row) => ({
    id: String(row.id),
    tenant: row.tenant_name,
    plan: row.plan_slug,
    status: row.status,
    provider: row.provider || "unattributed",
    periodEnd: row.current_period_end
  }));
  const purchasesData = purchases.rows.map((row) => ({
    id: String(row.id),
    tenant: row.tenant_name,
    pack: row.pack_name,
    status: row.status,
    amount: formatMoney(row.amount_cents, row.currency),
    provider: row.provider || "unattributed",
    createdAt: row.created_at
  }));
  const refundCases = refunds.rows.map((row) => ({
    id: String(row.id), purchaseId: String(row.purchase_id), tenant: row.tenant_name,
    purchaseStatus: row.purchase_status, status: row.status, amount: formatMoney(row.amount_cents, row.currency),
    provider: row.provider || "unattributed", reason: row.reason, providerRefundId: row.provider_refund_id,
    createdAt: row.created_at
  }));
  const disputeCases = disputes.rows.map((row) => ({
    id: String(row.id), purchaseId: String(row.purchase_id), providerDisputeId: row.provider_dispute_id,
    tenant: row.tenant_name, purchaseStatus: row.purchase_status, status: row.status,
    amount: formatMoney(row.amount_cents, row.currency), provider: row.provider || "unattributed",
    consumedExposureUnits: Number(row.consumed_exposure_units || 0), openedAt: row.opened_at, resolvedAt: row.resolved_at
  }));

  return envelope(req, "global", {
    metrics: [
      { label: "Active subscriptions", value: String(subscriptionRow.active || 0), trend: "Current tenant billing state", trendTone: "positive" },
      { label: "Restricted billing", value: String(subscriptionRow.restricted || 0), trend: "Past due, unpaid, or suspended", trendTone: subscriptionRow.restricted ? "attention" : "positive" },
      { label: "Pending transitions", value: String(transitionRow.pending || 0), trend: "Preview before execution", trendTone: transitionRow.pending ? "attention" : "positive" },
      { label: "Credit cases", value: String(caseRow.cases || 0), trend: "Refunds or disputes needing review", trendTone: caseRow.cases ? "attention" : "positive" }
    ],
    counts: {
      subscriptions: Number(countsRow.subscriptions || 0),
      purchases: Number(countsRow.purchases || 0),
      refunds: Number(countsRow.refunds || 0),
      disputes: Number(countsRow.disputes || 0)
    },
    subscriptions: subscriptionsData,
    creditPurchases: purchasesData,
    creditRefundsEnabled: releaseControls.usageCreditRefunds,
    creditDisputesEnabled: releaseControls.usageCreditDisputes,
    creditRefunds: refundCases,
    creditDisputes: disputeCases
  });
}

async function getDeveloperProjects(req) {
  const projects = await developerProjects.listProjectsForPlatform();
  const items = await Promise.all(projects.map(async (project) => {
    const approval = await developerProjects.getProductionApproval(project.id);
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      productionApproval: approvalStatus(approval?.status)
    };
  }));
  return envelope(req, "global", { projects: items });
}

async function findProjectOwner(project) {
  const result = await db.pool.query(`
    SELECT COALESCE(users.display_name, users.name, users.username, users.email) AS display_name
    FROM developer_account_memberships memberships
    INNER JOIN users ON users.id = memberships.user_id
    WHERE memberships.developer_account_id = $1
      AND memberships.role = 'owner'
      AND memberships.status = 'active'
    ORDER BY memberships.id
    LIMIT 1
  `, [project.developerAccountId]);
  return result.rows[0]?.display_name || "Developer workspace owner";
}

async function getDeveloperProjectGovernance(req, projectId) {
  const project = await developerProjects.findProjectById(projectId);
  if (!project || project.status !== "active") return null;

  const [accounts, registrations, suspension, approval, deliveryHealth, sandboxRateLimit, productionRateLimit] = await Promise.all([
    developerTestAccounts.list(project.id),
    developerWebhooks.listRegistrations(project.id),
    developerWebhookSuspensions.findActive(project.id, "production"),
    developerProjects.getProductionApproval(project.id),
    db.pool.query(`
      SELECT COUNT(*)::INTEGER AS total,
             COUNT(*) FILTER (WHERE d.status = 'sent')::INTEGER AS sent,
             COUNT(*) FILTER (WHERE d.status = 'failed')::INTEGER AS failed,
             COUNT(*) FILTER (WHERE d.status IN ('pending', 'retry', 'processing'))::INTEGER AS pending,
             MAX(d.updated_at) AS last_observed_at
      FROM developer_webhook_deliveries d
      INNER JOIN developer_webhook_registrations r ON r.id = d.registration_id
      WHERE r.developer_project_id = $1
        AND r.environment = 'production'
        AND d.updated_at >= NOW() - INTERVAL '24 hours'
    `, [project.id]),
    developerApiRateLimits.get(project.id, "sandbox"),
    developerApiRateLimits.get(project.id, "production")
  ]);

  const activeAccounts = accounts.filter((account) => account.status === "active");
  const appleReviewAccount = activeAccounts.find((account) => account.purpose === "apple_review");
  const appleReview = !appleReviewAccount
    ? "missing"
    : new Date(appleReviewAccount.expiresAt).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000
      ? "expiring"
      : "active";
  const deliverySummary = deliveryHealth.rows[0] || {};
  const sentDeliveries = Number(deliverySummary.sent || 0);
  const failedDeliveries = Number(deliverySummary.failed || 0);
  const pendingDeliveries = Number(deliverySummary.pending || 0);
  const productionRegistrations = registrations
    .filter((registration) => registration.environment === "production")
    .map((registration) => ({
      id: registration.id,
      name: registration.name,
      status: registration.status,
      events: registration.events,
      payloadVersion: registration.payloadVersion
    }));
  const webhookState = suspension ? "suspended" : failedDeliveries ? "degraded" : Number(deliverySummary.total || 0) ? "healthy" : "unknown";
  const lastProductionRegistration = registrations.find((registration) => registration.environment === "production");
  const lastObservedAt = deliverySummary.last_observed_at || lastProductionRegistration?.updatedAt || "Not observed";
  const productionStatus = approvalStatus(approval?.status);

  return envelope(req, "developer-project", {
    projectId: project.id,
    projectName: project.name,
    owner: await findProjectOwner(project),
    environments: [
      { name: "sandbox", readiness: activeAccounts.length ? "ready" : "needs-review", lastObservedAt },
      { name: "production", readiness: readinessForApproval(approval?.status), lastObservedAt: approval?.updatedAt || lastObservedAt }
    ],
    sandboxAccounts: {
      active: activeAccounts.length,
      limit: MAX_SANDBOX_ACCOUNTS,
      appleReview,
      appleReviewAccount: appleReviewAccount ? {
        id: appleReviewAccount.id,
        username: appleReviewAccount.username,
        email: appleReviewAccount.email,
        status: appleReviewAccount.status,
        expiresAt: appleReviewAccount.expiresAt,
        deviceCount: appleReviewAccount.deviceCount
      } : null
    },
    webhookHealth: {
      state: webhookState,
      lastObservedAt,
      suspension: suspension ? { reason: suspension.reason, suspendedAt: suspension.suspendedAt } : null,
      registrations: productionRegistrations,
      deliveryStats: {
        sent: sentDeliveries,
        failed: failedDeliveries,
        pending: pendingDeliveries
      }
    },
    productionApproval: productionStatus,
    productionApprovalDetail: approvalDetail(approval),
    rateLimits: { sandbox: sandboxRateLimit, production: productionRateLimit }
  });
}

module.exports = { getBilling, getDeveloperProjectGovernance, getDeveloperProjects, getModeration, getOverview, getQueueOperations, getReleaseReadiness, getSecurityAudit, getServiceHealth, getSettings, getTenants, getUserDetails, getUsers, getViewerContext, envelope, meta };
