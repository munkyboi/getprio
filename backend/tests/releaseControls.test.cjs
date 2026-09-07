const test = require("node:test");
const assert = require("node:assert/strict");

const {
  RELEASE_CONTROL_ENV_KEYS,
  buildReleaseControls
} = require("../src/config/releaseControls");

test("all entitlement rollout controls are server-owned and default off", () => {
  const controls = buildReleaseControls({});

  assert.deepEqual(Object.keys(controls).sort(), Object.keys(RELEASE_CONTROL_ENV_KEYS).sort());
  assert.equal(Object.values(controls).every((value) => value === false), true);
});

test("release controls accept only explicit server environment enablement", () => {
  const controls = buildReleaseControls({
    ENTITLEMENT_RESOLVER_SHADOW_ENABLED: "true",
    ENTITLEMENT_QUEUE_ENFORCEMENT_ENABLED: "1",
    ENTITLEMENT_BOOKING_ENFORCEMENT_ENABLED: "yes",
    PLAN_POLICY_MUTATIONS_ENABLED: "TRUE"
  });

  assert.equal(controls.entitlementResolverShadow, true);
  assert.equal(controls.entitlementQueueEnforcement, true);
  assert.equal(controls.entitlementBookingEnforcement, false);
  assert.equal(controls.planPolicyMutations, true);
});
