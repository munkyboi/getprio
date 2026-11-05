const db = require("../config/db");

async function readBaseline(sample, expectedDatabase) {
  return db.withTransaction(async (client) => {
    await client.query("SET LOCAL statement_timeout = '1000ms'");
    await client.query("SET LOCAL lock_timeout = '250ms'");
    const target = await client.query("SELECT current_database() AS database_name");
    if (target.rows[0].database_name !== expectedDatabase) throw new Error("shadow_database_mismatch");
    const result = await client.query(`SELECT id, tenant_id, location_id, sampled_at, features, predicted_wait_minutes
      FROM wait_time_prediction_samples
      WHERE ticket_id = $1 AND tenant_id = $2 AND location_id = $3
        AND predictor_version = 'baseline-v1' AND sample_bucket = $4 AND feature_hash = $5`,
    [sample.ticketId, sample.tenantId, sample.locationId, sample.sampleBucket, sample.featureHash]);
    return result.rows[0] || null;
  });
}

async function recordComparison(baselineId, comparison, configuration, latencyMs) {
  return db.withTransaction(async (client) => {
    await client.query("SET LOCAL statement_timeout = '1000ms'");
    await client.query("SET LOCAL lock_timeout = '250ms'");
    const result = await client.query(`INSERT INTO wait_time_shadow_samples
      (baseline_sample_id, source, namespace, deployment_sha, expected_artifact_sha256,
       validated_artifact_sha256, sampling_percent, used_fallback, fallback_reason,
       candidate_wait_minutes, candidate_predictor_version, inference_latency_ms)
      VALUES ($1, 'vendors', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (baseline_sample_id) DO NOTHING`,
    [baselineId, configuration.namespace, configuration.deploymentSha, configuration.artifactSha256,
      comparison.artifactSha256, configuration.samplingPercent, comparison.usedFallback,
      comparison.fallbackReason, comparison.usedFallback ? null : comparison.estimatedWaitMinutes,
      comparison.usedFallback ? null : comparison.predictorVersion,
      Math.round(latencyMs * 100) / 100]);
    return result.rowCount > 0;
  });
}

module.exports = { readBaseline, recordComparison };
