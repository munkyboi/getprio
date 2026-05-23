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
    entitlements: row.entitlements || {},
    included: row.included || []
  };
}

async function listPlans(options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT * FROM subscription_plans ORDER BY CASE slug WHEN 'economical' THEN 1 WHEN 'pro' THEN 2 ELSE 3 END`
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
        updated_by_user_id = $9
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
      JSON.stringify(plan.entitlements || {}),
      JSON.stringify(plan.included || []),
      userId ? Number(userId) : null
    ]
  );

  return mapPlan(result.rows[0]);
}

module.exports = {
  listPlans,
  findPlanBySlug,
  updatePlan
};
