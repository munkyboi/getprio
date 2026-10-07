const { createHash } = require("node:crypto");

function fail(message, statusCode = 409) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}
function id(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/u.test(value)
    || BigInt(value) > 9223372036854775807n) fail("Invalid resource ledger identifier.", 400);
  return value;
}
function normalizedCommand(command, payload) {
  const fields = { reserve: ["bookingItemId"], cancelReservation: ["reservationId"],
    allocate: ["ticketId"], release: ["allocationId", "outcome", "reason"] };
  if (!Object.hasOwn(fields, command) || !payload || typeof payload !== "object"
    || Array.isArray(payload) || Object.keys(payload).some(key => !fields[command].includes(key))) {
    fail("Unsupported ledger command.", 400);
  }
  const normalized = Object.fromEntries(fields[command].filter(key => key !== "reason")
    .map(key => [key, key === "outcome" ? payload[key] : id(payload[key])]));
  if (command === "release") {
    if (!["completed", "terminated"].includes(normalized.outcome)) fail("Invalid release outcome.", 400);
    if (payload.reason !== undefined && typeof payload.reason !== "string") fail("Invalid release reason.", 400);
    normalized.reason = payload.reason?.trim() || null;
    if (normalized.reason?.length > 500 || (normalized.outcome === "terminated" && !normalized.reason)) {
      fail("Termination requires a reason up to 500 characters.", 400);
    }
  }
  return normalized;
}
async function poolMapping(client, scope, serviceId) {
  const result = await client.query(`SELECT p.id::text, p.capacity, p.revision AS pool_revision,
    r.units_required, r.revision AS requirement_revision FROM service_resource_requirements r
    JOIN location_resource_pools p ON (p.id,p.tenant_id,p.location_id) = (r.pool_id,r.tenant_id,r.location_id)
    WHERE r.tenant_id=$1 AND r.location_id=$2 AND r.service_id=$3`, [...scope, serviceId]);
  if (!result.rows[0]) fail("Service resource demand is unknown.");
  return result.rows[0];
}

