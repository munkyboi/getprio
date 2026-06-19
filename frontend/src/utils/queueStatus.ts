import type { QueueSnapshot, TicketStatus } from "@shared";

export type QueueStatusSummary = {
  color: "gray" | "red" | "yellow" | "orange" | "teal" | "blue";
  label: string;
  message: string;
};

function makeSummary(color: QueueStatusSummary["color"], label: string, message: string): QueueStatusSummary {
  return { color, label, message };
}

export function getQueueStateSummary(snapshot: QueueSnapshot | null): QueueStatusSummary {
  if (!snapshot) {
    return makeSummary("gray", "Loading", "Loading live queue status.");
  }

  if (snapshot.queueDay.isClosed || !snapshot.location?.openStatus.isOpen) {
    return makeSummary("red", "Closed", "This queue is closed for now.");
  }

  if (snapshot.queueDay.isPaused) {
    return makeSummary("yellow", "Paused", "New joins are paused while staff works through the current line.");
  }

  if (snapshot.queueIntake.state === "near_limit") {
    return makeSummary("orange", "Near limit", "This queue is close to capacity.");
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
    case "unserved":
      return makeSummary("orange", "Unserved", "This ticket was marked unserved.");
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
