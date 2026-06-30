const test = require("node:test");
const assert = require("node:assert/strict");

const { shouldEnableVendorDashboardBootstrap } = require("../src/lib/vendorDashboardBootstrap.js");

test("vendor dashboard bootstrap does not require a location slug before it can load billing", () => {
  assert.equal(shouldEnableVendorDashboardBootstrap("token-1", "picklebois"), true);
  assert.equal(shouldEnableVendorDashboardBootstrap("token-1", ""), false);
  assert.equal(shouldEnableVendorDashboardBootstrap("", "picklebois"), false);
});
