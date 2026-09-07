const { PAID_PLAN_PRICE_INVARIANTS, PLAN_POLICY_FIXTURES } = require("../domain/planPolicyFixtures");

const PLAN_SLUGS = new Set(["free", "economical", "pro", "enterprise"]);

function validatePlanMutation(plan) {
  if (!PLAN_SLUGS.has(plan?.slug)) {
    const error = new Error("Unknown subscription plan.");
    error.statusCode = 400;
    throw error;
  }
  const expectedPrice = PAID_PLAN_PRICE_INVARIANTS[plan.slug];
  if (expectedPrice && (
    Number(plan.price?.monthlyAmountCents) !== expectedPrice.monthlyAmountCents ||
    Number(plan.price?.annualAmountCents) !== expectedPrice.annualAmountCents
  )) {
    const error = new Error("Paid plan prices require a separate approved pricing change.");
    error.statusCode = 409;
    error.code = "PAID_PRICE_INVARIANT";
    throw error;
  }
  if (plan.slug === "free" && (
    Number(plan.price?.monthlyAmountCents) !== 0 ||
    Number(plan.price?.annualAmountCents) !== 0 ||
    plan.checkoutEnabled
  )) {
    const error = new Error("Free must remain zero-price and cannot use subscription checkout.");
    error.statusCode = 409;
    error.code = "FREE_CHECKOUT_FORBIDDEN";
    throw error;
  }
  const features = plan.features || PLAN_POLICY_FIXTURES[plan.slug].features;
  if (plan.slug === "free" && !features.queue) {
    const error = new Error("Free must retain Queue System access.");
    error.statusCode = 409;
    error.code = "FREE_QUEUE_REQUIRED";
    throw error;
  }
  if (features.campaigns && !features.booking) {
    const error = new Error("Group-funded campaigns require Service Booking Access.");
    error.statusCode = 400;
    error.code = "CAMPAIGN_BOOKING_DEPENDENCY";
    throw error;
  }
  for (const value of Object.values(plan.allowances || {})) {
    if (!Number.isInteger(Number(value)) || Number(value) < 0) {
      const error = new Error("Monthly allowances must be whole numbers of zero or greater.");
      error.statusCode = 400;
      throw error;
    }
  }
  for (const key of ["locations", "counters", "staffSeats", "historyDays", "smsAllowance"]) {
    const value = Number(plan.entitlements?.[key]);
    if (!Number.isInteger(value) || value < 0) {
      const error = new Error(`${key} must be a whole number of zero or greater.`);
      error.statusCode = 400;
      error.code = "PLAN_ENTITLEMENT_INVALID";
      throw error;
    }
  }
  return plan;
}

module.exports = { validatePlanMutation };
