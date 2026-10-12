import type { QueueSnapshot } from "@shared";

export function counterBlockMessage(reason: string | null | undefined): string {
  const messages: Record<string, string> = {
    QUEUE_DAY_CLOSED: "Open the queue before calling a ticket.",
    COUNTER_OCCUPIED: "Resolve this counter’s called ticket before calling another.",
    COUNTER_INACTIVE: "Select an active counter to call a ticket.",
    NO_READY_WAITING_TICKET: "No waiting ticket is ready to be called yet."
  };
  return reason ? messages[reason] || "Refresh the queue before calling a ticket." : "";
}

export function selectCounterDispatch(snapshot: QueueSnapshot | null, tenantSlug: string, locationSlug: string, counterSlug: string) {
  if (snapshot?.tenant.slug !== tenantSlug || snapshot?.location?.slug !== locationSlug || !counterSlug) {
    return { lane: undefined, ticket: null };
  }
  const lane = snapshot.counterDispatch?.find((entry) => entry.counterSlug === (counterSlug === "__unassigned__" ? null : counterSlug));
  const ticket = snapshot.calledTickets?.find((entry) => entry.id === lane?.currentTicketId) || null;
  return { lane, ticket };
}
