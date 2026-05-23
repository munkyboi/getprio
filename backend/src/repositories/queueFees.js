const db = require("../config/db");

const FEE_COLUMNS = `
  plan_slug,
  enabled,
  amount_cents,
  currency,
  updated_by_user_id,
  created_at,
  updated_at
`;

const DEFAULT_FEES = [
  { planSlug: "economical", enabled: true, amountCents: 5000, currency: "PHP" },
  { planSlug: "pro", enabled: true, amountCents: 2500, currency: "PHP" },
  { planSlug: "enterprise", enabled: false, amountCents: 0, currency: "PHP" }
];

function buildQueryClient(client) {
  return client || db.pool;
}

function mapFee(row) {
  if (!row) {
    return null;
  }

  return {
    planSlug: row.plan_slug,
    enabled: row.enabled,
    amountCents: row.amount_cents,
    currency: row.currency || "PHP",
    updatedByUserId: row.updated_by_user_id ? String(row.updated_by_user_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function ensureDefaults(options = {}) {
  const queryClient = buildQueryClient(options.client);
  for (const fee of DEFAULT_FEES) {
    await queryClient.query(
      `
        INSERT INTO queue_fee_settings (plan_slug, enabled, amount_cents, currency)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (plan_slug) DO NOTHING
      `,
      [fee.planSlug, fee.enabled, fee.amountCents, fee.currency]
    );
  }
}

async function listQueueFees(options = {}) {
  const queryClient = buildQueryClient(options.client);
  await ensureDefaults({ client: queryClient });
  const result = await queryClient.query(
    `
      SELECT ${FEE_COLUMNS}
      FROM queue_fee_settings
      ORDER BY CASE plan_slug
        WHEN 'economical' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'enterprise' THEN 3
        ELSE 4
      END
    `
  );

  return result.rows.map(mapFee);
}

async function findQueueFeeByPlan(planSlug, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await ensureDefaults({ client: queryClient });
  const result = await queryClient.query(
    `SELECT ${FEE_COLUMNS} FROM queue_fee_settings WHERE plan_slug = $1 LIMIT 1`,
    [planSlug]
  );

  return mapFee(result.rows[0]);
}

async function upsertQueueFee(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO queue_fee_settings (
        plan_slug,
        enabled,
        amount_cents,
        currency,
        updated_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (plan_slug) DO UPDATE
      SET
        enabled = EXCLUDED.enabled,
        amount_cents = EXCLUDED.amount_cents,
        currency = EXCLUDED.currency,
        updated_by_user_id = EXCLUDED.updated_by_user_id
      RETURNING ${FEE_COLUMNS}
    `,
    [
      data.planSlug,
      Boolean(data.enabled),
      Number(data.amountCents),
      data.currency || "PHP",
      data.updatedByUserId ? Number(data.updatedByUserId) : null
    ]
  );

  return mapFee(result.rows[0]);
}

module.exports = {
  listQueueFees,
  findQueueFeeByPlan,
  upsertQueueFee
};
