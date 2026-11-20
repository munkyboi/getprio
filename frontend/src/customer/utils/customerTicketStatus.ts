/** Customer-safe projection of the queue's durable state, never a stage assignment. */
export interface CustomerTicketStatusInput {
  status?: string | null;
  statusReason?: string | null;
  customerConfirmedAt?: string | Date | null;
  serviceStartedAt?: string | Date | null;
  serviceEndedAt?: string | Date | null;
  serviceOutcome?: string | null;
  queueLifecycle?: { version?: number; state?: string | null } | null;
}

const summaries: Record<string, { label: string; message: string }> = {
  waiting: { label: "Waiting", message: "You are in the queue. Keep your ticket ready." },
  called: { label: "Called", message: "You have been called. Please proceed to the service area." },
  confirmed: { label: "Confirmed", message: "Your arrival is confirmed. Please wait for staff to begin service." },
  in_service: { label: "In service", message: "Your service is in progress." },
  served: { label: "Served", message: "Your service has been completed." },
  skipped: { label: "Skipped", message: "Staff skipped this ticket. Contact the vendor about the next step." },
  cancelled: { label: "Cancelled", message: "This ticket has been cancelled." },
  pending_carry_over: { label: "Saved for carry-over", message: "Your ticket is saved for the next eligible queue day and has no current position." },
  unserved: { label: "Unserved", message: "Service was not completed. Contact the vendor about the next step." },
  service_interrupted: { label: "Service interrupted", message: "Staff recorded that service ended without completion. Contact the vendor about the next step." },
  expired: { label: "Expired", message: "This ticket's carry-over opportunity has expired." },
  unknown: { label: "Status unavailable", message: "The current ticket status is unavailable. Refresh or contact the vendor." },
};

export function customerTicketStatus(ticket?: CustomerTicketStatusInput | null) {
  const status = ticket?.status || "";
  let key = status;
  if (status === "unserved" && ticket?.statusReason === "service_interrupted") key = "service_interrupted";
  else if (["served", "cancelled", "unserved", "expired", "skipped", "pending_carry_over"].includes(status)) key = status;
  else if (ticket?.serviceEndedAt && ticket.serviceOutcome === "completed") key = "served";
  else if (ticket?.serviceEndedAt && ticket.serviceOutcome === "interrupted") key = "service_interrupted";
  else if (ticket?.queueLifecycle?.version === 1 && ticket.queueLifecycle.state === "in_service") key = "in_service";
  else if (ticket?.serviceStartedAt && !ticket.serviceEndedAt) key = "in_service";
  else if (status === "called" && ticket?.customerConfirmedAt) key = "confirmed";
  if (!Object.hasOwn(summaries, key)) key = "unknown";
  return { key, ...summaries[key] };
}
