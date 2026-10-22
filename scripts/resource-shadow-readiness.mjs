// Read-only inventory. Timing observations and draft mappings are not occupancy.
const MAX_TICKETS = 10000;

function itemReasons(item, pools, requirements) {
  const reasons = new Set();
  if (!item || typeof item !== "object") return ["invalid_plan_item"];
  if (!Number.isFinite(item.durationMinutes) || item.durationMinutes <= 0) reasons.add("invalid_duration");
  const resource = item.resource;
  const requirement = requirements.get(String(item.serviceId));
  const pool = pools.get(String(resource?.poolId));
  if (resource?.known !== true || !requirement || !pool) {
    reasons.add("missing_resource_mapping");
    return reasons;
  }
  if (!Number.isInteger(resource.unitsRequired) || resource.unitsRequired < 1 || resource.unitsRequired > pool.capacity) {
    reasons.add("invalid_resource_demand");
  }
  if (String(resource.poolId) !== String(requirement.pool_id)
      || resource.unitsRequired !== requirement.units_required
      || resource.requirementRevision !== requirement.revision
      || resource.poolRevision !== pool.revision) reasons.add("stale_resource_snapshot");
  return reasons;
}

function exceedsParallelCapacity(demand, pools) {
  return [...demand].some(([poolId, units]) => pools.has(poolId) && units > pools.get(poolId).capacity);
}

function planReasons(row, pools, requirements) {
  if (!Array.isArray(row.items) || !row.items.length) return new Set(["missing_service_plan"]);
  const reasons = new Set();
  if (row.execution_mode !== "parallel") reasons.add("unsupported_execution_mode");
  const demand = new Map();
  for (const item of row.items) {
    for (const reason of itemReasons(item, pools, requirements)) reasons.add(reason);
    if (item?.resource?.known === true && Number.isInteger(item.resource.unitsRequired)) {
      const key = String(item.resource.poolId);
      demand.set(key, (demand.get(key) || 0) + item.resource.unitsRequired);
    }
  }
  // Parallel bundles consume simultaneous units; quantity must not multiply elapsed duration.
  if (row.execution_mode === "parallel" && exceedsParallelCapacity(demand, pools)) {
    reasons.add("parallel_demand_exceeds_capacity");
  }
  return reasons;
}

export async function readResourceShadowReadiness(client, scope, configuration) {
  const base = {
    reportVersion: "resource-shadow-readiness-v1", readyForShadowProjection: false,
    authoritativeOccupancyAvailable: false, customerEstimateChanged: false,
    blockers: ["authoritative_occupancy_adapter_not_implemented", "reservation_aware_runtime_predictor_not_implemented"],
    scopePolicy: "All waiting/called tickets and unfinished service observations at this vendor location, across queue dates. Independent of the reservation report window.",
    note: "Inventory only. Valid plans do not prove occupancy, reservation protection, correct ordering or rollout readiness. Timing interruptions here are terminal outcomes, not resumable occupancy events."
  };
  const tables = await client.query("SELECT to_regclass('public.ticket_service_plans') AS plans");
  if (!tables.rows[0].plans) return { ...base, tableAvailable: false, blockers: [...base.blockers, "service_plan_table_missing"] };
  const result = await client.query(`
    SELECT tickets.status, tickets.service_started_at, tickets.service_ended_at,
      plans.execution_mode, plans.items
    FROM tickets LEFT JOIN ticket_service_plans AS plans
      ON plans.ticket_id = tickets.id AND plans.tenant_id = tickets.tenant_id AND plans.location_id = tickets.location_id
    WHERE tickets.tenant_id = $1 AND tickets.location_id = $2
      AND (tickets.status IN ('waiting', 'called')
        OR (tickets.service_started_at IS NOT NULL AND tickets.service_ended_at IS NULL))
    ORDER BY tickets.id LIMIT ${MAX_TICKETS + 1}
  `, [scope.tenantId, scope.locationId]);
  if (result.rows.length > MAX_TICKETS) throw new Error("Resource readiness inventory exceeds 10,000 tickets; report was not truncated.");
  const pools = new Map(configuration.pools.map(pool => [String(pool.id), pool]));
  const requirements = new Map(configuration.requirements.map(item => [String(item.service_id), item]));
  const counts = { inventoriedTickets: result.rows.length, waitingTickets: 0, calledTickets: 0,
    unfinishedServiceObservations: 0, ticketsWithoutPlanIssues: 0, ticketsWithPlanIssues: 0 };
  const planIssueTicketCounts = {};
  for (const row of result.rows) {
    if (row.status === "waiting") counts.waitingTickets++;
    if (row.status === "called") counts.calledTickets++;
    if (row.service_started_at && !row.service_ended_at) counts.unfinishedServiceObservations++;
    const reasons = planReasons(row, pools, requirements);
    if (reasons.size) counts.ticketsWithPlanIssues++;
    else counts.ticketsWithoutPlanIssues++;
    for (const reason of reasons) planIssueTicketCounts[reason] = (planIssueTicketCounts[reason] || 0) + 1;
  }
  return { ...base, tableAvailable: true, counts, planIssueTicketCounts,
    configuredPools: pools.size, trackingEnabledPools: configuration.pools.filter(pool => pool.tracking_enabled).length,
    reasonCountPolicy: "One count per affected ticket per reason. Reasons and ticket states may overlap; counts are not resource units or training eligibility." };
}
