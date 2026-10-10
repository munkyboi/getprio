const billing = require("./billing");
const plans = require("./subscriptionPlans");

// Catalog owns the tenant FK target. NOWAIT avoids subscription-first
// lifecycle writers that may need that target for a transition record.
async function readLocationCreationLimit(tenantId, { client }) {
  await client.query("SELECT id FROM tenant_subscriptions WHERE tenant_id=$1 ORDER BY id FOR UPDATE NOWAIT", [tenantId]);
  const subscription = await billing.getActiveSubscriptionByTenantId(tenantId, { client });
  if (!subscription) return 1;
  await client.query("SELECT slug FROM subscription_plans WHERE slug=$1 FOR SHARE NOWAIT", [subscription.planSlug]);
  const plan = await plans.findPlanBySlug(subscription.planSlug, { client });
  return { ...plan?.entitlements, ...subscription.entitlements }.locations || 1;
}

module.exports = { readLocationCreationLimit };
