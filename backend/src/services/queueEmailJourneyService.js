const db = require("../config/db");
const { randomUUID, createHash } = require("node:crypto");
const EMAIL_QUOTA_POLICY = "unmetered";

function renewClaim(slotId, claimToken) {
  const timer = setInterval(() => {
    db.pool.query(`UPDATE queue_email_slots SET queued_at=NOW()
      WHERE id=$1 AND claim_token=$2 AND status='queued'`, [slotId, claimToken])
      .catch(() => console.warn("[queue-email-claim-renewal-failed]"));
  }, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}

async function holdAmbiguousRetry(ticketId, slotKey) {
  const held = await db.pool.query(`UPDATE queue_email_slots s SET status='suppressed',
    review_required_at=COALESCE(s.review_required_at,NOW()),claim_token=NULL
    FROM queue_email_journeys j WHERE j.id=s.journey_id AND j.ticket_id=$1 AND s.slot_key=$2
      AND s.delivery_ambiguous
      AND (s.status='failed' OR (s.status='queued' AND (s.queued_at IS NULL OR s.queued_at < NOW()-interval '5 minutes')))
      AND (s.delivery_payload->>'deliveryProvider' IS DISTINCT FROM 'resend'
        OR s.first_attempt_at IS NULL OR s.first_attempt_at <= NOW()-interval '23 hours')`, [ticketId, slotKey]);
  if (held.rowCount) console.warn("[queue-email-reconciliation-required]");
}

async function withLifecycleSlot(ticketId, slotKey, logicalMessageKey, deliver, deliveryPayload = null, options = {}) {
  let journey = await db.pool.query("SELECT id FROM queue_email_journeys WHERE ticket_id=$1", [ticketId]);
  // Legacy tickets acquire durable delivery state before any provider call.
  // A concurrent creator wins the unique ticket key without rewriting history.
  if (!journey.rows[0]) {
    await db.pool.query(`INSERT INTO queue_email_journeys (tenant_id, ticket_id, mode)
      SELECT tenant_id, id, $2 FROM tickets WHERE id=$1 AND notify_by_email AND customer_email IS NOT NULL
      ON CONFLICT (ticket_id) DO NOTHING`, [ticketId, EMAIL_QUOTA_POLICY]);
    journey = await db.pool.query("SELECT id FROM queue_email_journeys WHERE ticket_id=$1", [ticketId]);
  }
  if (!journey.rows[0]) return false;
  await db.pool.query(`INSERT INTO queue_email_slots (journey_id, slot_key)
    VALUES ($1,$2) ON CONFLICT (journey_id, slot_key) DO NOTHING`, [journey.rows[0].id, slotKey]);
  await holdAmbiguousRetry(ticketId, slotKey);
  const claimToken = randomUUID();
  const claim = await db.pool.query(
    `UPDATE queue_email_slots s SET status = 'queued', logical_message_key = $3,
       queued_at = NOW(), failed_at = NULL, claim_token=$4,
       delivery_payload=COALESCE(s.delivery_payload,$5::jsonb),
       first_attempt_at=COALESCE(s.first_attempt_at,NOW()),delivery_ambiguous=TRUE,
       had_ambiguous_attempt=s.had_ambiguous_attempt OR s.status='queued'
     FROM queue_email_journeys j JOIN tickets t ON t.id=j.ticket_id
     WHERE s.journey_id = j.id AND j.ticket_id = $1
       AND t.notify_by_email AND t.customer_email IS NOT NULL
       AND s.review_required_at IS NULL
       AND (s.status='unused' OR NOT s.delivery_ambiguous
         OR (s.delivery_payload->>'deliveryProvider'='resend' AND s.first_attempt_at > NOW()-interval '23 hours'))
       AND s.slot_key = $2 AND (s.status='unused'
         OR (s.status='failed' AND (NOT $6 OR s.failed_at < NOW()-interval '5 minutes'))
         OR (s.status='queued' AND (s.queued_at IS NULL OR s.queued_at < NOW()-interval '5 minutes')))
     RETURNING s.id,s.delivery_payload`, [ticketId, slotKey, logicalMessageKey, claimToken,
      deliveryPayload ? JSON.stringify(deliveryPayload) : null, Boolean(options.recoveryOnly)]
  );
  if (!claim.rows[0]) return false;
  const slotId = claim.rows[0].id;
  const stopRenewal = renewClaim(slotId, claimToken);
  const idempotencyKey = createHash("sha256").update(`queue-email:${ticketId}:${slotKey}:${logicalMessageKey}`).digest("hex");
  let delivered = false;
  try {
    const result = await deliver({ idempotencyKey, deliveryPayload: claim.rows[0].delivery_payload });
    delivered = true;
    const completed = await db.pool.query(`UPDATE queue_email_slots SET status = 'sent', sent_at = NOW(), delivery_payload=NULL,delivery_ambiguous=FALSE
      WHERE id=$1 AND claim_token=$2 AND status='queued'`, [slotId, claimToken]);
    return completed.rowCount ? result : false;
  } catch (error) {
    await db.pool.query(`UPDATE queue_email_slots SET status = 'failed', failed_at = NOW(),
      delivery_ambiguous=had_ambiguous_attempt OR $3,had_ambiguous_attempt=had_ambiguous_attempt OR $3
      WHERE id=$1 AND claim_token=$2 AND status='queued'`, [slotId, claimToken, delivered || error.deliveryAmbiguous !== false]);
    throw error;
  } finally {
    stopRenewal();
  }
}

async function recoverPending(deliver) {
  const pending = await db.pool.query(`SELECT j.ticket_id,s.slot_key,s.logical_message_key,s.delivery_payload
    FROM queue_email_slots s JOIN queue_email_journeys j ON j.id=s.journey_id
    JOIN tickets t ON t.id=j.ticket_id
    WHERE s.delivery_payload IS NOT NULL AND s.status IN ('queued','failed')
      AND t.notify_by_email AND t.customer_email IS NOT NULL
      AND ((s.status='queued' AND (s.queued_at IS NULL OR s.queued_at < NOW()-interval '5 minutes'))
        OR (s.status='failed' AND s.failed_at < NOW()-interval '5 minutes'))
    ORDER BY COALESCE(s.failed_at,s.queued_at),s.id LIMIT 10`);
  let recovered = 0;
  for (const row of pending.rows) {
    try {
      const result = await withLifecycleSlot(row.ticket_id, row.slot_key, row.logical_message_key,
        context => deliver({ ...context.deliveryPayload, idempotencyKey: context.idempotencyKey }),
        row.delivery_payload, { recoveryOnly: true });
      if (result) recovered++;
    } catch {
      console.warn("[queue-email-recovery-failed]");
    }
  }
  return recovered;
}

module.exports = { EMAIL_QUOTA_POLICY, withLifecycleSlot, recoverPending };
