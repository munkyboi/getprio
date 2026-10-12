// Explicit display allowlist: adding vendor/internal fields to a snapshot must
// never silently expose them on a board or customer tracking response.
function displayTicket(ticket) {
  if (!ticket) return null;
  return { id: ticket.id, ticketNumber: ticket.ticketNumber, position: ticket.position,
    status: ticket.status, calledAt: ticket.calledAt, serviceCounterId: ticket.serviceCounterId,
    serviceCounterName: ticket.serviceCounterName, serviceCounterSlug: ticket.serviceCounterSlug };
}
function queueMetadata(snapshot) {
  const { monitorUrl: _tenantBoardUrl, ...tenant } = snapshot.tenant || {};
  const { monitorUrl: _locationBoardUrl, ...location } = snapshot.location || {};
  return { tenant, location: snapshot.location ? location : null,
    publicBoardTheme: snapshot.publicBoardTheme, businessProfileTheme: snapshot.businessProfileTheme,
    queueDay: snapshot.queueDay, queueIntake: snapshot.queueIntake,
    stats: { ...snapshot.stats, currentTicketNumber: null },
    usage: {}, current: null, calledTickets: [], nextUp: [], overflow: [], recovery: [], history: [], focusTicket: null };
}
function boardSnapshot(snapshot) {
  return { ...queueMetadata(snapshot), current: displayTicket(snapshot.current),
    calledTickets: (snapshot.calledTickets || []).map(displayTicket),
    counterDispatch: (snapshot.counterDispatch || []).map((lane) => ({ serviceCounterId: lane.serviceCounterId, counterSlug: lane.counterSlug, counterName: lane.counterName })),
    nextUp: (snapshot.nextUp || []).map(displayTicket) };
}
function trackingSnapshot(snapshot) {
  return { ...queueMetadata(snapshot), focusTicket: snapshot.focusTicket };
}
module.exports = { displayTicket, queueMetadata, boardSnapshot, trackingSnapshot };
