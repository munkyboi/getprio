const resources = require("./serviceResourceSessionService");
const permissions = require("./permissions");
function requireExplicitService() {
  const error = new Error("Use Start service and Complete service, or record an interrupted service, for this ticket.");
  error.statusCode = 409;
  throw error;
}
async function assertLegacyOutcome(client, ticket, status, timingEnabled) {
  const state = await resources.readState(client, ticket);
  if (state.allocation || (ticket.serviceStartedAt && !ticket.serviceEndedAt)
    || (status === "served" && (timingEnabled || state.required))) requireExplicitService();
}
async function cancelUnusedProtection(client, ledger, ticket, { operation, cancelBooking = false, actor }) {
  const scope = [ticket.tenantId, ticket.locationId, ticket._id];
  // Location and ticket locks precede booking/binding locks, as for service start.
  const bookings = await client.query(`SELECT id::text,status FROM bookings
    WHERE tenant_id=$1 AND location_id=$2 AND queue_ticket_id=$3 ORDER BY id FOR UPDATE`, scope);
  if (cancelBooking && bookings.rows.some(booking => ["pending", "confirmed", "rescheduled"].includes(booking.status))) {
    permissions.assertPermission(actor, "tenant.booking.manage", { tenantId: ticket.tenantId });
  }
  for (const booking of bookings.rows) {
    const bindings = await client.query(`SELECT id::text,state FROM resource_ledger_reservations
      WHERE tenant_id=$1 AND location_id=$2 AND booking_id=$3 AND state IN ('protected','converted')
      ORDER BY id FOR UPDATE`, [ticket.tenantId, ticket.locationId, booking.id]);
    if (bindings.rows.some(binding => binding.state === "converted")) requireExplicitService();
    for (const binding of bindings.rows) {
      await ledger.executeCommand({ operationKey: `ticket:${ticket._id}:reservation:${binding.id}:${operation}`,
        command: "cancelReservation", payload: { reservationId: binding.id } });
    }
  }
  if (cancelBooking) {
    await client.query(`UPDATE bookings SET status='canceled',fulfillment_outcome_reason='ticket_cancelled',
      refund_eligible=FALSE,fulfillment_resolved_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND location_id=$2 AND queue_ticket_id=$3 AND status IN ('pending','confirmed','rescheduled')`, scope);
  }
}
module.exports = { assertLegacyOutcome, cancelUnusedProtection };
