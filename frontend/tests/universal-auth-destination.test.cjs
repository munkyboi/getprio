require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { safeSurfaceNext, createAppUrls, keepSurfaceReturnPath } = require("../src/surfaces/surfaceConfig.ts");
test("universal auth keeps destinations on the selected application", () => {
  assert.equal(safeSurfaceNext("/account/bookings?tab=upcoming#today", "customer"), "/account/bookings?tab=upcoming#today");
  assert.equal(safeSurfaceNext("/dashboard/settings?x=1#queue", "vendor"), "/dashboard/settings?x=1#queue");
  for (const bad of ["https://evil.invalid/account", "//evil.invalid", "/%2f%2fevil.invalid", "/account/%2e%2e/dashboard", "/dashboard\\evil"]) {
    assert.equal(safeSurfaceNext(bad, "customer"), "/account/dashboard");
  }
  assert.equal(safeSurfaceNext("/account/security", "vendor"), "/dashboard");
  assert.throws(() => createAppUrls({ customer: "https://user:pass@example.com" }));
});

test("switching surfaces retains only a return path valid for the new app", () => {
  assert.equal(keepSurfaceReturnPath("/vendors/example/book?service=1", "customer"), "/vendors/example/book?service=1");
  assert.equal(keepSurfaceReturnPath("/dashboard/settings", "customer"), null);
  assert.equal(keepSurfaceReturnPath("//evil.invalid", "customer"), null);
});
