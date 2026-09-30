const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadReadModelRoutes({ missingGovernanceProject = false, overrides = {} } = {}) {
  const routes = [];
  const uses = [];
  const serviceCalls = [];
  const router = new Proxy({}, {
    get: (_, method) => (...args) => {
      if (method === "use") uses.push(args[0]);
      else routes.push({ method, args });
    }
  });
  const fallback = new Proxy({}, { get: () => () => undefined });
  const platformReadModelService = new Proxy({}, {
    get: (_, method) => async (...args) => {
      serviceCalls.push({ method, args });
      if (method === "getDeveloperProjectGovernance" && missingGovernanceProject) return null;
      return { readModel: method };
    }
  });
  const evidenceService = {
    verifySignature: ({ signature }) => signature === "valid-signature",
    validateReport: (report) => report?.outcome === "success",
    recordReport: async (report) => serviceCalls.push({ method: "recordReport", args: [report] })
  };
  const authenticate = () => {};
  const mocks = {
    express: { Router: () => router },
    "../middleware/asyncHandler": (handler) => handler,
    "../middleware/auth": {
      authenticate,
      requirePlatformPermission: (permission) => ({ type: "permission", permission })
    },
    "../services/platformReadModelService": platformReadModelService,
    "../services/platformReleaseReadinessEvidence": evidenceService,
    "../middleware/idempotency": { requireIdempotency: (action) => ({ action }) }
  };
  Object.assign(mocks, overrides);

  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, "../src/routes/platformRoutes.js"), "utf8"),
    { require: (name) => mocks[name] || fallback, module: { exports: {} }, process: { env: {} } }
  );

  return { routes, uses, serviceCalls, authenticate };
}

