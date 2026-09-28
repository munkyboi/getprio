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
  const authenticate = () => {};
  const mocks = {
    express: { Router: () => router },
    "../middleware/asyncHandler": (handler) => handler,
    "../middleware/auth": {
      authenticate,
      requirePlatformPermission: (permission) => ({ type: "permission", permission })
    },
    "../services/platformReadModelService": platformReadModelService
  };
  Object.assign(mocks, overrides);

  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, "../src/routes/platformRoutes.js"), "utf8"),
    { require: (name) => mocks[name] || fallback, module: { exports: {} } }
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
    ["/overview", "platform.tenants.read"],
    ["/service-health", "platform.tenants.read"],
    ["/queues", "platform.tenants.read"],
    ["/tenants/read-model", "platform.tenants.read"],
    ["/users/read-model", "platform.users.read"],
    ["/users/:userId/details", "platform.users.read"],
    ["/security-audit/read-model", "platform.security_audit.read"],
    ["/billing/read-model", "platform.billing.read"],
    ["/moderation/read-model", "platform.users.read"],
    ["/settings/read-model", "platform.settings.manage"],
    ["/release-readiness/read-model", "platform.tenants.read"],
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
    ["/overview", "getOverview"],
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

test("password reset route is registered with dedicated capability and idempotency boundary", () => {
  const { routes } = loadReadModelRoutes();
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/users/:userId/password-reset");
  assert.ok(route);
  assert.equal(route.args[1].permission, "platform.user_password_reset.send");
  assert.equal(typeof route.args.at(-1), "function");
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