// Actual unreleased allocation consumes units even beyond its expected end.
// This foundation conservatively protects the whole requested future interval;
// relaxing this requires a separately defined forecast/reservation contract.
async function assertCapacity(client, scope, pool, startsAt, endsAt, excludedReservation = null) {
  const active = await client.query(`SELECT COALESCE(SUM(units),0)::int AS units FROM resource_allocations
    WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND released_at IS NULL`, [...scope, pool.id]);
  const reservations = await client.query(`SELECT units, starts_at, ends_at FROM resource_ledger_reservations
    WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND state='protected'
      AND starts_at < $5 AND ends_at > $4 AND ($6::bigint IS NULL OR id <> $6)
    ORDER BY starts_at,id`, [...scope, pool.id, startsAt, endsAt, excludedReservation]);
  const events = [[new Date(startsAt).getTime(), pool.units_required]];
  for (const reservation of reservations.rows) {
    events.push([Math.max(new Date(startsAt).getTime(), new Date(reservation.starts_at).getTime()), reservation.units],
      [Math.min(new Date(endsAt).getTime(), new Date(reservation.ends_at).getTime()), -reservation.units]);
  }
  // Half-open intervals: release before acquire at an equal timestamp.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let used = active.rows[0].units;
  for (const [, delta] of events) {
    used += delta;
    if (used > pool.capacity) fail("Protected resource capacity is unavailable.");
  }
}
async function reserve(client, scope, payload) {
  const item = await client.query(`SELECT i.*, b.status AS booking_status, b.pending_expires_at,
      b.payment_proof_object_key, clock_timestamp() AS observed_at FROM booking_bundle_items i
    JOIN bookings b ON (b.id,b.tenant_id,b.location_id)=(i.booking_id,i.tenant_id,i.location_id)
    WHERE i.tenant_id=$1 AND i.location_id=$2 AND i.id=$3 FOR UPDATE OF b,i`, [...scope, payload.bookingItemId]);
  const row = item.rows[0];
  if (!row) fail("Booking item not found.", 404);
  if (!["pending", "confirmed", "rescheduled"].includes(row.booking_status)
    || (row.booking_status === "pending" && !row.payment_proof_object_key
      && row.pending_expires_at && row.pending_expires_at <= row.observed_at)) fail("Booking does not protect an interval.");
  if (!(row.scheduled_end_at > row.scheduled_start_at) || row.scheduled_end_at <= row.observed_at) fail("Booking interval is invalid.");
  const pool = await poolMapping(client, scope, String(row.service_id));
  const existing = await client.query(`SELECT * FROM resource_ledger_reservations
    WHERE tenant_id=$1 AND location_id=$2 AND booking_item_id=$3 AND state IN ('protected','converted')`, [...scope, payload.bookingItemId]);
  if (existing.rows.length) fail("Booking item already has a live binding. Cancel it before rebinding.");
  await assertCapacity(client, scope, pool, row.scheduled_start_at, row.scheduled_end_at);
  const result = await client.query(`INSERT INTO resource_ledger_reservations
    (tenant_id,location_id,booking_id,booking_item_id,pool_id,pool_revision,requirement_revision,units,starts_at,ends_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text AS id`,
  [...scope, String(row.booking_id), payload.bookingItemId, pool.id, pool.pool_revision,
    pool.requirement_revision, pool.units_required, row.scheduled_start_at, row.scheduled_end_at]);
  return { reservationId: result.rows[0].id };
}
async function cancelReservation(client, scope, payload) {
  const result = await client.query(`UPDATE resource_ledger_reservations SET state='cancelled'
    WHERE tenant_id=$1 AND location_id=$2 AND id=$3 AND state='protected' RETURNING id::text`, [...scope, payload.reservationId]);
  if (!result.rows.length) fail("Only a protected reservation can be cancelled.");
  return { reservationId: result.rows[0].id };
}
async function allocationPlan(client, scope, ticketId) {
  const ticket = await client.query(`SELECT t.status,t.join_channel,t.customer_confirmed_at,p.source,p.booking_id,p.items,
      clock_timestamp() AS observed_at FROM tickets t LEFT JOIN ticket_service_plans p
      ON (p.ticket_id,p.tenant_id,p.location_id)=(t.id,t.tenant_id,t.location_id)
    WHERE t.tenant_id=$1 AND t.location_id=$2 AND t.id=$3 FOR UPDATE OF t`, [...scope, ticketId]);
  const row = ticket.rows[0];
  if (!row) fail("Ticket not found.", 404);
  if (row.status !== "called" || (row.join_channel !== "vendor" && !row.customer_confirmed_at)) {
    fail("Call and confirm the ticket before allocation.");
  }
  const item = row.items?.[0];
  if (row.items?.length !== 1 || !item?.resource?.known
    || !Number.isInteger(item.durationMinutes) || item.durationMinutes < 5 || item.durationMinutes > 480) {
    fail("A single-item known executable service plan is required.");
  }
  if (item.scheduledStartAt && new Date(item.scheduledStartAt) > row.observed_at) fail("Booked service is not ready yet.");
  const pool = await poolMapping(client, scope, id(item.serviceId));
  if (pool.id !== item.resource.poolId || pool.pool_revision !== item.resource.poolRevision
    || pool.requirement_revision !== item.resource.requirementRevision || pool.units_required !== item.resource.unitsRequired) {
    fail("Service plan resource configuration is stale.");
  }
  return { row, item, pool };
}
async function allocate(client, scope, payload) {
  const { row, item, pool } = await allocationPlan(client, scope, payload.ticketId);
  let reservationId = null;
  if (row.source === "booking") {
    const booking = await client.query(`SELECT status FROM bookings
      WHERE tenant_id=$1 AND location_id=$2 AND id=$3 FOR UPDATE`, [...scope, row.booking_id]);
    if (!["confirmed", "rescheduled"].includes(booking.rows[0]?.status)) fail("Booking cannot start service.");
    if (!item.bookingItemId) fail("Booking plan has no resource item identity.");
    const binding = await client.query(`SELECT * FROM resource_ledger_reservations WHERE tenant_id=$1
      AND location_id=$2 AND booking_item_id=$3 AND state='protected' FOR UPDATE`, [...scope, id(item.bookingItemId)]);
    const r = binding.rows[0];
    if (!r || String(r.booking_id) !== String(row.booking_id) || String(r.pool_id) !== pool.id || r.units !== pool.units_required
      || r.pool_revision !== pool.pool_revision || r.requirement_revision !== pool.requirement_revision
      || r.starts_at.getTime() !== new Date(item.scheduledStartAt).getTime()
      || r.ends_at.getTime() !== new Date(item.scheduledEndAt).getTime()
      || r.starts_at > row.observed_at || r.ends_at <= row.observed_at) fail("Booking reservation binding is unavailable or stale.");
    reservationId = String(r.id);
  }
  const endsAt = new Date(row.observed_at.getTime() + item.durationMinutes * 60000);
  await assertCapacity(client, scope, pool, row.observed_at, endsAt, reservationId);
  const result = await client.query(`INSERT INTO resource_allocations
    (tenant_id,location_id,ticket_id,pool_id,pool_revision,units,reservation_id,started_at,expected_end_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text`,
  [...scope, payload.ticketId, pool.id, pool.pool_revision, pool.units_required, reservationId, row.observed_at, endsAt]);
  if (reservationId) await client.query(`UPDATE resource_ledger_reservations SET state='converted'
    WHERE tenant_id=$1 AND location_id=$2 AND id=$3`, [...scope, reservationId]);
  return { allocationId: result.rows[0].id, reservationId };
}
async function release(client, scope, payload) {
  const result = await client.query(`UPDATE resource_allocations SET released_at=clock_timestamp(),outcome=$4,reason=$5
    WHERE tenant_id=$1 AND location_id=$2 AND id=$3 AND released_at IS NULL RETURNING id::text`,
  [...scope, payload.allocationId, payload.outcome, payload.reason]);
  if (!result.rows.length) fail("Allocation already resolved or not found.");
  return { allocationId: result.rows[0].id, outcome: payload.outcome };
}
const handlers = { reserve, cancelReservation, allocate, release };

