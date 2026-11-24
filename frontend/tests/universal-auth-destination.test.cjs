require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { safeSurfaceNext, createAppUrls, keepSurfaceReturnPath, initialAuthSurface, localizeLoopbackOrigins, localPreviewOrigins } = require("../src/surfaces/surfaceConfig.ts");
test("universal login and registration default to customer while preserving vendor intent", () => {
  for (const path of ["/login", "/register"]) {
    assert.equal(initialAuthSurface(path, new URLSearchParams()), "customer");
    assert.equal(initialAuthSurface(path, new URLSearchParams("app=vendor")), "vendor");
    assert.equal(initialAuthSurface(path, new URLSearchParams("next=%2Fdashboard%2Fsettings")), "vendor");
    assert.equal(initialAuthSurface(path, new URLSearchParams("app=customer&next=%2Fdashboard")), "customer");
    assert.equal(initialAuthSurface(path, new URLSearchParams("next=https%3A%2F%2Fevil.invalid")), "customer");
  }
  assert.equal(initialAuthSurface("/register/vendor", new URLSearchParams()), "vendor");
});
test("universal auth keeps destinations on the selected application", () => {
  assert.equal(safeSurfaceNext("/account/bookings?tab=upcoming#today", "customer"), "/account/bookings?tab=upcoming#today");
  assert.equal(safeSurfaceNext("/dashboard/settings?x=1#queue", "vendor"), "/dashboard/settings?x=1#queue");
  for (const bad of ["https://evil.invalid/account", "//evil.invalid", "/%2f%2fevil.invalid", "/account/%2e%2e/dashboard", "/dashboard\\evil"]) {
    assert.equal(safeSurfaceNext(bad, "customer"), "/dashboard");
  }
  assert.equal(safeSurfaceNext("/account/security", "vendor"), "/dashboard");
  assert.throws(() => createAppUrls({ customer: "https://user:pass@example.com" }));
});

test("switching surfaces retains only a return path valid for the new app", () => {
  assert.equal(keepSurfaceReturnPath("/vendors/example/book?service=1", "customer"), "/vendors/example/book?service=1");
  assert.equal(keepSurfaceReturnPath("/dashboard/settings", "customer"), null);
  assert.equal(keepSurfaceReturnPath("//evil.invalid", "customer"), null);
});

test("unconfigured app destinations use their deployed application origins", () => {
  const appUrl = createAppUrls({});
  assert.equal(appUrl("vendor", "/dashboard"), "https://vendor.getprio.online/dashboard");
  assert.equal(appUrl("customer", "/dashboard"), "https://app.getprio.online/dashboard");
});

test("local app destinations use the browser loopback host", () => {
  const values = localizeLoopbackOrigins({ customer: "http://127.0.0.1:5191", vendor: "http://127.0.0.1:5192" }, "localhost");
  assert.equal(values.customer, "http://localhost:5191");
  assert.equal(values.vendor, "http://localhost:5192");
});

test("local preview destinations have safe defaults without the build flag", () => {
  const values = localPreviewOrigins({}, "localhost");
  assert.equal(values.marketing, "http://localhost:5190");
  assert.equal(values.customer, "http://localhost:5191");
  assert.equal(values.vendor, "http://localhost:5192");
  assert.equal(localPreviewOrigins({}, "getprio.online").customer, undefined);
  const emptyInjectedValues = localPreviewOrigins({ marketing: "", customer: "", vendor: "" }, "localhost");
  assert.equal(emptyInjectedValues.marketing, "http://localhost:5190");
  assert.equal(emptyInjectedValues.customer, "http://localhost:5191");
  assert.equal(emptyInjectedValues.vendor, "http://localhost:5192");
});

test("local auth destinations do not require an unrelated platform origin", () => {
  const appUrl = createAppUrls({
    marketing: "http://127.0.0.1:5190",
    customer: "http://127.0.0.1:5191",
    vendor: "http://127.0.0.1:5192",
  }, true, ["marketing", "customer", "vendor"]);
  assert.equal(appUrl("customer", "/dashboard"), "http://127.0.0.1:5191/dashboard");
  assert.equal(appUrl("vendor", "/dashboard"), "http://127.0.0.1:5192/dashboard");
});
