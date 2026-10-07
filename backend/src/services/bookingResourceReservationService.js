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

async function cancelBookingReservations({ client, ledger, booking }) {
  // Existing immutable bindings survive configuration edits or tracking changes.
  const bindings = await client.query(`SELECT id::text,state FROM resource_ledger_reservations
    WHERE tenant_id=$1 AND location_id=$2 AND booking_id=$3 AND state IN ('protected','converted')
    ORDER BY id FOR UPDATE`, [booking.tenantId, booking.locationId, booking._id]);
  if (bindings.rows.some(binding => binding.state === "converted")) {
    conflict("This booking has started service and cannot be cancelled here.");
  }
  for (const binding of bindings.rows) {
    await ledger.executeCommand({ operationKey: `booking:${booking._id}:reservation:${binding.id}:cancel`,
      command: "cancelReservation", payload: { reservationId: binding.id } });
  }
}

module.exports = { reserveCreatedBooking, cancelBookingReservations };
