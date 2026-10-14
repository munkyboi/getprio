const db = require("../config/db");
const EMAIL_QUOTA_POLICY = "unmetered";

async function withLifecycleSlot(ticketId, slotKey, logicalMessageKey, deliver) {
  let journey = await db.pool.query("SELECT id FROM queue_email_journeys WHERE ticket_id=$1", [ticketId]);
  // Legacy tickets acquire durable delivery state before any provider call.
  // A concurrent creator wins the unique ticket key without rewriting history.
  if (!journey.rows[0]) {
    await db.pool.query(`INSERT INTO queue_email_journeys (tenant_id, ticket_id, mode)
      SELECT tenant_id, id, $2 FROM tickets WHERE id=$1
      ON CONFLICT (ticket_id) DO NOTHING`, [ticketId, EMAIL_QUOTA_POLICY]);
    journey = await db.pool.query("SELECT id FROM queue_email_journeys WHERE ticket_id=$1", [ticketId]);
  }
  if (!journey.rows[0]) return false;
  await db.pool.query(`INSERT INTO queue_email_slots (journey_id, slot_key)
    VALUES ($1,$2) ON CONFLICT (journey_id, slot_key) DO NOTHING`, [journey.rows[0].id, slotKey]);
  const claim = await db.pool.query(
    `UPDATE queue_email_slots s SET status = 'queued', logical_message_key = $3, queued_at = NOW(), failed_at = NULL
     FROM queue_email_journeys j
     WHERE s.journey_id = j.id AND j.ticket_id = $1
       AND s.slot_key = $2 AND s.status IN ('unused', 'failed')
     RETURNING s.id`, [ticketId, slotKey, logicalMessageKey]
  );
  if (!claim.rows[0]) return false;
  try {
    const result = await deliver();
    await db.pool.query(`UPDATE queue_email_slots SET status = 'sent', sent_at = NOW() WHERE id = $1`, [claim.rows[0].id]);
    return result;
  } catch (error) {
    await db.pool.query(`UPDATE queue_email_slots SET status = 'failed', failed_at = NOW() WHERE id = $1`, [claim.rows[0].id]);
    throw error;
  }
}

module.exports = { EMAIL_QUOTA_POLICY, withLifecycleSlot };
