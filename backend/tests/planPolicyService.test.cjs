const test = require("node:test");
const assert = require("node:assert/strict");

const { validatePlanMutation } = require("../src/services/planPolicyService");

function freePlan(overrides = {}) {
  return {
    slug: "free",
    checkoutEnabled: false,
    price: { monthlyAmountCents: 0, annualAmountCents: 0 },
    features: { queue: true, branding: false, discovery: false, booking: false, campaigns: false },
    allowances: { queueTickets: 500, serviceBookings: 0 },
    entitlements: { locations: 1, counters: 1, staffSeats: 1, historyDays: 7, smsAllowance: 0 },
    ...overrides
  };
}

test("Free plan policy always retains queue access", () => {
  assert.throws(
    () => validatePlanMutation(freePlan({ features: { queue: false, branding: false, discovery: false, booking: false, campaigns: false } })),
    (error) => error.statusCode === 409 && error.code === "FREE_QUEUE_REQUIRED"
  );
  assert.equal(validatePlanMutation(freePlan()).features.queue, true);
});

test("operational plan limits must be non-negative whole numbers", () => {
  assert.throws(
    () => validatePlanMutation(freePlan({ entitlements: { locations: 1, counters: 1, staffSeats: -1, historyDays: 7, smsAllowance: 0 } })),
    (error) => error.statusCode === 400 && error.code === "PLAN_ENTITLEMENT_INVALID"
  );
});

for (const value of [0, 500, -1, null]) {
  test(`retired email allowance publication is rejected for ${value}`, () => {
    assert.throws(() => validatePlanMutation(freePlan({
      allowances: { queueTickets: 500, serviceBookings: 0, queueEmailJourneys: value }
    })), (error) => error.statusCode === 400 && error.code === 'EMAIL_QUOTAS_RETIRED');
  });
}
for (const key of ['monthlyQueueEmailJourneys', 'monthlyTransactionalEmails']) {
  test(`retired ${key} entitlement publication is rejected`, () => {
    const plan = freePlan();
    plan.entitlements[key] = 0;
    assert.throws(() => validatePlanMutation(plan),
      (error) => error.statusCode === 400 && error.code === 'EMAIL_QUOTAS_RETIRED');
  });
}