function response() {
  return {
    code: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("Platform read-model routes require authentication and their capability-specific permissions", () => {
  const { routes, uses, authenticate } = loadReadModelRoutes();
  assert.equal(uses[0], authenticate);

  const expected = new Map([
    ["/viewer-context", "platform.tenants.read"],
    ["/overview/read-model", "platform.tenants.read"],
    ["/service-health", "platform.tenants.read"],
    ["/queues", "platform.tenants.read"],
    ["/tenants/read-model", "platform.tenants.read"],
    ["/users/read-model", "platform.users.read"],
    ["/users/:userId/details", "platform.users.read"],
    ["/security-audit/read-model", "platform.security_audit.read"],
    ["/billing/read-model", "platform.billing.read"],
    ["/moderation/read-model", "platform.users.read"],
    ["/settings/read-model", "platform.settings.manage"],
    ["/release-readiness/read-model", "platform.release_readiness.read"],
    ["/developer-projects/read-model", "platform.developer_api.manage"],
    ["/developer-projects/:projectId/governance", "platform.developer_api.manage"]
  ]);

  for (const [routePath, permission] of expected) {
    const route = routes.find(({ method, args }) => method === "get" && args[0] === routePath);
    assert.ok(route, `GET ${routePath} is registered`);
    assert.equal(route.args[1].permission, permission, `GET ${routePath} checks ${permission}`);
    assert.equal(typeof route.args.at(-1), "function");
  }
});

test("read-model handlers return no-store responses and delegate to the matching service", async () => {
  const { routes, serviceCalls } = loadReadModelRoutes();
  const cases = [
    ["/viewer-context", "getViewerContext"],
    ["/overview/read-model", "getOverview"],
    ["/service-health", "getServiceHealth"],
    ["/queues", "getQueueOperations"],
    ["/tenants/read-model", "getTenants"],
    ["/users/read-model", "getUsers"],
    ["/users/:userId/details", "getUserDetails"],
    ["/security-audit/read-model", "getSecurityAudit"],
    ["/billing/read-model", "getBilling"],
    ["/moderation/read-model", "getModeration"],
    ["/settings/read-model", "getSettings"],
    ["/release-readiness/read-model", "getReleaseReadiness"],
    ["/developer-projects/read-model", "getDeveloperProjects"],
    ["/developer-projects/:projectId/governance", "getDeveloperProjectGovernance"]
  ];

  for (const [routePath, serviceMethod] of cases) {
    const route = routes.find(({ method, args }) => method === "get" && args[0] === routePath);
    const res = response();
    const req = { params: { projectId: "proj_7fd3", userId: "27" }, user: { _id: "user_1" } };
    await route.args.at(-1)(req, res);
    assert.equal(res.headers["Cache-Control"], "no-store", routePath);
    assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { readModel: serviceMethod });
  }

  assert.deepEqual(serviceCalls.map(({ method }) => method), cases.map(([, method]) => method));
  assert.equal(serviceCalls.at(-1).args[1], "proj_7fd3");
});

test("legacy Platform overview remains available separately for billing analytics consumers", () => {
  const { routes } = loadReadModelRoutes();
  assert.ok(routes.some(({ method, args }) => method === "get" && args[0] === "/overview/read-model"));
  assert.ok(routes.some(({ method, args }) => method === "get" && args[0] === "/overview"));
});

test("release evidence ingestion is signed and separate from the authenticated Platform routes", async () => {
  const { routes, uses, serviceCalls } = loadReadModelRoutes();
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/release-readiness/evidence");
  assert.ok(route, "the deployment evidence ingestion route is registered");
  assert.notEqual(uses[0], route.args[1], "the signed pipeline report does not require a user session");
  const report = { outcome: "success" };
  const res = response();
  res.statusCode = 200;
  res.status = function status(code) { this.code = code; return this; };
  await route.args.at(-1)({
    body: report,
    get: (header) => header === "x-platform-evidence-signature" ? "valid-signature" : "1730000000"
  }, res);
  assert.equal(res.code, 202);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(serviceCalls.at(-1).method, "recordReport");

  const rejected = response();
  await route.args.at(-1)({ body: report, get: (header) => header === "x-platform-evidence-signature" ? "bad" : "1730000000" }, rejected);
  assert.equal(rejected.code, 401);
});

test("password reset route is registered with dedicated capability and idempotency boundary", () => {
  const { routes } = loadReadModelRoutes();
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/users/:userId/password-reset");
  assert.ok(route);
  assert.equal(route.args[1].permission, "platform.user_password_reset.send");
  assert.equal(typeof route.args.at(-1), "function");
});

test("global role updates require their dedicated capability and privileged confirmation", () => {
  const { routes } = loadReadModelRoutes();
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/users/:userId/roles");
  assert.ok(route);
  assert.equal(route.args[1].permission, "platform.user_roles.manage");
  assert.equal(route.args[2].action, "platform.user.roles.update");
  assert.equal(typeof route.args.at(-1), "function");
});

test("global role update persists the exact reviewed roles, revokes sessions, and audits the change", async () => {
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push(["query", sql, params]);
    if (/SELECT id,email,roles,deletion_requested_at,platform_access_suspended_at FROM users/.test(sql)) return { rows: [{ id: 27, email: "owner@example.com", roles: ["customer"], deletion_requested_at: null, platform_access_suspended_at: null }] };
    if (/SELECT COUNT\(\*\)::INTEGER AS count FROM users/.test(sql)) return { rows: [{ count: 2 }] };
    if (/UPDATE users SET roles/.test(sql)) return { rows: [{ id: 27, roles: ["customer", "platform_release_observer"] }] };
    return { rows: [] };
  } };
  const { routes } = loadReadModelRoutes({ overrides: {
    "../config/db": { withTransaction: async (callback) => callback(client) },
    "../services/privilegedPreviewService": { resolvePreview: async (input) => { calls.push(["preview", input]); return { revision: "roles-revision" }; } },
    "../services/privilegedTransactionService": { consumeConfirmation: async (input) => calls.push(["confirmation", input]) },
    "../repositories/authSessions": { revokeAllSessionsForUser: async (...args) => { calls.push(["revoke-sessions", ...args]); return 3; } },
    "../services/notificationService": { sendEmail: async (input) => { calls.push(["email", input]); return true; } },
    "../services/securityAuditService": { record: async (event) => calls.push(["audit", event]) },
  } });
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/users/:userId/roles");
  const res = response();
  await route.args.at(-1)({
    params: { userId: "27" }, body: { roles: ["customer", "platform_release_observer"], reason: "Enable release smoke account", previewRevision: "roles-revision" },
    user: { _id: "8" }, auth: { session: { _id: "session-8" }, sessionId: "session-8" },
    get: (header) => header === "x-transaction-confirmation" ? "confirmation-token" : null
  }, res);

  assert.equal(res.code, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { success: true, roles: ["customer", "platform_release_observer"], revokedSessions: 3, notificationSent: true });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find(([kind]) => kind === "confirmation")[1].payload)), { userId: "27", roles: ["customer", "platform_release_observer"] });
  assert.equal(calls.find(([kind]) => kind === "revoke-sessions")[1], "27");
  assert.equal(calls.find(([kind]) => kind === "audit")[1].action, "platform.user.roles.update");
  assert.deepEqual(calls.find(([kind]) => kind === "audit")[1].afterState.roles, ["customer", "platform_release_observer"]);
  assert.equal(calls.find(([kind]) => kind === "email")[1].to, "owner@example.com");
});

