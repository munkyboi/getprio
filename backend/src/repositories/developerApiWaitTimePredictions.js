const db = require("../config/db");

function clientFor(options = {}) {
  return options.client || db.pool;
}

async function recordPredictions(samples, options = {}) {
  const validSamples = (samples || []).filter((sample) =>
    sample?.environment === "sandbox" &&
    sample.ticketId && sample.projectId && sample.profileId && sample.queueId &&
    sample.predictorVersion && sample.featureHash && sample.sampleBucket && sample.sampledAt &&
    sample.features && Number.isFinite(Number(sample.predictedWaitMinutes)) &&
    Number(sample.predictedWaitMinutes) >= 0
  );
  if (!validSamples.length) return 0;

  const values = [];
  const rows = validSamples.map((sample, index) => {
    const offset = index * 11;
    values.push(
      sample.ticketId,
      sample.projectId,
      sample.profileId,
      sample.queueId,
      sample.environment,
      sample.predictorVersion,
      sample.featureHash,
      sample.sampleBucket,
      sample.sampledAt,
      JSON.stringify(sample.features),
      Number(sample.predictedWaitMinutes)
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}::JSONB, $${offset + 11})`;
  });

  const result = await clientFor(options).query(
    `INSERT INTO developer_api_wait_time_prediction_samples (
       ticket_id, developer_project_id, developer_api_profile_id, developer_api_queue_id,
       environment, predictor_version, feature_hash, sample_bucket, sampled_at,
       features, predicted_wait_minutes
     ) VALUES ${rows.join(", ")}
     ON CONFLICT (ticket_id, predictor_version, sample_bucket) DO NOTHING`,
    values
  );
  return result.rowCount;
}

async function recordOutcome(ticketId, outcomeType, outcomeAt, options = {}) {
  if (!["called", "censored"].includes(outcomeType)) {
    throw new Error("Unsupported Developer API wait-time outcome.");
  }

  const result = await clientFor(options).query(
    `UPDATE developer_api_wait_time_prediction_samples
        SET outcome_type = $2,
            outcome_at = $3::TIMESTAMPTZ,
            outcome_wait_minutes = CASE
              WHEN $2 = 'called'
                THEN GREATEST(0, EXTRACT(EPOCH FROM ($3::TIMESTAMPTZ - sampled_at)) / 60)
              ELSE NULL
            END
      WHERE ticket_id = $1 AND outcome_type IS NULL`,
    [ticketId, outcomeType, outcomeAt || new Date()]
  );
  return result.rowCount;
}

module.exports = { recordOutcome, recordPredictions };
