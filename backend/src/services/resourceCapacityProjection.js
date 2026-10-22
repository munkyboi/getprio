// Pure reservation projection. This is not an allocation or live wait predictor.
function buildSegments(pool, reservations, from, to) {
  const changes = new Map([[from, 0], [to, 0]]);
  for (const item of reservations) {
    if (item.pool_id !== pool.id || item.expired_pending) continue;
    const start = Math.max(from, new Date(item.starts_at).getTime());
    const end = Math.min(to, new Date(item.ends_at).getTime());
    if (end <= start) continue;
    changes.set(start, (changes.get(start) || 0) + item.units_required);
    changes.set(end, (changes.get(end) || 0) - item.units_required);
  }
  const points = [...changes.keys()].sort((a, b) => a - b);
  let demand = 0;
  return points.slice(0, -1).map((point, index) => {
    demand += changes.get(point);
    return { start: point, end: points[index + 1], demand };
  });
}

function earliestScheduleStart(segments, capacity, units, duration, from, to) {
  if (units > capacity) return null;
  let candidate = from;
  for (const segment of segments) {
    if (segment.end <= candidate) continue;
    if (segment.start >= candidate + duration) break;
    if (segment.demand + units > capacity) candidate = segment.end;
  }
  return candidate + duration <= to ? new Date(candidate).toISOString() : null;
}

function projectReservationCapacity({ pools, requirements, reservations, from, to, candidate }) {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Invalid projection window.");
  const mappedServices = new Set(requirements.map((item) => item.service_id));
  const unmappedReservationItems = reservations.filter((item) => !item.expired_pending && !mappedServices.has(item.service_id)).length;
  const invalidReservationItems = reservations.filter((item) =>
    !item.expired_pending && !(new Date(item.ends_at).getTime() > new Date(item.starts_at).getTime())
  ).length;
  const invalidRequirements = requirements.filter((item) => {
    const pool = pools.find((entry) => entry.id === item.pool_id);
    return !pool || item.units_required > pool.capacity;
  }).map((item) => ({ serviceId: item.service_id, poolId: item.pool_id, unitsRequired: item.units_required }));
  const incomplete = unmappedReservationItems > 0 || invalidReservationItems > 0 || invalidRequirements.length > 0;
  const poolReports = pools.map((pool) => {
    const segments = buildSegments(pool, reservations, start, end);
    return {
      poolId: pool.id,
      name: pool.name,
      capacity: pool.capacity,
      trackingEnabled: pool.tracking_enabled,
      peakReservedUnits: Math.max(0, ...segments.map((segment) => segment.demand)),
      conflicts: segments.filter((segment) => segment.demand > pool.capacity).map((segment) => ({
        startsAt: new Date(segment.start).toISOString(), endsAt: new Date(segment.end).toISOString(),
        reservedUnits: segment.demand
      })),
      ...(!incomplete && candidate?.pool_id === pool.id ? {
        candidateScheduleStart: earliestScheduleStart(segments, pool.capacity, candidate.units_required,
          candidate.durationMinutes * 60000, start, end)
      } : {})
    };
  });
  return {
    pools: poolReports,
    unmappedReservationItems,
    invalidReservationItems,
    expiredPendingItems: reservations.filter((item) => item.expired_pending).length,
    invalidRequirements
  };
}

module.exports = { projectReservationCapacity };
