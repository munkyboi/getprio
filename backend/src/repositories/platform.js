const db = require("../config/db");
const { mapPayment } = require("./queueJoinPayments");

function buildQueryClient(client) {
  return client || db.pool;
}

async function getOverviewTotals(options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT
        (SELECT COUNT(*)::int FROM tenants) AS tenants,
        (SELECT COUNT(*)::int FROM users) AS users,
        (
          SELECT COUNT(*)::int
          FROM tenant_subscriptions
          WHERE status = 'active'
        ) AS active_subscriptions,
        (SELECT COUNT(*)::int FROM queue_join_payments) AS queue_join_payments,
        (
          SELECT COUNT(*)::int
          FROM queue_join_payments
          WHERE status = 'paid'
        ) AS paid_queue_join_payments,
        (
          SELECT COALESCE(SUM(amount_cents), 0)::int
          FROM queue_join_payments
          WHERE status = 'paid'
        ) AS queue_join_revenue_cents,
        (
          SELECT COUNT(*)::int
          FROM queue_join_payments
          WHERE status IN ('failed', 'expired', 'canceled')
        ) AS failed_queue_join_payments
    `
  );

  const row = result.rows[0] || {};
  return {
    tenants: row.tenants || 0,
    users: row.users || 0,
    activeSubscriptions: row.active_subscriptions || 0,
    queueJoinPayments: row.queue_join_payments || 0,
    paidQueueJoinPayments: row.paid_queue_join_payments || 0,
    queueJoinRevenueCents: row.queue_join_revenue_cents || 0,
    failedQueueJoinPayments: row.failed_queue_join_payments || 0
  };
}

async function getOverviewAnalytics(options = {}) {
  const queryClient = buildQueryClient(options.client);
  const [revenueTrend, paymentStatusMix, subscriptionsByPlan, tenantGrowth, userGrowth] =
    await Promise.all([
      queryClient.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS period,
               COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0)::int AS amount_cents
        FROM queue_join_payments
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY 1
        ORDER BY 1
      `),
      queryClient.query(`
        SELECT status, COUNT(*)::int AS count
        FROM queue_join_payments
        GROUP BY status
        ORDER BY status
      `),
      queryClient.query(`
        SELECT plan_slug, COUNT(*)::int AS count
        FROM tenant_subscriptions
        WHERE status = 'active'
        GROUP BY plan_slug
        ORDER BY plan_slug
      `),
      queryClient.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS period, COUNT(*)::int AS count
        FROM tenants
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY 1
        ORDER BY 1
      `),
      queryClient.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS period, COUNT(*)::int AS count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY 1
        ORDER BY 1
      `)
    ]);

  return {
    revenueTrend: revenueTrend.rows.map((row) => ({
      period: row.period,
      amountCents: row.amount_cents
    })),
    paymentStatusMix: paymentStatusMix.rows.map((row) => ({
      status: row.status,
      count: row.count
    })),
    subscriptionsByPlan: subscriptionsByPlan.rows.map((row) => ({
      planSlug: row.plan_slug,
      count: row.count
    })),
    tenantGrowth: tenantGrowth.rows.map((row) => ({
      period: row.period,
      count: row.count
    })),
    userGrowth: userGrowth.rows.map((row) => ({
      period: row.period,
      count: row.count
    }))
  };
}

