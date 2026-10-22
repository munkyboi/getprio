const { validateResourceOperationalSnapshot } = require("./resourceOperationalSnapshot");

const PREDICTOR_VERSION = "resource-service-start-shadow-v1";
const TARGET = "time_to_actual_service_start";
const MAX_WORK = 250;
const MAX_RESERVATIONS = 500;
const MAX_ALLOCATIONS = 100;
const MAX_STEPS = 4096;
const MAX_OPERATIONS = 100000;
const SAFE_ERRORS = new Set(["invalid_resource_snapshot", "invalid_resource_consumer_configuration",
  "unsupported_resource_contract", "resource_scope_mismatch", "stale_resource_snapshot",
  "incomplete_resource_horizon", "resource_reservation_conflict", "projection_budget_exceeded"]);

function unavailable(reason) { throw new Error(reason); }
function tick(state) {
  state.operations++;
  if (state.operations > MAX_OPERATIONS) unavailable("projection_budget_exceeded");
}
function prepare(envelope, options, targetWorkRef) {
  if (envelope.readiness !== "ready") unavailable("runtime_not_ready");
  const snapshot = envelope.snapshot;
  const target = snapshot.work.find(entry => entry.workRef === targetWorkRef);
  if (!target || target.state !== "waiting") unavailable("target_not_waiting");
  const pool = snapshot.pools.find(entry => entry.poolId === target.poolId);
  const work = snapshot.work.filter(entry => entry.poolId === target.poolId && entry.state !== "in_service");
  const reservations = snapshot.reservations.filter(entry => entry.poolId === target.poolId);
  const allocations = snapshot.allocations.filter(entry => entry.poolId === target.poolId);
  if (work.length > MAX_WORK || reservations.length > MAX_RESERVATIONS || allocations.length > MAX_ALLOCATIONS) {
    unavailable("projection_inventory_limit");
  }
  if (work.some(entry => entry.state === "called")) unavailable("called_service_start_unknown");
  if (allocations.some(entry => entry.state === "unresolved" || entry.expectedEndAt === null)) {
    unavailable("occupancy_completion_unknown");
  }
  if (allocations.some(entry => Date.parse(entry.expectedEndAt) <= options.nowMs)) unavailable("overdue_occupancy");
  const bindings = new Map(reservations.map(entry => [entry.reservationRef, entry]));
  return { target, snapshot, capacity: pool.capacity, reservations, bindings,
    horizon: options.forecastUntilMs, now: options.nowMs, operations: 0, removed: new Set(),
    waiting: work.map(entry => ({ ...entry, readyAt: Math.max(options.nowMs,
      entry.earliestCallAt === null ? options.nowMs : Date.parse(entry.earliestCallAt),
      entry.reservationRef === null ? options.nowMs : Date.parse(bindings.get(entry.reservationRef).startsAt)) }))
      .sort((left, right) => left.orderKey < right.orderKey ? -1 : 1),
    occupied: allocations.map(entry => ({ start: options.nowMs, end: Date.parse(entry.expectedEndAt), units: entry.units })) };
}

