// Called only inside the location-first service transaction. Historical booking
// bindings and allocations survive tracking disable; completion uses occupancy,
// never the current draft mapping or its forecast end.
function conflict() {
  const error = new Error("Service resource state needs reconciliation.");
  error.statusCode = 409;
  throw error;
}

async function readState(client, ticket) {
  const scope = [ticket.tenantId, ticket.locationId, ticket._id];
  const flags = await client.query(`SELECT
    EXISTS (SELECT 1 FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2
      AND tracking_enabled=TRUE) AS enabled,
    EXISTS (SELECT 1 FROM resource_ledger_reservations r JOIN bookings b
      ON (b.id,b.tenant_id,b.location_id)=(r.booking_id,r.tenant_id,r.location_id)
      LEFT JOIN ticket_service_plans p ON (p.booking_id,p.tenant_id,p.location_id)=(r.booking_id,r.tenant_id,r.location_id)
        AND p.source='booking'
      WHERE r.tenant_id=$1 AND r.location_id=$2 AND (b.queue_ticket_id=$3 OR p.ticket_id=$3)) AS bound`, scope);
  const allocations = await client.query(`SELECT id::text,released_at,outcome FROM resource_allocations
    WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3`, scope);
  const allocation = allocations.rows[0] || null;
  let enabled = flags.rows[0].enabled;
  if (enabled && !allocation && !flags.rows[0].bound) {
    const plans = await client.query(`SELECT items FROM ticket_service_plans
      WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3`, scope);
    const items = plans.rows[0]?.items;
    const identified = Array.isArray(items) && items.length > 0 && items.every(item =>
      typeof item?.serviceId === "string" && /^[1-9]\d{0,18}$/u.test(item.serviceId)
      && BigInt(item.serviceId) <= 9223372036854775807n);
    if (identified) {
      const pools = items.filter(item => item.resource?.known === true).map(item => item.resource.poolId).filter(value => typeof value === "string");
      const tracked = await client.query(`SELECT EXISTS (SELECT 1 FROM location_resource_pools p
        LEFT JOIN service_resource_requirements r ON (r.pool_id,r.tenant_id,r.location_id)=(p.id,p.tenant_id,p.location_id)
        WHERE p.tenant_id=$1 AND p.location_id=$2 AND p.tracking_enabled=TRUE
          AND (p.id::text=ANY($3::text[]) OR r.service_id::text=ANY($4::text[]))) AS enabled`,
      [ticket.tenantId, ticket.locationId, pools, items.map(item => item.serviceId)]);
      enabled = tracked.rows[0].enabled;
    }
    // Missing/invalid service identity remains unknown in a tracked location;
    // it cannot silently bypass allocation as an ordinary selected service.
  }
  return { allocation, required: !!allocation || enabled || flags.rows[0].bound };
}

function assertStarted(state) {
  if (state.required && (!state.allocation || state.allocation.released_at)) conflict();
}

async function allocate(ledger, ticket, state) {
  if (state.allocation) conflict();
  if (!state.required) return null;
  const result = await ledger.executeCommand({ operationKey: `ticket:${ticket._id}:service:start`,
    command: "allocate", payload: { ticketId: String(ticket._id) } });
  return result.allocationId;
}

async function release(ledger, ticket, state, outcome) {
  assertStarted(state);
  if (!state.allocation) return null;
  await ledger.executeCommand({ operationKey: `ticket:${ticket._id}:service:${outcome}`,
    command: "release", payload: { allocationId: state.allocation.id,
      outcome: outcome === "completed" ? "completed" : "terminated",
      ...(outcome === "interrupted" ? { reason: "Staff explicitly interrupted service." } : {}) } });
  return state.allocation.id;
}

function assertFinished(state, outcome) {
  if (state.required && (!state.allocation || !state.allocation.released_at
    || state.allocation.outcome !== (outcome === "completed" ? "completed" : "terminated"))) conflict();
}

module.exports = { readState, assertStarted, allocate, release, assertFinished };
