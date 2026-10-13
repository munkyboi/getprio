import { OperationAlert as Alert } from "../vendor/OperationsUi";
import { formatBookingScheduleDateTime } from "../utils/dates";
import {
  getBookingCheckInState,
  type CheckInBooking,
} from "../utils/bookingCheckIn";

export function BookingCheckInNotice({
  booking,
  now,
  canReschedule,
  queueBlocked,
  queueGuidance,
}: Readonly<{
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
      <Alert color="orange" title="Check-in window missed">
        The check-in window closed 15 minutes after the scheduled start.{" "}
        {canReschedule
          ? "Reschedule this booking to choose a new time."
          : "Ask a vendor admin to reschedule this booking."}
      </Alert>
    );
  }
  if (state.isTooEarly) {
    return (
      <Alert color="blue" title="Check-in not open yet">
        {state.opensAt
          ? `Check-in opens ${formatBookingScheduleDateTime(state.opensAt)}, 15 minutes before the booking.`
          : "The booking schedule is unavailable. Check the scheduled time before checking in."}
      </Alert>
    );
  }
  if (!queueBlocked) return null;
  return (
    <Alert color="blue" title="Check-in unavailable">
      {queueGuidance}
    </Alert>
  );
}
