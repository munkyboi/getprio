const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PLAN_POLICY_FIXTURES,
  PAID_PLAN_PRICE_INVARIANTS
} = require("../src/domain/planPolicyFixtures");

test("paid plan price invariants remain unchanged", () => {
  assert.deepEqual(PAID_PLAN_PRICE_INVARIANTS, {
    economical: { monthlyAmountCents: 49900, annualAmountCents: 498000 },
    pro: { monthlyAmountCents: 149900, annualAmountCents: 1499000 },
    enterprise: { monthlyAmountCents: 699900, annualAmountCents: 6999000 }
  });
});
test("settled four-plan features and monthly allowances have one canonical fixture", () => {
  assert.deepEqual(PLAN_POLICY_FIXTURES, {
    free: {
      checkoutEnabled: false,
      features: { queue: true, branding: false, discovery: false, booking: false, campaigns: false },
      allowances: { queueTickets: 500, queueEmailJourneys: 500, serviceBookings: 0 }
    },
    economical: {
      checkoutEnabled: true,
      features: { queue: true, branding: false, discovery: true, booking: true, campaigns: true },
      allowances: { queueTickets: 1000, queueEmailJourneys: 1000, serviceBookings: 100 }
    },
    pro: {
      checkoutEnabled: true,
      features: { queue: true, branding: true, discovery: true, booking: true, campaigns: true },
      allowances: { queueTickets: 5000, queueEmailJourneys: 5000, serviceBookings: 1000 }
    },
    enterprise: {
      checkoutEnabled: false,
      features: { queue: true, branding: true, discovery: true, booking: true, campaigns: true },
      allowances: { queueTickets: 50000, queueEmailJourneys: 50000, serviceBookings: 10000 }
    }
  });
});
