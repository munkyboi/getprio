import type { QueueSnapshot } from "@shared";

export function selectCounterDispatch(snapshot: QueueSnapshot | null, tenantSlug: string, locationSlug: string, counterSlug: string) {
  if (snapshot?.tenant.slug !== tenantSlug || snapshot?.location?.slug !== locationSlug || !counterSlug) {
    return { lane: undefined, ticket: null };
  }
  const lane = snapshot.counterDispatch?.find((entry) => entry.counterSlug === (counterSlug === "__unassigned__" ? null : counterSlug));
  const ticket = snapshot.calledTickets?.find((entry) => entry.id === lane?.currentTicketId) || null;
  return { lane, ticket };
}
