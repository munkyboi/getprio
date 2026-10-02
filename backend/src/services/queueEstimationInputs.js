// Schedule context is collected for the next predictor; it does not represent
// resource occupancy or change the currently deployed estimate.
function scheduleDurationMinutes(schedule) {
  if (!schedule?.scheduledStartAt || !schedule?.scheduledEndAt) return null;
  const start = new Date(schedule.scheduledStartAt).getTime();
  const end = new Date(schedule.scheduledEndAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 60000 * 100) / 100;
}

function describeTicketServiceTime(ticket, averageServiceMinutes) {
  const booking = ticket?.linkedBookingEstimation;
  const duration = scheduleDurationMinutes(booking);
  const fallback = Number(averageServiceMinutes);
  if (duration === null) {
    return {
      source: "vendor_average",
      durationMinutes: Number.isFinite(fallback) ? Math.max(0, fallback) : 0,
      bookingLinked: Boolean(ticket?.linkedBookingReference),
      scheduleAvailable: false
    };
  }
  const items = Array.isArray(booking.serviceItems) ? booking.serviceItems : [];
  return {
    source: "booking_schedule",
    durationMinutes: duration,
    bookingLinked: true,
    scheduleAvailable: true,
    executionMode: booking.executionMode === "sequential" ? "sequential" : "parallel",
    serviceItemCount: items.length || 1,
    serviceItemDurationsMinutes: items.map(scheduleDurationMinutes)
  };
}

function buildServiceTimeContext({ ticket, position, waitingTickets, currentTicket, averageServiceMinutes }) {
  const aheadCount = Math.max(0, Math.trunc(Number(position) || 0) - 1);
  const ahead = { ticketCount: 0, bookingScheduleCount: 0, fallbackCount: 0, totalDurationMinutes: 0 };
  for (const entry of waitingTickets.slice(0, aheadCount)) {
    const service = describeTicketServiceTime(entry, averageServiceMinutes);
    ahead.ticketCount += 1;
    ahead.totalDurationMinutes += service.durationMinutes;
    if (service.scheduleAvailable) ahead.bookingScheduleCount += 1;
    else ahead.fallbackCount += 1;
  }
  ahead.totalDurationMinutes = Math.round(ahead.totalDurationMinutes * 100) / 100;
  return {
    version: 1,
    current: currentTicket ? describeTicketServiceTime(currentTicket, averageServiceMinutes) : null,
    ahead,
    own: ticket ? describeTicketServiceTime(ticket, averageServiceMinutes) : null
  };
}

module.exports = { scheduleDurationMinutes, describeTicketServiceTime, buildServiceTimeContext };
