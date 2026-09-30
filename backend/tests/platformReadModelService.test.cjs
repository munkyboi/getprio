const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadReadModelService({ env = {}, query, repositories = {}, releaseControls = {}, deploymentReport = null } = {}) {
  const fallback = new Proxy({}, { get: () => () => undefined });
  const permissions = new Set([
    "platform.tenants.read",
    "platform.users.read",
    "platform.billing.read",
    "platform.developer_api.manage"
  ]);
  const mocks = {
    "../config/db": { pool: { query: query || (async () => ({ rows: [] })) } },
    "../config/env": env,
    "../config/releaseControls": releaseControls,
    "../repositories/developerProjects": repositories.developerProjects || {},
    "../repositories/developerTestAccounts": { MAX_ACCOUNTS: 2, ...repositories.developerTestAccounts },
    "../repositories/developerWebhooks": repositories.developerWebhooks || {},
    "../repositories/developerWebhookSuspensions": repositories.developerWebhookSuspensions || {},
    "../repositories/developerApiRateLimits": repositories.developerApiRateLimits || {},
    "../repositories/organizerCampaigns": repositories.organizerCampaigns || {},
    "../repositories/ratings": repositories.ratings || {},
    "../repositories/platform": {},
    "./platformReleaseReadinessEvidence": { getLatestReport: async () => deploymentReport },
    "./permissions": { getGlobalPermissions: () => permissions }
  };
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, "../src/services/platformReadModelService.js"), "utf8"),
    { require: (name) => mocks[name] || fallback, module }
  );
  return module.exports;
}

test("read-model envelope includes request correlation, versioned scope, and an empty error list", () => {
  const service = loadReadModelService();
  const result = service.envelope({ context: { correlationId: "req_123" } }, "global", { value: 7 });
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)), { value: 7 });
  assert.equal(result.meta.requestId, "req_123");
  assert.equal(result.meta.scope, "global");
  assert.equal(result.meta.environment, "all");
  assert.equal(result.meta.schemaVersion, "platform-read-model.v1");
  assert.ok(Number.isFinite(Date.parse(result.meta.generatedAt)));
  assert.deepEqual(JSON.parse(JSON.stringify(result.errors)), []);
});

test("viewer context returns only the viewer's granted navigation capabilities", async () => {
  const service = loadReadModelService();
  const result = await service.getViewerContext({
    user: { _id: 9, name: "Carlo", roles: ["platform_admin"] },
    auth: { session: { expiresAt: "2026-10-01T00:00:00.000Z" } }
  });
  assert.equal(result.data.user.id, "9");
  assert.equal(result.data.user.displayName, "Carlo");
  assert.equal(result.data.user.role, "Platform Admin");
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.navigation)), ["overview", "operations", "developer", "billing"]);
  assert.ok(result.data.capabilities.includes("platform.users.read"));
  assert.equal(result.data.sessionExpiresAt, "2026-10-01T00:00:00.000Z");
});

test("user detail read model returns account and security posture without credentials or MFA secrets", async () => {
  const calls = [];
  const service = loadReadModelService({
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("FROM tenant_memberships m")) return { rows: [{ tenant_id: 9, tenant_name: "North Clinic", tenant_slug: "north-clinic", role: "admin", is_active: true }] };
      return { rows: [{
        id: 27, name: "Carlo Abella", display_name: "Carlo", username: "carlo", email: "carlo@example.com", phone: "+639171234567",
        roles: ["platform_admin"], email_verified: true, email_mfa_enabled: true, mfa_enabled: true, mfa_required: true,
        has_password: true, last_login_provider: "password", active_sessions: 3, active_mfa_factors: 1, pending_mfa_factors: 0,
        unused_recovery_codes: 5, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-09-27T00:00:00.000Z",
        is_sandbox_test_account: false, deletion_requested_at: null, account_locked_until: null
      }] };
    }
  });

  const result = await service.getUserDetails({ context: { correlationId: "user_detail_1" } }, "27");
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.user)), {
    id: "27", name: "Carlo Abella", displayName: "Carlo", username: "carlo", email: "carlo@example.com", phone: "+639171234567",
    roles: ["platform_admin"], tenantMemberships: [{ tenantId: "9", tenantName: "North Clinic", tenantSlug: "north-clinic", role: "admin", isActive: true }], state: "active", emailVerified: true, emailMfaEnabled: true, mfaEnabled: true, mfaRequired: true,
    hasPassword: true, lastLoginProvider: "password", activeSessions: 3, activeMfaFactors: 1, pendingMfaFactors: 0,
    unusedRecoveryCodes: 5, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z"
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].params)), [27]);
  assert.match(calls[0].sql, /auth_mfa_factors/);
  assert.match(calls[0].sql, /auth_mfa_recovery_codes/);
  assert.doesNotMatch(JSON.stringify(result.data), /secret_ciphertext|secret_iv|code_hash|password_hash/);
});

