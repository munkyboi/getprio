import { Alert } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { getBookingCheckInState, type CheckInBooking } from "../utils/bookingCheckIn";

export function BookingCheckInNotice({ booking, now, canReschedule, queueBlocked, queueGuidance }: Readonly<{
  booking: CheckInBooking;
  now: number;
  canReschedule: boolean;
  queueBlocked: boolean;
  queueGuidance: string;
}>) {
  const state = getBookingCheckInState(booking, now);
  if (!state.isAwaitingCheckIn) return null;
  if (state.isLate) {
    return (
      <Alert color="orange" icon={<IconInfoCircle size={18} />} title="Check-in window missed">
        The check-in window closed 15 minutes after the scheduled start. {canReschedule
          ? "Reschedule this booking to choose a new time."
          : "Ask a vendor admin to reschedule this booking."}
      </Alert>
    );
  }
  if (!state.isTooEarly && !queueBlocked) return null;
  return (
    <Alert color="blue" icon={<IconInfoCircle size={18} />} title="Check-in unavailable">
      {state.isTooEarly ? "Check-in opens 15 minutes before the booking." : null}
      {state.isTooEarly && queueBlocked ? " " : null}
      {queueBlocked ? queueGuidance : null}
    </Alert>
  );
}