function intervals(state, excludedReservation = null) {
  const result = [...state.occupied];
  for (const entry of state.reservations) {
    tick(state);
    if (state.removed.has(entry.reservationRef) || entry.reservationRef === excludedReservation) continue;
    result.push({ start: Date.parse(entry.startsAt), end: Date.parse(entry.endsAt), units: entry.units });
  }
  return result;
}
function fits(state, start, end, units, excludedReservation = null) {
  const changes = new Map([[start, units], [end, -units]]);
  for (const entry of intervals(state, excludedReservation)) {
    tick(state);
    const from = Math.max(start, entry.start);
    const to = Math.min(end, entry.end);
    if (from >= to) continue;
    changes.set(from, (changes.get(from) || 0) + entry.units);
    changes.set(to, (changes.get(to) || 0) - entry.units);
  }
  let demand = 0;
  for (const [, delta] of [...changes].sort(([left], [right]) => left - right)) {
    tick(state);
    demand += delta;
    if (demand > state.capacity) return false;
  }
  return true;
}
function advance(state) {
  let next = state.horizon;
  const consider = time => { if (time > state.now) next = Math.min(next, time); };
  for (const entry of state.waiting) { tick(state); consider(entry.readyAt); }
  for (const entry of state.occupied) { tick(state); consider(entry.end); }
  for (const entry of state.reservations) {
    tick(state);
    if (state.removed.has(entry.reservationRef)) continue;
    consider(Date.parse(entry.startsAt)); consider(Date.parse(entry.endsAt));
  }
  if (next >= state.horizon) unavailable("no_start_within_horizon");
  state.now = next;
  // Only the private forecast advances past expected completion. No ledger
  // allocation is released; overdue actual occupancy was rejected up front.
  state.occupied = state.occupied.filter(entry => entry.end > state.now);
}
function bookingWindow(state, entry, end) {
  if (entry.reservationRef === null) return;
  const binding = state.bindings.get(entry.reservationRef);
  if (end > Date.parse(binding.endsAt)) unavailable("reservation_window_unusable");
}
function simulate(state) {
  if (!fits(state, state.now, state.horizon, 0)) unavailable("forecast_capacity_conflict");
  for (let step = 0; step < MAX_STEPS; step++) {
    tick(state);
    const entry = state.waiting.find(item => item.readyAt <= state.now);
    if (!entry) { advance(state); continue; }
    const end = state.now + entry.durationMinutes * 60000;
    bookingWindow(state, entry, end);
    if (end <= state.horizon && fits(state, state.now, end, entry.units, entry.reservationRef)) {
      if (entry.workRef === state.target.workRef) return state.now;
      if (entry.reservationRef !== null) state.removed.add(entry.reservationRef);
      state.occupied.push({ start: state.now, end, units: entry.units });
      state.waiting = state.waiting.filter(item => item.workRef !== entry.workRef);
    } else {
      // Resource-blocked eligible head cannot be bypassed by a shorter job.
      // Visit readiness/reservation boundaries so a booking that becomes
      // eligible can participate according to its producer-assigned order.
      advance(state);
    }
  }
  unavailable("projection_budget_exceeded");
}

// Caller supplies bounded bytes from a trusted internal producer and clock.
// This function has no I/O, runtime callers, allocation writes or publication.
function predictResourceServiceStartShadow({ snapshotBytes, validation, targetWorkRef }) {
  const base = { predictorVersion: PREDICTOR_VERSION, target: TARGET, customerEstimateChanged: false,
    rolloutApproved: false, uncertaintyCalibrated: false };
  const fallback = reason => ({ ...base, usedFallback: true, fallbackReason: reason,
    predictedServiceStartAt: null, serviceStartWaitMinutes: null });
  try {
    if (typeof targetWorkRef !== "string" || !targetWorkRef.trim() || targetWorkRef.length > 160) {
      return fallback("invalid_target_reference");
    }
    const envelope = validateResourceOperationalSnapshot(snapshotBytes, validation);
    if (envelope.readiness !== "ready") return { ...fallback("runtime_not_ready"), producerReasons: envelope.reasons };
    const state = prepare(envelope, validation, targetWorkRef);
    const start = simulate(state);
    return { ...base, usedFallback: false, fallbackReason: null,
      predictedServiceStartAt: new Date(start).toISOString(), serviceStartWaitMinutes: (start - validation.nowMs) / 60000,
      forecastedAt: new Date(validation.nowMs).toISOString(), snapshotObservedAt: envelope.snapshot.observedAt,
      ledgerRevision: envelope.snapshot.ledgerRevision, configurationRevision: envelope.snapshot.configurationRevision,
      horizonEndsAt: new Date(validation.forecastUntilMs).toISOString(),
      assumption: "Expected completion is a private forecast, never an actual resource release. No future arrivals or service delays are inferred." };
  } catch (error) {
    const reasons = new Set(["target_not_waiting", "projection_inventory_limit", "called_service_start_unknown",
      "occupancy_completion_unknown", "overdue_occupancy", "no_start_within_horizon", "reservation_window_unusable", "forecast_capacity_conflict"]);
    return fallback(SAFE_ERRORS.has(error.message) || reasons.has(error.message) ? error.message : "resource_projection_error");
  }
}

module.exports = { PREDICTOR_VERSION, TARGET, predictResourceServiceStartShadow };
