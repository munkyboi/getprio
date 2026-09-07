#!/usr/bin/env node
import crypto from "node:crypto";
import pg from "pg";

const mode = process.argv[2] || "census";
const allowed = new Set(["census", "dry-run", "apply", "verify", "resume"]);
if (!allowed.has(mode)) throw new Error(`Unknown mode: ${mode}`);
const databaseUrl = process.env.GETPRIO_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set GETPRIO_DATABASE_URL to an explicit GetPrio database.");
if (["apply", "resume"].includes(mode) && process.env.FREE_PLAN_BACKFILL_ENABLED !== "true") throw new Error("Set FREE_PLAN_BACKFILL_ENABLED=true after reviewing the dry-run.");

const pool = new pg.Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false });
const classifications = await pool.query(`
  SELECT t.id, t.slug, t.vendor_approval_status, t.is_active,
    COUNT(s.id)::INTEGER AS subscription_history,
    COUNT(s.id) FILTER (WHERE s.status IN ('active','unpaid','past_due','suspended'))::INTEGER AS current_rows,
    COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'plan',s.plan_slug,'status',s.status)) FILTER (WHERE s.id IS NOT NULL),'[]') AS subscriptions
  FROM tenants t LEFT JOIN tenant_subscriptions s ON s.tenant_id=t.id
  GROUP BY t.id ORDER BY t.id`);

const records = classifications.rows.map((row) => ({
  ...row,
  classification: Number(row.current_rows) > 1 ? "blocking_ambiguous"
    : Number(row.subscription_history) > 0 ? "history_preserved"
    : row.vendor_approval_status === "approved" && row.is_active ? "eligible_free"
    : "ineligible"
}));
const digest = crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex");

if (["census", "dry-run"].includes(mode)) {
  process.stdout.write(`${JSON.stringify({ mode, digest, totals: records.reduce((acc, row) => ({ ...acc, [row.classification]: (acc[row.classification] || 0) + 1 }), {}), records }, null, 2)}\n`);
  await pool.end();
  process.exit(0);
}

