import type { VendorBookingSummary } from "@shared";

export type CheckInBooking = Pick<VendorBookingSummary, "scheduledStartAt" | "status" | "checkedInAt" | "linkedTicket">;

export function getBookingCheckInState(booking: CheckInBooking, now = Date.now()) {
  const startAt = new Date(booking.scheduledStartAt).getTime();
  const validStart = Number.isFinite(startAt);
  const isEligibleStatus = ["confirmed", "rescheduled"].includes(booking.status);
  const isTooEarly = !validStart || now < startAt - 15 * 60 * 1000;
  const isLate = validStart && now > startAt + 15 * 60 * 1000;
  const isAwaitingCheckIn = isEligibleStatus && !booking.checkedInAt && !booking.linkedTicket;
  return {
    opensAt: validStart ? new Date(startAt - 15 * 60 * 1000).toISOString() : null,
    isWindowOpen: isAwaitingCheckIn && !isTooEarly && !isLate,
    isTooEarly,
    isLate,
    isEligibleStatus,
    isAwaitingCheckIn
  };
}
