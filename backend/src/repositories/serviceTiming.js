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

async function start(ticket, actorUserId, client, allocationId = null) {
  await client.query(`
    UPDATE tickets SET service_started_at = CASE WHEN $3::bigint IS NULL THEN clock_timestamp()
      ELSE (SELECT started_at FROM resource_allocations WHERE id=$3 AND ticket_id=$1
        AND tenant_id=$4 AND location_id=$5 AND released_at IS NULL) END,
      service_started_by_user_id = $2
    WHERE id = $1 AND service_started_at IS NULL AND status = 'called'
  `, [ticket._id, actorUserId, allocationId, ticket.tenantId, ticket.locationId]);
}

async function finish(ticket, outcome, actorUserId, client, allocationId = null) {
  // Queue closure does not end actual service. A terminal queue ticket can still
  // receive an explicit timing outcome without rewriting its queue/booking history.
  await client.query(`
    WITH observed AS (SELECT CASE WHEN $4::bigint IS NULL THEN clock_timestamp()
      ELSE (SELECT released_at FROM resource_allocations WHERE id=$4 AND ticket_id=$1
        AND tenant_id=$5 AND location_id=$6) END AS ended_at)
    UPDATE tickets SET service_ended_at = observed.ended_at, service_outcome = $2,
      service_ended_by_user_id = $3,
      status_reason = CASE WHEN status = 'called' AND $2 = 'interrupted' THEN 'service_interrupted' ELSE status_reason END,
      status = CASE WHEN status = 'called' THEN CASE WHEN $2 = 'completed' THEN 'served' ELSE 'unserved' END ELSE status END,
      served_at = CASE WHEN status = 'called' AND $2 = 'completed' THEN observed.ended_at ELSE served_at END,
      unserved_at = CASE WHEN status = 'called' AND $2 = 'interrupted' THEN observed.ended_at ELSE unserved_at END,
      service_priority_band = CASE WHEN status = 'called' THEN 'normal' ELSE service_priority_band END,
      rejoin_deadline_at = CASE WHEN status = 'called' THEN NULL ELSE rejoin_deadline_at END
    FROM observed WHERE id = $1 AND service_started_at IS NOT NULL AND service_ended_at IS NULL
  `, [ticket._id, outcome, actorUserId, allocationId, ticket.tenantId, ticket.locationId]);
}

module.exports = { listUnfinished, start, finish };
