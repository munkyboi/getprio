import type { LocalResourceOperations } from "../../../shared/localPoolDemo";

export type DashboardScope = { tenantSlug: string; locationSlug: string; tenantId: string; locationId: string };
export type DashboardPool = LocalResourceOperations["pools"][number];
export type DashboardModel = {
  scopeKey: string;
  asOf: string;
  ledgerRevision: string;
  pools: DashboardPool[];
  // Compatibility name only: current queue-date waiting count, excluding future bookings.
  // It does NOT establish resource availability, valid plans, READY stages/counters or next eligibility.
  readyToCall: number;
  loadedWaiting: number;
  loadedCalled: number;
  requestsWithAllocations: number;
  attention: { poolId: string | null; title: string; detail: string }[];
  reconciliationRequired: boolean;
  attentionPoolCount: number | null;
};
export function dashboardScopeKey(scope: DashboardScope) {
  return JSON.stringify([scope.tenantSlug, scope.locationSlug, scope.tenantId, scope.locationId]);
}
const whole = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
/** Reject foreign or malformed observations instead of borrowing another scope's cached data. */
export function resourceDashboardModel(data: LocalResourceOperations, scope: DashboardScope): DashboardModel {
  if (data.contractVersion !== "local-resource-operations-v1" || data.localDemo !== true ||
      !scope.tenantId || !scope.locationId || data.scope?.tenantId !== scope.tenantId || data.scope?.locationId !== scope.locationId) {
    throw new Error("Dashboard data does not match the selected business and location.");
  }
  if (!Number.isFinite(Date.parse(data.asOf)) || (typeof data.ledgerRevision !== "string" || !data.ledgerRevision) || !whole(data.readyWaitingCount) ||
      !Array.isArray(data.pools) || !Array.isArray(data.waiting) || !Array.isArray(data.called) || !Array.isArray(data.activeSessions) ||
      typeof data.reconciliation?.required !== "boolean" || !Array.isArray(data.reconciliation.issues)) {
    throw new Error("Dashboard observation is incomplete. Refresh to try again.");
  }
  const ids = new Set<string>();
  for (const pool of data.pools) {
    if (!pool.id || ids.has(pool.id) || typeof pool.name !== "string" || typeof pool.trackingEnabled !== "boolean" || typeof pool.overCapacity !== "boolean" ||
        typeof pool.revision !== "string" || !pool.revision || pool.overdueUnits > pool.allocatedUnits ||
        ![pool.capacity, pool.allocatedUnits, pool.protectedUnitsNow, pool.availableUnits, pool.overdueUnits].every(whole)) {
      throw new Error("Pool capacity data is unavailable. Refresh to try again.");
    }
    ids.add(pool.id);
  }
  const distinct = (rows: { id: string }[]) => {
    if (rows.some(row => typeof row.id !== "string" || !row.id)) throw new Error("Request observation is incomplete.");
    return new Set(rows.map(row => row.id)).size;
  };
  if (data.activeSessions.some(session => typeof session.ticketId !== "string" || !session.ticketId)) throw new Error("Allocation observation is incomplete.");
  const globalReconciliation = data.reconciliation.required && (data.reconciliation.issues.length === 0 ||
    data.reconciliation.issues.some(issue => !issue.poolId || !ids.has(issue.poolId)));
  const reconciliationPools = new Set(data.reconciliation.required ? data.reconciliation.issues.flatMap(issue => issue.poolId ? [issue.poolId] : []) : []);
  const pools = data.pools.map(pool => ({...pool,
    availabilityReasonCodes: globalReconciliation || reconciliationPools.has(pool.id)
      ? [...new Set([...(pool.availabilityReasonCodes || []), "reconciliation_required" as const])] : pool.availabilityReasonCodes,
    // Older local runtimes omit the quality fields. Absence is unknown, never healthy.
    availabilityQuality: pool.availabilityQuality === "observed" && pool.archivedAt === null &&
      Array.isArray(pool.availabilityReasonCodes) && pool.availabilityReasonCodes.length === 0 && pool.trackingEnabled && !globalReconciliation && !reconciliationPools.has(pool.id)
      ? "observed" as const : "unknown" as const}));
  const attention: DashboardModel["attention"] = [];
  if (data.reconciliation.required) attention.push({poolId: null, title: "Resource records need review", detail: "Review resource records in Live queue."});
  for (const pool of pools) {
    if (pool.availabilityQuality !== "observed") attention.push({poolId: pool.id, title: `${pool.name}: availability unknown`, detail: poolAvailabilityReason(pool)});
    if (!pool.trackingEnabled) attention.push({poolId: pool.id, title: `${pool.name}: tracking unavailable`, detail: "Resource tracking is turned off."});
    else if (pool.capacity === 0) attention.push({poolId: pool.id, title: `${pool.name}: no configured capacity`, detail: "Add capacity to see usage and availability."});
    else if (pool.allocatedUnits > pool.capacity || pool.overCapacity) attention.push({poolId: pool.id, title: `${pool.name}: over configured capacity`, detail: `${pool.allocatedUnits} in use, ${pool.protectedUnitsNow} held; ${pool.capacity} configured units.`});
    else if (pool.availabilityQuality === "observed" && pool.availableUnits === 0) attention.push({poolId: pool.id, title: `${pool.name}: no available capacity`, detail: "No units are available in this pool."});
    if (pool.overdueUnits > 0) attention.push({poolId: pool.id, title: `${pool.name}: ${pool.overdueUnits} overdue units`, detail: "Review overdue resources in Live queue."});
  }
  return {scopeKey: dashboardScopeKey(scope), asOf: data.asOf, ledgerRevision: data.ledgerRevision, pools,
    // Legacy DTO/property names are retained; this is Waiting now, never call-ready eligibility.
    readyToCall: data.readyWaitingCount, loadedWaiting: distinct(data.waiting), loadedCalled: distinct(data.called),
    requestsWithAllocations: new Set(data.activeSessions.map(session => session.ticketId)).size,
    attention, reconciliationRequired: data.reconciliation.required,
    attentionPoolCount: pools.length > 0 && pools.every(pool => pool.availabilityQuality === "observed" && pool.capacity > 0) && !data.reconciliation.required ? new Set(attention.flatMap(item => item.poolId ? [item.poolId] : [])).size : null};
}
export function poolUtilization(pool: DashboardPool): number | null {
  return pool.availabilityQuality === "observed" && pool.trackingEnabled && pool.capacity > 0 ? pool.allocatedUnits / pool.capacity * 100 : null;
}

/** The stream URL scopes tenant access; explicit other-location hints must be ignored. */
export function dashboardHintMatchesLocation(payload: string, locationId: string): boolean {
  try {
    const hint = JSON.parse(payload);
    return !hint || typeof hint !== "object" || !("locationId" in hint) || hint.locationId === locationId;
  } catch { return true; } // An unstructured invalidation hint only triggers a scoped authenticated read.
}

export function poolAvailabilityReason(pool: DashboardPool): string {
  if (pool.archivedAt) return "This pool is archived.";
  if (!pool.trackingEnabled) return "Resource tracking is turned off.";
  const reasons = new Set(pool.availabilityReasonCodes || []);
  if (reasons.has("pool_archived")) return "This pool is archived.";
  if (reasons.has("tracking_disabled")) return "Resource tracking is turned off.";
  if (reasons.has("protection_expired")) return "A held reservation needs review.";
  if (reasons.has("protection_inconsistent")) return "Held capacity needs review.";
  if (reasons.has("reconciliation_required")) return "Resource records need review.";
  return "Availability could not be confirmed. Refresh to try again.";
}
