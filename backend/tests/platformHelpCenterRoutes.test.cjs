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
    "../repositories/platformHelpCenter": {
      getAdmin: async () => ({ publishedRevision: 3, draft: null, revisions: [] }),
      saveDraft: async (_content, _actorId, _reason) => { calls.push(["saveDraft", _reason]); return { revision: 4 }; },
      publishDraft: async (_revision, _actorId, _reason) => { calls.push(["publishDraft", _reason]); return { publishedRevision: 4 }; }
    },
    "../services/securityAuditService": { record: async (event) => calls.push(["audit", event]) },
    "../config/db": { withTransaction: async (callback) => callback({ transaction: true }) }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../src/routes/platformRoutes.js"), "utf8"), {
    require: (name) => mocks[name] || fallback,
    module: { exports: {} }
  });
  return { routes, calls };
}

function response() {
  return { code: 200, body: null, headers: {}, status(code) { this.code = code; return this; }, setHeader(key, value) { this.headers[key.toLowerCase()] = value; return this; }, json(body) { this.body = body; return this; } };
}

test("Platform Help Center authoring routes require the dedicated permission", async () => {
  const { routes } = loadRoutes();
  const get = routes.find(({ method, args }) => method === "get" && args[0] === "/help-center");
  const save = routes.find(({ method, args }) => method === "post" && args[0] === "/help-center/drafts");
  const publish = routes.find(({ method, args }) => method === "post" && args[0] === "/help-center/publish");
  assert.ok(get && save && publish);
  for (const route of [get, save, publish]) assert.equal(route.args[1].permission, "platform.help_center.manage");
  assert.equal(save.args[2].scope, "platform.help_center.draft.save");
  assert.equal(publish.args[2].scope, "platform.help_center.publish");
  const res = response();
  await get.args.at(-1)({}, res);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.body.publishedRevision, 3);
});

test("saving and publishing require an audit reason and record actor/reason", async () => {
  const { routes, calls } = loadRoutes();
  const save = routes.find(({ method, args }) => method === "post" && args[0] === "/help-center/drafts");
  const publish = routes.find(({ method, args }) => method === "post" && args[0] === "/help-center/publish");
  const req = { body: { reason: "Reviewed queue and booking guidance", content: { topics: [], articles: [], faqs: [] } }, user: { _id: 81 }, auth: { sessionId: "session-81" } };
  const saveResponse = response();
  await save.args.at(-1)(req, saveResponse);
  assert.equal(saveResponse.code, 201);
  assert.equal(calls[0][0], "saveDraft");
  assert.equal(calls.find(([kind]) => kind === "audit")[1].actorId, 81);
  assert.equal(calls.find(([kind]) => kind === "audit")[1].reason, req.body.reason);

  const publishResponse = response();
  await publish.args.at(-1)({ ...req, body: { revision: 4, reason: "Publish reviewed customer help" } }, publishResponse);
  assert.equal(publishResponse.code, 200);
  assert.equal(calls.find(([kind]) => kind === "publishDraft")[1], "Publish reviewed customer help");

  await assert.rejects(() => save.args.at(-1)({ ...req, body: { reason: "short", content: {} } }, response()), /audit reason/i);
});
