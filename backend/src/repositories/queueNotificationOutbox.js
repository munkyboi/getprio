const db = require("../config/db");

function queryClient(client) {
  return client || db.pool;
}

async function enqueue(data, options = {}) {
  const result = await queryClient(options.client).query(
    `INSERT INTO queue_notification_outbox (
       idempotency_key, queue_event_id, queue_day_id, ticket_id, tenant_id,
       recipient_key, channel, template_name, payload_version, payload,
       aggregate_version, deadline_version, available_at, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             COALESCE($13, NOW()), $14)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      data.idempotencyKey,
      data.queueEventId ? Number(data.queueEventId) : null,
      data.queueDayId ? Number(data.queueDayId) : null,
      data.ticketId ? Number(data.ticketId) : null,
      Number(data.tenantId),
      data.recipientKey,
      data.channel,
      data.templateName,
      Number(data.payloadVersion || 1),
      data.payload || {},
      data.aggregateVersion == null ? null : Number(data.aggregateVersion),
      data.deadlineVersion == null ? null : Number(data.deadlineVersion),
      data.availableAt || null,
      data.expiresAt || null
    ]
  );
  return result.rows[0] ? String(result.rows[0].id) : null;
}

async function claimBatch(workerId, limit = 50, options = {}) {
  const result = await queryClient(options.client).query(
    `WITH candidates AS (
       SELECT id
       FROM queue_notification_outbox
       WHERE (
           status IN ('pending', 'retry')
           OR (status = 'processing' AND leased_until < NOW())
         )
         AND available_at <= NOW()
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (leased_until IS NULL OR leased_until < NOW())
       ORDER BY available_at, id
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     UPDATE queue_notification_outbox AS outbox
     SET status = 'processing',
         lease_owner = $1,
         leased_until = NOW() + INTERVAL '2 minutes',
         attempt_count = attempt_count + 1,
         updated_at = NOW()
     FROM candidates
     WHERE outbox.id = candidates.id
     RETURNING outbox.*`,
    [workerId, Math.max(1, Math.min(Number(limit) || 50, 200))]
  );
  return result.rows;
}

async function markSent(id, workerId, options = {}) {
  await queryClient(options.client).query(
    `UPDATE queue_notification_outbox
     SET status = 'sent', sent_at = NOW(), lease_owner = NULL,
         leased_until = NULL, last_error = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'processing' AND lease_owner = $2`,
    [Number(id), workerId]
  );
}

async function markRetry(id, workerId, errorMessage, options = {}) {
  await queryClient(options.client).query(
    `UPDATE queue_notification_outbox
     SET status = CASE WHEN attempt_count >= 8 THEN 'dead' ELSE 'retry' END,
         available_at = NOW() + (LEAST(attempt_count, 6) * INTERVAL '1 minute'),
         lease_owner = NULL, leased_until = NULL, last_error = $3,
         updated_at = NOW()
     WHERE id = $1 AND status = 'processing' AND lease_owner = $2`,
    [Number(id), workerId, String(errorMessage || "Delivery failed").slice(0, 500)]
  );
}

async function obsoleteStaleWarnings(queueDayId, deadlineVersion, options = {}) {
  await queryClient(options.client).query(
    `UPDATE queue_notification_outbox
     SET status = 'obsolete', updated_at = NOW()
     WHERE queue_day_id = $1
       AND template_name IN ('queue_closing_15m', 'queue_closing_5m')
       AND deadline_version < $2
       AND status IN ('pending', 'retry')`,
    [Number(queueDayId), Number(deadlineVersion)]
  );
}

async function obsoleteWarningsForClosedQueueDay(queueDayId, options = {}) {
  await queryClient(options.client).query(
    `UPDATE queue_notification_outbox
     SET status = 'obsolete', updated_at = NOW()
     WHERE queue_day_id = $1
       AND template_name IN ('queue_closing_15m', 'queue_closing_5m')
       AND status IN ('pending', 'retry')`,
    [Number(queueDayId)]
  );
}

async function requeue(id, options = {}) {
  const result = await queryClient(options.client).query(
    `UPDATE queue_notification_outbox
     SET status = 'pending', available_at = NOW(), lease_owner = NULL,
         leased_until = NULL, last_error = NULL, updated_at = NOW()
     WHERE id = $1 AND status IN ('retry', 'dead')
     RETURNING id, status`,
    [Number(id)]
  );
  return result.rows[0] || null;
}

module.exports = {
  claimBatch,
  enqueue,
  markRetry,
  markSent,
  obsoleteStaleWarnings,
  obsoleteWarningsForClosedQueueDay,
  requeue
};
