// Internal adapter: callers must already hold the location-first transaction.
// Production constraints keep tracking disabled until all lifecycle writers and
// activation reconciliation are covered. Draft mappings do not affect bookings.
function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  throw error;
}

async function reserveCreatedBooking({ client, ledger, booking }) {
  const scope = [booking.tenantId, booking.locationId];
  const tracking = await client.query(`SELECT EXISTS (SELECT 1 FROM location_resource_pools
    WHERE tenant_id=$1 AND location_id=$2 AND tracking_enabled=TRUE) AS enabled`, scope);
  if (tracking.rows[0]?.enabled !== true) return;

  const items = await client.query(`SELECT i.id::text, i.booking_quantity,
      i.scheduled_start_at, i.scheduled_end_at, p.tracking_enabled
    FROM booking_bundle_items i LEFT JOIN service_resource_requirements r
      ON (r.tenant_id,r.location_id,r.service_id)=(i.tenant_id,i.location_id,i.service_id)
    LEFT JOIN location_resource_pools p
      ON (p.id,p.tenant_id,p.location_id)=(r.pool_id,r.tenant_id,r.location_id)
    WHERE i.tenant_id=$1 AND i.location_id=$2 AND i.booking_id=$3 ORDER BY i.sort_order,i.id`,
  [...scope, booking._id]);
  if (!items.rows.some(item => item.tracking_enabled === true)) return;
  const item = items.rows[0];
  const duration = (item.scheduled_end_at - item.scheduled_start_at) / 60000;
  if (items.rows.length !== 1 || item.booking_quantity !== 1
    || !Number.isInteger(duration) || duration < 5 || duration > 480) {
    conflict("Resource bookings require one service item, quantity one and a supported interval.");
  }
  await ledger.executeCommand({ operationKey: `booking:${booking._id}:item:${item.id}:reserve`,
    command: "reserve", payload: { bookingItemId: item.id } });
}

async function cancelBookingReservations({ client, ledger, booking, operation = "cancel" }) {
  // Existing immutable bindings survive configuration edits or tracking changes.
  const bindings = await client.query(`SELECT id::text,state FROM resource_ledger_reservations
    WHERE tenant_id=$1 AND location_id=$2 AND booking_id=$3 AND state IN ('protected','converted')
    ORDER BY id FOR UPDATE`, [booking.tenantId, booking.locationId, booking._id]);
  if (bindings.rows.some(binding => binding.state === "converted")) {
    conflict("This booking has started service and cannot be cancelled here.");
  }
  for (const binding of bindings.rows) {
    await ledger.executeCommand({ operationKey: `booking:${booking._id}:reservation:${binding.id}:${operation}`,
      command: "cancelReservation", payload: { reservationId: binding.id } });
  }
}

async function currentProtectedItem({ client, booking }) {
  const result = await client.query(`SELECT i.id::text AS item_id,i.booking_quantity,
    i.scheduled_start_at,i.scheduled_end_at,p.tracking_enabled,p.id::text AS mapped_pool_id,
    p.revision AS mapped_pool_revision,r.revision AS mapped_requirement_revision,r.units_required,
    b.id::text AS reservation_id,b.state,b.pool_id::text,b.pool_revision,b.requirement_revision,
    b.units,b.starts_at,b.ends_at
    FROM booking_bundle_items i LEFT JOIN service_resource_requirements r
      ON (r.tenant_id,r.location_id,r.service_id)=(i.tenant_id,i.location_id,i.service_id)
    LEFT JOIN location_resource_pools p
      ON (p.id,p.tenant_id,p.location_id)=(r.pool_id,r.tenant_id,r.location_id)
    LEFT JOIN resource_ledger_reservations b
      ON (b.booking_item_id,b.booking_id,b.tenant_id,b.location_id)=(i.id,i.booking_id,i.tenant_id,i.location_id)
      AND b.state IN ('protected','converted')
    WHERE i.tenant_id=$1 AND i.location_id=$2 AND i.booking_id=$3 ORDER BY i.sort_order,i.id`,
  [booking.tenantId,booking.locationId,booking._id]);
  if (!result.rows.length) {
    const tracking = await client.query(`SELECT EXISTS (SELECT 1 FROM location_resource_pools
      WHERE tenant_id=$1 AND location_id=$2 AND tracking_enabled=TRUE) AS enabled`,
    [booking.tenantId,booking.locationId]);
    if (tracking.rows[0]?.enabled === true) conflict("Booking resource items are missing. Reconciliation is needed.");
  }
  if (!result.rows.some(row => row.reservation_id || row.tracking_enabled === true)) return null;
  const row = result.rows[0];
  if (result.rows.length !== 1 || row.booking_quantity !== 1 || !row.reservation_id) {
    conflict("A single-item protected resource booking is required. Reconciliation is needed.");
  }
  if (row.state !== "protected") conflict("This booking has started service and cannot be changed here.");
  const duration = (row.scheduled_end_at - row.scheduled_start_at) / 60000;
  if (!Number.isInteger(duration) || duration < 5 || duration > 480
    || row.starts_at.getTime() !== row.scheduled_start_at.getTime()
    || row.ends_at.getTime() !== row.scheduled_end_at.getTime()) {
    conflict("Booking resource interval is inconsistent. Reconciliation is needed.");
  }
  return row;
}

async function assertBookingReservationCurrent(options) {
  await currentProtectedItem(options);
}

async function prepareBookingReservationReplacement(options) {
  const row = await currentProtectedItem(options);
  if (row && (row.pool_id !== row.mapped_pool_id || row.pool_revision !== row.mapped_pool_revision
    || row.requirement_revision !== row.mapped_requirement_revision || row.units !== row.units_required)) {
    conflict("Booking resource configuration is stale. Refresh the booking before rescheduling.");
  }
  return row;
}

async function replaceBookingReservation({ ledger, booking, replacement }) {
  if (!replacement) return;
  // Use the old immutable binding identity so moving back to a previously used
  // interval cannot replay a receipt pointing to an already cancelled binding.
  const key = `booking:${booking._id}:reservation:${replacement.reservation_id}:reschedule`;
  await ledger.executeCommand({ operationKey: `${key}:cancel`, command: "cancelReservation",
    payload: { reservationId: replacement.reservation_id } });
  await ledger.executeCommand({ operationKey: `${key}:reserve`, command: "reserve",
    payload: { bookingItemId: replacement.item_id } });
}

module.exports = { reserveCreatedBooking, cancelBookingReservations, assertBookingReservationCurrent,
  prepareBookingReservationReplacement, replaceBookingReservation };