async function listTenants(options = {}) {
  const queryClient = buildQueryClient(options.client);
  const limit = Math.min(Number(options.limit || 100), 250);
  const result = await queryClient.query(
    `
      SELECT
        tenants.id,
        tenants.name,
        tenants.slug,
        tenants.is_active,
        tenants.created_at,
        COALESCE(active_subscription.plan_slug, 'economical') AS plan_slug,
        COUNT(tickets.id)::int AS ticket_count
      FROM tenants
      LEFT JOIN LATERAL (
        SELECT plan_slug
        FROM tenant_subscriptions
        WHERE tenant_subscriptions.tenant_id = tenants.id
        ORDER BY
          CASE status
            WHEN 'active' THEN 0
            WHEN 'past_due' THEN 1
            WHEN 'unpaid' THEN 2
            ELSE 3
          END,
          updated_at DESC
        LIMIT 1
      ) active_subscription ON TRUE
      LEFT JOIN tickets ON tickets.tenant_id = tenants.id
      GROUP BY tenants.id, active_subscription.plan_slug
      ORDER BY tenants.created_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    isActive: row.is_active,
    planSlug: row.plan_slug,
    ticketCount: row.ticket_count,
    createdAt: row.created_at
  }));
}

async function listUsers(options = {}) {
  const queryClient = buildQueryClient(options.client);
  const limit = Math.min(Number(options.limit || 100), 250);
  const result = await queryClient.query(
    `
      SELECT id, name, email, phone, roles, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    roles: row.roles || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function listSubscriptions(options = {}) {
  const queryClient = buildQueryClient(options.client);
  const limit = Math.min(Number(options.limit || 100), 250);
  const result = await queryClient.query(
    `
      SELECT
        tenant_subscriptions.id,
        tenant_subscriptions.plan_slug,
        tenant_subscriptions.status,
        tenant_subscriptions.provider,
        tenant_subscriptions.current_period_start,
        tenant_subscriptions.current_period_end,
        tenant_subscriptions.created_at,
        tenants.name AS tenant_name,
        tenants.slug AS tenant_slug
      FROM tenant_subscriptions
      INNER JOIN tenants ON tenants.id = tenant_subscriptions.tenant_id
      ORDER BY tenant_subscriptions.updated_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    planSlug: row.plan_slug,
    status: row.status,
    provider: row.provider,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    createdAt: row.created_at
  }));
}

async function listBillingEvents(options = {}) {
  const queryClient = buildQueryClient(options.client);
  const limit = Math.min(Number(options.limit || 100), 250);
  const result = await queryClient.query(
    `
      SELECT
        billing_events.id,
        billing_events.provider,
        billing_events.provider_event_id,
        billing_events.event_type,
        billing_events.provider_checkout_session_id,
        billing_events.provider_payment_id,
        billing_events.processed_at,
        tenants.name AS tenant_name,
        tenants.slug AS tenant_slug
      FROM billing_events
      LEFT JOIN tenants ON tenants.id = billing_events.tenant_id
      ORDER BY billing_events.created_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    provider: row.provider,
    providerEventId: row.provider_event_id,
    eventType: row.event_type,
    providerCheckoutSessionId: row.provider_checkout_session_id,
    providerPaymentId: row.provider_payment_id,
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    processedAt: row.processed_at
  }));
}

async function listRecentPayments(options = {}) {
  const queryClient = buildQueryClient(options.client);
  const limit = Math.min(Number(options.limit || 10), 50);
  const result = await queryClient.query(
    `
      SELECT
        queue_join_payments.*,
        tenants.name AS tenant_name,
        tenants.slug AS tenant_slug
      FROM queue_join_payments
      INNER JOIN tenants ON tenants.id = queue_join_payments.tenant_id
      ORDER BY queue_join_payments.created_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows.map(mapPayment);
}

async function getSetting(key, fallback = "", options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT value FROM platform_settings WHERE key = $1 LIMIT 1`,
    [key]
  );

  return result.rows[0]?.value || fallback;
}

async function upsertSetting({ key, value, userId }, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO platform_settings (key, value, updated_by_user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_by_user_id = EXCLUDED.updated_by_user_id
      RETURNING key, value, updated_at
    `,
    [key, value, userId ? Number(userId) : null]
  );

  return result.rows[0];
}

async function getPlatformSettings(options = {}) {
  return {
    enterpriseInquiryEmail: await getSetting(
      "enterprise_inquiry_email",
      "carlo.abella@gmail.com",
      options
    )
  };
}

async function updatePlatformSettings({ enterpriseInquiryEmail, userId }, options = {}) {
  await upsertSetting({
    key: "enterprise_inquiry_email",
    value: enterpriseInquiryEmail,
    userId
  }, options);

  return getPlatformSettings(options);
}

module.exports = {
  getOverviewTotals,
  getOverviewAnalytics,
  listTenants,
  listUsers,
  listSubscriptions,
  listBillingEvents,
  listRecentPayments,
  getPlatformSettings,
  updatePlatformSettings
};
