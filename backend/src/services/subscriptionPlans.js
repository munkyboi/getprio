const subscriptionPlanRepository = require("../repositories/subscriptionPlans");

const ADD_ONS = [
  { slug: "extra_location", name: "Extra location", priceDisplay: "PHP 399/mo" },
  { slug: "extra_staff_seat", name: "Extra staff seat", priceDisplay: "PHP 99/mo" },
  { slug: "custom_domain", name: "Custom domain / white label", priceDisplay: "PHP 999/mo" },
  { slug: "sms_overage", name: "SMS overage using Semaphore", priceDisplay: "At least PHP 1/SMS" },
  { slug: "pro_assisted_setup", name: "Pro assisted setup", priceDisplay: "PHP 2,500-PHP 5,000" },
  { slug: "enterprise_onboarding", name: "Enterprise onboarding", priceDisplay: "Starts at PHP 10,000" }
];

async function listPlans() {
  return subscriptionPlanRepository.listPlans();
}

function listAddOns() {
  return JSON.parse(JSON.stringify(ADD_ONS));
}

async function findPlanBySlug(slug) {
  return subscriptionPlanRepository.findPlanBySlug(slug);
}

async function getPlanEntitlements(planSlug) {
  const plan = await findPlanBySlug(planSlug);
  return plan?.entitlements || null;
}

function canUseFeature(entitlements, featureKey) {
  return Boolean(entitlements?.[featureKey]);
}

function assertWithinLimit({ used, limit, label }) {
  if (limit === null || limit === undefined) {
    return true;
  }

  if (Number(used) <= Number(limit)) {
    return true;
  }

  const error = new Error(`${label || "Usage"} limit exceeded.`);
  error.statusCode = 403;
  throw error;
}

module.exports = {
  listPlans,
  listAddOns,
  findPlanBySlug,
  getPlanEntitlements,
  canUseFeature,
  assertWithinLimit
};