test("user detail read model returns null for an unknown user", async () => {
  const service = loadReadModelService({ query: async () => ({ rows: [] }) });
  assert.equal(await service.getUserDetails({}, "999"), null);
});

test("user read model searches and paginates the full account set with a stable bounded query", async () => {
  const calls = [];
  const service = loadReadModelService({
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("mfa_required = TRUE")) return { rows: [{ total: 1842, mfa_required: 6, attention: 3 }] };
      if (sql.includes("SELECT COUNT(*)::INTEGER AS total") && sql.includes("WHERE $1 = ''")) return { rows: [{ total: 27 }] };
      if (sql.includes("FROM users") && sql.includes("ORDER BY updated_at DESC")) return { rows: [{ id: 126, display_name: "Carlo Abella", roles: ["customer"], email_verified: true, mfa_enabled: false, mfa_required: false, is_sandbox_test_account: false }] };
      assert.fail(`Unexpected users read-model query: ${sql}`);
    }
  });

  const result = await service.getUsers({ query: { page: "3", pageSize: "25", search: "carlo_%" } });
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.pagination)), { page: 3, pageSize: 25, total: 27, totalPages: 2, search: "carlo_%" });
  assert.equal(result.data.users[0].id, "126");
  const pageQuery = calls.find(({ sql }) => sql.includes("ORDER BY updated_at DESC"));
  assert.deepEqual(JSON.parse(JSON.stringify(pageQuery.params)), ["carlo_%", "%carlo\\_\\%%", 25, 50]);
  assert.match(pageQuery.sql, /LIMIT \$3 OFFSET \$4/);
  assert.doesNotMatch(pageQuery.sql, /LIMIT 250/);
});

