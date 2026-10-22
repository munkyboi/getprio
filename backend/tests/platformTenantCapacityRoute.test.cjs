const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadCapacityRoute(tenant) {
  const routes = [];
  const calls = [];
  const router = new Proxy({}, { get: (_, method) => (...args) => { if (method === "get") routes.push(args); } });
  const fallback = new Proxy({}, { get: () => () => undefined });
  const mocks = {
    express: { Router: () => router },
    "../middleware/asyncHandler": (handler) => handler,
    "../middleware/auth": { authenticate: () => {}, requirePlatformPermission: (permission) => ({ permission }) },
    "../repositories/tenants": { findTenantById: async (id) => { calls.push(["tenant", id]); return tenant; } },
    "../services/usageCreditService": { getTenantCapacity: async (id) => { calls.push(["capacity", id]); return { planSlug: "free" }; } }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../src/routes/platformRoutes.js"), "utf8"), { require: (name) => mocks[name] || fallback, module: { exports: {} } });
  const route = routes.find(([url]) => url === "/tenants/:tenantId/capacity");
  assert.equal(route[1].permission, "platform.capacity.read");
  return { handler: route.at(-1), calls };
}

function response() {
  return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test("tenant capacity includes the exact tenant identity without exposing private fields", async () => {
  const { handler, calls } = loadCapacityRoute({ _id: "42", name: "Court", slug: "court", contactEmail: "private@example.test" });
  const res = response();
  await handler({ params: { tenantId: "42" } }, res);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { tenant: { id: "42", name: "Court", slug: "court" }, capacity: { planSlug: "free" } });
  assert.deepEqual(calls, [["tenant", "42"], ["capacity", "42"]]);
});

test("missing and malformed tenant links fail before loading capacity", async () => {
  for (const [id, expected] of [["999", 404], ["bad", 400]]) {
    const { handler, calls } = loadCapacityRoute(null);
    const res = response();
    await handler({ params: { tenantId: id } }, res);
    assert.equal(res.code, expected);
    assert.equal(calls.some(([action]) => action === "capacity"), false);
  }
});
