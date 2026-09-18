const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadRoutes() {
  const routes = [];
  const router = new Proxy({}, { get: (_, method) => (...args) => { if (["get", "post", "put"].includes(method)) routes.push({ method, args }); } });
  const fallback = new Proxy({}, { get: () => () => undefined });
  const calls = [];
  const mocks = {
    express: { Router: () => router },
    "../middleware/asyncHandler": (handler) => handler,
    "../middleware/auth": { authenticate: () => {}, requirePlatformPermission: (permission) => ({ permission }) },
    "../middleware/idempotency": { requireIdempotency: (scope) => ({ scope }) },
    "../repositories/developerProjects": {
      findProjectById: async () => ({ id: "project-1", name: "Demo", status: "active" }),
      getProductionApproval: async () => ({ id: "application-1", projectId: "project-1", status: "pending_review", draft: {}, approvedSubmissionId: null, submissions: [{ id: "submission-1", version: 1, snapshot: {}, status: "pending_review" }] }),
      reviewProductionApproval: async ({ status, submissionId }, options) => { assert.ok(options?.client); return { id: "application-1", projectId: "project-1", status, draft: {}, approvedSubmissionId: status === "approved" ? submissionId : null, submissions: [{ id: submissionId, version: 1, snapshot: {}, status }] }; }
    },
    "../repositories/developerWebhookSuspensions": {
      findActive: async () => null,
      suspend: async (data) => { calls.push(["suspend", data]); return { id: "suspension-1", projectId: data.projectId, environment: "production", status: "active", reason: data.reason, suspendedByUserId: String(data.userId), suspendedAt: "2026-09-15T12:00:00.000Z" }; },
      reinstate: async () => null
    },
    "../repositories/developerApiRateLimits": {
      normalizeEnvironment: (value) => value || "sandbox",
      get: async (_projectId, environment) => ({ projectId: "project-1", environment, readLimitPerMinute: 600, writeLimitPerMinute: 120 }),
      save: async (data) => ({ projectId: data.projectId, environment: data.environment, readLimitPerMinute: data.readLimitPerMinute, writeLimitPerMinute: data.writeLimitPerMinute })
    },
    "../services/securityAuditService": { record: async (data) => calls.push(["audit", data]) },
    "../config/db": { withTransaction: async (callback) => callback({}) }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../src/routes/platformRoutes.js"), "utf8"), { require: (name) => mocks[name] || fallback, module: { exports: {} } });
  return { routes, calls };
}

function response() {
  return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test("platform webhook suspension routes require the developer API permission", async () => {
  const { routes, calls } = loadRoutes();
  const suspendRoute = routes.find(({ method, args }) => method === "post" && args[0] === "/developer-projects/:projectId/webhook-suspension");
  const reinstateRoute = routes.find(({ method, args }) => method === "post" && args[0] === "/developer-projects/:projectId/webhook-suspension/reinstate");
  assert.equal(suspendRoute.args[1].permission, "platform.developer_api.manage");
  assert.equal(reinstateRoute.args[1].permission, "platform.developer_api.manage");
  const res = response();
  await suspendRoute.args.at(-1)({ params: { projectId: "project-1" }, body: { reason: "Compromised receiver" }, user: { _id: 7 }, auth: { sessionId: "session-1" } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.suspension.status, "active");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ["suspend", { projectId: "project-1", userId: 7, reason: "Compromised receiver" }]);
  assert.equal(calls[1][0], "audit");
});

test("platform webhook suspension rejects a missing reason", async () => {
  const { routes } = loadRoutes();
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/developer-projects/:projectId/webhook-suspension");
  await assert.rejects(
    () => route.args.at(-1)({ params: { projectId: "project-1" }, body: {}, user: { _id: 7 }, auth: { sessionId: "session-1" } }, response()),
    (error) => error.code === "INVALID_REASON" && error.statusCode === 400
  );
});

test("platform rate-limit controls are permissioned and validate configured budgets", async () => {
  const { routes } = loadRoutes();
  const route = routes.find(({ method, args }) => method === "put" && args[0] === "/developer-projects/:projectId/rate-limit");
  assert.equal(route.args[1].permission, "platform.developer_api.manage");
  const res = response();
  await route.args.at(-1)({ params: { projectId: "project-1" }, body: { environment: "production", readLimitPerMinute: 300, writeLimitPerMinute: 60 }, user: { _id: 7 }, auth: { sessionId: "session-1" } }, res);
  assert.equal(res.body.limits.readLimitPerMinute, 300);
  await assert.rejects(
    () => route.args.at(-1)({ params: { projectId: "project-1" }, body: { environment: "production", readLimitPerMinute: 0, writeLimitPerMinute: 60 }, user: { _id: 7 }, auth: { sessionId: "session-1" } }, response()),
    (error) => error.code === "INVALID_RATE_LIMIT" && error.statusCode === 400
  );
});

test("platform production approval routes review project submissions", async () => {
  const { routes, calls } = loadRoutes();
  const getRoute = routes.find(({ method, args }) => method === "get" && args[0] === "/developer-projects/:projectId/production-approval");
  const reviewRoute = routes.find(({ method, args }) => method === "post" && args[0] === "/developer-projects/:projectId/production-approval/:submissionId/review");
  assert.equal(getRoute.args[1].permission, "platform.developer_api.manage");
  assert.equal(reviewRoute.args[1].permission, "platform.developer_api.manage");
  const listed = response();
  await getRoute.args.at(-1)({ params: { projectId: "project-1" } }, listed);
  assert.equal(listed.body.approval.status, "pending_review");
  const reviewed = response();
  await reviewRoute.args.at(-1)({ params: { projectId: "project-1", submissionId: "submission-1" }, body: { status: "approved" }, user: { _id: 7 }, auth: { sessionId: "session-1" } }, reviewed);
  assert.equal(reviewed.body.approval.status, "approved");
  assert.equal(calls.at(-1)[0], "audit");
});

test("platform production review requires feedback for corrective outcomes", async () => {
  const { routes } = loadRoutes();
  const reviewRoute = routes.find(({ method, args }) => method === "post" && args[0] === "/developer-projects/:projectId/production-approval/:submissionId/review");
  await assert.rejects(
    () => reviewRoute.args.at(-1)({ params: { projectId: "project-1", submissionId: "submission-1" }, body: { status: "changes_requested" }, user: { _id: 7 }, auth: { sessionId: "session-1" } }, response()),
    (error) => error.code === "INVALID_PRODUCTION_REVIEW" && error.statusCode === 400
  );
});