test("overview normalizes live aggregate counts and maps audit outcomes into activity signals", async () => {
  const calls = [];
  const service = loadReadModelService({
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("SELECT COUNT(*)::INTEGER AS count FROM tenants WHERE is_active = TRUE")) return { rows: [{ count: "248" }] };
      if (sql.includes("FROM developer_projects WHERE status = 'active'")) return { rows: [{ count: "36" }] };
      if (sql.includes("FROM queue_days")) return { rows: [{ healthy: "197", total: "200" }] };
      if (sql.includes("tenant-approval") && sql.includes("developer_project_production_applications")) return { rows: [
        { category: "production-review", count: "2" },
        { category: "webhook-failure", count: "1" }
      ] };
      if (sql.includes("generate_series")) return { rows: [{ date: "Sep 27", total_events: "8", successful_events: "5" }] };
      if (sql.includes("SELECT action_key")) return { rows: [
        { action_key: "tenant.updated", scope: "tenant_1", outcome: "success", occurred_at: "2026-09-27T10:00:00Z" },
        { action_key: "project.review", scope: "project_2", outcome: "pending", occurred_at: "2026-09-27T09:00:00Z" },
        { action_key: "queue.repair", scope: "queue_3", outcome: "denied", occurred_at: "2026-09-27T08:00:00Z" }
      ] };
      assert.fail(`Unexpected overview query: ${sql}`);
    }
  });

  const result = await service.getOverview({ context: { correlationId: "overview_1" } });
  assert.equal(calls.length, 6);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.metrics)), [
    { label: "Needs attention", value: "3", trend: "Live aggregate", trendTone: "attention" },
    { label: "Active tenants", value: "248", trend: "Current platform scope", trendTone: "neutral" },
    { label: "Queue health", value: "98.5%", trend: "197 of 200 recent open queue days healthy", trendTone: "attention" },
    { label: "API projects", value: "36", trend: "Active Developer API projects", trendTone: "neutral" }
  ]);
  assert.equal(result.data.attentionCount, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.attentionItems)), [
    { id: "production-review", title: "2 production reviews pending", detail: "Developer API · production access", area: "developer", severity: "warning", actionLabel: "Review" },
    { id: "webhook-failure", title: "1 webhook delivery failed", detail: "Developer API · last 24 hours", area: "developer", severity: "critical", actionLabel: "Action" }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.activity)), [{ date: "Sep 27", events: 8, successfulEvents: 5 }]);
  const activitySql = calls.find((sql) => sql.includes("generate_series"));
  assert.match(activitySql, /NOW\(\) AT TIME ZONE 'UTC'/);
  assert.match(activitySql, /day AT TIME ZONE 'UTC'/);
  assert.match(activitySql, /JOIN security_audit_events/);
  const queueSql = calls.find((sql) => sql.includes("FROM queue_days"));
  assert.match(queueSql, /business_date >= \(\(NOW\(\) AT TIME ZONE 'UTC'\)::date - 6\)/);
  assert.match(queueSql, /business_date <= \(NOW\(\) AT TIME ZONE 'UTC'\)::date/);
  const attentionSql = calls.find((sql) => sql.includes("'webhook-failure'"));
  assert.match(attentionSql, /status = 'failed' AND updated_at >= NOW\(\) - INTERVAL '24 hours'/);
  assert.doesNotMatch(attentionSql, /created_at >= NOW\(\) - INTERVAL '24 hours'/);
  assert.match(calls.find((sql) => sql.includes("SELECT action_key")), /ORDER BY occurred_at DESC, id DESC/);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.recentActivity.map((row) => row.status))), ["complete", "review", "action"]);
  assert.equal(result.meta.requestId, "overview_1");
});

test("overview signals no recent queue observations instead of implying full health", async () => {
  const service = loadReadModelService({
    query: async (sql) => {
      if (sql.includes("SELECT COUNT(*)::INTEGER AS count FROM tenants WHERE is_active = TRUE")) return { rows: [{ count: 0 }] };
      if (sql.includes("FROM developer_projects WHERE status = 'active'")) return { rows: [{ count: 0 }] };
      if (sql.includes("FROM queue_days")) return { rows: [{ healthy: 0, total: 0 }] };
      if (sql.includes("tenant-approval") && sql.includes("developer_project_production_applications")) return { rows: [] };
      if (sql.includes("generate_series")) return { rows: [] };
      if (sql.includes("SELECT action_key")) return { rows: [] };
      assert.fail(`Unexpected overview query: ${sql}`);
    }
  });

  const result = await service.getOverview({});
  assert.equal(result.data.metrics[2].value, "—");
  assert.equal(result.data.metrics[2].trend, "No recent queue-day observations");
  assert.equal(result.data.metrics[2].trendTone, "neutral");
  assert.equal(result.data.attentionCount, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.attentionItems)), []);
});

