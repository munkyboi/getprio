const db = require("../config/db");

function clientFor(options = {}) {
  return options.client || db.pool;
}

async function recordPredictions(samples, options = {}) {
  if (!options.client) {
    return db.withTransaction((client) => recordPredictions(samples, { ...options, client }));
  }

  const validSamples = (samples || []).filter((sample) =>
    sample?.environment === "sandbox" &&
    sample.ticketId && sample.projectId && sample.profileId && sample.queueId &&
    sample.predictorVersion && sample.featureHash && sample.sampleBucket && sample.sampledAt &&
    sample.features && Number.isFinite(Number(sample.predictedWaitMinutes)) &&
    Number(sample.predictedWaitMinutes) >= 0
  );
  if (!validSamples.length) return 0;

  const queryClient = clientFor(options);
  const ticketIds = [...new Set(validSamples.map((sample) => sample.ticketId))];
  const ticketResult = await queryClient.query(
    `SELECT id, status, called_at, updated_at
       FROM developer_api_tickets
      WHERE id = ANY($1::UUID[])
      ORDER BY id
      FOR UPDATE`,
    [ticketIds]
  );
  const ticketsById = new Map(ticketResult.rows.map((ticket) => [String(ticket.id), ticket]));

  const values = [];
  const rows = [];
  for (const sample of validSamples) {
    const ticket = ticketsById.get(String(sample.ticketId));
    if (!ticket) continue;

    const sampledAt = new Date(sample.sampledAt);
    const calledAt = ticket.called_at ? new Date(ticket.called_at) : null;
    const updatedAt = ticket.updated_at ? new Date(ticket.updated_at) : null;
    let outcomeType = null;
    let outcomeAt = null;
    let outcomeWaitMinutes = null;
    if (calledAt && calledAt >= sampledAt) {
      outcomeType = "called";
      outcomeAt = calledAt;
      outcomeWaitMinutes = Math.max(0, (calledAt.getTime() - sampledAt.getTime()) / 60000);
    } else if (
      updatedAt &&
      updatedAt >= sampledAt &&
      ["cancelled", "unserved", "expired", "skipped"].includes(ticket.status)
    ) {
      outcomeType = "censored";
      outcomeAt = updatedAt;
    } else if (ticket.status !== "waiting") {
      continue;
    }

    const offset = rows.length * 14;
    values.push(
      sample.ticketId,
      sample.projectId,
      sample.profileId,
      sample.queueId,
      sample.environment,
      sample.predictorVersion,
      sample.featureHash,
      sample.sampleBucket,
      sampledAt,
      JSON.stringify(sample.features),
      Number(sample.predictedWaitMinutes),
      outcomeType,
      outcomeAt,
      outcomeWaitMinutes
    );
    rows.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}::JSONB, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`);
  }
  if (!rows.length) return 0;

  const result = await clientFor(options).query(
    `INSERT INTO developer_api_wait_time_prediction_samples (
       ticket_id, developer_project_id, developer_api_profile_id, developer_api_queue_id,
       environment, predictor_version, feature_hash, sample_bucket, sampled_at,
       features, predicted_wait_minutes, outcome_type, outcome_at, outcome_wait_minutes
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
