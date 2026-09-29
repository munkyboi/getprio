const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

async function recordPrediction(sample, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO wait_time_prediction_samples (
        ticket_id,
        tenant_id,
        location_id,
        queue_date_key,
        predictor_version,
        feature_hash,
        sample_bucket,
        sampled_at,
        features,
        predicted_wait_minutes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, $10)
      ON CONFLICT (ticket_id, predictor_version, sample_bucket) DO NOTHING
    `,
    [
      Number(sample.ticketId),
      Number(sample.tenantId),
      sample.locationId ? Number(sample.locationId) : null,
      sample.queueDateKey,
      sample.predictorVersion,
      sample.featureHash,
      sample.sampleBucket,
      sample.observedAt,
      JSON.stringify(sample.features),
      sample.predictedWaitMinutes
    ]
  );

  if (result.rowCount > 0) {
    const ticketResult = await buildQueryClient(options.client).query(
      `
        SELECT status, called_at, updated_at
        FROM tickets
        WHERE id = $1
        FOR UPDATE
      `,
      [Number(sample.ticketId)]
    );
    const ticket = ticketResult.rows[0];
    const calledAt = ticket?.called_at ? new Date(ticket.called_at) : null;
    const sampledAt = new Date(sample.observedAt);

    if (calledAt && calledAt >= sampledAt) {
      await recordOutcome(sample.ticketId, "called", { outcomeAt: calledAt });
    } else if (["cancelled", "unserved"].includes(ticket?.status)) {
      await recordOutcome(sample.ticketId, "censored", {
        outcomeAt: ticket.updated_at
      });
    }
  }

  return result.rowCount > 0;
}

async function recordOutcome(ticketId, outcomeType, options = {}) {
  if (!["called", "censored"].includes(outcomeType)) {
    throw new Error("Unsupported wait-time prediction outcome.");
  }

  const result = await buildQueryClient(options.client).query(
    `
      UPDATE wait_time_prediction_samples
      SET outcome_type = $2,
          outcome_at = COALESCE($3::TIMESTAMPTZ, NOW()),
          outcome_wait_minutes = CASE
            WHEN $2 = 'called'
              THEN GREATEST(0, EXTRACT(EPOCH FROM (COALESCE($3::TIMESTAMPTZ, NOW()) - sampled_at)) / 60)
            ELSE NULL
          END
      WHERE ticket_id = $1
        AND outcome_type IS NULL
    `,
    [Number(ticketId), outcomeType, options.outcomeAt || null]
  );

  return result.rowCount;
}

module.exports = {
  recordPrediction,
  recordOutcome
};