test("release readiness does not infer production status from this runtime's configured origins", async () => {
  const sandboxConfiguration = {
    sandboxTestFlightPublicUrl: "https://testflight.apple.com/join/AbCdEf",
    sandboxAndroidPackageName: "com.getprio.sandbox",
    sandboxAndroidGooglePlayPublicUrl: "https://play.google.com/store/apps/details?id=com.getprio.sandbox",
    fcmSandboxProjectId: "sandbox-project",
    fcmSandboxClientEmail: "push@example.test",
    fcmSandboxPrivateKey: "configured-only"
  };
  const runtimeEnvironments = [
    { ...sandboxConfiguration, platformDashboardUrl: "http://localhost:5176", serverUrl: "http://localhost:5001" },
    { ...sandboxConfiguration, platformDashboardUrl: "https://platform.getprio.online", serverUrl: "https://api.getprio.online" }
  ];

  for (const env of runtimeEnvironments) {
    const service = loadReadModelService({ env });
    const result = await service.getReleaseReadiness({});
    const web = result.data.surfaces.find((surface) => surface.id === "platform-web");
    const api = result.data.surfaces.find((surface) => surface.id === "platform-api");

    assert.equal(web.state, "unknown");
    assert.equal(web.signal, "Production deployment not observed");
    assert.match(web.evidence, /No verified production deployment observation is connected/);
    assert.equal(web.observedAt, "Not observed");
    assert.equal(api.state, "unknown");
    assert.equal(api.signal, "Production deployment not observed");
    assert.match(api.evidence, /Authenticated production smoke evidence has not been observed/);
    assert.equal(api.observedAt, "Not observed");
    assert.equal(result.data.deploymentEvidence, null);
    assert.deepEqual(JSON.parse(JSON.stringify(result.data.metrics)), [
      { label: "Surfaces in scope", value: "5", trend: "Web, API, Sandbox, and mobile signals", trendTone: "neutral" },
      { label: "Verified ready", value: "0", trend: "Requires current verification evidence", trendTone: "attention" },
      { label: "Review required", value: "3", trend: "Configured surfaces still need checks", trendTone: "attention" },
      { label: "Blocked", value: "0", trend: "Known release blockers", trendTone: "positive" },
      { label: "Not observed", value: "2", trend: "Deployment or operational evidence unavailable", trendTone: "attention" }
    ]);
  }
});

test("release readiness uses the latest authenticated post-deploy smoke report for web and API evidence", async () => {
  const service = loadReadModelService({ env: { deploymentSha: "a".repeat(40) }, deploymentReport: {
    workflow_run_id: "19384756201",
    deployment_sha: "a".repeat(40),
    workflow_url: "https://github.com/getprio/web-app/actions/runs/19384756201",
    outcome: "success",
    summary: "Authenticated Platform API and web smoke passed.",
    observed_at: "2026-09-29T10:20:30.000Z"
  } });
  const result = await service.getReleaseReadiness({});
  const web = result.data.surfaces.find((surface) => surface.id === "platform-web");
  const api = result.data.surfaces.find((surface) => surface.id === "platform-api");

  for (const surface of [web, api]) {
    assert.equal(surface.state, "ready");
    assert.equal(surface.signal, "Authenticated post-deploy smoke passed");
    assert.match(surface.evidence, /aaaaaaaaaaaa/);
    assert.equal(surface.observedAt, "2026-09-29T10:20:30.000Z");
  }
  assert.equal(result.data.deploymentEvidence.workflowRunId, "19384756201");
  assert.equal(result.data.deploymentEvidence.outcome, "success");
  assert.equal(result.data.metrics.find((metric) => metric.label === "Verified ready").value, "2");
});

test("release readiness keeps failed smoke reports in review instead of calling production blocked or ready", async () => {
  const service = loadReadModelService({ env: { deploymentSha: "b".repeat(40) }, deploymentReport: {
    workflow_run_id: "19384756202",
    deployment_sha: "b".repeat(40),
    workflow_url: "https://github.com/getprio/web-app/actions/runs/19384756202",
    outcome: "failure",
    summary: "The authenticated Platform API smoke did not pass.",
    observed_at: "2026-09-29T10:20:30.000Z"
  } });
  const result = await service.getReleaseReadiness({});
  const web = result.data.surfaces.find((surface) => surface.id === "platform-web");
  const api = result.data.surfaces.find((surface) => surface.id === "platform-api");

  assert.equal(web.state, "review");
  assert.equal(api.state, "review");
  assert.equal(result.data.deploymentEvidence.outcome, "failure");
});

