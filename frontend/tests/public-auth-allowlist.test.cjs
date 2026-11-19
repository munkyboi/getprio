require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { publicAuthPathAllowed } = require("../../shared/publicAuthPolicy.ts");
test("marketing auth allows only the intended vendor onboarding completion method", () => {
  assert.equal(publicAuthPathAllowed("/auth/register/vendor/complete", "POST"), true);
  assert.equal(publicAuthPathAllowed("/auth/register/vendor/complete", "GET"), false);
  assert.equal(publicAuthPathAllowed("/auth/register/vendor/complete/other", "POST"), false);
});
