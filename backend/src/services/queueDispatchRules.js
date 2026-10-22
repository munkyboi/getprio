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
// Releases dispatch occupancy only. Resource allocations remain held until an
// explicit service outcome; timing alone or a foreign/released row is no proof.
function startedResourceServicePredicate(ticketAlias = 'tickets') {
  if (!['tickets','w'].includes(ticketAlias)) throw new Error('Invalid dispatch SQL alias.');
  return `(${ticketAlias}.service_started_at IS NOT NULL AND ${ticketAlias}.service_ended_at IS NULL
    AND EXISTS (SELECT 1 FROM resource_allocations allocation
      WHERE allocation.ticket_id=${ticketAlias}.id AND allocation.tenant_id=${ticketAlias}.tenant_id
        AND allocation.location_id=${ticketAlias}.location_id AND allocation.released_at IS NULL))`;
}
module.exports = { bookingCallNotReady, waitingPriorityOrder, priorityBandRank, startedResourceServicePredicate };