test("release readiness ignores evidence from a previous deployment revision", async () => {
  const service = loadReadModelService({ env: { deploymentSha: "c".repeat(40) }, deploymentReport: {
    workflow_run_id: "19384756203",
    deployment_sha: "d".repeat(40),
    workflow_url: "https://github.com/getprio/web-app/actions/runs/19384756203",
    outcome: "success",
    summary: "Authenticated Platform API and web smoke passed.",
    observed_at: "2026-09-29T10:20:30.000Z"
  } });
  const result = await service.getReleaseReadiness({});
  const web = result.data.surfaces.find((surface) => surface.id === "platform-web");
  const api = result.data.surfaces.find((surface) => surface.id === "platform-api");

  assert.equal(web.state, "unknown");
  assert.equal(api.state, "unknown");
  assert.equal(result.data.deploymentEvidence, null);
});

test("billing tab counts report full category totals independently of bounded lists", async () => {
  const calls = [];
  const service = loadReadModelService({
    releaseControls: { usageCreditRefunds: true, usageCreditDisputes: true },
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("AS subscriptions") && sql.includes("AS disputes")) {
        return { rows: [{ subscriptions: "125", purchases: "240", refunds: "260", disputes: "55" }] };
      }
      if (sql.includes("FILTER (WHERE status = 'active')")) return { rows: [{ active: "90", restricted: "8" }] };
      if (sql.includes("subscription_transitions")) return { rows: [{ pending: "3" }] };
      if (sql.includes("AS cases")) return { rows: [{ cases: "10" }] };
      if (sql.includes("LIMIT 100")) return { rows: [] };
      if (sql.includes("LIMIT 200")) return { rows: [] };
      assert.fail(`Unexpected billing query: ${sql}`);
    }
  });

  const result = await service.getBilling({});
  assert.ok(calls.some((sql) => sql.includes("status IN ('requested', 'provider_pending')")));
  assert.ok(calls.every((sql) => !sql.includes("status IN ('requested', 'processing')")));
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.counts)), {
    subscriptions: 125,
    purchases: 240,
    refunds: 260,
    disputes: 55
  });
  assert.equal(result.data.subscriptions.length, 0);
  assert.equal(result.data.creditPurchases.length, 0);
  assert.equal(result.data.creditRefunds.length + result.data.creditDisputes.length, 0);
  assert.equal(calls.filter((sql) => sql.includes("LIMIT 100")).length, 2);
  assert.equal(calls.filter((sql) => sql.includes("LIMIT 200")).length, 2);
});

test("service health measures queue-day reconciliation independently from notification delivery", async () => {
  const calls = [];
  const service = loadReadModelService({
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("SELECT NOW() AS observed_at")) return { rows: [{ observed_at: "2026-09-27T12:00:00.000Z" }] };
      if (sql.includes("FROM queue_days")) return { rows: [{ healthy: "987", total: "1000", failed: "0", last_observed_at: "2026-09-27T11:55:00.000Z" }] };
      if (sql.includes("FROM developer_webhook_deliveries")) return { rows: [{ total: "10", failed: "2", last_observed_at: "2026-09-27T11:50:00.000Z" }] };
      assert.fail(`Unexpected service-health query: ${sql}`);
    }
  });

  const result = await service.getServiceHealth({ context: { correlationId: "health_1" } });
  const queue = result.data.services.find((item) => item.id === "queue-reconciliation");
  const developer = result.data.services.find((item) => item.id === "developer-api");
  const mobile = result.data.services.find((item) => item.id === "mobile-push");
  assert.equal(queue.state, "healthy");
  assert.equal(queue.metric, "98.7% healthy");
  assert.equal(queue.evidence, "No reconciliation errors among recent open queue days");
  assert.equal(queue.freshness, "recent");
  assert.equal(developer.state, "degraded");
  assert.equal(developer.evidence, "2 failed webhook deliveries in the last 24 hours");
  assert.equal(mobile.state, "unknown");
  assert.equal(mobile.freshness, "not-observed");
  assert.match(mobile.evidence, /No mobile heartbeat/);
  const queueSql = calls.find((sql) => sql.includes("FROM queue_days"));
  assert.match(queueSql, /last_reconciliation_error/);
  assert.match(queueSql, /business_date <= \(NOW\(\) AT TIME ZONE 'UTC'\)::date/);
  assert.doesNotMatch(calls.find((sql) => sql.includes("FROM queue_days")), /queue_notification_outbox/);
  assert.equal(result.meta.requestId, "health_1");
});

