const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

function mapPushSubscription(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    userId: String(row.user_id),
    tenantId: row.tenant_id ? String(row.tenant_id) : null,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.user_agent || "",
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    failureCount: Number(row.failure_count || 0),
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function upsertSubscription(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO push_subscriptions (
        user_id,
        tenant_id,
        endpoint,
        p256dh,
        auth,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (endpoint) WHERE is_active = TRUE
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        tenant_id = EXCLUDED.tenant_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        failure_count = 0,
        is_active = TRUE,
        updated_at = NOW()
      RETURNING *
    `,
    [
      Number(data.userId),
      data.tenantId ? Number(data.tenantId) : null,
      data.endpoint,
      data.p256dh,
      data.auth,
      data.userAgent || null
    ]
  );

  return mapPushSubscription(result.rows[0]);
}

async function deactivateSubscriptionForUser(userId, subscriptionId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE push_subscriptions
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `,
    [Number(subscriptionId), Number(userId)]
  );

  return mapPushSubscription(result.rows[0]);
}

async function deactivateByEndpoint(endpoint, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      UPDATE push_subscriptions
      SET is_active = FALSE, updated_at = NOW()
      WHERE endpoint = $1
    `,
    [endpoint]
  );
}

async function recordPushSuccess(subscriptionId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      UPDATE push_subscriptions
      SET last_success_at = NOW(), failure_count = 0, updated_at = NOW()
      WHERE id = $1
    `,
    [Number(subscriptionId)]
  );
}

async function recordPushFailure(subscriptionId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      UPDATE push_subscriptions
      SET last_failure_at = NOW(), failure_count = failure_count + 1, updated_at = NOW()
      WHERE id = $1
    `,
    [Number(subscriptionId)]
  );
}

async function listActiveByTenantId(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const roles = Array.isArray(options.roles) && options.roles.length
    ? options.roles.map((role) => String(role))
    : ["owner", "admin", "staff"];
  const result = await queryClient.query(
    `
      SELECT push_subscriptions.*
      FROM push_subscriptions
      INNER JOIN tenant_memberships
        ON tenant_memberships.user_id = push_subscriptions.user_id
        AND tenant_memberships.tenant_id = push_subscriptions.tenant_id
        AND tenant_memberships.is_active = TRUE
      WHERE push_subscriptions.tenant_id = $1
        AND push_subscriptions.is_active = TRUE
        AND tenant_memberships.role = ANY($2::TEXT[])
      ORDER BY push_subscriptions.updated_at DESC
    `,
    [Number(tenantId), roles]
  );

  return result.rows.map(mapPushSubscription);
}

async function listActiveByUserId(userId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT push_subscriptions.*
      FROM push_subscriptions
      WHERE push_subscriptions.user_id = $1
        AND push_subscriptions.is_active = TRUE
      ORDER BY push_subscriptions.updated_at DESC
    `,
    [Number(userId)]
  );

  return result.rows.map(mapPushSubscription);
}

module.exports = {
  mapPushSubscription,
  upsertSubscription,
  deactivateSubscriptionForUser,
  deactivateByEndpoint,
  recordPushSuccess,
  recordPushFailure,
  listActiveByTenantId,
  listActiveByUserId
};
