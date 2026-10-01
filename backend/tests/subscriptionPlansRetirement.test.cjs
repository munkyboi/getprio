const test = require("node:test");
const assert = require("node:assert/strict");
const plans = require("../src/repositories/subscriptionPlans");

test("legacy plan reads and writes cannot advertise or restore campaign access", async () => {
  const row = { slug: "pro", name: "Pro", entitlements: { serviceBookingAccess: true, groupFundedCampaignAccess: true } };
  const writes = [];
  const client = { query: async (sql, values) => {
    if (sql.includes("UPDATE subscription_plans")) {
      row.entitlements = JSON.parse(values[6]);
    }
    if (sql.includes("INSERT INTO plan_feature_entitlements")) writes.push(values);
    return { rows: [row] };
  } };
  const plan = await plans.findPlanBySlug("pro", { client });
  assert.equal(plan.features.campaigns, false);
  assert.equal(plan.entitlements.groupFundedCampaignAccess, false);
  const updated = await plans.updatePlan({ ...plan, features: { ...plan.features, campaigns: true }, entitlements: { ...plan.entitlements, groupFundedCampaignAccess: true } }, "1", { client });
  assert.equal(updated.features.booking, true);
  assert.equal(row.entitlements.groupFundedCampaignAccess, false);
  assert.equal(writes.find((values) => values[1] === "campaigns")[2], false);
});
