import { metrics } from "./wait-time-metrics.mjs";
import { isResourceShadowFallbackReason } from "./resource-shadow-evaluation.mjs";

export const DATASET_VERSION = "resource-shadow-refresh-dataset-v2";
const PREDICTOR = "resource-service-start-shadow-v1";
const DROPS = new Set(["work_budget", "window_budget", "throttled", "capture_unavailable"]);
const FIELDS = ["observationKey", "workKey", "scopeKey", "poolKey", "channel", "predictorVersion", "attemptSequence", "kind",
  "disposition", "reason", "attemptedAt", "observedAt", "forecastedAt", "acceptedAt", "predictedServiceStartAt", "queueRevision",
  "snapshotObservedAt", "delivery", "outcome"];
function invalid() { throw new Error("Invalid private resource refresh evaluation dataset."); }
function shape(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length
      || keys.some(key => !Object.hasOwn(value, key))) invalid();
}
function time(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) invalid();
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z")) invalid();
  return ms;
}
function integer(value, low, high) { if (!Number.isSafeInteger(value) || value < low || value > high) invalid(); }
function outcome(value, asOf) {
  shape(value, ["state", "at"]);
  if (value.state === "pending") { if (value.at !== null) invalid(); }
  else if (!["started", "censored"].includes(value.state) || time(value.at) > asOf) invalid();
}
function delivery(row, asOf) {
  shape(row.delivery, ["state", "at"]);
  if (row.disposition !== "accepted") {
    if (row.delivery.state !== "not_delivered" || row.delivery.at !== null) invalid();
    return;
  }
  if (row.delivery.state === "delivered") {
    const at = time(row.delivery.at);
    if (at < time(row.acceptedAt) || at > asOf) invalid();
  } else if (!["private", "not_delivered", "unknown"].includes(row.delivery.state) || row.delivery.at !== null) invalid();
}
function forecast(row, asOf) {
  if (row.forecastedAt === null) {
    if (row.predictedServiceStartAt !== null || row.acceptedAt !== null || row.disposition === "accepted") invalid();
    return;
  }
  const at = time(row.forecastedAt), predicted = time(row.predictedServiceStartAt);
  if (row.observedAt === null || at < time(row.observedAt) || at > asOf || predicted < at || predicted - at > 480 * 60000) invalid();
  if (row.disposition === "accepted") {
    const accepted = time(row.acceptedAt);
    if (accepted < at || accepted > asOf) invalid();
  } else if (row.acceptedAt !== null) invalid();
}
function validateRow(row, bounds) {
  shape(row, FIELDS);
  for (const name of ["observationKey", "workKey", "scopeKey", "poolKey"]) if (typeof row[name] !== "string" || !/^[a-f0-9]{64}$/u.test(row[name])) invalid();
  integer(row.attemptSequence, 1, 1000000000);
  if (!["vendor", "qr", "online"].includes(row.channel) || row.predictorVersion !== PREDICTOR
      || !["initial", "refresh"].includes(row.kind) || (row.kind === "initial") !== (row.attemptSequence === 1)) invalid();
  const attempted = time(row.attemptedAt);
  if (attempted < bounds.from || attempted >= bounds.to) invalid();
  if (!["accepted", "fallback", "dropped"].includes(row.disposition)) invalid();
  if (row.disposition === "dropped") {
    if (!DROPS.has(row.reason) || [row.observedAt, row.forecastedAt, row.acceptedAt, row.predictedServiceStartAt, row.snapshotObservedAt, row.queueRevision].some(value => value !== null)) invalid();
  } else {
    if (time(row.observedAt) < attempted || time(row.observedAt) > bounds.asOf) invalid();
    if (row.disposition === "accepted" ? row.reason !== null : !isResourceShadowFallbackReason(row.reason)) invalid();
  }
  if (row.queueRevision !== null && (typeof row.queueRevision !== "string" || !/^(?:0|[1-9]\d{0,18})$/u.test(row.queueRevision)
      || BigInt(row.queueRevision) > 9223372036854775807n)) invalid();
  if (row.snapshotObservedAt !== null) {
    const snapshot = time(row.snapshotObservedAt);
    if (snapshot > bounds.asOf || (row.forecastedAt !== null && snapshot > time(row.forecastedAt))) invalid();
  }
  forecast(row, bounds.asOf); delivery(row, bounds.asOf); outcome(row.outcome, bounds.asOf);
}
function group(row) {
  return { scopeKey: row.scopeKey, poolKey: row.poolKey, channel: row.channel, kind: row.kind,
    attempts: 0, accepted: 0, fallback: 0, dropped: 0, reasons: {}, unknownRevisionAdmittedAttempts: 0,
    started: 0, pending: 0, censored: 0, unacceptedForecasts: 0, startsBeforeAcceptance: 0,
    delivered: 0, private: 0, notDelivered: 0, unknownDelivery: 0, staleDeliveries: 0,
    unknownSnapshotAgeDeliveries: 0, startsBeforeDelivery: 0, errors: [], deliveredErrors: [], timelyErrors: [], snapshotDeliveryAges: [], acceptanceDeliveryAges: [] };
}
function appendDelivery(result, row, maximumAgeMs) {
  const state = row.delivery.state;
  if (state !== "delivered") { result[{ private: "private", not_delivered: "notDelivered", unknown: "unknownDelivery" }[state]]++; return; }
  result.delivered++;
  const at = time(row.delivery.at);
  result.acceptanceDeliveryAges.push(at - time(row.acceptedAt));
  if (row.snapshotObservedAt !== null) result.snapshotDeliveryAges.push(at - time(row.snapshotObservedAt));
  const unknownAge = row.snapshotObservedAt === null;
  const stale = !unknownAge && at - time(row.snapshotObservedAt) > maximumAgeMs;
  if (unknownAge) result.unknownSnapshotAgeDeliveries++;
  if (stale) result.staleDeliveries++;
  if (row.outcome.state !== "started") return;
  if (time(row.outcome.at) < at) { result.startsBeforeDelivery++; return; }
  const error = (time(row.outcome.at) - time(row.predictedServiceStartAt)) / 60000;
  result.deliveredErrors.push(error);
  if (!unknownAge && !stale) result.timelyErrors.push(error);
}
function append(result, row, maximumAgeMs) {
  result.attempts++; result[row.disposition]++; result[row.outcome.state]++;
  if (row.reason !== null) result.reasons[row.reason] = (result.reasons[row.reason] || 0) + 1;
  if (row.disposition !== "dropped" && row.queueRevision === null) result.unknownRevisionAdmittedAttempts++;
  if (row.disposition !== "accepted") {
    if (row.forecastedAt !== null) result.unacceptedForecasts++;
    return;
  }
  appendDelivery(result, row, maximumAgeMs);
  if (row.outcome.state !== "started") return;
  if (time(row.outcome.at) < time(row.acceptedAt)) { result.startsBeforeAcceptance++; return; }
  result.errors.push((time(row.outcome.at) - time(row.predictedServiceStartAt)) / 60000);
}
function ages(values) {
  if (!values.length) return { samples: 0, meanMs: null, maximumMs: null, p95Ms: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: values.length, meanMs: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    maximumMs: sorted.at(-1), p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}
function accuracy(errors) {
  const { tickets, ...values } = metrics(errors);
  return { attempts: tickets, ...values };
}
function describe(result) {
  const { errors, deliveredErrors, timelyErrors, snapshotDeliveryAges, acceptanceDeliveryAges, ...counts } = result;
  return { ...counts, acceptedAttemptCoveragePercent: Math.round(10000 * result.accepted / result.attempts) / 100,
    scoredAcceptedStarts: errors.length, acceptedAccuracy: accuracy(errors),
    scoredDeliveredBeforeStart: deliveredErrors.length, deliveredBeforeStartAccuracy: accuracy(deliveredErrors),
    scoredTimelyDeliveredStarts: timelyErrors.length, timelyDeliveredAccuracy: accuracy(timelyErrors),
    snapshotToDeliveryAge: ages(snapshotDeliveryAges), acceptanceToDeliveryAge: ages(acceptanceDeliveryAges) };
}
function checkWork(rows) {
  rows.sort((a, b) => a.attemptSequence - b.attemptSequence);
  let gaps = 0;
  const first = rows[0];
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1], row = rows[index];
    if (row.attemptSequence === previous.attemptSequence || time(row.attemptedAt) < time(previous.attemptedAt)
        || row.poolKey !== first.poolKey || row.channel !== first.channel || (row.outcome.state !== first.outcome.state || (row.outcome.at === null ? null : time(row.outcome.at)) !== (first.outcome.at === null ? null : time(first.outcome.at)))) invalid();
    gaps += row.attemptSequence - previous.attemptSequence - 1;
  }
  return { gaps, lacksInitialInWindow: first.kind !== "initial", admitted: rows.filter(row => row.disposition !== "dropped").length };
}

