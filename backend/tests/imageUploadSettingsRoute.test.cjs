const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadSettingsRoutes() {
  const routes = [];
  const writes = [];
  const router = new Proxy({}, { get: (_, method) => (...args) => routes.push({ method, args }) });
  const fallback = new Proxy({}, { get: () => () => undefined });
  const mocks = {
    express: { Router: () => router },
    "../middleware/asyncHandler": (handler) => handler,
    "../middleware/auth": { authenticate: "authenticate", requirePlatformPermission: (permission) => ({ permission }) },
    "../utils/imageUploadLimit": require("../src/utils/imageUploadLimit"),
    "../utils/timezones": require("../src/utils/timezones"),
    "../repositories/platform": {
      updatePlatformSettings: async (settings) => { writes.push(settings); return settings; },
      getImageUploadLimitKb: async () => 200
    }
  };
  const context = { require: (name) => mocks[name] || fallback, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../src/routes/platformRoutes.js"), "utf8"), context);
  return { routes, writes };
}

test("image setting keeps settings permission and rejects invalid values before saving", async () => {
  const { routes, writes } = loadSettingsRoutes();
  assert.ok(routes.some(({ method, args }) => method === "use" && args[0] === "authenticate"));
  const { args } = routes.find(({ method, args }) => method === "patch" && args[0] === "/settings");
  assert.equal(args[1].permission, "platform.settings.manage");
  const handler = args.at(-1);
  const res = { json: () => {} };
  for (const value of [null, "200", 0, -1, 1.5, 8193, true, {}, []]) {
    await assert.rejects(handler({ body: { maxImageUploadKb: value }, user: { _id: "42" } }, res), { statusCode: 400 });
  }
  assert.equal(writes.length, 0);
  for (const value of [1, 200, 8192]) {
    await handler({ body: { enterpriseInquiryEmail: "ops@example.com", defaultTimezone: "Asia/Manila", maxImageUploadKb: value }, user: { _id: "42" } }, res);
    assert.equal(writes.at(-1).maxImageUploadKb, value);
    assert.equal(writes.at(-1).userId, "42");
  }
});
