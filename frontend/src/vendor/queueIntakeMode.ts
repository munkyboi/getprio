import { canAccessVendorSection } from "../lib/vendorDashboardNavigation";

type ModeInput = {
  optedIn: boolean;
  tenantSlug: string;
  entitlementTenantSlug: string | null | undefined;
  loaded: boolean;
  entitlements: { serviceBookingAccess?: boolean } | null | undefined;
  plan?: { planSlug?: string | null; subscriptionStatus?: string | null } | null;
};
/** Presentation only; the server still authorizes queue admission and booking separately. */
export function queueIntakeMode(input: ModeInput): "loading" | "legacy" | "resource" {
  if (!input.tenantSlug || !input.loaded || input.entitlementTenantSlug !== input.tenantSlug || !input.entitlements) return "loading";
  return input.optedIn && canAccessVendorSection("services", input.entitlements, input.plan) ? "resource" : "legacy";
}

export function queueWorkPresentation({resourceIntake, managementAllowed, resourceTicketIds, currentTicketId}: {
  resourceIntake: boolean; managementAllowed: boolean; resourceTicketIds: string[]; currentTicketId?: string | null;
}) {
  const currentResource = Boolean(currentTicketId && resourceTicketIds.includes(currentTicketId));
  return {currentResource, resourceCounters: resourceIntake || Boolean(managementAllowed && resourceTicketIds.length && (!currentTicketId || currentResource)), newRequest: resourceIntake ? "resource" as const : "walkIn" as const};
}

export function legacyQueueWork<T extends {calledTickets?: Array<{id: string}>}>(snapshot:T|null, resourceTicketIds:string[]):T|null {
  return snapshot ? {...snapshot,calledTickets:snapshot.calledTickets?.filter(ticket=>!resourceTicketIds.includes(ticket.id))} : null;
}

export function showResourceManagement({managementOnly, activeReady, draftsReady, activeCount, draftCount, hasMore, transient}: {
  managementOnly: boolean; activeReady: boolean; draftsReady: boolean; activeCount:number; draftCount:number; hasMore:boolean; transient:boolean;
}) {
  return !managementOnly || !activeReady || !draftsReady || activeCount>0 || draftCount>0 || hasMore || transient;
}
