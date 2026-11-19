require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { isWebOAuthProviderAvailable } = require("../src/components/socialAuthAvailability.ts");
test("Apple native credentials never enable the unsupported web flow", () => {
  assert.equal(isWebOAuthProviderAvailable("apple", true), false);
  assert.equal(isWebOAuthProviderAvailable("apple", false), false);
  assert.equal(isWebOAuthProviderAvailable("google", true), true);
  assert.equal(isWebOAuthProviderAvailable("facebook", false), false);
});
