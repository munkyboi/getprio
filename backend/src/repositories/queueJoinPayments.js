const db = require("../config/db");

const PAYMENT_COLUMNS = `
  queue_join_payments.id,
  queue_join_payments.tenant_id,
  queue_join_payments.otp_id,
  queue_join_payments.plan_slug,
  queue_join_payments.provider,
  queue_join_payments.provider_checkout_session_id,
  queue_join_payments.provider_payment_id,
  queue_join_payments.status,
  queue_join_payments.amount_cents,
  queue_join_payments.currency,
  queue_join_payments.checkout_url,
  queue_join_payments.payload,
  queue_join_payments.metadata,
  queue_join_payments.ticket_id,
  queue_join_payments.ticket_lookup_code,
  queue_join_payments.paid_at,
  queue_join_payments.created_at,
  queue_join_payments.updated_at
`;

function buildQueryClient(client) {
  return client || db.pool;
}

function mapPayment(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    tenantName: row.tenant_name || undefined,
    tenantSlug: row.tenant_slug || undefined,
    otpId: String(row.otp_id),
    planSlug: row.plan_slug,
    provider: row.provider,
    providerCheckoutSessionId: row.provider_checkout_session_id,
    providerPaymentId: row.provider_payment_id,
    status: row.status,
    amountCents: row.amount_cents,
    currency: row.currency || "PHP",
    checkoutUrl: row.checkout_url,
    payload: row.payload || {},
    metadata: row.metadata || {},
    ticketId: row.ticket_id ? String(row.ticket_id) : null,
    ticketLookupCode: row.ticket_lookup_code,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTimestampForPostgres(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    const milliseconds = numericValue < 100000000000 ? numericValue * 1000 : numericValue;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function createPayment(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO queue_join_payments (
        tenant_id,
        otp_id,
        plan_slug,
        provider,
        amount_cents,
        currency,
        payload,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id, otp_id) DO UPDATE
      SET metadata = queue_join_payments.metadata || EXCLUDED.metadata
      RETURNING ${PAYMENT_COLUMNS}
    `,
    [
      Number(data.tenantId),
      Number(data.otpId),
      data.planSlug,
      data.provider,
      Number(data.amountCents),
      data.currency || "PHP",
      JSON.stringify(data.payload || {}),
      JSON.stringify(data.metadata || {})
    ]
  );

  return mapPayment(result.rows[0]);
}

async function updateProviderData(paymentId, data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE queue_join_payments
      SET
        provider_checkout_session_id = $2,
        checkout_url = $3,
        metadata = metadata || $4::jsonb
      WHERE id = $1
      RETURNING ${PAYMENT_COLUMNS}
    `,
    [
      Number(paymentId),
      data.providerCheckoutSessionId || null,
      data.checkoutUrl || null,
      JSON.stringify(data.metadata || {})
    ]
  );

  return mapPayment(result.rows[0]);
}

async function findPaymentById(paymentId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${PAYMENT_COLUMNS} FROM queue_join_payments WHERE queue_join_payments.id = $1 LIMIT 1`,
    [Number(paymentId)]
  );

  return mapPayment(result.rows[0]);
}

async function findPaymentByIdForUpdate(paymentId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${PAYMENT_COLUMNS} FROM queue_join_payments WHERE queue_join_payments.id = $1 FOR UPDATE`,
    [Number(paymentId)]
  );

  return mapPayment(result.rows[0]);
}

async function findPaymentByProviderId(providerCheckoutSessionId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${PAYMENT_COLUMNS}
      FROM queue_join_payments
      WHERE provider_checkout_session_id = $1
      LIMIT 1
    `,
    [providerCheckoutSessionId]
  );

  return mapPayment(result.rows[0]);
}

async function findPaymentByProviderIdForUpdate(providerCheckoutSessionId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${PAYMENT_COLUMNS}
      FROM queue_join_payments
      WHERE provider_checkout_session_id = $1
      FOR UPDATE
    `,
    [providerCheckoutSessionId]
  );

  return mapPayment(result.rows[0]);
}

async function markPaidWithTicket(paymentId, data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE queue_join_payments
      SET
        status = 'paid',
        provider_payment_id = COALESCE($2, provider_payment_id),
        paid_at = COALESCE($3::timestamptz, paid_at, NOW()),
        ticket_id = $4,
        ticket_lookup_code = $5,
        metadata = metadata || $6::jsonb
      WHERE id = $1
      RETURNING ${PAYMENT_COLUMNS}
    `,
    [
      Number(paymentId),
      data.providerPaymentId || null,
      normalizeTimestampForPostgres(data.paidAt),
      Number(data.ticketId),
      data.ticketLookupCode || null,
      JSON.stringify(data.metadata || {})
    ]
  );

  return mapPayment(result.rows[0]);
}

async function listPayments(options = {}) {
  const queryClient = buildQueryClient(options.client);
  const limit = Math.min(Number(options.limit || 50), 250);
  const values = [limit];
  const filters = [];

  if (options.status) {
    values.push(options.status);
    filters.push(`queue_join_payments.status = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await queryClient.query(
    `
      SELECT ${PAYMENT_COLUMNS},
        tenants.name AS tenant_name,
        tenants.slug AS tenant_slug
      FROM queue_join_payments
      INNER JOIN tenants ON tenants.id = queue_join_payments.tenant_id
      ${whereClause}
      ORDER BY queue_join_payments.created_at DESC
      LIMIT $1
    `,
    values
  );

  return result.rows.map(mapPayment);
}

module.exports = {
  mapPayment,
  createPayment,
  updateProviderData,
  findPaymentById,
  findPaymentByIdForUpdate,
  findPaymentByProviderId,
  findPaymentByProviderIdForUpdate,
  markPaidWithTicket,
  listPayments
};