test("service health marks queue reconciliation unknown when no recent queue days are observed", async () => {
  const service = loadReadModelService({
    query: async (sql) => {
      if (sql.includes("SELECT NOW() AS observed_at")) return { rows: [{ observed_at: "2026-09-27T12:00:00.000Z" }] };
      if (sql.includes("FROM queue_days")) return { rows: [{ healthy: 0, total: 0, failed: 0, last_observed_at: null }] };
      if (sql.includes("FROM developer_webhook_deliveries")) return { rows: [{ total: 0, failed: 0, last_observed_at: null }] };
      assert.fail(`Unexpected service-health query: ${sql}`);
    }
  });

  const result = await service.getServiceHealth({});
  const queue = result.data.services.find((item) => item.id === "queue-reconciliation");
  assert.equal(queue.state, "unknown");
  assert.equal(queue.freshness, "not-observed");
  assert.equal(queue.observedAt, "Not observed");
  assert.equal(queue.metric, "No recent queue-day observations");
});

test("queue operation metrics use platform totals rather than the 100-row table window", async () => {
  const calls = [];
  const service = loadReadModelService({
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("AS open_queue_days")) return { rows: [{
        open_queue_days: "150",
        reconciliation_issues: "4",
        unresolved_tickets: "230",
        notification_backlog: "9"
      }] };
      if (sql.includes("FROM queue_days q")) return { rows: [{
        id: "1827",
        tenant_id: "42",
        tenant_name: "Example Tenant",
        location_id: "8",
        location_name: "Main Branch",
        business_date: "2026-09-27",
        state: "open",
        reconciliation_attempt_count: "2",
        last_reconciliation_error: "Provider response timed out.",
        unresolved_tickets: "7",
        notification_backlog: "1"
      }] };
      assert.fail(`Unexpected queue-operations query: ${sql}`);
    }
  });

  const result = await service.getQueueOperations({});
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.metrics.map((metric) => metric.value))), ["150", "4", "230", "9"]);
  assert.equal(result.data.queueDays.length, 1);
  assert.equal(result.data.queueDays[0].id, "1827");
  assert.equal(result.data.queueDays[0].tenantName, "Example Tenant");
  assert.equal(result.data.queueDays[0].locationName, "Main Branch");
  assert.equal(result.data.queueDays[0].unresolvedTickets, 7);
  assert.equal(result.data.queueDays[0].attention, "action");
  assert.equal(calls.length, 2);
  assert.match(calls[0], /FROM tickets t/);
  assert.match(calls[1], /LIMIT 100/);
  assert.match(calls[1], /LEFT JOIN tenants/);
  assert.match(calls[1], /LEFT JOIN store_locations/);
});

test("tenant metrics come from the full tenant population rather than the 250-row table window", async () => {
  const service = loadReadModelService({
    query: async (sql) => {
      if (sql.includes("AS pending_approval")) return { rows: [{ active: "248", pending_approval: "8", without_plan: "3" }] };
      if (sql.includes("FROM tenants t") && sql.includes("LIMIT 250")) return { rows: [{
        id: "tenant_1", name: "Recent tenant", slug: "recent", is_active: true,
        vendor_approval_status: "approved", created_at: "2026-09-27T10:00:00Z",
        owner_username: "owner", plan_slug: "pro", ticket_count: "11"
      }] };
      assert.fail(`Unexpected tenants query: ${sql}`);
    }
  });

  const result = await service.getTenants({});
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.metrics.map((metric) => metric.value))), ["248", "8", "3"]);
  assert.equal(result.data.tenants.length, 1);
});

