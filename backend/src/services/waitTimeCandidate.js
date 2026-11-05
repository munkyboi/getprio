const { createHash } = require("crypto");
const { predictWaitTime } = require("./waitTimePredictor");

const CANDIDATE_VERSION = "queue-pace-median-v1";
const TARGET = "observation-to-call-minutes";

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function supportsCandidate(features) {
  return candidateContextExclusion(features) === null;
}

function candidateContextExclusion(features) {
  if (features.priorityBand !== "normal") return "unsupported_priority_band";
  if (features.queuePaused) return "queue_paused";
  if (!(features.position > 0)) return "nonpositive_position";
  return null;
}

// The fitter and coverage report use the same selection. Inputs are validated
// by the offline dataset reader; holdout labels never enter training statistics.
function collectTrainingScopes(samples, trainingCutoff, minimumTrainingTickets) {
  const cutoff = new Date(trainingCutoff).getTime();
  if (!Number.isFinite(cutoff) || !Number.isSafeInteger(minimumTrainingTickets) || minimumTrainingTickets < 1) {
    throw new Error("Invalid training cutoff or minimum ticket count.");
  }
  const scopes = new Map();
  for (const sample of samples) {
    if (!scopes.has(sample.scopeKey)) scopes.set(sample.scopeKey, {
      rates: [], observationDays: new Set(), historicalTickets: 0, overlappingTickets: 0,
      exclusionReasons: {}, firstEligibleObservation: null, latestEligibleObservation: null
    });
    const scope = scopes.get(sample.scopeKey);
    const observed = Date.parse(sample.sampledAt);
    if (observed >= cutoff) continue;
    if (Date.parse(sample.calledAt) >= cutoff) {
      scope.overlappingTickets += 1;
      continue;
    }
    scope.historicalTickets += 1;
    const rate = sample.actualWaitMinutes / sample.features.position;
    const reason = sample.scopeKey.endsWith(":unknown") ? "unknown_location"
      : candidateContextExclusion(sample.features) || ((!Number.isFinite(rate) || rate < 0) ? "invalid_queue_pace" : null);
    if (reason) {
      scope.exclusionReasons[reason] = (scope.exclusionReasons[reason] || 0) + 1;
      continue;
    }
    scope.rates.push(rate);
    scope.observationDays.add(new Date(observed).toISOString().slice(0, 10));
    scope.firstEligibleObservation = scope.firstEligibleObservation === null ? observed : Math.min(scope.firstEligibleObservation, observed);
    scope.latestEligibleObservation = scope.latestEligibleObservation === null ? observed : Math.max(scope.latestEligibleObservation, observed);
  }
  return scopes;
}

function describeTrainingCoverage(samples, trainingCutoff, minimumTrainingTickets = 30) {
  const scopes = collectTrainingScopes(samples, trainingCutoff, minimumTrainingTickets);
  return {
    reportVersion: "wait-time-training-coverage-v1",
    trainingCutoff: new Date(trainingCutoff).toISOString(),
    minimumTrainingTickets,
    scopes: [...scopes].map(([scopeKey, scope]) => ({
      scopeKey,
      historicalTickets: scope.historicalTickets,
      excludedOverlappingTickets: scope.overlappingTickets,
      eligibleTrainingTickets: scope.rates.length,
      excludedHistoricalTickets: scope.historicalTickets - scope.rates.length,
      exclusionReasons: scope.exclusionReasons,
      additionalEligibleTicketsToThreshold: Math.max(0, minimumTrainingTickets - scope.rates.length),
      trainingSampleThresholdMet: scope.rates.length >= minimumTrainingTickets,
      eligibleObservationDaysUtc: scope.observationDays.size,
      firstEligibleObservationAt: scope.firstEligibleObservation === null ? null : new Date(scope.firstEligibleObservation).toISOString(),
      latestEligibleObservationAt: scope.latestEligibleObservation === null ? null : new Date(scope.latestEligibleObservation).toISOString()
    })),
    rolloutApproved: false,
    note: "Training sample coverage only. Counts and days use eligible history strictly before the fixed cutoff. Threshold attainment does not establish representative operations, accuracy, uncertainty calibration, or rollout approval."
  };
}

// Fit only labels available strictly before the fixed cutoff.
function fitWaitTimeCandidate(samples, trainingCutoff, minimumTrainingTickets = 30) {
  const scopes = collectTrainingScopes(samples, trainingCutoff, minimumTrainingTickets);
  return {
    predictorVersion: CANDIDATE_VERSION,
    target: TARGET,
    trainingCutoff: new Date(trainingCutoff).toISOString(),
    minimumTrainingTickets,
    scopeRates: [...scopes].filter(([, scope]) => scope.rates.length >= minimumTrainingTickets)
      .map(([scopeKey, scope]) => ({ scopeKey, minutesPerPosition: median(scope.rates), trainingTickets: scope.rates.length }))
  };
}

// Standalone interface for offline evaluation. Live callers still exclusively use
// waitTimePredictor.js; no model artifact is loaded by the API in this slice.
function predictWaitTimeWithFallback(input, model, scopeKey) {
  const baseline = predictWaitTime(input);
  const fallback = (reason) => ({ prediction: baseline, usedFallback: true, fallbackReason: reason });
  if (typeof scopeKey !== "string" || scopeKey.endsWith(":unknown")) return fallback("unsupported_scope");
  if (!model || model.predictorVersion !== CANDIDATE_VERSION || model.target !== TARGET || !Array.isArray(model.scopeRates)) {
    return fallback("missing_or_incompatible_model");
  }
  const cutoff = Date.parse(model.trainingCutoff);
  if (!Number.isFinite(cutoff) || !Number.isFinite(baseline.observedAt.getTime()) || baseline.observedAt.getTime() < cutoff) return fallback("model_not_available_at_observation");
  if (!supportsCandidate(baseline.features)) return fallback("unsupported_queue_context");
  const scope = model.scopeRates.find((entry) => entry && entry.scopeKey === scopeKey);
  if (!scope) return fallback("insufficient_scope_history");
  if (!Number.isSafeInteger(model.minimumTrainingTickets) || model.minimumTrainingTickets < 1 ||
      !Number.isSafeInteger(scope.trainingTickets) || scope.trainingTickets < model.minimumTrainingTickets ||
      typeof scope.minutesPerPosition !== "number" || !Number.isFinite(scope.minutesPerPosition) || scope.minutesPerPosition < 0) {
    return fallback("invalid_model_parameters");
  }
  const estimate = baseline.features.position * scope.minutesPerPosition;
  if (!Number.isFinite(estimate) || estimate < 0) return fallback("invalid_candidate_prediction");
  const features = { ...baseline.features, learnedMinutesPerPosition: scope.minutesPerPosition };
  return {
    prediction: {
      ...baseline, estimatedWaitMinutes: estimate, predictorVersion: CANDIDATE_VERSION, features,
      featureHash: createHash("sha256").update(JSON.stringify(features)).digest("hex")
    },
    usedFallback: false,
    fallbackReason: null
  };
}

module.exports = { CANDIDATE_VERSION, TARGET, fitWaitTimeCandidate, describeTrainingCoverage, predictWaitTimeWithFallback };
