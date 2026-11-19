require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { needsLegacyRegistration } = require("../src/surfaces/registrationHandoff.ts");
test("preserves guest ticket claims and existing-account vendor onboarding", () => {
  assert.equal(needsLegacyRegistration("customer", false, false, true), true);
  assert.equal(needsLegacyRegistration("customer", false, false, false), false);
  assert.equal(needsLegacyRegistration("vendor", true, false, false), true);
  assert.equal(needsLegacyRegistration("vendor", false, true, false), true);
  assert.equal(needsLegacyRegistration("vendor", false, false, false), false);
});