test("user metrics remain global while the account list is searchable and paginated", async () => {
  const service = loadReadModelService({
    query: async (sql, params) => {
      if (sql.includes("AS mfa_required") && sql.includes("AS attention")) return { rows: [{ total: "1842", mfa_required: "6", attention: "3" }] };
      if (sql.includes("SELECT COUNT(*)::INTEGER AS total") && sql.includes("WHERE $1 = ''")) return { rows: [{ total: 1842 }] };
      if (sql.includes("FROM users") && sql.includes("LIMIT $3 OFFSET $4")) return { rows: [{
        id: "1001", display_name: "Platform Admin", roles: ["platform_admin"], email_verified: true,
        mfa_enabled: true, mfa_required: true, last_login_provider: "password",
        is_sandbox_test_account: false, deletion_requested_at: null, account_locked_until: null
      }] };
      assert.fail(`Unexpected users query: ${sql}`);
    }
  });

  const result = await service.getUsers({});
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.metrics.map((metric) => metric.value))), ["1842", "6", "3"]);
  assert.equal(result.data.users.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.pagination)), { page: 1, pageSize: 50, total: 1842, totalPages: 37, search: "" });
});

test("security audit in-view count matches the bounded event list, not the global event total", async () => {
  const calls = [];
  const service = loadReadModelService({
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("AS attention") && sql.includes("AS recent")) return { rows: [{ total: "1400", attention: "12", recent: "34" }] };
      if (sql.includes("SELECT id, action_key")) return { rows: [
        { id: 11, action_key: "session.revoked", resource_type: "user", resource_id: "8", outcome: "success", actor_user_id: 1, tenant_id: null, reason: "Routine access cleanup", metadata: { requestId: "req_a" }, event_digest: "digest_a", occurred_at: "2026-09-27T11:00:00Z" },
        { id: 10, action_key: "session.login", resource_type: "user", resource_id: "8", outcome: "denied", actor_user_id: 2, tenant_id: 4, reason: "Missing MFA", metadata: {}, event_digest: "digest_b", occurred_at: "2026-09-27T10:00:00Z" }
      ] };
      assert.fail(`Unexpected security-audit query: ${sql}`);
    }
  });

  const result = await service.getSecurityAudit({});
  assert.equal(result.data.metrics[0].value, "2");
  assert.equal(result.data.metrics[0].trend, "Latest 2 security audit events");
  assert.equal(result.data.metrics[1].value, "12");
  assert.equal(result.data.metrics[1].label, "Failed, denied, or conflicting");
  assert.equal(result.data.metrics[2].value, "34");
  assert.equal(result.data.events.length, 2);
  const eventsSql = calls.find((sql) => sql.includes("SELECT id, action_key"));
  assert.match(eventsSql, /ORDER BY occurred_at DESC, id DESC/);
});

test("moderation metrics use global counts and a real this-week resolution window", async () => {
  let summarySql;
  const service = loadReadModelService({
    query: async (sql) => {
      summarySql = sql;
      return { rows: [{ open_reports: "45", open_disputes: "11", resolved_this_week: "6" }] };
    },
    repositories: {
      organizerCampaigns: { listReports: async () => [{
        id: 1, campaign_id: 2, campaign_title: "Visible report", category: "spam",
        report_status: "open", campaign_status: "collecting", reporter_user_id: 3,
        details: null, created_at: "2026-09-27T10:00:00Z"
      }] },
      ratings: { listDisputes: async () => [{
        id: 4, rating_type: "vendor_review", rating_id: 5, dispute_status: "open",
        reason: "Review requested", reporter_user_id: 6, created_at: "2026-09-27T09:00:00Z"
      }] }
    }
  });

  const result = await service.getModeration({});
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.metrics.map((metric) => metric.value))), ["45", "11", "6"]);
  assert.equal(result.data.campaignReports.length, 1);
  assert.equal(result.data.ratingDisputes.length, 1);
  assert.match(summarySql, /report_status IN \('open', 'reviewing'\)/);
  assert.match(summarySql, /dispute_status IN \('open', 'reviewing'\)/);
  assert.match(summarySql, /updated_at >= date_trunc\('week', NOW\(\)\)/);
  assert.match(summarySql, /resolved_at >= date_trunc\('week', NOW\(\)\)/);
});

