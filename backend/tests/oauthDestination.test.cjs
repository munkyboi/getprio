const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeOAuthSurface, getPostOauthPath } = require("../src/services/oauthDestination");
test("OAuth login retains Customer intent for users with Vendor memberships", () => {
  const user = { tenantMemberships: [{ tenantId: "1" }] };
  assert.equal(getPostOauthPath("login", "google", user, normalizeOAuthSurface("customer")), "/account/dashboard");
  assert.equal(getPostOauthPath("login", "google", user, normalizeOAuthSurface("vendor")), "/dashboard");
  assert.equal(getPostOauthPath("login", "google", user, normalizeOAuthSurface("https://evil.invalid")), "/dashboard");
  assert.equal(getPostOauthPath("register_vendor", "facebook", { tenantMemberships: [] }, "customer"), "/register/vendor?oauth=facebook");
});
