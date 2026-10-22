const resources = require("./serviceResourceSessionService");
const permissions = require("./permissions");
const { assertOwnership } = require("./customerTicketCancellationService");
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
async function assertRestorable(client, ticket) {
  await assertLegacyOutcome(client, ticket, "waiting", false);
  const converted = await client.query(`SELECT 1 FROM resource_ledger_reservations r JOIN bookings b
    ON (b.id,b.tenant_id,b.location_id)=(r.booking_id,r.tenant_id,r.location_id)
    LEFT JOIN ticket_service_plans p ON (p.booking_id,p.tenant_id,p.location_id)=(r.booking_id,r.tenant_id,r.location_id) AND p.source='booking'
    WHERE r.tenant_id=$1 AND r.location_id=$2 AND (b.queue_ticket_id=$3 OR p.ticket_id=$3) AND r.state='converted' LIMIT 1`,
  [ticket.tenantId, ticket.locationId, ticket._id]);
  if (ticket.serviceStartedAt || ticket.serviceEndedAt || converted.rows.length) requireExplicitService();
}
async function cancelUnusedProtection(client, ledger, ticket, { operation, cancelBooking = false, actor, customer }) {
  const scope = [ticket.tenantId, ticket.locationId, ticket._id];
  // Location and ticket locks precede booking/binding locks, as for service start.
  const bookings = await client.query(`SELECT id::text,status,customer_user_id::text,customer_email,customer_phone FROM bookings
    WHERE tenant_id=$1 AND location_id=$2 AND queue_ticket_id=$3 ORDER BY id FOR UPDATE`, scope);
  if (customer) {
    for (const booking of bookings.rows) assertOwnership(customer, {
      userId: booking.customer_user_id, customerEmail: booking.customer_email, customerPhone: booking.customer_phone
    });
  } else if (cancelBooking && bookings.rows.some(booking => ["pending", "confirmed", "rescheduled"].includes(booking.status))) {
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
module.exports = { assertLegacyOutcome, assertRestorable, cancelUnusedProtection };
