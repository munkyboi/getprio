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

test('active plan reads and writes omit email quotas while retaining other entitlements', async () => {
  const row = { slug: 'pro', entitlements: { monthlyTickets: 5000, monthlyServiceBookings: 1000,
    monthlyTransactionalEmails: 5000, monthlyQueueEmailJourneys: 5000, emailAlerts: true },
    included: ['Email alerts', '5,000 Queue Email Journeys/mo', '5,000 Queue Tickets/mo',
      '100 transactional emails/mo', '500 transactional emails/mo', 'Monthly transactional emails',
      'Transactional email delivery'] };
  const allowanceWrites = [];
  const client = { query: async (sql, values) => {
    if (sql.includes('UPDATE subscription_plans')) row.entitlements = JSON.parse(values[6]);
    if (sql.includes('INSERT INTO plan_allowances')) allowanceWrites.push(values[1]);
    return { rows: [row] };
  } };
  const plan = await plans.findPlanBySlug('pro', { client });
  assert.equal(Object.hasOwn(plan.entitlements, 'monthlyTransactionalEmails'), false);
  assert.equal(Object.hasOwn(plan.allowances, 'queueEmailJourneys'), false);
  assert.deepEqual(plan.included, ['Email alerts', '5,000 Queue Tickets/mo', 'Transactional email delivery']);
  await plans.updatePlan({ ...plan, price: {}, allowances: { ...plan.allowances, queueEmailJourneys: 1 },
    entitlements: { ...plan.entitlements, monthlyQueueEmailJourneys: 1 } }, '1', { client });
  assert.deepEqual(allowanceWrites, ['queueTickets', 'serviceBookings']);
  assert.equal(Object.hasOwn(row.entitlements, 'monthlyQueueEmailJourneys'), false);
  assert.equal(row.entitlements.emailAlerts, true);
});
