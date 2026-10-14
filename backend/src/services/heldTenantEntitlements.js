const billing = require("../repositories/billing");
const plans = require("../services/subscriptionPlans");
const { activeEntitlements } = require("../domain/activePlanQuotas");

function fail(message, code, statusCode = 409) {
  throw Object.assign(new Error(message), { code, statusCode });
}
function tenantIdentity(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) fail("Tenant identifier must be exact.", "INVALID_TENANT_ID", 400);
  const identity = String(value ?? "");
  if (!/^[1-9]\d{0,18}$/u.test(identity) || BigInt(identity) > 9223372036854775807n) fail("Tenant identifier must be exact.", "INVALID_TENANT_ID", 400);
  return identity;
}
async function hold(client, sql, values, code) {
  try { return await client.query(sql, values); }
  catch (error) {
    if (error.code === "55P03") fail("Commercial policy is being updated. Roll back and retry.", code);
    throw error;
  }
}

// Internal write-transaction prerequisite. Caller owns BEGIN/COMMIT/ROLLBACK
// and owns authorization. Branch-aware callers must acquire branch roots,
// tenant and current authority in that order before invoking this read.
// Ordinary optional-client billing reads remain nonlocking.
async function readHeldTenantEntitlements(tenantId, { client } = {}) {
  const identity = tenantIdentity(tenantId);
  if (!client || typeof client.query !== "function") fail("Held entitlements require a transaction client.", "ENTITLEMENT_TRANSACTION_REQUIRED", 400);
  const tenant = await client.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [identity]);
  if (!tenant.rows.length) fail("Vendor not found.", "ENTITLEMENT_TENANT_NOT_FOUND", 404);
  const history = await hold(client, `SELECT id,status FROM tenant_subscriptions WHERE tenant_id=$1
    ORDER BY id LIMIT 1001 FOR SHARE NOWAIT`, [identity], "ENTITLEMENT_SUBSCRIPTION_BUSY");
  if (history.rows.length > 1000) fail("Subscription history exceeds the held-read bound.", "ENTITLEMENT_HISTORY_LIMIT");
  if (history.rows.filter(row => row.status === "active").length > 1) fail("Multiple active subscriptions require reconciliation.", "SUBSCRIPTION_AMBIGUOUS");
  const subscription = await billing.getActiveSubscriptionByTenantId(identity, { client });
  if (subscription?.status !== "active") return {};
  const plan = await hold(client, "SELECT slug FROM subscription_plans WHERE slug=$1 FOR SHARE NOWAIT", [subscription.planSlug], "ENTITLEMENT_PLAN_BUSY");
  if (!plan.rows.length) fail("Current subscription plan is unavailable.", "ENTITLEMENT_PLAN_UNAVAILABLE");
  const selectedPlan = await plans.findPlanBySlug(subscription.planSlug, { client });
  return activeEntitlements({ ...(selectedPlan.entitlements || {}), ...(subscription.entitlements || {}) });
}

module.exports = { readHeldTenantEntitlements };
