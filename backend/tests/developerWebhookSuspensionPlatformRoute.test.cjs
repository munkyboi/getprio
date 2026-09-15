const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadRoutes() {
  const routes = [];
  const router = new Proxy({}, { get: (_, method) => (...args) => { if (["get", "post"].includes(method)) routes.push({ method, args }); } });
  const fallback = new Proxy({}, { get: () => () => undefined });
  const calls = [];
  const mocks = {
    express: { Router: () => router },
    "../middleware/asyncHandler": (handler) => handler,
    "../middleware/auth": { authenticate: () => {}, requirePlatformPermission: (permission) => ({ permission }) },
    "../middleware/idempotency": { requireIdempotency: (scope) => ({ scope }) },
    "../repositories/developerProjects": { findProjectById: async () => ({ id: "project-1", name: "Demo", status: "active" }) },
    "../repositories/developerWebhookSuspensions": {
      findActive: async () => null,
      suspend: async (data) => { calls.push(["suspend", data]); return { id: "suspension-1", projectId: data.projectId, environment: "production", status: "active", reason: data.reason, suspendedByUserId: String(data.userId), suspendedAt: "2026-09-15T12:00:00.000Z" }; },
      reinstate: async () => null
    },
    "../services/securityAuditService": { record: async (data) => calls.push(["audit", data]) }
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