test("global role update rejects an attempt to remove the last Platform Admin", async () => {
  const client = { query: async (sql) => {
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
    if (/SELECT id,email,roles,deletion_requested_at,platform_access_suspended_at FROM users/.test(sql)) return { rows: [{ id: 27, email: "admin@example.com", roles: ["platform_admin"], deletion_requested_at: null, platform_access_suspended_at: null }] };
    if (/SELECT COUNT\(\*\)::INTEGER AS count FROM users/.test(sql)) return { rows: [{ count: 1 }] };
    throw new Error("A last-admin removal must stop before mutation.");
  } };
  const { routes } = loadReadModelRoutes({ overrides: {
    "../config/db": { withTransaction: async (callback) => callback(client) },
    "../services/privilegedPreviewService": { resolvePreview: async () => ({ revision: "roles-revision" }) },
    "../services/privilegedTransactionService": { consumeConfirmation: async () => {} }
  } });
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/users/:userId/roles");
  const res = response();
  await assert.rejects(route.args.at(-1)({
    params: { userId: "27" }, body: { roles: ["customer"], reason: "Remove obsolete admin role", previewRevision: "roles-revision" },
    user: { _id: "8" }, auth: { session: { _id: "session-8" }, sessionId: "session-8" },
    get: () => "confirmation-token"
  }, res), (error) => error.code === "LAST_PLATFORM_ADMIN");
});

test("admin MFA reset requires a dedicated capability and security confirmation", () => {
  const { routes } = loadReadModelRoutes();
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/users/:userId/mfa/reset");
  assert.ok(route);
  assert.equal(route.args[1].permission, "platform.user_mfa.reset");
  assert.equal(route.args[2].action, "platform.user.mfa.reset");
});

test("admin MFA reset revokes factors, recovery codes, and sessions while preserving role-required MFA", async () => {
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push(["query", sql, params]);
    if (/SELECT id,email,roles,mfa_enabled,email_mfa_enabled,deletion_requested_at FROM users/.test(sql)) return { rows: [{ id: 27, email: "owner@example.com", roles: ["platform_release_observer"], mfa_enabled: true, email_mfa_enabled: true, deletion_requested_at: null }] };
    if (/UPDATE users SET mfa_enabled=FALSE,email_mfa_enabled=FALSE/.test(sql)) return { rows: [] };
    return { rows: [] };
  } };
  const { routes } = loadReadModelRoutes({ overrides: {
    "../config/db": { withTransaction: async (callback) => callback(client) },
    "../services/privilegedPreviewService": { resolvePreview: async () => ({ revision: "mfa-reset-revision" }) },
    "../services/privilegedTransactionService": { consumeConfirmation: async (input) => calls.push(["confirmation", input]) },
    "../repositories/mfa": { revokeFactorsAndRecoveryCodes: async (userId, options) => calls.push(["revoke-mfa", userId, options]) },
    "../repositories/authSessions": { revokeAllSessionsForUser: async (userId, reason, options) => { calls.push(["revoke-sessions", userId, reason, options]); return 2; } },
    "../services/mfaService": { userRequiresPrivilegedMfa: (user) => user.roles.includes("platform_release_observer") },
    "../services/notificationService": { sendEmail: async (input) => { calls.push(["email", input]); return true; } },
    "../services/securityAuditService": { record: async (event) => calls.push(["audit", event]) },
  } });
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/users/:userId/mfa/reset");
  const res = response();
  await route.args.at(-1)({
    params: { userId: "27" }, body: { reason: "Owner lost authenticator device", previewRevision: "mfa-reset-revision" },
    user: { _id: "8" }, auth: { session: { _id: "session-8" }, sessionId: "session-8" },
    get: (header) => header === "x-transaction-confirmation" ? "confirmation-token" : null
  }, res);

  assert.equal(res.code, 200);
  assert.equal(res.body.mfaRequired, true);
  assert.equal(res.body.revokedSessions, 2);
  assert.equal(calls.some(([kind]) => kind === "revoke-mfa"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find(([kind]) => kind === "confirmation")[1].payload)), { userId: "27" });
  assert.equal(calls.find(([kind]) => kind === "audit")[1].action, "platform.user.mfa.reset");
  assert.equal(calls.find(([kind]) => kind === "email")[1].to, "owner@example.com");
});

test("account access changes use a dedicated capability and previewed action", () => {
  const { routes } = loadReadModelRoutes();
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/users/:userId/access");
  assert.ok(route);
  assert.equal(route.args[1].permission, "platform.user_access.manage");
  assert.equal(route.args[2].action, "platform.user.access.update");
});

