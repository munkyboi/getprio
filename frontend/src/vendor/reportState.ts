/** Gaps between recorded served-ticket updates, never inferred service durations. */
export function servedTicketIntervals(
  tickets: ReadonlyArray<{
    ticketNumber: string;
    status: string;
    updatedAt: string | Date;
  }>,
  limit = 30,
) {
  const records = tickets
    .filter((ticket) => ticket.status === "served")
    .map((ticket) => ({
      label: ticket.ticketNumber,
      timestamp: new Date(ticket.updatedAt).getTime(),
    }))
    .filter((ticket) => Number.isFinite(ticket.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-limit);
  return records
    .slice(1)
    .map((record, index) => ({
      label: record.label,
      minutes:
        Math.round((record.timestamp - records[index].timestamp) / 6000) / 10,
    }));
}
