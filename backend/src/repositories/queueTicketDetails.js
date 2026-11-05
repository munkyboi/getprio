const COLUMNS = `ticket.id::text,ticket.tenant_id::text,ticket.location_id::text,ticket.ticket_number,ticket.status,
  ticket.customer_name,ticket.notes,ticket.customer_email,ticket.customer_phone,ticket.date_key,
  ticket.current_queue_day_id::text,ticket.service_started_at,ticket.service_ended_at,ticket.service_outcome,
  to_char(ticket.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_updated_at,
  plan.items->0->>'serviceName' AS service_name,jsonb_array_length(plan.items) AS service_item_count,
  EXISTS(SELECT 1 FROM resource_allocations a WHERE a.tenant_id=ticket.tenant_id
    AND a.location_id=ticket.location_id AND a.ticket_id=ticket.id AND a.released_at IS NULL) AS allocated`;

async function read(client, scope, ticketId, { forUpdate = false } = {}) {
  const result = await client.query(`SELECT ${COLUMNS} FROM tickets ticket
    LEFT JOIN ticket_service_plans plan ON (plan.ticket_id,plan.tenant_id,plan.location_id)=(ticket.id,ticket.tenant_id,ticket.location_id)
    WHERE ticket.tenant_id=$1 AND ticket.location_id=$2 AND ticket.id=$3 ${forUpdate ? 'FOR UPDATE OF ticket' : ''}`,
  [scope.tenantId,scope.locationId,ticketId]);
  return result.rows[0] || null;
}
async function update(client, scope, ticketId, details) {
  await client.query(`UPDATE tickets SET customer_name=$4,notes=$5,updated_at=clock_timestamp()
    WHERE tenant_id=$1 AND location_id=$2 AND id=$3`, [scope.tenantId,scope.locationId,ticketId,details.customerName,details.notes]);
  return read(client,scope,ticketId);
}
module.exports = { read, update };
