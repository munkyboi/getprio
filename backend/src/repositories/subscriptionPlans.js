const { activeAllowances, activeEntitlements, assertNoRetiredEmailQuotas } = require("../domain/activePlanQuotas");
const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

function formatPhp(amountCents, suffix) {
  return `PHP ${(Number(amountCents || 0) / 100).toLocaleString("en-PH")}${suffix}`;
}

function mapPlan(row) {
  if (!row) {
    return null;
  }

  return {
    slug: row.slug,
    name: row.name,
    price: {
      currency: row.currency,
      monthlyAmountCents: row.monthly_amount_cents,
      monthlyDisplay: formatPhp(row.monthly_amount_cents, "/mo"),
      annualAmountCents: row.annual_amount_cents,
      annualDisplay: formatPhp(row.annual_amount_cents, "/yr")
    },
    bestFor: row.best_for,
    checkoutEnabled: row.checkout_enabled,
    sortOrder: Number(row.sort_order || 0),
    policyRevision: Number(row.policy_revision || 1),
    features: {
      queue: Boolean(row.entitlements?.queueSystemAccess),
      resourceQueue: row.entitlements?.resourceQueueAccess === true,
      workflowQueue: row.entitlements?.workflowQueueAccess === true,
      branding: Boolean(row.entitlements?.publicFacingBranding),
      discovery: Boolean(row.entitlements?.marketplaceDiscovery),
      booking: Boolean(row.entitlements?.serviceBookingAccess),
      campaigns: false
    },
    allowances: {
      queueTickets: Number(row.entitlements?.monthlyTickets || 0),
      serviceBookings: Number(row.entitlements?.monthlyServiceBookings || 0)
    },
    entitlements: activeEntitlements({ ...(row.entitlements || {}), groupFundedCampaignAccess: false }),
    included: (row.included || []).filter(item => !/Queue Email Journey|^(?:monthly|[\d,]+) transactional emails?/i.test(String(item).trim()))
  };
}

async function listPlans(options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT * FROM subscription_plans ORDER BY sort_order ASC, slug ASC`
  );
  return result.rows.map(mapPlan);
}

async function findPlanBySlug(slug, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT * FROM subscription_plans WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  return mapPlan(result.rows[0]);
}

async function updatePlan(plan, userId, options = {}) {
  assertNoRetiredEmailQuotas(plan);
  if (!options.client && typeof db.withTransaction === "function") {
    return db.withTransaction((client) => updatePlan(plan, userId, { client }));
  }
  const queryClient = buildQueryClient(options.client);
  const previous = (await queryClient.query("SELECT entitlements FROM subscription_plans WHERE slug=$1 FOR UPDATE", [plan.slug])).rows[0]?.entitlements || {};
  const advanced = {
    resourceQueue: plan.features?.resourceQueue ?? previous.resourceQueueAccess ?? false,
    workflowQueue: plan.features?.workflowQueue ?? previous.workflowQueueAccess ?? false
  };
  if ((advanced.resourceQueue || advanced.workflowQueue) && plan.features?.queue !== true) {
    throw Object.assign(new Error("Advanced queue types require Simple Queue access."), {statusCode:400,code:"QUEUE_TYPE_QUEUE_DEPENDENCY"});
  }
  const entitlements = activeEntitlements({
    ...previous,
    ...(plan.entitlements || {}),
    queueSystemAccess: Boolean(plan.features?.queue),
    resourceQueueAccess: advanced.resourceQueue,
    workflowQueueAccess: advanced.workflowQueue,
    publicFacingBranding: Boolean(plan.features?.branding),
    marketplaceDiscovery: Boolean(plan.features?.discovery),
    serviceBookingAccess: Boolean(plan.features?.booking),
    groupFundedCampaignAccess: false,
    monthlyTickets: Number(plan.allowances?.queueTickets || 0),
    monthlyServiceBookings: Number(plan.allowances?.serviceBookings || 0)
  });
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE subscription_plans
      SET
        name = $2,
        best_for = $3,
        checkout_enabled = $4,
        monthly_amount_cents = $5,
        annual_amount_cents = $6,
        entitlements = $7,
        included = $8,
        updated_by_user_id = $9,
        policy_revision = policy_revision + 1,
        updated_at = NOW()
      WHERE slug = $1
      RETURNING *
    `,
    [
      plan.slug,
      plan.name,
      plan.bestFor,
      Boolean(plan.checkoutEnabled),
      Number(plan.price.monthlyAmountCents),
      Number(plan.price.annualAmountCents),
      JSON.stringify(entitlements),
      JSON.stringify(plan.included || []),
      userId ? Number(userId) : null
    ]
  );

  for (const [featureKey, enabled] of Object.entries({ ...(plan.features || {}), ...advanced, campaigns: false })) {
    await queryClient.query(
      `INSERT INTO plan_feature_entitlements (plan_slug, feature_key, enabled, updated_by_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (plan_slug, feature_key) DO UPDATE
       SET enabled = EXCLUDED.enabled, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW()`,
      [plan.slug, featureKey, Boolean(enabled), userId ? Number(userId) : null]
    );
  }
  for (const [allowanceKey, monthlyLimit] of Object.entries(activeAllowances(plan.allowances))) {
    await queryClient.query(
      `INSERT INTO plan_allowances (plan_slug, allowance_key, monthly_limit, updated_by_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (plan_slug, allowance_key) DO UPDATE
       SET monthly_limit = EXCLUDED.monthly_limit, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW()`,
      [plan.slug, allowanceKey, Number(monthlyLimit), userId ? Number(userId) : null]
    );
  }

  return mapPlan(result.rows[0]);
}

module.exports = {
  listPlans,
  findPlanBySlug,
  updatePlan
};
