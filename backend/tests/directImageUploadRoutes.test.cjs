const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("direct image uploads reject parameter tampering and use buffer byte counts", async () => {
  const routes = [];
  const uploads = [];
  const router = new Proxy({}, { get: (_, method) => (...args) => routes.push({ method, args }) });
  const fallback = new Proxy({}, { get: () => () => undefined });
  const uploadBinary = async (input) => { uploads.push(input); return { uploaded: true }; };
  const mocks = {
    express: { Router: () => router, raw: () => () => {} },
    "../middleware/asyncHandler": (handler) => handler,
    "../middleware/auth": { assertTenantPermission: () => {} },
    "./vendorRouteHelpers": {
      getAuthorizedTenant: async () => ({ _id: "tenant" }),
      getLocationForTenant: async () => ({ _id: "location" }),
      normalizeRequestText: (value) => String(value || "").trim()
    },
    "../services/publicBoardThemeUploadService": { uploadBinary },
    "../services/locationPaymentQrUploadService": { uploadBinary }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/routes/vendorRoutes.js"), "utf8"), {
    require: (name) => mocks[name] || fallback, module: { exports: {} }, Buffer
  });
  const directRoutes = routes.filter(({ method, args }) => method === "post" && ["/tenant/:tenantSlug/public-board-theme/uploads/direct", "/tenant/:tenantSlug/location-payment-qrs/uploads/direct", "/tenant/:tenantSlug/locations/:locationSlug/payment-qr/uploads/direct"].includes(args[0]));
  assert.equal(directRoutes.length, 3);
  for (const { args } of directRoutes) {
    const handler = args.at(-1);
    const request = { user: {}, params: { tenantSlug: "vendor", locationSlug: "main" }, query: { locationSlug: "main" }, headers: { "content-type": "image/png" } };
    const response = { status: () => response, json: () => {} };
    for (const body of [undefined, "image", [1, 2, 3], { length: 3, byteLength: 3 }, Buffer.alloc(0)]) {
      const count = uploads.length;
      await assert.rejects(handler({ ...request, body }, response), { statusCode: 400 });
      assert.equal(uploads.length, count);
    }
    const body = Buffer.from("é😀");
    await handler({ ...request, body }, response);
    assert.equal(uploads.at(-1).body.sizeBytes, 6);
    assert.equal(uploads.at(-1).fileBuffer, body);
  }
});
