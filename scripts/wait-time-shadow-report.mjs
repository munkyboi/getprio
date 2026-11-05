export async function readWaitTimeShadowReport(client, vendorId) {
  const table = await client.query("SELECT to_regclass('public.wait_time_shadow_samples') AS table_name");
  if (!table.rows[0]?.table_name) return { tableAvailable: false, summary: [], fallbackReasons: [] };
  const summary = await client.query(`SELECT shadow.namespace, shadow.deployment_sha,
      shadow.expected_artifact_sha256, base.tenant_id::text AS vendor_id, base.location_id::text AS location_id,
      MAX(shadow.candidate_predictor_version) AS candidate_predictor_version,
      COUNT(*)::int AS recorded_observations,
      COUNT(*) FILTER (WHERE NOT shadow.used_fallback)::int AS candidate_observations,
      COUNT(*) FILTER (WHERE shadow.used_fallback)::int AS fallback_observations,
      COUNT(*) FILTER (WHERE base.outcome_type = 'called')::int AS called_observations,
      COUNT(*) FILTER (WHERE base.outcome_type = 'censored')::int AS censored_observations,
      COUNT(*) FILTER (WHERE base.outcome_type IS NULL)::int AS pending_observations,
      COUNT(*) FILTER (WHERE base.outcome_type = 'called' AND NOT shadow.used_fallback)::int AS paired_candidate_called_observations,
      ROUND(AVG(ABS(shadow.candidate_wait_minutes - base.outcome_wait_minutes))
        FILTER (WHERE base.outcome_type = 'called' AND NOT shadow.used_fallback), 2) AS candidate_mae_minutes,
      ROUND(AVG(ABS(base.predicted_wait_minutes - base.outcome_wait_minutes))
        FILTER (WHERE base.outcome_type = 'called' AND NOT shadow.used_fallback), 2) AS paired_baseline_mae_minutes,
      ROUND(AVG(shadow.inference_latency_ms), 2) AS mean_inference_latency_ms,
      MAX(shadow.inference_latency_ms) AS max_inference_latency_ms,
      MIN(shadow.recorded_at) AS first_recorded_at, MAX(shadow.recorded_at) AS latest_recorded_at
    FROM wait_time_shadow_samples shadow
    JOIN wait_time_prediction_samples base ON base.id = shadow.baseline_sample_id
    WHERE base.predictor_version = 'baseline-v1' AND shadow.recorded_at >= transaction_timestamp() - INTERVAL '30 days'
      AND ($1::bigint IS NULL OR base.tenant_id = $1)
    GROUP BY shadow.namespace, shadow.deployment_sha, shadow.expected_artifact_sha256, base.tenant_id, base.location_id
    ORDER BY MAX(shadow.recorded_at) DESC LIMIT 1001`, [vendorId]);
  const reasons = await client.query(`SELECT shadow.namespace, shadow.expected_artifact_sha256, shadow.fallback_reason,
      COUNT(*)::int AS observations
    FROM wait_time_shadow_samples shadow JOIN wait_time_prediction_samples base ON base.id = shadow.baseline_sample_id
    WHERE base.predictor_version = 'baseline-v1' AND shadow.used_fallback
      AND shadow.recorded_at >= transaction_timestamp() - INTERVAL '30 days' AND ($1::bigint IS NULL OR base.tenant_id = $1)
    GROUP BY shadow.namespace, shadow.expected_artifact_sha256, shadow.fallback_reason
    ORDER BY COUNT(*) DESC LIMIT 1001`, [vendorId]);
  return { reportVersion: "wait-time-shadow-capture-v1", tableAvailable: true, readOnly: true, windowDays: 30,
    summary: summary.rows.slice(0, 1000), fallbackReasons: reasons.rows.slice(0, 1000),
    truncated: summary.rows.length > 1000 || reasons.rows.length > 1000,
    customerEstimateChanged: false, rolloutApproved: false,
    note: "Sampled observation diagnostics, not distinct-ticket temporal validation. Paired MAEs include only the same called observations with a successful candidate. Capture is tied to existing focus-ticket baseline observations, not every issued ticket. Missing rows can reflect disabled capture, allowlist/sampling/rate/concurrency limits, or errors. This report does not verify running-process configuration, artifact provenance, representative operations, or rollout approval." };
}
