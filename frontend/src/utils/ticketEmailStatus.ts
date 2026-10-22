type EmailPreference = {
  notifyByEmail?: boolean | null;
  emailJourneyMode?: string;
};

/** Old exhaustion metadata is inconclusive until backend retirement is confirmed. */
export function needsEmailDeliveryFallback(ticket: EmailPreference | null | undefined, emailQuotaPolicy?: string | null) {
  return emailQuotaPolicy !== "unmetered" && ticket?.emailJourneyMode === "journey_exhausted" && ticket.notifyByEmail !== false;
}

export function getBookingEmailStatus(ticket: EmailPreference | null | undefined, emailQuotaPolicy?: string | null) {
  if (needsEmailDeliveryFallback(ticket, emailQuotaPolicy)) {
    return "Email updates are not confirmed. Follow updates on this page.";
  }
  if (ticket?.notifyByEmail === true) return "Enabled — carried over from your booking.";
  if (ticket?.notifyByEmail === false) return "Not enabled for this ticket.";
  return "Email alert status is unavailable. Follow updates on this page.";
}
