import { metrics } from "./wait-time-metrics.mjs";

export const DATASET_VERSION = "resource-shadow-evaluation-dataset-v1";
const PREDICTOR = "resource-service-start-shadow-v1";
const REASONS = new Set(["shadow_disabled", "invalid_target_reference", "snapshot_provider_busy", "snapshot_provider_timeout",
  "invalid_resource_snapshot", "snapshot_expired_before_acceptance", "snapshot_provider_error", "runtime_not_ready",
  "invalid_resource_consumer_configuration", "unsupported_resource_contract", "resource_scope_mismatch",
  "stale_resource_snapshot", "incomplete_resource_horizon", "resource_reservation_conflict", "projection_budget_exceeded",
  "target_not_waiting", "projection_inventory_limit", "called_service_start_unknown", "occupancy_completion_unknown",
  "overdue_occupancy", "no_start_within_horizon", "reservation_window_unusable", "forecast_capacity_conflict", "resource_projection_error"]);

function invalid() { throw new Error("Invalid resource service-start evaluation dataset."); }
function shape(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
}
function time(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) invalid();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z")) invalid();
  return parsed;
}
function key(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) invalid();
}
function validateObservation(row, bounds) {
  shape(row, ["observationKey", "workKey", "scopeKey", "poolKey", "channel", "predictorVersion", "observedAt",
    "forecastedAt", "acceptedAt", "predictedServiceStartAt", "fallbackReason", "outcome"]);
  for (const name of ["observationKey", "workKey", "scopeKey", "poolKey"]) key(row[name]);
  const observed = time(row.observedAt);
  if (observed < bounds.from || observed >= bounds.to || row.predictorVersion !== PREDICTOR
      || !["vendor", "qr", "online"].includes(row.channel)) invalid();
  if (row.fallbackReason !== null) {
    if (!REASONS.has(row.fallbackReason) || row.forecastedAt !== null || row.acceptedAt !== null
        || row.predictedServiceStartAt !== null) invalid();
  } else {
    const forecasted = time(row.forecastedAt);
    const accepted = time(row.acceptedAt);
    const predicted = time(row.predictedServiceStartAt);
    if (forecasted < observed || accepted < forecasted || accepted > bounds.asOf
        || predicted < forecasted || predicted - forecasted > 480 * 60000) invalid();
  }
  shape(row.outcome, ["state", "at"]);
  if (row.outcome.state === "pending") {
    if (row.outcome.at !== null) invalid();
  } else {
    if (!["started", "censored"].includes(row.outcome.state)) invalid();
    const outcome = time(row.outcome.at);
    if (outcome < observed || outcome > bounds.asOf) invalid();
  }
}

function outcomeKey(outcome) {
  return `${outcome.state}:${outcome.at === null ? "pending" : time(outcome.at)}`;
}

function emptyGroup(row) {
  return { scopeKey: row.scopeKey, poolKey: row.poolKey, channel: row.channel, predictorVersion: PREDICTOR,
    selectedWork: 0, successfulForecasts: 0, fallbackWork: 0, startedWork: 0, censoredWork: 0,
    pendingWork: 0, excludedStartsBeforeAcceptance: 0, fallbackReasons: {}, errors: [] };
}
function append(group, row) {
  group.selectedWork++;
  if (row.fallbackReason !== null) {
    group.fallbackWork++;
    group.fallbackReasons[row.fallbackReason] = (group.fallbackReasons[row.fallbackReason] || 0) + 1;
  } else group.successfulForecasts++;
  if (row.outcome.state === "pending") { group.pendingWork++; return; }
  if (row.outcome.state === "censored") { group.censoredWork++; return; }
  group.startedWork++;
  if (row.fallbackReason !== null) return;
  if (time(row.outcome.at) < time(row.acceptedAt)) { group.excludedStartsBeforeAcceptance++; return; }
  group.errors.push((time(row.outcome.at) - time(row.predictedServiceStartAt)) / 60000);
}
function describe(group) {
  const { errors, ...counts } = group;
  return { ...counts, successfulForecastCoveragePercent: Math.round(10000 * group.successfulForecasts / group.selectedWork) / 100,
    scoredStartedWork: errors.length, serviceStartAccuracy: metrics(errors) };
}

// Offline declared data only. No DB reader, training, inference or promotion.
export function evaluateResourceServiceStarts(dataset) {
  shape(dataset, ["datasetVersion", "provenance", "from", "to", "outcomesAsOf", "observations"]);
  if (dataset.datasetVersion !== DATASET_VERSION || !["synthetic", "unverified-operational-data"].includes(dataset.provenance)
      || !Array.isArray(dataset.observations) || dataset.observations.length > 10000) invalid();
  const bounds = { from: time(dataset.from), to: time(dataset.to), asOf: time(dataset.outcomesAsOf) };
  if (bounds.from >= bounds.to || bounds.asOf < bounds.to) invalid();
  const seen = new Set();
  const selected = new Map();
  for (const row of dataset.observations) {
    validateObservation(row, bounds);
    if (seen.has(row.observationKey)) invalid();
    seen.add(row.observationKey);
    const identity = `${row.scopeKey}:${row.workKey}`;
    const previous = selected.get(identity);
    if (previous) {
      if (outcomeKey(previous.outcome) !== outcomeKey(row.outcome)) invalid();
      if (time(previous.observedAt) < time(row.observedAt)
          || (time(previous.observedAt) === time(row.observedAt) && previous.observationKey < row.observationKey)) continue;
    }
    selected.set(identity, row);
  }
  const groups = new Map();
  for (const row of selected.values()) {
    const groupKey = `${row.scopeKey}:${row.poolKey}:${row.channel}`;
    if (!groups.has(groupKey)) {
      if (groups.size >= 1000) invalid();
      groups.set(groupKey, emptyGroup(row));
    }
    append(groups.get(groupKey), row);
  }
  return { reportVersion: "resource-service-start-evaluation-v1", target: "time_to_actual_service_start",
    provenance: dataset.provenance, from: dataset.from, to: dataset.to, outcomesAsOf: dataset.outcomesAsOf,
    inputObservations: dataset.observations.length, distinctWork: selected.size,
    excludedRepeatedObservations: dataset.observations.length - selected.size,
    observationPolicy: "Earliest attempt per scope/work; timestamp ties use ordinal observation key. Fallbacks remain in coverage.",
    errorConvention: "Actual service start minus predicted service start in minutes; positive means the estimate was early.",
    groups: [...groups.entries()].sort(([left], [right]) => left < right ? -1 : 1).map(([, group]) => describe(group)),
    customerEstimateChanged: false, rolloutApproved: false, productionPerformanceEstablished: false,
    uncertaintyCalibrated: false,
    note: "Declared offline diagnostics only. Score accepted forecasts against explicit service starts, never calls. Pending, censored, fallback and pre-acceptance starts are excluded from accuracy. No baseline substitution or synthetic-to-production claim." };
}
