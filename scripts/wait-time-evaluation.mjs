// Aggregate diagnostics only. Call inside the audit's read-only snapshot.
const SOURCES = {
  vendors: {
    table: "wait_time_prediction_samples",
    owner: "tenant_id",
    scope: "COALESCE(location_id::text, 'unknown')",
    filter: "($1::bigint IS NULL OR tenant_id = $1)"
  },
  "developer-sandbox": {
    table: "developer_api_wait_time_prediction_samples",
    owner: "developer_project_id",
    scope: "developer_api_queue_id::text",
    filter: "environment = 'sandbox'"
  }
};

export async function readWaitTimeEvaluation(client, source, vendorId = null) {
  const config = SOURCES[source];
  if (!config) throw new Error("Unsupported wait-time evaluation source.");
  // Identifiers come only from the fixed registry above; caller values are bound.
  const result = await client.query(`
    WITH observations AS (
      SELECT id, ticket_id, ${config.owner}::text AS owner_id,
        ${config.scope} AS scope_id, predictor_version, sampled_at, outcome_at,
        outcome_type, predicted_wait_minutes, outcome_wait_minutes,
        COALESCE(outcome_type = 'called'
          AND isfinite(sampled_at) AND isfinite(outcome_at)
          AND outcome_at >= sampled_at
          AND predicted_wait_minutes::text NOT IN ('NaN', 'Infinity', '-Infinity')
          AND outcome_wait_minutes::text NOT IN ('NaN', 'Infinity', '-Infinity')
          AND predicted_wait_minutes >= 0 AND outcome_wait_minutes >= 0, FALSE) AS usable
      FROM ${config.table}
      WHERE ${config.filter}
    ), coverage AS (
      SELECT owner_id, scope_id, predictor_version,
        COUNT(*)::int AS observations,
        COUNT(*) FILTER (WHERE outcome_type = 'called')::int AS called_observations,
        COUNT(DISTINCT ticket_id) FILTER (WHERE outcome_type = 'called')::int AS distinct_called_tickets,
        COUNT(*) FILTER (WHERE outcome_type = 'called' AND NOT usable)::int AS invalid_called_observations,
        COUNT(*) FILTER (WHERE outcome_type = 'censored')::int AS censored_observations,
        COUNT(*) FILTER (WHERE outcome_type IS NULL)::int AS pending_observations
      FROM observations GROUP BY owner_id, scope_id, predictor_version
    ), tickets AS (
      SELECT DISTINCT ON (owner_id, scope_id, predictor_version, ticket_id)
        owner_id, scope_id, predictor_version, ticket_id, sampled_at, outcome_at,
        predicted_wait_minutes, outcome_wait_minutes
      FROM observations WHERE usable
      ORDER BY owner_id, scope_id, predictor_version, ticket_id, sampled_at, id
    ), ordered AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY owner_id, scope_id, predictor_version ORDER BY sampled_at, ticket_id
      ) AS ordinal, COUNT(*) OVER (
        PARTITION BY owner_id, scope_id, predictor_version
      ) AS ticket_count
      FROM tickets
    ), boundaries AS (
      SELECT owner_id, scope_id, predictor_version,
        MIN(sampled_at) FILTER (WHERE ticket_count >= 5 AND ordinal > FLOOR(ticket_count * 0.8)) AS holdout_start_at
      FROM ordered GROUP BY owner_id, scope_id, predictor_version
    ), classified AS (
      SELECT tickets.*, boundaries.holdout_start_at,
        CASE
          WHEN holdout_start_at IS NULL THEN 'unsplit'
          WHEN sampled_at >= holdout_start_at THEN 'holdout'
          WHEN outcome_at < holdout_start_at THEN 'historical'
          ELSE 'overlapping'
        END AS partition
      FROM tickets JOIN boundaries USING (owner_id, scope_id, predictor_version)
    ), evaluation AS (
      SELECT owner_id, scope_id, predictor_version,
        COUNT(*)::int AS usable_distinct_tickets,
        COUNT(DISTINCT (sampled_at AT TIME ZONE 'UTC')::date)::int AS observation_days_utc,
        MIN(sampled_at) AS first_observation_at, MAX(sampled_at) AS latest_observation_at,
        MAX(holdout_start_at) AS holdout_start_at,
        COUNT(*) FILTER (WHERE partition = 'historical')::int AS historical_tickets,
        COUNT(*) FILTER (WHERE partition = 'holdout')::int AS holdout_tickets,
        COUNT(*) FILTER (WHERE partition = 'overlapping')::int AS excluded_overlapping_tickets,
        ROUND(AVG(ABS(predicted_wait_minutes - outcome_wait_minutes))
          FILTER (WHERE partition = 'historical'), 2) AS historical_baseline_mae_minutes,
        ROUND(AVG(ABS(predicted_wait_minutes - outcome_wait_minutes))
          FILTER (WHERE partition = 'holdout'), 2) AS holdout_baseline_mae_minutes,
        ROUND(AVG(outcome_wait_minutes - predicted_wait_minutes)
          FILTER (WHERE partition = 'holdout'), 2) AS holdout_mean_signed_error_minutes,
        ROUND(100 * AVG((ABS(predicted_wait_minutes - outcome_wait_minutes) <= 5)::int)
          FILTER (WHERE partition = 'holdout'), 1) AS holdout_within_five_minutes_percent
      FROM classified GROUP BY owner_id, scope_id, predictor_version
    )
    SELECT coverage.*, COALESCE(evaluation.usable_distinct_tickets, 0) AS usable_distinct_tickets,
      COALESCE(evaluation.observation_days_utc, 0) AS observation_days_utc,
      evaluation.first_observation_at, evaluation.latest_observation_at, evaluation.holdout_start_at,
      COALESCE(evaluation.historical_tickets, 0) AS historical_tickets,
      COALESCE(evaluation.holdout_tickets, 0) AS holdout_tickets,
      COALESCE(evaluation.excluded_overlapping_tickets, 0) AS excluded_overlapping_tickets,
      evaluation.historical_baseline_mae_minutes, evaluation.holdout_baseline_mae_minutes,
      evaluation.holdout_mean_signed_error_minutes, evaluation.holdout_within_five_minutes_percent,
      COALESCE(evaluation.historical_tickets > 0 AND evaluation.holdout_tickets > 0, FALSE) AS temporal_split_available
    FROM coverage LEFT JOIN evaluation USING (owner_id, scope_id, predictor_version)
    ORDER BY owner_id, scope_id, predictor_version
  `, source === "vendors" ? [vendorId] : []);

  return {
    reportVersion: "wait-time-evaluation-v1",
    target: "Time from captured prediction to ticket call; not time to actual service start.",
    observationPolicy: "One earliest usable called observation per ticket and predictor version in each scope.",
    splitPolicy: "Per location or sandbox queue: latest approximately 20% of distinct tickets by observation time. Timestamp ties stay together; at least five usable tickets are needed to attempt a split. Historical outcomes must precede holdout start; overlapping tickets are excluded.",
    approval: "Diagnostic only. Split availability is not sufficient data coverage, model validation, or rollout approval. Sandbox and manual test data do not establish production performance.",
    customerEstimateChanged: false,
    modelEvaluated: false,
    scopes: result.rows
  };
}
