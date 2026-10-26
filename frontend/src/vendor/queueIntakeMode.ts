
type ModeInput = {
  optedIn: boolean;
  queueType?: {scope:{tenantSlug:string;locationSlug:string};type:"simple"|"resource"|"workflow";capabilities:{simple:boolean;resource:boolean;workflow:boolean}} | null;
  tenantSlug: string;
  entitlementTenantSlug: string | null | undefined;
  loaded: boolean;
  entitlements: { queueSystemAccess?: boolean; serviceBookingAccess?: boolean } | null | undefined;
  setup?: {scope:string;ready:boolean};
  locationSlug?: string;
  plan?: { planSlug?: string | null; subscriptionStatus?: string | null } | null;
};
/** Presentation only; the server still authorizes queue admission and booking separately. */
export function queueIntakeMode(input: ModeInput): "loading" | "legacy" | "resource" | "workflow" | "blocked" {
  if (!input.tenantSlug || !input.loaded || input.entitlementTenantSlug !== input.tenantSlug || !input.entitlements) return "loading";
  const setting = input.queueType;
  if (!setting || setting.scope.tenantSlug!==input.tenantSlug || setting.scope.locationSlug!==input.locationSlug) return "loading";
  if (!setting.capabilities[setting.type]) return "blocked";
  if (setting.type === "simple") return "legacy";
  if (setting.type === "workflow") return "workflow";
  return input.optedIn && input.entitlements.queueSystemAccess === true && input.setup?.scope === `${input.tenantSlug}:${input.locationSlug}` && input.setup.ready ? "resource" : "blocked";
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

export function fullInventoryReady(active:{isSuccess:boolean;hasNextPage:boolean;isFetchingNextPage:boolean},skipped:{isSuccess:boolean;hasNextPage:boolean;isFetchingNextPage:boolean}) {
 return [active,skipped].every(read=>read.isSuccess&&!read.hasNextPage&&!read.isFetchingNextPage);
}
export function scopedResourceIds(currentScope:string, inventory:{scope:string;ids:string[]}) {
 return inventory.scope===currentScope?inventory.ids:[];
}