test("suspending an account revokes sessions, persists the suspension, and audits the reason", async () => {
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push(["query", sql, params]);
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
    if (/SELECT id,email,roles,deletion_requested_at,platform_access_suspended_at FROM users/.test(sql)) return { rows: [{ id: 27, email: "owner@example.com", roles: ["customer"], deletion_requested_at: null, platform_access_suspended_at: null }] };
    if (/UPDATE users SET platform_access_suspended_at=CASE/.test(sql)) return { rows: [] };
    return { rows: [] };
  } };
  const { routes } = loadReadModelRoutes({ overrides: {
    "../config/db": { withTransaction: async (callback) => callback(client) },
    "../services/privilegedPreviewService": { resolvePreview: async (input) => { calls.push(["preview", input]); return { revision: "access-revision" }; } },
    "../services/privilegedTransactionService": { consumeConfirmation: async (input) => calls.push(["confirmation", input]) },
    "../repositories/authSessions": { revokeAllSessionsForUser: async (userId, reason, options) => { calls.push(["revoke-sessions", userId, reason, options]); return 4; } },
    "../services/notificationService": { sendEmail: async (input) => { calls.push(["email", input]); return true; } },
    "../services/securityAuditService": { record: async (event) => calls.push(["audit", event]) },
  } });
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/users/:userId/access");
  const res = response();
  await route.args.at(-1)({
    params: { userId: "27" }, body: { suspended: true, reason: "Abuse investigation in progress", previewRevision: "access-revision" },
    user: { _id: "8" }, auth: { session: { _id: "session-8" }, sessionId: "session-8" },
    get: (header) => header === "x-transaction-confirmation" ? "confirmation-token" : null
  }, res);

  assert.equal(res.code, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { success: true, suspended: true, revokedSessions: 4, notificationSent: true });
  assert.equal(calls.find(([kind]) => kind === "preview")[1].action, "platform.user.access.suspend");
  assert.equal(calls.find(([kind]) => kind === "revoke-sessions")[1], "27");
  assert.equal(calls.find(([kind]) => kind === "audit")[1].action, "platform.user.access.suspend");
  assert.equal(calls.find(([kind]) => kind === "email")[1].to, "owner@example.com");
});

test("password reset sends the one-time link only to the target account and never returns it", async () => {
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push(["query", sql, params]);
    return { rows: [{ id: 27, email: "owner@example.com", roles: ["customer"] }] };
  } };
  const { routes } = loadReadModelRoutes({ overrides: {
    "../config/db": { withTransaction: async (callback) => callback(client) },
    "../services/privilegedPreviewService": { resolvePreview: async () => ({ revision: "revision-1" }) },
    "../services/privilegedTransactionService": { consumeConfirmation: async (input) => calls.push(["confirmation", input]) },
    "../services/passwordResetService": { issuePasswordResetToken: async (input) => {
      calls.push(["issue-token", input.user.email]);
      return { token: "must-not-leak", resetUrl: "https://example.test/reset?token=must-not-leak", expiresAt: "2026-09-27T10:00:00.000Z" };
    } },
    "../services/notificationService": { sendEmail: async (input) => { calls.push(["email", input.to, input.text]); return true; } },
    "../services/securityAuditService": { record: async (event) => calls.push(["audit", event]) },
  } });
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/users/:userId/password-reset");
  const res = response();
  await route.args.at(-1)({
    params: { userId: "27" }, body: { reason: "Account owner requested recovery", previewRevision: "revision-1" },
    user: { _id: "8" }, auth: { session: { _id: "session-8" }, sessionId: "session-8" },
    get: (header) => header === "x-transaction-confirmation" ? "confirmation-token" : null
  }, res);

  assert.equal(res.code, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { success: true, message: "Password reset instructions were sent to the account email." });
  assert.equal(calls.find(([kind]) => kind === "email")[1], "owner@example.com");
  assert.match(calls.find(([kind]) => kind === "email")[2], /must-not-leak/);
  assert.equal(calls.find(([kind]) => kind === "audit")[1].outcome, "success");
  assert.equal(calls.some(([kind]) => kind === "confirmation"), true);
});

test("inactive or missing Developer API projects return 404 without a cacheable response", async () => {
  const { routes } = loadReadModelRoutes({ missingGovernanceProject: true });
  const route = routes.find(({ method, args }) => method === "get" && args[0] === "/developer-projects/:projectId/governance");
  const res = response();
  await route.args.at(-1)({ params: { projectId: "proj_missing" } }, res);
  assert.equal(res.code, 404);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { message: "Active developer project not found." });
});