if (mode === "verify") {
  const checks = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM tenants t LEFT JOIN tenant_subscriptions s ON s.tenant_id=t.id WHERE t.vendor_approval_status='approved' AND t.is_active AND s.id IS NULL)::INTEGER AS approved_without_subscription,
      (SELECT COUNT(*) FROM (SELECT tenant_id FROM tenant_subscriptions WHERE status IN ('active','unpaid','past_due','suspended') GROUP BY tenant_id HAVING COUNT(*)>1) x)::INTEGER AS ambiguous_current,
      (SELECT COUNT(*) FROM entitlement_rollout_anomalies WHERE blocking=TRUE AND resolved_at IS NULL)::INTEGER AS blocking_anomalies,
      (SELECT COUNT(*) FROM subscription_plans WHERE slug IN ('free','economical','pro','enterprise'))::INTEGER AS plan_count`);
  process.stdout.write(`${JSON.stringify({ mode, digest, checks: checks.rows[0] }, null, 2)}\n`);
  await pool.end();
  process.exit(checks.rows[0].approved_without_subscription || checks.rows[0].ambiguous_current || checks.rows[0].blocking_anomalies || checks.rows[0].plan_count !== 4 ? 1 : 0);
}

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const run = await client.query(`INSERT INTO entitlement_rollout_runs (run_type, cohort, status, summary) VALUES ('free_backfill',$1,'started',$2::jsonb) RETURNING id`, [process.env.ROLLOUT_COHORT || "manual", JSON.stringify({ digest, mode })]);
  const legacyRows = await client.query(`
    SELECT s.id, s.tenant_id, s.entitlements, s.entitlement_model_version,
      COALESCE(baseline.features,'{}') AS baseline_features,
      COALESCE(baseline.allowances,'{}') AS baseline_allowances
    FROM tenant_subscriptions s
    LEFT JOIN LATERAL (
      SELECT features, allowances FROM plan_policy_baselines
      WHERE plan_slug=s.plan_slug ORDER BY captured_at, id LIMIT 1
    ) baseline ON TRUE
    WHERE s.status='active' AND s.plan_slug <> 'free' AND COALESCE(s.entitlement_model_version,1) < 2
    ORDER BY s.id`);
  const featureKeys = { queue: "queueSystemAccess", branding: "publicFacingBranding", discovery: "marketplaceDiscovery", booking: "serviceBookingAccess", campaigns: "groupFundedCampaignAccess" };
  const allowanceKeys = { queueTickets: "monthlyTickets", serviceBookings: "monthlyServiceBookings" };
  let convertedSubscriptions = 0;
  let conversionAnomalies = 0;
  let blockingConversionAnomalies = 0;
  for (const legacy of legacyRows.rows) {
    const snapshot = legacy.entitlements || {};
    let blocking = false;
    const comparison = { features: {}, allowances: {} };
    const recordAnomaly = async (code, details, isBlocking = true) => {
      await client.query(`INSERT INTO entitlement_rollout_anomalies (rollout_run_id,tenant_id,anomaly_code,blocking,details) VALUES ($1,$2,$3,$4,$5::jsonb)`, [run.rows[0].id, legacy.tenant_id, code, isBlocking, JSON.stringify({ subscriptionId: String(legacy.id), ...details })]);
      conversionAnomalies += 1;
      if (isBlocking) { blocking = true; blockingConversionAnomalies += 1; }
    };
    for (const [key, legacyKey] of Object.entries(featureKeys)) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, legacyKey)) continue;
      if (typeof snapshot[legacyKey] !== "boolean") { await recordAnomaly("LEGACY_FEATURE_TYPE_INVALID", { policyKey: legacyKey, value: snapshot[legacyKey] }); continue; }
      comparison.features[key] = { legacy: snapshot[legacyKey], baseline: legacy.baseline_features[key] };
      if (typeof legacy.baseline_features[key] !== "boolean" || snapshot[legacyKey] !== legacy.baseline_features[key]) await client.query(`INSERT INTO tenant_entitlement_overrides (subscription_id,policy_key,value,reason) VALUES ($1,$2,$3::jsonb,'Legacy entitlement conversion') ON CONFLICT (subscription_id,policy_key) WHERE revoked_at IS NULL DO NOTHING`, [legacy.id, `feature.${key}`, JSON.stringify(snapshot[legacyKey])]);
    }
    for (const [key, legacyKey] of Object.entries(allowanceKeys)) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, legacyKey)) continue;
      const value = Number(snapshot[legacyKey]);
      if (!Number.isInteger(value) || value < 0) { await recordAnomaly("LEGACY_ALLOWANCE_TYPE_INVALID", { policyKey: legacyKey, value: snapshot[legacyKey] }); continue; }
      comparison.allowances[key] = { legacy: value, baseline: legacy.baseline_allowances[key] };
      if (!Number.isInteger(Number(legacy.baseline_allowances[key])) || value !== Number(legacy.baseline_allowances[key])) await client.query(`INSERT INTO tenant_entitlement_overrides (subscription_id,policy_key,value,reason) VALUES ($1,$2,$3::jsonb,'Legacy allowance conversion') ON CONFLICT (subscription_id,policy_key) WHERE revoked_at IS NULL DO NOTHING`, [legacy.id, `allowance.${key}`, JSON.stringify(value)]);
    }
    const legacyEmailUnits = snapshot.monthlyTransactionalEmails;
    if (legacyEmailUnits !== undefined && legacyEmailUnits !== null) {
      await recordAnomaly("LEGACY_EMAIL_UNIT_NOT_CONVERTED", { legacyMonthlyTransactionalEmails: legacyEmailUnits }, false);
    }
    if (!blocking) {
      const comparisonHash = crypto.createHash("sha256").update(JSON.stringify(comparison)).digest("hex");
      await client.query(`UPDATE tenant_subscriptions SET entitlement_model_version=2, entitlement_comparison_hash=$2, entitlement_converted_at=NOW(), updated_at=NOW() WHERE id=$1`, [legacy.id, comparisonHash]);
      convertedSubscriptions += 1;
    }
  }
  await client.query(`
    INSERT INTO subscription_allowance_periods (subscription_id, period_start, period_end)
    SELECT s.id, allowance_window.period_start, LEAST(allowance_window.period_end, s.current_period_end)
    FROM tenant_subscriptions s
    CROSS JOIN LATERAL (
      SELECT s.current_period_start + (n * INTERVAL '1 month') AS period_start,
             s.current_period_start + ((n + 1) * INTERVAL '1 month') AS period_end
      FROM generate_series(0, 119) n
      WHERE s.current_period_start + (n * INTERVAL '1 month') <= NOW()
        AND s.current_period_start + (n * INTERVAL '1 month') < s.current_period_end
      ORDER BY n DESC LIMIT 1
    ) allowance_window
    WHERE s.status = 'active' AND s.plan_slug <> 'free' AND s.current_period_start IS NOT NULL AND s.current_period_end IS NOT NULL
    ON CONFLICT (subscription_id, period_start) DO UPDATE SET period_end = EXCLUDED.period_end;
    INSERT INTO usage_accounts (tenant_id, resource_key)
    SELECT DISTINCT tenant_id, resource_key FROM tenant_subscriptions
    CROSS JOIN (VALUES ('queueTickets'),('queueEmailJourneys'),('serviceBookings')) resources(resource_key)
    WHERE status = 'active' AND plan_slug <> 'free'
    ON CONFLICT (tenant_id, resource_key) DO NOTHING;
  `);
  const baselineSources = [
    { resource: "queueTickets", subject: "queue_ticket", table: "tickets", id: "t.id", tenant: "t.tenant_id", created: "t.created_at", join: "" },
    { resource: "serviceBookings", subject: "service_booking", table: "bookings", id: "t.id", tenant: "t.tenant_id", created: "t.created_at", join: "" },
    { resource: "queueEmailJourneys", subject: "queue_ticket", table: "tickets", id: "t.id", tenant: "t.tenant_id", created: "t.created_at", join: "JOIN queue_email_journeys qej ON qej.ticket_id = t.id AND qej.mode = 'metered'" }
  ];
  let baselineUnits = 0;
  for (const source of baselineSources) {
    const inserted = await client.query(`
      INSERT INTO allowance_operations (usage_account_id, allowance_period_id, operation_key, operation_type, signed_units, subject_type, subject_id, reason, metadata)
      SELECT ua.id, sap.id, 'migration-baseline:${source.resource}:' || ${source.id}, 'baseline', 1, $1, ${source.id}::text,
             'Migration usage baseline', jsonb_build_object('rolloutRunId',$2::text,'correlatedEvidence',${source.resource === "queueEmailJourneys" ? "'queue_email_journey'" : "'business_record'"})
      FROM ${source.table} t ${source.join}
      JOIN tenant_subscriptions s ON s.tenant_id = ${source.tenant} AND s.status = 'active' AND s.plan_slug <> 'free'
      JOIN subscription_allowance_periods sap ON sap.subscription_id = s.id AND ${source.created} >= sap.period_start AND ${source.created} < sap.period_end
      JOIN usage_accounts ua ON ua.tenant_id = ${source.tenant} AND ua.resource_key = $3
      ON CONFLICT (usage_account_id, operation_key) DO NOTHING RETURNING id`, [source.subject, run.rows[0].id, source.resource]);
    baselineUnits += inserted.rowCount || 0;
    await client.query(`
      INSERT INTO allowance_allocations (operation_id, source_type, allowance_period_id, units)
      SELECT ao.id, 'base', ao.allowance_period_id, 1 FROM allowance_operations ao
      WHERE ao.operation_type = 'baseline' AND ao.operation_key LIKE $1
        AND NOT EXISTS (SELECT 1 FROM allowance_allocations aa WHERE aa.operation_id = ao.id)
    `, [`migration-baseline:${source.resource}:%`]);
  }
  let assigned = 0;
  for (const row of records.filter((item) => item.classification === "eligible_free")) {
    const locked = await client.query(`SELECT id FROM tenants WHERE id=$1 FOR UPDATE`, [row.id]);
    if (!locked.rows[0]) continue;
    const history = await client.query(`SELECT 1 FROM tenant_subscriptions WHERE tenant_id=$1 LIMIT 1`, [row.id]);
    if (history.rows[0]) continue;
    const subscription = await client.query(`INSERT INTO tenant_subscriptions (tenant_id,plan_slug,status,provider,billing_interval,current_period_start,current_period_end,entitlements,entitlement_model_version,metadata) VALUES ($1,'free','active','system','monthly',NOW(),NOW()+INTERVAL '1 month','{}',2,$2::jsonb) RETURNING id`, [row.id, JSON.stringify({ rolloutRunId: String(run.rows[0].id), classificationDigest: digest })]);
    await client.query(`INSERT INTO subscription_transitions (tenant_id,to_plan_slug,transition_type,status,reason,effective_at,completed_at,metadata) VALUES ($1,'free','free_assignment','effective','Approved vendor Free assignment',NOW(),NOW(),$2::jsonb)`, [row.id, JSON.stringify({ subscriptionId: String(subscription.rows[0].id), rolloutRunId: String(run.rows[0].id) })]);
    assigned += 1;
  }
  await client.query(`UPDATE entitlement_rollout_runs SET status='completed', summary=summary||$2::jsonb, completed_at=NOW() WHERE id=$1`, [run.rows[0].id, JSON.stringify({ assigned, baselineUnits, convertedSubscriptions, conversionAnomalies, blockingConversionAnomalies })]);
  await client.query("COMMIT");
  process.stdout.write(`${JSON.stringify({ mode, digest, assigned, baselineUnits, convertedSubscriptions, conversionAnomalies, blockingConversionAnomalies, runId: String(run.rows[0].id) }, null, 2)}\n`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
