const db = require("../config/db");

async function listUnfinished(tenantId, locationId) {
  if (!locationId) return [];
  const result = await db.pool.query(`
    SELECT id::text, ticket_number, status, service_started_at
    FROM tickets WHERE tenant_id = $1 AND location_id = $2
      AND service_started_at IS NOT NULL AND service_ended_at IS NULL
    ORDER BY service_started_at, id LIMIT 100
  `, [tenantId, locationId]);
  return result.rows.map((row) => ({
    id: row.id, ticketNumber: row.ticket_number, status: row.status,
    serviceStartedAt: row.service_started_at
  }));
}

async function start(ticket, actorUserId, client) {
  await client.query(`
    UPDATE tickets SET service_started_at = clock_timestamp(), service_started_by_user_id = $2
    WHERE id = $1 AND service_started_at IS NULL AND status = 'called'
  `, [ticket._id, actorUserId]);
}

async function finish(ticket, outcome, actorUserId, client) {
  // Queue closure does not end actual service. A terminal queue ticket can still
  // receive an explicit timing outcome without rewriting its queue/booking history.
  await client.query(`
    UPDATE tickets SET service_ended_at = clock_timestamp(), service_outcome = $2,
      service_ended_by_user_id = $3,
      status_reason = CASE WHEN status = 'called' AND $2 = 'interrupted' THEN 'service_interrupted' ELSE status_reason END,
      status = CASE WHEN status = 'called' THEN CASE WHEN $2 = 'completed' THEN 'served' ELSE 'unserved' END ELSE status END,
      served_at = CASE WHEN status = 'called' AND $2 = 'completed' THEN clock_timestamp() ELSE served_at END,
      unserved_at = CASE WHEN status = 'called' AND $2 = 'interrupted' THEN clock_timestamp() ELSE unserved_at END,
      service_priority_band = CASE WHEN status = 'called' THEN 'normal' ELSE service_priority_band END,
      rejoin_deadline_at = CASE WHEN status = 'called' THEN NULL ELSE rejoin_deadline_at END
    WHERE id = $1 AND service_started_at IS NOT NULL AND service_ended_at IS NULL
  `, [ticket._id, outcome, actorUserId]);
}

module.exports = { listUnfinished, start, finish };
