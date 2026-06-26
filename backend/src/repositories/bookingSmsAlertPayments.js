const db = require("../config/db");

const PAYMENT_COLUMNS = `
  booking_sms_alert_payments.id,
  booking_sms_alert_payments.tenant_id,
  booking_sms_alert_payments.booking_otp_id,
  booking_sms_alert_payments.plan_slug,
  booking_sms_alert_payments.provider,
  booking_sms_alert_payments.provider_checkout_session_id,
  booking_sms_alert_payments.provider_payment_id,
  booking_sms_alert_payments.status,
  booking_sms_alert_payments.amount_cents,
  booking_sms_alert_payments.currency,
  booking_sms_alert_payments.checkout_url,
  booking_sms_alert_payments.payload,
  booking_sms_alert_payments.metadata,
  booking_sms_alert_payments.paid_at,
  booking_sms_alert_payments.created_at,
  booking_sms_alert_payments.updated_at
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
    bookingOtpId: String(row.booking_otp_id),
    planSlug: row.plan_slug,
    provider: row.provider,
    providerCheckoutSessionId: row.provider_checkout_session_id,
    providerPaymentId: row.provider_payment_id,
    status: row.status,
    amountCents: Number(row.amount_cents),
    currency: row.currency || "PHP",
    checkoutUrl: row.checkout_url,
    payload: row.payload || {},
    metadata: row.metadata || {},
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTimestampForPostgres(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function createPayment(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO booking_sms_alert_payments (
        tenant_id,
        booking_otp_id,
        plan_slug,
        provider,
        amount_cents,
        currency,
        payload,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id, booking_otp_id) DO UPDATE
      SET metadata = booking_sms_alert_payments.metadata || EXCLUDED.metadata
      RETURNING ${PAYMENT_COLUMNS}
    `,
    [
      Number(data.tenantId),
      Number(data.bookingOtpId),
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
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE booking_sms_alert_payments
      SET provider_checkout_session_id = $2,
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

async function markFailed(paymentId, data = {}, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE booking_sms_alert_payments
      SET status = 'failed',
          provider_checkout_session_id = COALESCE($2, provider_checkout_session_id),
          checkout_url = COALESCE($3, checkout_url),
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
  const result = await buildQueryClient(options.client).query(
    `SELECT ${PAYMENT_COLUMNS} FROM booking_sms_alert_payments WHERE booking_sms_alert_payments.id = $1 LIMIT 1`,
    [Number(paymentId)]
  );

  return mapPayment(result.rows[0]);
}

async function findPaymentByProviderId(providerCheckoutSessionId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${PAYMENT_COLUMNS}
      FROM booking_sms_alert_payments
      WHERE provider_checkout_session_id = $1
      LIMIT 1
    `,
    [providerCheckoutSessionId]
  );

  return mapPayment(result.rows[0]);
}

async function markPaid(paymentId, data = {}, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE booking_sms_alert_payments
      SET status = 'paid',
          provider_payment_id = COALESCE($2, provider_payment_id),
          paid_at = COALESCE($3::timestamptz, paid_at, NOW()),
          metadata = metadata || $4::jsonb
      WHERE id = $1
      RETURNING ${PAYMENT_COLUMNS}
    `,
    [
      Number(paymentId),
      data.providerPaymentId || null,
      normalizeTimestampForPostgres(data.paidAt),
      JSON.stringify(data.metadata || {})
    ]
  );

  return mapPayment(result.rows[0]);
}

module.exports = {
  createPayment,
  updateProviderData,
  markFailed,
  findPaymentById,
  findPaymentByProviderId,
  markPaid
};