// No application caller or route is wired to this internal foundation. The
// explicit pool owns the transaction; callers cannot bypass the location lock
// by passing an arbitrary prelocked client. Authorization belongs to the future
// domain adapter, which must repeat membership/state checks under this lock.
async function executeCommand({ pool, tenantId, locationId, actorUserId, operationKey, command, payload }) {
  const scope = [id(tenantId), id(locationId)];
  const actorId = id(actorUserId);
  if (typeof operationKey !== "string" || !operationKey.trim() || operationKey.length > 120) fail("Invalid operation key.", 400);
  const data = normalizedCommand(command, payload);
  const fingerprint = createHash("sha256").update(JSON.stringify({ actorId, command, data })).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const branch = await client.query("SELECT id FROM store_locations WHERE tenant_id=$1 AND id=$2 FOR UPDATE", scope);
    if (!branch.rows.length) fail("Location not found.", 404);
    await client.query(`INSERT INTO resource_ledger_scopes (tenant_id,location_id) VALUES ($1,$2)
      ON CONFLICT DO NOTHING`, scope);
    const prior = await client.query(`SELECT payload_hash,result FROM resource_ledger_commands
      WHERE tenant_id=$1 AND location_id=$2 AND operation_key=$3`, [...scope, operationKey]);
    let result;
    if (prior.rows[0]) {
      if (prior.rows[0].payload_hash !== fingerprint) fail("Operation key was reused with a different command.");
      result = prior.rows[0].result;
    } else {
      result = await handlers[command](client, scope, data);
      const revision = await client.query(`UPDATE resource_ledger_scopes SET revision=revision+1
        WHERE tenant_id=$1 AND location_id=$2 RETURNING revision::text`, scope);
      result.revision = revision.rows[0].revision;
      await client.query(`INSERT INTO resource_ledger_commands
        (tenant_id,location_id,operation_key,command,payload_hash,actor_user_id,result)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [...scope, operationKey, command, fingerprint, actorId, JSON.stringify(result)]);
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
module.exports = { executeCommand };
