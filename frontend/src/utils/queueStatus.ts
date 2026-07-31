import type { QueueDayStatus, QueueSnapshot, TicketStatus } from "@shared";

export type QueueStatusSummary = {
  color: "gray" | "red" | "yellow" | "orange" | "teal" | "blue";
  label: string;
  message: string;
};

function makeSummary(color: QueueStatusSummary["color"], label: string, message: string): QueueStatusSummary {
  return { color, label, message };
}

export function resolveQueueDayState(
  queueDay: Pick<QueueDayStatus, "state" | "isClosed"> | null | undefined
): QueueDayStatus["state"] | undefined {
  if (!queueDay) {
    return undefined;
  }

  return queueDay.state || (queueDay.isClosed ? "closed" : "open");
}

export function isQueueAcceptingJoins(
  snapshot: Pick<QueueSnapshot, "queueDay" | "queueIntake"> | null | undefined
): boolean {
  if (!snapshot || resolveQueueDayState(snapshot.queueDay) !== "open") {
    return false;
  }

  if (snapshot.queueDay.availabilityReason === "reconciling") {
    return false;
  }

  if (snapshot.queueDay.intakeMode) {
    return snapshot.queueDay.intakeMode === "accepting";
  }

  return (
    !snapshot.queueDay.isPaused &&
    snapshot.queueIntake.state !== "paused" &&
    snapshot.queueIntake.state !== "closed"
  );
}

export function getQueueStateSummary(snapshot: QueueSnapshot | null): QueueStatusSummary {
  if (!snapshot) {
    return makeSummary("gray", "Loading", "Loading live queue status.");
  }

  if (!snapshot.location?.openStatus.isOpen || snapshot.queueDay.availabilityReason === "outside_store_hours") {
    const nextOpen = snapshot.location?.openStatus.nextOpenAt
      ? ` Next opening: ${new Date(snapshot.location.openStatus.nextOpenAt).toLocaleString()}.`
      : "";
    return makeSummary("red", "Store closed", `The store is outside its effective hours.${nextOpen}`);
  }

  if (snapshot.queueDay.availabilityReason === "reconciling") {
    return makeSummary("orange", "Queue closing", "The queue is closing. Check again shortly.");
  }

  if (snapshot.queueDay.state === "unopened" || snapshot.queueDay.availabilityReason === "not_opened") {
    return makeSummary("gray", "Not open yet", "The store is open, but staff have not opened today’s queue.");
  }

  if (snapshot.queueDay.state === "closed" || snapshot.queueDay.isClosed) {
    return makeSummary("red", "Queue closed", "Today’s queue has closed. Staff may not reopen it.");
  }

  if (snapshot.queueDay.isPaused) {
    return makeSummary("yellow", "Paused", "New joins are paused while staff works through the current line.");
  }

  if (snapshot.queueIntake.state === "near_limit") {
    return makeSummary("orange", "Near limit", "This queue is close to capacity.");
  }

  if (snapshot.queueDay.autoClosePhase === "warning") {
    const closingTime = snapshot.queueDay.currentClosesAt
      ? new Date(snapshot.queueDay.currentClosesAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "soon";
    return makeSummary(
      "orange",
      "Closing soon",
      `The queue closes at ${closingTime}. Joining does not guarantee service before closing.`
    );
  }

  if (snapshot.queueDay.autoClosePhase === "extended") {
    const closingTime = snapshot.queueDay.currentClosesAt
      ? new Date(snapshot.queueDay.currentClosesAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "the updated time";
    return makeSummary("blue", "Extended", `The queue remains open until ${closingTime}.`);
  }

  return makeSummary("teal", "Open", "This queue is accepting joins.");
}

export function getTicketStateSummary(status?: TicketStatus | null): QueueStatusSummary {
  switch (status) {
    case "waiting":
      return makeSummary("teal", "Joined", "Your ticket is active and waiting in line.");
    case "called":
      return makeSummary("blue", "Called", "You have been called. Please proceed to the service area.");
    case "served":
      return makeSummary("gray", "Served", "This ticket has already been served.");
    case "skipped":
      return makeSummary("yellow", "Skipped", "This ticket was skipped by staff.");
    case "cancelled":
      return makeSummary("red", "Cancelled", "This ticket was cancelled.");
    case "pending_carry_over":
      return makeSummary(
        "blue",
        "Saved for carry-over",
        "Your ticket is retained, but it has no live position until the next eligible Queue Day is opened by staff."
      );
    case "unserved":
      return makeSummary(
        "orange",
        "Unserved",
        "The queue closed after your ticket was called. This outcome is final; contact the vendor about the appropriate next step."
      );
    case "expired":
      return makeSummary(
        "red",
        "Expired",
        "Your one carry-over opportunity ended without service. This outcome is final and is not a cancellation."
      );
    default:
      return makeSummary("gray", "Unknown", "Ticket status is unavailable.");
  }
}

export function getLocationStatusSummary(snapshot: QueueSnapshot | null): QueueStatusSummary {
  if (!snapshot) {
    return makeSummary("gray", "Loading", "Loading live queue status.");
  }

  if (snapshot.location?.openStatus.isOpen) {
    return makeSummary("teal", "Open", "This location is currently open.");
  }

  return makeSummary("red", "Closed", "This location is currently closed.");
}
