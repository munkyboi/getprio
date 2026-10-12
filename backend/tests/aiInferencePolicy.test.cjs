const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizePolicy,
  decide,
  accepts,
} = require("../src/services/aiInferencePolicy");
const { getGlobalPermissions } = require("../src/services/permissions");
const scope = { tenantId: "1", locationId: "10" };
const ready = {
  callerIntegrated: true,
  producerReady: true,
  shadowApproved: true,
};
const base = {
  revision: "1",
  requestedMode: "private_shadow",
  timeoutMs: 100,
  freshnessMs: 1000,
  pilots: [{ ...scope, requestedMode: "private_shadow" }],
};
test("global Off overrides private pilots and missing gates remain blocked", () => {
  assert.equal(decide(base, scope, ready).allowed, true);
  assert.equal(
    decide({ ...base, requestedMode: "off" }, scope, ready).allowed,
    false,
  );
  assert.equal(
    decide(base, { tenantId: "2", locationId: "10" }, ready).allowed,
    false,
  );
  for (const key of Object.keys(ready))
    assert.equal(
      decide(base, scope, { ...ready, [key]: false }).allowed,
      false,
    );
});
test("old, cross-scope, wrong-target and wrong-version decisions cannot be accepted", () => {
  const admission = decide(base, scope, ready);
  assert.equal(accepts(admission, admission), true);
  for (const changed of [
    { revision: "2" },
    { scope: { tenantId: "2", locationId: "10" } },
    { target: "time_to_call" },
    { predictorVersion: "other" },
    { allowed: false },
  ]) {
    assert.equal(accepts(admission, { ...admission, ...changed }), false);
  }
});
test("policy rejects customer mode, unknown settings, invalid bounds and duplicate/cross-shaped pilots", () => {
  const draft = {
    requestedMode: "off",
    timeoutMs: 100,
    freshnessMs: 1000,
    pilots: [],
  };
  for (const patch of [
    { requestedMode: "customer" },
    { timeoutMs: 0 },
    { timeoutMs: 1001 },
    { timeoutMs: 1.5 },
    { freshnessMs: 0 },
    { freshnessMs: 5001 },
    { privacyApproved: true },
    {
      pilots: [
        { ...scope, requestedMode: "private_shadow" },
        { ...scope, requestedMode: "off" },
      ],
    },
    {
      pilots: [
        {
          tenantId: "9223372036854775808",
          locationId: "10",
          requestedMode: "off",
        },
      ],
    },
  ]) {
    assert.throws(() => normalizePolicy({ ...draft, ...patch }));
  }
  assert.equal(
    normalizePolicy({ ...draft, timeoutMs: 1, freshnessMs: 5000 }).freshnessMs,
    5000,
  );
});
test("only Platform Admin has dedicated inference view/manage capabilities", () => {
  assert.ok(
    getGlobalPermissions({ roles: ["platform_admin"] }).has(
      "platform.ai_inference.manage",
    ),
  );
  for (const role of [
    "customer",
    "vendor_admin",
    "vendor_staff",
    "platform_release_observer",
  ]) {
    assert.equal(
      getGlobalPermissions({ roles: [role] }).has("platform.ai_inference.read"),
      false,
    );
    assert.equal(
      getGlobalPermissions({ roles: [role] }).has(
        "platform.ai_inference.manage",
      ),
      false,
    );
  }
});
