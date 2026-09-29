const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadSettingsRoutes() {
  const routes = [];
  const writes = [];
  const audits = [];
  const router = new Proxy({}, { get: (_, method) => (...args) => routes.push({ method, args }) });
  const fallback = new Proxy({}, { get: () => () => undefined });
  const mocks = {
    express: { Router: () => router },
    "../middleware/asyncHandler": (handler) => handler,
    "../middleware/auth": { authenticate: "authenticate", requirePlatformPermission: (permission) => ({ permission }) },
    "../utils/imageUploadLimit": require("../src/utils/imageUploadLimit"),
    "../utils/timezones": require("../src/utils/timezones"),
    "../repositories/platform": {
      getPlatformSettings: async () => ({ enterpriseInquiryEmail: "ops@example.com", defaultTimezone: "Asia/Manila", mobileApprovedHosts: ["getprio.online"], maxImageUploadKb: 200 }),
      updatePlatformSettings: async ({ userId, ...settings }) => { writes.push({ ...settings, userId }); return settings; },
      getImageUploadLimitKb: async () => 200
    },
    "../services/securityAuditService": { record: async (event) => audits.push(event) },
    "../config/db": { withTransaction: async (callback) => callback({ transaction: true }) }
  };
  const context = { require: (name) => mocks[name] || fallback, module: { exports: {} }, URL };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../src/routes/platformRoutes.js"), "utf8"), context);
  return { routes, writes, audits };
}

test("image setting keeps settings permission and rejects invalid values before saving", async () => {
  const { routes, writes, audits } = loadSettingsRoutes();
  assert.ok(routes.some(({ method, args }) => method === "use" && args[0] === "authenticate"));
  const { args } = routes.find(({ method, args }) => method === "patch" && args[0] === "/settings");
  assert.equal(args[1].permission, "platform.settings.manage");
  const handler = args.at(-1);
  const res = { json: () => {} };
  for (const value of [null, "200", 0, -1, 1.5, 8193, true, {}, []]) {
    await assert.rejects(handler({ body: { maxImageUploadKb: value }, user: { _id: "42" } }, res), { statusCode: 400 });
  }
  assert.equal(writes.length, 0);
  await assert.rejects(handler({ body: { enterpriseInquiryEmail: "ops@example.com", defaultTimezone: "Asia/Manila", maxImageUploadKb: 200 }, user: { _id: "42" } }, res), { statusCode: 400, code: "INVALID_REASON" });
  for (const value of [1, 200, 8192]) {
    await handler({ body: { enterpriseInquiryEmail: "ops@example.com", defaultTimezone: "Asia/Manila", mobileApprovedHosts: ["getprio.online"], maxImageUploadKb: value, reason: "Update platform image upload policy" }, user: { _id: "42" }, auth: { sessionId: "session-42" } }, res);
    assert.equal(writes.at(-1).maxImageUploadKb, value);
    assert.equal(writes.at(-1).userId, "42");
    assert.equal(audits.at(-1).action, "platform.settings.update");
    assert.equal(audits.at(-1).actorId, "42");
    assert.equal(audits.at(-1).reason, "Update platform image upload policy");
    assert.deepEqual(Array.from(audits.at(-1).metadata.changedFields), value === 200 ? [] : ["maxImageUploadKb"]);
  }
  await assert.rejects(handler({ body: { enterpriseInquiryEmail: "ops@example.com", defaultTimezone: "Asia/Manila", maxImageUploadKb: 200, reason: "short" }, user: { _id: "42" } }, res), { statusCode: 400, code: "INVALID_REASON" });
  await assert.rejects(handler({ body: { enterpriseInquiryEmail: "ops@example.com", defaultTimezone: "Asia/Manila", mobileApprovedHosts: ["getprio.online"], maxImageUploadKb: 300, reason: "Update platform image upload policy", expectedSettings: { enterpriseInquiryEmail: "ops@example.com", defaultTimezone: "Asia/Manila", mobileApprovedHosts: ["getprio.online"], maxImageUploadKb: 100 } }, user: { _id: "42" } }, res), { statusCode: 409, code: "SETTINGS_CHANGED" });
  assert.equal(writes.length, 3);
});
