import { ApiError } from "../api/client";
import type { QueueSnapshot } from "@shared";
import type { LocalPoolWork, LocalResourceOperations } from "../../../shared/localPoolDemo";

export function scopedLocalPoolData(snapshot: QueueSnapshot | null, data: LocalResourceOperations | undefined, tenantSlug: string, locationSlug: string) {
  if (!data || !snapshot) return null;
  return data.scope?.tenantId === snapshot?.tenant.id && data.scope?.locationId === snapshot?.location?.id && snapshot?.tenant.slug === tenantSlug && snapshot?.location?.slug === locationSlug ? data : null;
}

export function localPoolReadState(snapshot: QueueSnapshot | null, data: LocalResourceOperations | undefined, tenantSlug: string, locationSlug: string, pending: boolean, failed: boolean, error?: unknown): 'checking' | 'unavailable' | 'ready' | 'not_applicable' {
  if (failed) return error instanceof ApiError && error.status===404 && error.code==='LOCAL_RESOURCE_OPERATIONS_NOT_APPLICABLE' ? 'not_applicable' : 'unavailable';
  if (scopedLocalPoolData(snapshot,data,tenantSlug,locationSlug)) return 'ready';
  return pending ? 'checking' : 'unavailable';
}

/** Only explicit server dispatch advice can free a local call lane; availability is not admission. */
export function localPoolDispatchSnapshot(snapshot: QueueSnapshot | null, data: LocalResourceOperations | null) {
  return snapshot ? {...snapshot, counterDispatch: data?.counterDispatch || [], calledTickets: snapshot.calledTickets?.filter(ticket => data?.called.some(work => work.id === ticket.id)) || []} : null;
}

/** Frozen plans cannot be repaired by editing a ticket's customer details. */
export function hasExecutableLocalPlan(work: LocalPoolWork | undefined): boolean {
  const plan = work?.plan;
  return Boolean(plan && plan.itemCount === 1 && plan.serviceId && plan.poolId && plan.resourceKnown &&
    Number.isInteger(plan.durationMinutes) && plan.durationMinutes! >= 5 && plan.durationMinutes! <= 480 &&
    Number.isInteger(plan.unitsRequired) && plan.unitsRequired! >= 1);
}
export const missingServicePlanGuidance = "This ticket has no executable service plan. Skip this ticket, then issue a new ticket with a service selected. The original ticket stays in history.";
