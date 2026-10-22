const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const PROJECT_ID = "7fd30000-0000-4000-8000-000000000001";
const KEY_ID = "7fd30000-0000-4000-8000-000000000002";

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
    "../repositories/developerProjects": {
      findProjectById: async (id) => ({ id, name: "Project", status: "active" }),
      listApiKeys: async () => [{ id: KEY_ID, projectId: PROJECT_ID, name: "Production", environment: "production", keyPrefix: "gp_live_…", scopes: ["queues:read"], status: "active", lastUsedAt: null }],
      findApiKeyById: async (_projectId, keyId) => ({ id: keyId, projectId: PROJECT_ID, name: "Production", environment: "production", keyPrefix: "gp_live_…", scopes: ["queues:read"], status: "active" }),
      revokeApiKeyForPlatform: async (projectId, keyId, reason, options) => {
        calls.push(["revoke", projectId, keyId, reason, options]);
        return { id: keyId, projectId, name: "Production", environment: "production", keyPrefix: "gp_live_…", scopes: ["queues:read"], status: "revoked", revokeReason: reason };
      }
    },
    "../repositories/developerApiKeyActivity": { listForProject: async () => [{ keyId: KEY_ID, requests: 14, reads: 10, writes: 4, clientErrors: 2, serverErrors: 0, rateLimited: 1, authFailures: 0, lastSeenAt: "2026-09-28T12:00:00.000Z" }] },
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

test("Platform API-key review exposes safe key metadata and recent activity under the admin capability", async () => {
  const { routes } = loadRoutes();
  const route = routes.find(({ method, args }) => method === "get" && args[0] === "/developer-projects/:projectId/api-keys");
  assert.ok(route, "project API-key review route exists");
  assert.equal(route.args[1].permission, "platform.developer_api.manage");
  const res = response();
  await route.args.at(-1)({ params: { projectId: PROJECT_ID } }, res);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.body.keys[0].keyPrefix, "gp_live_…");
  assert.equal(res.body.keys[0].activity.rateLimited, 1);
  assert.equal(res.body.keys[0].signal, "review");
  assert.equal("secretHash" in res.body.keys[0], false);
});

test("emergency API-key revocation is project-scoped, idempotent, and audited", async () => {
  const { routes, calls } = loadRoutes();
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/developer-projects/:projectId/api-keys/:keyId/revoke");
  assert.ok(route, "emergency revoke route exists");
  assert.equal(route.args[1].permission, "platform.developer_api.manage");
  assert.equal(route.args[2].scope, "platform.developer_api_key.revoke");
  const res = response();
  await route.args.at(-1)({
    params: { projectId: PROJECT_ID, keyId: KEY_ID },
    body: { reason: "Suspected leaked production credential" },
    user: { _id: 44 },
    auth: { sessionId: "session-7" }
  }, res);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.body.key.status, "revoked");
  assert.equal(calls[0][0], "revoke");
  assert.equal(calls[0][1], PROJECT_ID);
  assert.equal(calls[0][2], KEY_ID);
  assert.equal(calls[0][4].client.transaction, true);
  assert.equal(calls[1][0], "audit");
  assert.equal(calls[1][1].actorId, 44);
  assert.equal(calls[1][1].sessionId, "session-7");
  assert.equal(calls[1][1].reason, "Suspected leaked production credential");
  assert.equal(calls[1][2].client.transaction, true);
});

test("emergency API-key revocation rejects inadequate audit reasons before mutation", async () => {
  const { routes, calls } = loadRoutes();
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/developer-projects/:projectId/api-keys/:keyId/revoke");
  await assert.rejects(
    () => route.args.at(-1)({ params: { projectId: PROJECT_ID, keyId: KEY_ID }, body: { reason: "fix" }, user: { _id: 44 }, auth: { sessionId: "session-7" } }, response()),
    (error) => error.statusCode === 400
  );
  assert.equal(calls.length, 0);
});

test("emergency API-key revocation rejects malformed identifiers before database access", async () => {
  const { routes, calls } = loadRoutes();
  const route = routes.find(({ method, args }) => method === "post" && args[0] === "/developer-projects/:projectId/api-keys/:keyId/revoke");
  const res = response();
  await route.args.at(-1)({
    params: { projectId: PROJECT_ID, keyId: "not-a-uuid" },
    body: { reason: "Credential compromise verified" },
    user: { _id: 44 },
    auth: { sessionId: "session-7" }
  }, res);
  assert.equal(res.code, 400);
  assert.equal(calls.length, 0);
});
