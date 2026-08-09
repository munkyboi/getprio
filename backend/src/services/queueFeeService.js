const billingRepository = require("../repositories/billing");
const queueFeeRepository = require("../repositories/queueFees");

function formatPhp(amountCents) {
  return `PHP ${(Number(amountCents || 0) / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function sanitizeAmountCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    const error = new Error("Queue fee amount must be zero or greater.");
    error.statusCode = 400;
    throw error;
  }

  return Math.round(amount);
}

function buildFeeSummary(fee, planSlug) {
  const amountCents = Number(fee?.amountCents || 0);
  const enabled = Boolean(fee?.enabled) && amountCents > 0;

  return {
    enabled,
    amountCents: enabled ? amountCents : 0,
    currency: "PHP",
    displayAmount: formatPhp(enabled ? amountCents : 0),
    planSlug
  };
}

async function getActiveTenantSubscription(tenantId, options = {}) {
  const subscription = await billingRepository.getActiveSubscriptionByTenantId(tenantId, options);
  return subscription?.status === "active" ? subscription : null;
}

async function assertTenantCanAcceptCustomerJoins(tenantId, options = {}) {
  const subscription = await getActiveTenantSubscription(tenantId, options);
  if (subscription) {
    return subscription;
  }

  const error = new Error("This queue is not accepting online joins until the vendor activates a subscription plan.");
  error.statusCode = 403;
  throw error;
}

async function getTenantPlanSlug(tenantId) {
  const subscription = await getActiveTenantSubscription(tenantId);
  if (subscription) return subscription.planSlug;
  const error = new Error("This vendor does not have an active subscription.");
  error.statusCode = 403;
  error.code = "SUBSCRIPTION_REQUIRED";
  throw error;
}

async function getQueueFeeForTenant(tenantId) {
  const planSlug = await getTenantPlanSlug(tenantId);
  const fee = await queueFeeRepository.findQueueFeeByPlan(planSlug);
  return buildFeeSummary(fee, planSlug);
}

async function listQueueFees(options = {}) {
  return queueFeeRepository.listQueueFees(options);
}

async function updateQueueFees({ queueFees, user }, options = {}) {
  if (!Array.isArray(queueFees)) {
    const error = new Error("queueFees must be an array.");
    error.statusCode = 400;
    throw error;
  }

  for (const fee of queueFees) {
    if (!["free", "economical", "pro", "enterprise"].includes(fee.planSlug)) {
      const error = new Error("Unknown plan slug in queue fee settings.");
      error.statusCode = 400;
      throw error;
    }

    await queueFeeRepository.upsertQueueFee({
      planSlug: fee.planSlug,
      enabled: Boolean(fee.enabled),
      amountCents: sanitizeAmountCents(fee.amountCents),
      currency: "PHP",
      updatedByUserId: user?._id
    }, options);
  }

  return listQueueFees(options);
}

module.exports = {
  formatPhp,
  buildFeeSummary,
  getActiveTenantSubscription,
  assertTenantCanAcceptCustomerJoins,
  getTenantPlanSlug,
  getQueueFeeForTenant,
  listQueueFees,
  updateQueueFees
};
