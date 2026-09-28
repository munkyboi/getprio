const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadRoutes() {
  const routes = [];
  const router = new Proxy({}, { get: (_, method) => (...args) => { routes.push({ method, args }); } });
  const fallback = new Proxy({}, { get: () => () => undefined });
  const calls = [];
  const mocks = {
    express: { Router: () => router },
    "../middleware/asyncHandler": (handler) => handler,
    "../middleware/auth": { authenticate: () => {}, requirePlatformPermission: (permission) => ({ permission }) },
    "../middleware/idempotency": { requireIdempotency: (scope) => ({ scope }) },
    "../services/accountDeletionAdminService": {
      listRequests: async () => [{ id: "request-1", status: "review_required", tasks: [] }],
      completeTask: async (input, options) => {
        calls.push(["complete-task", input, options]);
        return { id: input.requestId, status: "review_required", dueAt: "2026-10-01", readyForErasure: false, task: { kind: input.taskKind, label: "Task", status: "completed", evidence: input.evidence, completedAt: "2026-09-28" } };
      }
    },
    "../services/securityAuditService": { record: async (input, options) => calls.push(["audit", input, options]) },
    "../config/db": { withTransaction: async (callback) => callback({ transaction: true }) }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../src/routes/platformRoutes.js"), "utf8"), {
    require: (name) => mocks[name] || fallback,
    module: { exports: {} }
  });
  return { routes, calls };
}

function response() {
  return {
    code: 200,
    body: null,
    headers: {},
    status(code) { this.code = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("account deletion queue is a no-store Platform Admin read", async () => {
  const { routes } = loadRoutes();
  const route = routes.find(({ method, args }) => method === "get" && args[0] === "/account-deletion-requests");
  assert.ok(route, "Platform account deletion queue route exists");
  assert.equal(route.args[1].permission, "platform.account_deletion.manage");
  const res = response();
  await route.args.at(-1)({}, res);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.body.requests[0].id, "request-1");
});

test("completing a deletion prerequisite requires permission, idempotency, and records the actor and reason", async () => {
  const { routes, calls } = loadRoutes();
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/account-deletion-requests/:requestId/tasks/:taskKind/complete");
  assert.ok(route, "task completion route exists");
  assert.equal(route.args[1].permission, "platform.account_deletion.manage");
  assert.equal(route.args[2].scope, "platform.account_deletion.task.complete");

  const res = response();
  await route.args.at(-1)({
    params: { requestId: "request-1", taskKind: "personal_data_inventory" },
    body: { evidence: "Inventory ticket INV-19 complete.", retentionNotice: "No records retained.", reason: "Verified inventory evidence" },
    user: { _id: 44 },
    auth: { sessionId: "session-7" }
  }, res);

  assert.equal(res.body.request.task.status, "completed");
  assert.equal(calls[0][0], "complete-task");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), {
    requestId: "request-1",
    taskKind: "personal_data_inventory",
    evidence: "Inventory ticket INV-19 complete.",
    retentionNotice: "No records retained."
  });
  assert.equal(calls[0][2].client.transaction, true);
  assert.equal(calls[1][0], "audit");
  assert.equal(calls[1][1].actorId, 44);
  assert.equal(calls[1][1].sessionId, "session-7");
  assert.equal(calls[1][1].reason, "Verified inventory evidence");
  assert.equal(calls[1][2].client.transaction, true);
});

test("deletion prerequisite updates reject empty evidence or audit reasons", async () => {
  const { routes, calls } = loadRoutes();
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/account-deletion-requests/:requestId/tasks/:taskKind/complete");
  assert.ok(route, "task completion route exists");
  await assert.rejects(
    () => route.args.at(-1)({ params: { requestId: "request-1", taskKind: "backup_disposal" }, body: { evidence: "", reason: "short" }, user: { _id: 44 }, auth: { sessionId: "session-7" } }, response()),
    (error) => error.statusCode === 400
  );
  assert.equal(calls.length, 0);
});
