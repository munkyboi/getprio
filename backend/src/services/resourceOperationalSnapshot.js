// Internal consumer contract only. No producer, DB access or live inference hook.
const { TextDecoder } = require("node:util");
const CONTRACT_VERSION = "resource-operational-snapshot-v1";
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const NOT_READY_REASONS = new Set(["ledger_unavailable", "tracking_disabled", "writer_coverage_incomplete",
  "inventory_incomplete", "unknown_plan", "stale_plan", "unsupported_composition", "scope_unsupported",
  "reservation_conflict", "snapshot_inconsistent"]);

function invalid() { throw new Error("invalid_resource_snapshot"); }
function shape(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
}
function id(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/u.test(value) || BigInt(value) > 9223372036854775807n) invalid();
}
function ref(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 160) invalid();
}
function optionalRef(value) { if (value !== null) ref(value); }
function units(value) { if (!Number.isInteger(value) || value < 1 || value > 100) invalid(); }
function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) invalid();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z")) invalid();
  return time;
}
function optionalTimestamp(value) { return value === null ? null : timestamp(value); }
function validateScope(scope) {
  shape(scope, ["tenantId", "locationId", "queueKind", "sourceBinding"]);
  id(scope.tenantId); id(scope.locationId); ref(scope.sourceBinding);
  if (scope.queueKind !== "location") invalid();
}
function index(entries, key, maximum, validate) {
  if (!Array.isArray(entries) || entries.length > maximum) invalid();
  const result = new Map();
  for (const entry of entries) {
    validate(entry);
    if (result.has(entry[key])) invalid();
    result.set(entry[key], entry);
  }
  return result;
}
function pool(entry) {
  shape(entry, ["poolId", "capacity", "revision"]);
  id(entry.poolId); id(entry.revision); units(entry.capacity);
}
function demand(entry, pools) {
  id(entry.poolId); units(entry.units);
  if (!pools.has(entry.poolId) || entry.units > pools.get(entry.poolId).capacity) invalid();
}
function reservation(entry, pools) {
  shape(entry, ["reservationRef", "bookingItemRef", "poolId", "units", "startsAt", "endsAt", "state"]);
  ref(entry.reservationRef); ref(entry.bookingItemRef); demand(entry, pools);
  if (entry.state !== "protected" || timestamp(entry.startsAt) >= timestamp(entry.endsAt)) invalid();
}
function allocation(entry, pools, observedAt) {
  shape(entry, ["allocationRef", "sessionRef", "workRef", "poolId", "units", "startedAt", "expectedEndAt", "reservationRef", "state"]);
  ref(entry.allocationRef); ref(entry.sessionRef); ref(entry.workRef); optionalRef(entry.reservationRef);
  demand(entry, pools);
  const start = timestamp(entry.startedAt);
  const end = optionalTimestamp(entry.expectedEndAt);
  if (start > observedAt || (end !== null && end <= start) || !["active", "unresolved"].includes(entry.state)) invalid();
}
function duration(value) {
  if (!Number.isInteger(value) || value < 5 || value > 480) invalid();
}
function work(entry, pools, observedAt) {
  shape(entry, ["workRef", "state", "orderKey", "priorityBand", "stationArrivedAt", "earliestCallAt", "planRevision",
    "executionMode", "poolId", "units", "durationMinutes", "reservationRef"]);
  ref(entry.workRef); ref(entry.orderKey); id(entry.planRevision); optionalRef(entry.reservationRef);
  demand(entry, pools); optionalTimestamp(entry.earliestCallAt); duration(entry.durationMinutes);
  if (!["waiting", "called", "in_service"].includes(entry.state) || entry.executionMode !== "single"
      || !["normal", "checked_in_booking", "recovery", "carry_over"].includes(entry.priorityBand)
      || timestamp(entry.stationArrivedAt) > observedAt) invalid();
}
function unique(entries, field) {
  const values = entries.map(entry => entry[field]);
  if (new Set(values).size !== values.length) invalid();
}
function validateAllocationLink(entry, works, reservations, converted) {
  const item = works.get(entry.workRef);
  if (!item || item.state !== "in_service" || item.poolId !== entry.poolId || item.units !== entry.units
      || item.reservationRef !== entry.reservationRef) invalid();
  if (entry.reservationRef === null) return;
  if (reservations.has(entry.reservationRef) || converted.has(entry.reservationRef)) invalid();
  converted.add(entry.reservationRef);
}
function allocationLinks(allocations, works, reservations, pools) {
  unique([...allocations.values()], "sessionRef");
  unique([...allocations.values()], "workRef");
  const used = new Map();
  const converted = new Set();
  for (const entry of allocations.values()) {
    validateAllocationLink(entry, works, reservations, converted);
    used.set(entry.poolId, (used.get(entry.poolId) || 0) + entry.units);
  }
  if ([...used].some(([poolId, count]) => count > pools.get(poolId).capacity)) invalid();
}
function workLinks(works, allocations, reservations) {
  const active = new Set([...allocations.values()].map(entry => entry.workRef));
  const reserved = new Set();
  const pending = [...works.values()].filter(entry => entry.state !== "in_service");
  unique(pending, "orderKey");
  if (new Set(pending.map(entry => entry.orderKey.length)).size > 1) invalid();
  for (const entry of works.values()) {
    if ((entry.state === "in_service") !== active.has(entry.workRef)) invalid();
    if (entry.state === "in_service" || entry.reservationRef === null) continue;
    const binding = reservations.get(entry.reservationRef);
    if (!binding || binding.poolId !== entry.poolId || binding.units !== entry.units || reserved.has(entry.reservationRef)) invalid();
    reserved.add(entry.reservationRef);
  }
}
function reservationCapacity(reservations, pools) {
  const changes = new Map();
  for (const entry of reservations.values()) {
    const points = changes.get(entry.poolId) || new Map();
    for (const [instant, delta] of [[timestamp(entry.startsAt), entry.units], [timestamp(entry.endsAt), -entry.units]]) {
      points.set(instant, (points.get(instant) || 0) + delta);
    }
    changes.set(entry.poolId, points);
  }
  for (const [poolId, points] of changes) {
    let reserved = 0;
    for (const [, delta] of [...points].sort(([left], [right]) => left - right)) {
      reserved += delta;
      if (reserved > pools.get(poolId).capacity) throw new Error("resource_reservation_conflict");
    }
  }
}
function validateInventory(snapshot, observedAt) {
  const pools = index(snapshot.pools, "poolId", 100, pool);
  if (!pools.size) invalid();
  const reservations = index(snapshot.reservations, "reservationRef", 20000, entry => reservation(entry, pools));
  unique([...reservations.values()], "bookingItemRef");
  reservationCapacity(reservations, pools);
  const allocations = index(snapshot.allocations, "allocationRef", 10000, entry => allocation(entry, pools, observedAt));
  const works = index(snapshot.work, "workRef", 10000, entry => work(entry, pools, observedAt));
  allocationLinks(allocations, works, reservations, pools);
  workLinks(works, allocations, reservations);
}
function validateSnapshot(snapshot, options) {
  shape(snapshot, ["observedAt", "ledgerRevision", "configurationRevision", "window", "writerCoverageComplete",
    "inventoryComplete", "intakePaused", "pools", "allocations", "reservations", "work"]);
  id(snapshot.ledgerRevision); id(snapshot.configurationRevision);
  if (snapshot.writerCoverageComplete !== true || snapshot.inventoryComplete !== true || typeof snapshot.intakePaused !== "boolean") invalid();
  const observedAt = timestamp(snapshot.observedAt);
  if (observedAt > options.nowMs || options.nowMs - observedAt > options.maximumAgeMs) throw new Error("stale_resource_snapshot");
  shape(snapshot.window, ["from", "to"]);
  const from = timestamp(snapshot.window.from);
  const to = timestamp(snapshot.window.to);
  if (from > observedAt || to <= options.nowMs || to < options.forecastUntilMs) throw new Error("incomplete_resource_horizon");
  validateInventory(snapshot, observedAt);
  for (const entry of snapshot.reservations) {
    if (timestamp(entry.startsAt) >= to || timestamp(entry.endsAt) <= from) invalid();
  }
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function configuration(options) {
  try {
    validateScope(options.expectedScope);
    if (!Number.isSafeInteger(options.nowMs) || !Number.isSafeInteger(options.forecastUntilMs)
        || options.forecastUntilMs <= options.nowMs || !Number.isSafeInteger(options.maximumAgeMs)
        || options.maximumAgeMs < 1 || options.maximumAgeMs > 5000) invalid();
    return options;
  } catch { throw new Error("invalid_resource_consumer_configuration"); }
}

// Bytes must come from an authorized internal producer; shape validation is not
// proof of provenance, writer coverage or permission to publish a forecast.
function validateResourceOperationalSnapshot(bytes, suppliedOptions) {
  const options = configuration(suppliedOptions);
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_SNAPSHOT_BYTES) invalid();
  let envelope;
  try { envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)); } catch { invalid(); }
  shape(envelope, ["contractVersion", "scope", "readiness", "reasons", "snapshot"]);
  if (envelope.contractVersion !== CONTRACT_VERSION) throw new Error("unsupported_resource_contract");
  validateScope(envelope.scope);
  if (Object.keys(options.expectedScope).some(key => options.expectedScope[key] !== envelope.scope[key])) {
    throw new Error("resource_scope_mismatch");
  }
  if (!Array.isArray(envelope.reasons)) invalid();
  if (envelope.readiness === "not_ready") {
    if (envelope.snapshot !== null || !envelope.reasons.length || envelope.reasons.length > NOT_READY_REASONS.size
        || new Set(envelope.reasons).size !== envelope.reasons.length
        || envelope.reasons.some(reason => !NOT_READY_REASONS.has(reason))) invalid();
  } else {
    if (envelope.readiness !== "ready" || envelope.reasons.length) invalid();
    validateSnapshot(envelope.snapshot, options);
  }
  return freeze(envelope);
}

module.exports = { CONTRACT_VERSION, MAX_SNAPSHOT_BYTES, validateResourceOperationalSnapshot };
