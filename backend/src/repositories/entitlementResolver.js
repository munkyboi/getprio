const db = require("../config/db");

async function readResolverInput(tenantId, options = {}) {
  const client = options.client || db.pool;
  if (options.lockPolicy) {
    if (!options.client) throw new Error("Locked policy resolution requires a transaction client.");
    // Catalog owns the tenant lock. Do not wait on subscription-first mutators
    // that may need a tenant foreign-key check for their transition records.
    await client.query("SELECT id FROM tenant_subscriptions WHERE tenant_id=$1 ORDER BY id FOR UPDATE NOWAIT", [tenantId]);
    await client.query("SELECT id FROM entitlement_rollout_anomalies WHERE tenant_id=$1 ORDER BY id FOR SHARE NOWAIT", [tenantId]);
  }
  const policyLock = options.lockPolicy ? " FOR SHARE NOWAIT" : "";
  const subscriptionResult = await client.query(
    `SELECT s.id, s.tenant_id, s.plan_slug, s.status, s.current_period_start, s.current_period_end,
            s.entitlements, s.entitlement_model_version, s.entitlement_comparison_hash,
            EXISTS (
              SELECT 1 FROM entitlement_rollout_anomalies anomaly
              WHERE anomaly.tenant_id = s.tenant_id
                AND anomaly.blocking = TRUE
                AND anomaly.resolved_at IS NULL
            ) AS has_blocking_anomaly,
            s.created_at, s.updated_at
     FROM tenant_subscriptions
     AS s WHERE s.tenant_id = $1
     AND s.status IN ('active','past_due','unpaid','suspended')
     ORDER BY
       CASE status WHEN 'active' THEN 0 WHEN 'past_due' THEN 1 WHEN 'unpaid' THEN 2
         WHEN 'suspended' THEN 3 ELSE 4 END,
       updated_at DESC`,
    [tenantId]
  );
  if (subscriptionResult.rows.length > 1) return { subscription: null, ambiguous: true };
  const row = subscriptionResult.rows[0];
  if (!row) return { subscription: null };

  const [planResult, featureResult, allowanceResult, overrideResult] = await Promise.all([
    client.query(
      `SELECT slug, policy_revision, entitlements FROM subscription_plans WHERE slug = $1 LIMIT 1${policyLock}`,
      [row.plan_slug]
    ),
    client.query(
      `SELECT feature_key, enabled FROM plan_feature_entitlements WHERE plan_slug = $1 ORDER BY feature_key${policyLock}`,
      [row.plan_slug]
    ),
    client.query(
      `SELECT allowance_key, monthly_limit FROM plan_allowances WHERE plan_slug = $1 ORDER BY allowance_key${policyLock}`,
      [row.plan_slug]
    ),
    client.query(
      `SELECT id, policy_key, value, reason, expires_at
       FROM tenant_entitlement_overrides
       WHERE subscription_id = $1 AND revoked_at IS NULL ORDER BY id${policyLock}`,
      [row.id]
    )
  ]);

  return {
    subscription: {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      planSlug: row.plan_slug,
      status: row.status,
      entitlementModelVersion: row.entitlement_model_version,
      entitlementComparisonHash: row.entitlement_comparison_hash,
      hasBlockingAnomaly: Boolean(row.has_blocking_anomaly),
      legacyEntitlements: row.entitlements || {},
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end
    },
    plan: {
      slug: planResult.rows[0]?.slug || row.plan_slug,
      revision: Number(planResult.rows[0]?.policy_revision || 1),
      legacyEntitlements: planResult.rows[0]?.entitlements || {}
    },
    features: Object.fromEntries(featureResult.rows.map((item) => [item.feature_key, item.enabled])),
    allowances: Object.fromEntries(allowanceResult.rows.map((item) => [item.allowance_key, item.monthly_limit])),
    overrides: overrideResult.rows.map((item) => ({
      id: String(item.id),
      policyKey: item.policy_key,
      value: item.value,
      reason: item.reason,
      expiresAt: item.expires_at
    }))
  };
}

async function loadResolverInput(tenantId, options = {}) {
  try {
    return await readResolverInput(tenantId, options);
  } catch (error) {
    if (options.lockPolicy && error.code === "55P03") {
      throw Object.assign(new Error("Booking policy is changing. Reload before saving."), { statusCode: 409, code: "ENTITLEMENT_POLICY_BUSY" });
    }
    throw error;
  }
}

module.exports = { loadResolverInput };
