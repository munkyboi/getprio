// One policy for the mutation, waiting display, and observed source assessment.
// Runtime uses the database clock at claim; assessment pins an observation only.
function bookingCallNotReady(ticketAlias = 'tickets', observed = false) {
  if (!['tickets','w','t'].includes(ticketAlias)) throw new Error('Invalid dispatch SQL alias.');
  const clock = observed ? 'transaction_timestamp()' : 'clock_timestamp()';
  return `EXISTS (
    SELECT 1 FROM bookings
    WHERE bookings.queue_ticket_id = ${ticketAlias}.id
      AND bookings.tenant_id = ${ticketAlias}.tenant_id
      AND bookings.location_id = ${ticketAlias}.location_id
      AND bookings.scheduled_start_at > ${clock}
  )`;
}
function waitingPriorityOrder(prefix = '') {
  if (!['','w.'].includes(prefix)) throw new Error('Invalid dispatch SQL alias.');
  return `${priorityBandRank(prefix)} ASC, ${prefix}carry_over_count DESC, ${prefix}created_at ASC`;
}
function priorityBandRank(prefix = '') {
  if (!['','w.'].includes(prefix)) throw new Error('Invalid dispatch SQL alias.');
  return `CASE ${prefix}service_priority_band WHEN 'carry_over' THEN 0 WHEN 'recovery' THEN 1 WHEN 'checked_in_booking' THEN 2 ELSE 3 END`;
}
module.exports = { bookingCallNotReady, waitingPriorityOrder, priorityBandRank };
