const db = require("../config/db");
const releaseControls = require("../config/releaseControls");

async function withLifecycleSlot(ticketId, slotKey, logicalMessageKey, deliver) {
  if (!releaseControls.allowanceQueueEmailJourneys) return deliver();
  const claim = await db.pool.query(
    `UPDATE queue_email_slots s SET status = 'queued', logical_message_key = $3, queued_at = NOW(), failed_at = NULL
     FROM queue_email_journeys j
     WHERE s.journey_id = j.id AND j.ticket_id = $1 AND j.mode = 'metered'
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
