const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

function scheduleCommittedShadow(sample, inserted) {
  if (!inserted || sample.predictorVersion !== "baseline-v1") return;
  // Independent work only after COMMIT. Shadow errors must not reject the
  // existing baseline capture or change the queue snapshot response.
  try { require("../services/waitTimeShadowCapture").scheduleShadowCapture(sample); }
  catch { console.warn("Wait-time shadow scheduling failed."); }
}

async function recordPrediction(sample, options = {}) {
  if (!options.client) {
    const inserted = await db.withTransaction((client) => recordPrediction(sample, { ...options, client }));
    scheduleCommittedShadow(sample, inserted);
    return inserted;
  }

  const observedAt = new Date(sample.observedAt);
  if (!Number.isFinite(observedAt.getTime())) {
    throw new Error("Wait-time prediction sample requires a valid observedAt timestamp.");
  }

  const queryClient = buildQueryClient(options.client);
  const ticketResult = await queryClient.query(
    `
      SELECT status, called_at, updated_at, date_key
      FROM tickets
      WHERE id = $1
      FOR UPDATE
    `,
    [Number(sample.ticketId)]
  );
  const ticket = ticketResult.rows[0];
  if (!ticket) {
    return false;
  }

  const calledAt = ticket.called_at ? new Date(ticket.called_at) : null;
  const updatedAt = new Date(ticket.updated_at);
  const queueDateChanged = String(ticket.date_key) !== String(sample.queueDateKey);
  let outcomeType = null;
  let outcomeAt = null;
  if (calledAt && calledAt >= observedAt) {
    outcomeType = "called";
    outcomeAt = calledAt;
  } else if (
    updatedAt >= observedAt &&
    (queueDateChanged || ["cancelled", "unserved", "pending_carry_over", "expired", "skipped"].includes(ticket.status))
  ) {
    outcomeType = "censored";
    outcomeAt = updatedAt;
  } else if (ticket.status !== "waiting" || queueDateChanged) {
    return false;
  }

  const result = await queryClient.query(
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
    if (outcomeType) {
      await recordOutcome(sample.ticketId, outcomeType, { client: options.client, outcomeAt });
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
