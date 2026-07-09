const db = require("../config/db");
const { findPlanBySlug } = require("../services/subscriptionPlans");

function buildQueryClient(client) {
  return client || db.pool;
}

function mapSubscription(row) {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    planSlug: row.plan_slug,
    status: row.status,
    provider: row.provider,
    providerCustomerId: row.provider_customer_id,
    providerSubscriptionId: row.provider_subscription_id,
    providerCheckoutSessionId: row.provider_checkout_session_id,
    billingInterval: row.billing_interval,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    entitlements: row.entitlements || {},
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseSubscriptionTimestamps(data = {}) {
  return {
    currentPeriodStart: data.currentPeriodStart || null,
    currentPeriodEnd: data.currentPeriodEnd || null
  };
}

function mapCheckoutSession(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    planSlug: row.plan_slug,
    provider: row.provider,
    providerCheckoutSessionId: row.provider_checkout_session_id,
    status: row.status,
    amountCents: row.amount_cents,
    currency: row.currency,
    checkoutUrl: row.checkout_url,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTimestampMetadata(value) {
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

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value || {};
  }

  return {
    ...value,
    paidAt: normalizeTimestampMetadata(value.paidAt) || value.paidAt
  };
}

async function getActiveSubscriptionByTenantId(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT *
      FROM tenant_subscriptions
      WHERE tenant_id = $1
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'past_due' THEN 1
          WHEN 'unpaid' THEN 2
          ELSE 3
        END,
        updated_at DESC
      LIMIT 1
    `,
    [Number(tenantId)]
  );

  return mapSubscription(result.rows[0]);
}

async function createCheckoutSession(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO billing_checkout_sessions (
        tenant_id,
        plan_slug,
        provider,
        amount_cents,
        currency,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [
      Number(data.tenantId),
      data.planSlug,
      data.provider,
      data.amountCents,
      data.currency || "PHP",
      JSON.stringify(normalizeMetadata(data.metadata))
    ]
  );

  return mapCheckoutSession(result.rows[0]);
}

async function updateCheckoutSessionProviderData(checkoutId, data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE billing_checkout_sessions
      SET
        provider_checkout_session_id = $2,
        checkout_url = $3,
        metadata = metadata || $4::jsonb
      WHERE id = $1
      RETURNING *
    `,
    [
      Number(checkoutId),
      data.providerCheckoutSessionId || null,
      data.checkoutUrl || null,
      JSON.stringify(normalizeMetadata(data.metadata))
    ]
  );

  return mapCheckoutSession(result.rows[0]);
}

async function findCheckoutSessionByProviderId(providerCheckoutSessionId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT *
      FROM billing_checkout_sessions
      WHERE provider_checkout_session_id = $1
      LIMIT 1
    `,
    [providerCheckoutSessionId]
  );

  return mapCheckoutSession(result.rows[0]);
}

async function findCheckoutSessionById(checkoutId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT *
      FROM billing_checkout_sessions
      WHERE id = $1
      LIMIT 1
    `,
    [Number(checkoutId)]
  );

  return mapCheckoutSession(result.rows[0]);
}

async function markCheckoutSessionPaid(checkoutId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE billing_checkout_sessions
      SET status = 'paid'
      WHERE id = $1
      RETURNING *
    `,
    [Number(checkoutId)]
  );

  return mapCheckoutSession(result.rows[0]);
}

async function recordBillingEvent(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO billing_events (
        provider,
        provider_event_id,
        event_type,
        provider_checkout_session_id,
        provider_payment_id,
        tenant_id,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING *
    `,
    [
      data.provider,
      data.providerEventId,
      data.eventType,
      data.providerCheckoutSessionId || null,
      data.providerPaymentId || null,
      data.tenantId ? Number(data.tenantId) : null,
      JSON.stringify(data.payload || {})
    ]
  );

  return result.rows[0] || null;
}

