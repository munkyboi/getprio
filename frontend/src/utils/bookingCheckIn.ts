import type { VendorBookingSummary } from "@shared";

export type CheckInBooking = Pick<VendorBookingSummary, "scheduledStartAt" | "status" | "checkedInAt" | "linkedTicket">;

export function getBookingCheckInState(booking: CheckInBooking, now = Date.now()) {
  const startAt = new Date(booking.scheduledStartAt).getTime();
  const validStart = Number.isFinite(startAt);
  const isEligibleStatus = ["confirmed", "rescheduled"].includes(booking.status);
  return {
    isTooEarly: !validStart || now < startAt - 15 * 60 * 1000,
    isLate: validStart && now > startAt + 15 * 60 * 1000,
    isEligibleStatus,
    isAwaitingCheckIn: isEligibleStatus && !booking.checkedInAt && !booking.linkedTicket
  };
}
