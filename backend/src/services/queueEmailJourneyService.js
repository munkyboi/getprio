const db = require("../config/db");

async function withLifecycleSlot(ticketId, slotKey, logicalMessageKey, deliver) {
  const journey = await db.pool.query("SELECT id FROM queue_email_journeys WHERE ticket_id=$1", [ticketId]);
  // Tickets created before journey tracking remain deliverable; old exhausted
  // journeys now use the same retry/dedup slots without a quota admission check.
  if (!journey.rows[0]) return deliver();
  await db.pool.query(`INSERT INTO queue_email_slots (journey_id, slot_key)
    VALUES ($1,$2) ON CONFLICT (journey_id, slot_key) DO NOTHING`, [journey.rows[0].id, slotKey]);
  const claim = await db.pool.query(
    `UPDATE queue_email_slots s SET status = 'queued', logical_message_key = $3, queued_at = NOW(), failed_at = NULL
     FROM queue_email_journeys j
     WHERE s.journey_id = j.id AND j.ticket_id = $1
       AND s.slot_key = $2 AND s.status IN ('unused', 'failed')
     RETURNING s.id`, [Number(ticketId), slotKey, logicalMessageKey]
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

module.exports = { withLifecycleSlot };