test("Developer project webhooks remain unknown without production delivery evidence", async () => {
  const service = loadReadModelService({
    query: async (sql) => {
      if (sql.includes("FROM developer_webhook_deliveries")) return { rows: [{ total: 0, sent: 0, failed: 0, pending: 0, last_observed_at: null }] };
      if (sql.includes("FROM developer_account_memberships")) return { rows: [{ display_name: "Project owner" }] };
      assert.fail(`Unexpected project-governance query: ${sql}`);
    },
    repositories: {
      developerProjects: {
        findProjectById: async () => ({ id: "proj_1", name: "Project", status: "active", developerAccountId: "account_1" }),
        getProductionApproval: async () => ({ status: "approved", updatedAt: "2026-09-27T10:00:00Z" })
      },
      developerTestAccounts: { list: async () => [] },
      developerWebhooks: { listRegistrations: async () => [{ id: "sandbox-hook", environment: "sandbox", updatedAt: "2026-09-27T11:00:00Z" }] },
      developerWebhookSuspensions: { findActive: async () => null },
      developerApiRateLimits: { get: async (_projectId, environment) => ({ projectId: "proj_1", environment, readLimitPerMinute: 60, writeLimitPerMinute: 30, updatedByUserId: null, updatedAt: null }) }
    }
  });

  const result = await service.getDeveloperProjectGovernance({}, "proj_1");
  assert.equal(result.data.webhookHealth.state, "unknown");
  assert.equal(result.data.webhookHealth.lastObservedAt, "Not observed");
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.webhookHealth.registrations)), []);
  assert.equal(result.data.environments[0].lastObservedAt, "Not observed");
});

test("Developer project webhooks are healthy only when production deliveries were observed", async () => {
  const service = loadReadModelService({
    query: async (sql) => {
      if (sql.includes("FROM developer_webhook_deliveries")) return { rows: [{ total: 8, sent: 8, failed: 0, pending: 0, last_observed_at: "2026-09-27T11:55:00Z" }] };
      if (sql.includes("FROM developer_account_memberships")) return { rows: [{ display_name: "Project owner" }] };
      assert.fail(`Unexpected project-governance query: ${sql}`);
    },
    repositories: {
      developerProjects: {
        findProjectById: async () => ({ id: "proj_1", name: "Project", status: "active", developerAccountId: "account_1" }),
        getProductionApproval: async () => ({ status: "approved", updatedAt: "2026-09-27T10:00:00Z" })
      },
      developerTestAccounts: { list: async () => [] },
      developerWebhooks: { listRegistrations: async () => [{ id: "production-hook", environment: "production", updatedAt: "2026-09-27T11:00:00Z" }] },
      developerWebhookSuspensions: { findActive: async () => null },
      developerApiRateLimits: { get: async (_projectId, environment) => ({ projectId: "proj_1", environment, readLimitPerMinute: 60, writeLimitPerMinute: 30, updatedByUserId: null, updatedAt: null }) }
    }
  });

  const result = await service.getDeveloperProjectGovernance({}, "proj_1");
  assert.equal(result.data.webhookHealth.state, "healthy");
  assert.equal(result.data.webhookHealth.lastObservedAt, "2026-09-27T11:55:00Z");
  assert.equal(result.data.webhookHealth.deliveryStats.sent, 8);
});
