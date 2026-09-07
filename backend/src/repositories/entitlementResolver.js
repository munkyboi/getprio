const db = require("../config/db");

async function loadResolverInput(tenantId, options = {}) {
  const client = options.client || db.pool;
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
    [Number(tenantId)]
  );
  if (subscriptionResult.rows.length > 1) return { subscription: null, ambiguous: true };
  const row = subscriptionResult.rows[0];
  if (!row) return { subscription: null };

  const [planResult, featureResult, allowanceResult, overrideResult] = await Promise.all([
    client.query(
      `SELECT slug, policy_revision, entitlements FROM subscription_plans WHERE slug = $1 LIMIT 1`,
      [row.plan_slug]
    ),
    client.query(
      `SELECT feature_key, enabled FROM plan_feature_entitlements WHERE plan_slug = $1`,
      [row.plan_slug]
    ),
    client.query(
      `SELECT allowance_key, monthly_limit FROM plan_allowances WHERE plan_slug = $1`,
      [row.plan_slug]
    ),
    client.query(
      `SELECT id, policy_key, value, reason, expires_at
       FROM tenant_entitlement_overrides
       WHERE subscription_id = $1 AND revoked_at IS NULL`,
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

module.exports = { loadResolverInput };