async function activateTenantSubscription(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      UPDATE tenant_subscriptions
      SET status = 'expired'
      WHERE tenant_id = $1 AND status IN ('active', 'past_due', 'unpaid')
    `,
    [Number(data.tenantId)]
  );

  const result = await queryClient.query(
    `
      INSERT INTO tenant_subscriptions (
        tenant_id,
        plan_slug,
        status,
        provider,
        provider_checkout_session_id,
        billing_interval,
        current_period_start,
        current_period_end,
        entitlements,
        metadata
      )
      VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
    [
      Number(data.tenantId),
      data.planSlug,
      data.provider,
      data.providerCheckoutSessionId || null,
      data.billingInterval || "monthly",
      data.currentPeriodStart || new Date(),
      data.currentPeriodEnd || null,
      JSON.stringify(data.entitlements || {}),
      JSON.stringify(data.metadata || {})
    ]
  );

  return mapSubscription(result.rows[0]);
}

async function listSubscriptions(options = {}) {
  const queryClient = buildQueryClient(options.client);
  const limit = Math.min(Number(options.limit || 100), 250);
  const result = await queryClient.query(
    `
      SELECT
        tenant_subscriptions.*,
        tenants.name AS tenant_name,
        tenants.slug AS tenant_slug
      FROM tenant_subscriptions
      INNER JOIN tenants ON tenants.id = tenant_subscriptions.tenant_id
      ORDER BY updated_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    ...mapSubscription(row),
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug
  }));
}

async function createTenantSubscription(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const timestamps = parseSubscriptionTimestamps(data);
  const result = await queryClient.query(
    `
      INSERT INTO tenant_subscriptions (
        tenant_id,
        plan_slug,
        status,
        provider,
        provider_customer_id,
        provider_subscription_id,
        provider_checkout_session_id,
        billing_interval,
        current_period_start,
        current_period_end,
        entitlements,
        metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `,
    [
      Number(data.tenantId),
      data.planSlug,
      data.status || "unpaid",
      data.provider || "manual",
      data.providerCustomerId || null,
      data.providerSubscriptionId || null,
      data.providerCheckoutSessionId || null,
      data.billingInterval || "monthly",
      timestamps.currentPeriodStart,
      timestamps.currentPeriodEnd,
      JSON.stringify(data.entitlements || {}),
      JSON.stringify(data.metadata || {})
    ]
  );

  return mapSubscription(result.rows[0]);
}

async function updateTenantSubscription(subscriptionId, changes, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const nextPlan = changes.planSlug ? await findPlanBySlug(changes.planSlug, { client: queryClient }) : null;
  const nextEntitlements = changes.entitlements || (changes.planSlug ? nextPlan?.entitlements || {} : null);
  const result = await queryClient.query(
    `
      UPDATE tenant_subscriptions
      SET
        tenant_id = COALESCE($2, tenant_id),
        plan_slug = COALESCE($3, plan_slug),
        status = COALESCE($4, status),
        provider = COALESCE($5, provider),
        provider_customer_id = $6,
        provider_subscription_id = $7,
        provider_checkout_session_id = $8,
        billing_interval = COALESCE($9, billing_interval),
        current_period_start = $10,
        current_period_end = $11,
        entitlements = COALESCE($12, entitlements),
        metadata = COALESCE($13, metadata),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      Number(subscriptionId),
      changes.tenantId ? Number(changes.tenantId) : null,
      changes.planSlug || null,
      changes.status || null,
      changes.provider || null,
      changes.providerCustomerId ?? null,
      changes.providerSubscriptionId ?? null,
      changes.providerCheckoutSessionId ?? null,
      changes.billingInterval || null,
      changes.currentPeriodStart ?? null,
      changes.currentPeriodEnd ?? null,
      nextEntitlements ? JSON.stringify(nextEntitlements) : null,
      changes.metadata ? JSON.stringify(changes.metadata) : null
    ]
  );

  return mapSubscription(result.rows[0]);
}

async function deleteTenantSubscription(subscriptionId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      DELETE FROM tenant_subscriptions
      WHERE id = $1
      RETURNING *
    `,
    [Number(subscriptionId)]
  );

  return mapSubscription(result.rows[0]);
}

module.exports = {
  getActiveSubscriptionByTenantId,
  createCheckoutSession,
  updateCheckoutSessionProviderData,
  findCheckoutSessionByProviderId,
  findCheckoutSessionById,
  markCheckoutSessionPaid,
  recordBillingEvent,
  activateTenantSubscription,
  listSubscriptions,
  createTenantSubscription,
  updateTenantSubscription,
  deleteTenantSubscription
};
