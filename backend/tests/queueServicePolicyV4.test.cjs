const test = require("node:test"),
  assert = require("node:assert/strict");
const policy = require("../src/services/queueServicePolicyV4");
const input = () => ({
  labels: {
    service: "Service",
    resources: "Resources",
    duration: "Duration",
    extras: "Extras",
  },
  assignment: { mode: "named", allocationIdentity: "named_member" },
  duration: {
    mode: "adjustable",
    visible: true,
    baseMinutes: 60,
    minCount: 1,
    maxCount: 3,
    stepCount: 1,
    defaultCount: 1,
  },
  extras: [{ serviceId: "2", selection: "optional" }],
  execution: {
    resourceStart: "together",
    extraStart: "with_parent",
    extraContainment: "within_parent",
    selectedExtraResolution: "explicit_required",
  },
});
test("duration count multiplies the frozen explicit base without changing resource quantity or pricing", () => {
  const configured = policy.configuration(input()),
    selection = {
      quantity: 1,
      ...policy.duration(3, "8", { ...configured, revision: "8" }),
    };
  assert.equal(selection.quantity, 1);
  assert.equal(selection.durationMinutes, 180);
  assert.equal(selection.baseMinutes, 60);
  assert.equal(selection.durationPolicyRevision, "8");
  assert.equal(Object.hasOwn(selection, "price"), false);
  configured.duration.baseMinutes = 30;
  assert.equal(selection.durationPolicy.baseMinutes, 60);
  assert.equal(selection.durationMinutes, 180);
});
test("integer, bounds, step and accepted revision reject invalid duration without correction", () => {
  const p = { ...input(), revision: "2" };
  p.duration = {
    ...p.duration,
    baseMinutes: 30,
    minCount: 1,
    maxCount: 5,
    stepCount: 2,
  };
  policy.configuration(pick(p));
  for (const count of [0, 2, 4, 6, 1.5, "3", NaN, Infinity, null])
    assert.throws(() => policy.duration(count, "2", p), {
      code: "INVALID_DURATION_COUNT",
    });
  assert.equal(policy.duration(3, "2", p).durationMinutes, 90);
  assert.throws(() => policy.duration(3, "1", p), {
    code: "STALE_DURATION_POLICY",
  });
});
function pick({ revision, ...rest }) {
  return rest;
}
test("fixed hidden duration is explicit and never accepts an alternative count", () => {
  const p = input();
  p.duration = {
    mode: "fixed",
    visible: false,
    baseMinutes: 15,
    minCount: 2,
    maxCount: 2,
    stepCount: 1,
    defaultCount: 2,
  };
  policy.configuration(p);
  assert.equal(
    policy.duration(2, "4", { ...p, revision: "4" }).durationMinutes,
    30,
  );
  assert.throws(() => policy.duration(1, "4", { ...p, revision: "4" }), {
    code: "INVALID_DURATION_COUNT",
  });
  p.duration.mode = "adjustable";
  assert.throws(() => policy.configuration(p), {
    code: "INVALID_DURATION_POLICY",
  });
});
test("automatic assignment promises pooled capacity and unsupported physical assignment or timing is rejected", () => {
  const p = input();
  p.assignment = { mode: "automatic", allocationIdentity: "pooled_capacity" };
  policy.configuration(p);
  p.assignment.allocationIdentity = "named_member";
  assert.throws(() => policy.configuration(p), {
    code: "UNSUPPORTED_SERVICE_POLICY",
  });
  p.assignment.allocationIdentity = "pooled_capacity";
  p.execution.extraStart = "delayed";
  assert.throws(() => policy.configuration(p), {
    code: "UNSUPPORTED_SERVICE_POLICY",
  });
  p.execution.extraStart = "with_parent";
  p.execution.extraContainment = "unbounded";
  assert.throws(() => policy.configuration(p), {
    code: "UNSUPPORTED_SERVICE_POLICY",
  });
});
test("required and optional extra selection is explicit; every selected extra keeps explicit resolution", () => {
  const p = input();
  p.extras.push({ serviceId: "3", selection: "required" });
  assert.deepEqual(policy.configuration(p).extras, p.extras);
  p.execution.selectedExtraResolution = "automatic";
  assert.throws(() => policy.configuration(p), {
    code: "UNSUPPORTED_SERVICE_POLICY",
  });
});
