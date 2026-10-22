/** Hours errors have no editor context; never promise a draft or an in-place duration control. */
export function serviceHoursRecovery(code: string | undefined): string | null {
  if (code === "SERVICE_DURATION_EXCEEDS_STORE_HOURS") return "This request can't finish before closing. Choose a shorter duration or try during opening hours.";
  if (code === "STORE_HOURS_UNAVAILABLE") return "We couldn't check the opening hours. Refresh and try again.";
  return null;
}

/** User-facing recovery for authoritative Linear queue command rejections. */
export function linearQueueRecovery(code: string | undefined, message: string): string | null {
  const hours = serviceHoursRecovery(code);
  if (hours) return hours;
  switch (code) {
    case "RESOURCE_CAPACITY_UNAVAILABLE":
      return "Resources are unavailable for the required service time. Refresh the queue after capacity changes, then try again.";
    case "SERVICE_PLAN_REQUIRED":
      return "This ticket needs an executable service plan. Review its service details before trying again.";
    case "SERVICE_PLAN_STALE":
      return "The service's resource settings have changed. Refresh the queue and review the ticket's service plan before trying again.";
    case "RESOURCE_CONFIGURATION_CHANGED":
    case "STALE_REVISION":
      return "Resource configuration changed. Refresh the queue, open Amend request, review the current resources, save the amendment, then try Call again.";
    case "TICKET_RESERVATION_STALE":
      return "This ticket's resource reservation is no longer valid. Refresh the queue. For a walk-in, skip it, restore it from Missed recovery, then call it again.";
    case "TICKET_RESERVATION_CONFLICT":
      return "The resource reservation could not be confirmed. Refresh the queue before trying to call this ticket again.";
    default:
      // Compatibility with the ledger's current capacity error, which has no code.
      return message === "Protected resource capacity is unavailable."
        ? "Resources are unavailable for the required service time. Refresh the queue after capacity changes, then try again."
        : null;
  }
}
