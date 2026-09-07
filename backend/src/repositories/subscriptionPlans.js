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
      branding: Boolean(row.entitlements?.publicFacingBranding),
      discovery: Boolean(row.entitlements?.marketplaceDiscovery),
      booking: Boolean(row.entitlements?.serviceBookingAccess),
      campaigns: Boolean(row.entitlements?.groupFundedCampaignAccess)
    },
    allowances: {
      queueTickets: Number(row.entitlements?.monthlyTickets || 0),
      queueEmailJourneys: Number(row.entitlements?.monthlyQueueEmailJourneys ?? row.entitlements?.monthlyTransactionalEmails ?? 0),
      serviceBookings: Number(row.entitlements?.monthlyServiceBookings || 0)
    },
    entitlements: row.entitlements || {},
    included: row.included || []
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
  if (!options.client && typeof db.withTransaction === "function") {
    return db.withTransaction((client) => updatePlan(plan, userId, { client }));
  }
  const entitlements = {
    ...(plan.entitlements || {}),
    queueSystemAccess: Boolean(plan.features?.queue),
    publicFacingBranding: Boolean(plan.features?.branding),
    marketplaceDiscovery: Boolean(plan.features?.discovery),
    serviceBookingAccess: Boolean(plan.features?.booking),
    groupFundedCampaignAccess: Boolean(plan.features?.campaigns),
    monthlyTickets: Number(plan.allowances?.queueTickets || 0),
    monthlyTransactionalEmails: Number(plan.allowances?.queueEmailJourneys || 0),
    monthlyQueueEmailJourneys: Number(plan.allowances?.queueEmailJourneys || 0),
    monthlyServiceBookings: Number(plan.allowances?.serviceBookings || 0)
  };
  const queryClient = buildQueryClient(options.client);
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

  for (const [featureKey, enabled] of Object.entries(plan.features || {})) {
    await queryClient.query(
      `INSERT INTO plan_feature_entitlements (plan_slug, feature_key, enabled, updated_by_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (plan_slug, feature_key) DO UPDATE
       SET enabled = EXCLUDED.enabled, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW()`,
      [plan.slug, featureKey, Boolean(enabled), userId ? Number(userId) : null]
    );
  }
  for (const [allowanceKey, monthlyLimit] of Object.entries(plan.allowances || {})) {
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