// Declared offline diagnostics only. No capture, exporter, producer or promotion.
export function evaluateResourceRefreshes(dataset) {
  shape(dataset, ["datasetVersion", "provenance", "from", "to", "outcomesAsOf", "budgets", "attempts"]);
  shape(dataset.budgets, ["maximumAdmittedPerWork", "maximumAdmittedPerWindow", "maximumDeliveryAgeMs"]);
  integer(dataset.budgets.maximumAdmittedPerWork, 1, 10000);
  integer(dataset.budgets.maximumAdmittedPerWindow, 1, 10000);
  integer(dataset.budgets.maximumDeliveryAgeMs, 1, 480 * 60000);
  if (dataset.datasetVersion !== DATASET_VERSION || !["synthetic", "unverified-operational-data"].includes(dataset.provenance)
      || !Array.isArray(dataset.attempts) || dataset.attempts.length > 10000) invalid();
  const bounds = { from: time(dataset.from), to: time(dataset.to), asOf: time(dataset.outcomesAsOf) };
  if (bounds.from >= bounds.to || bounds.asOf < bounds.to) invalid();
  const seen = new Set(), work = new Map(), groups = new Map();
  for (const row of dataset.attempts) {
    validateRow(row, bounds);
    if (seen.has(row.observationKey)) invalid(); seen.add(row.observationKey);
    const workKey = `${row.scopeKey}:${row.workKey}`;
    if (!work.has(workKey)) work.set(workKey, []); work.get(workKey).push(row);
    const groupKey = `${row.scopeKey}:${row.poolKey}:${row.channel}:${row.kind}`;
    if (!groups.has(groupKey)) { if (groups.size >= 1000) invalid(); groups.set(groupKey, group(row)); }
    append(groups.get(groupKey), row, dataset.budgets.maximumDeliveryAgeMs);
  }
  const coverage = [...work.values()].map(checkWork);
  const admitted = coverage.reduce((sum, value) => sum + value.admitted, 0);
  return { reportVersion: "resource-refresh-evaluation-v2", predictorVersion: PREDICTOR, target: "time_to_actual_service_start", provenance: dataset.provenance,
    from: dataset.from, to: dataset.to, outcomesAsOf: dataset.outcomesAsOf, declaredBudgets: { ...dataset.budgets },
    inputAttempts: dataset.attempts.length, distinctWork: work.size,
    workWithoutInitialInWindow: coverage.filter(row => row.lacksInitialInWindow).length,
    unrecordedSequenceSlotsWithinWindow: coverage.reduce((sum, row) => sum + row.gaps, 0),
    workOverDeclaredAdmissionBudget: coverage.filter(row => row.admitted > dataset.budgets.maximumAdmittedPerWork).length,
    windowOverDeclaredAdmissionBudget: admitted > dataset.budgets.maximumAdmittedPerWindow,
    groups: [...groups.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([, value]) => describe(value)),
    customerEstimateChanged: false, rolloutApproved: false, productionPerformanceEstablished: false, uncertaintyCalibrated: false,
    captureCoverageVerified: false, deliveryVerified: false, privacyApprovalEstablished: false,
    note: "Declared attempts only. Initial and refresh metrics are separate; repeated refreshes are not independent work. Dropped/fallback attempts stay in support; unaccepted and pre-acceptance forecasts never score. Delivered accuracy and known-age timely delivery are separate. Keys, labels, revisions, budgets and delivery are declarations, not verified operational evidence." };
}
