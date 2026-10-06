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
  return features.priorityBand === "normal" && !features.queuePaused && features.position > 0;
}

// Inputs are validated by the offline dataset reader. Fit only labels available
// strictly before the fixed cutoff; later outcomes cannot influence this model.
function fitWaitTimeCandidate(samples, trainingCutoff, minimumTrainingTickets = 30) {
  const cutoff = new Date(trainingCutoff).getTime();
  if (!Number.isFinite(cutoff) || !Number.isSafeInteger(minimumTrainingTickets) || minimumTrainingTickets < 1) {
    throw new Error("Invalid training cutoff or minimum ticket count.");
  }
  const scopes = new Map();
  for (const sample of samples) {
    if (sample.scopeKey.endsWith(":unknown") || Date.parse(sample.sampledAt) >= cutoff || Date.parse(sample.calledAt) >= cutoff || !supportsCandidate(sample.features)) continue;
    const rate = sample.actualWaitMinutes / sample.features.position;
    if (!Number.isFinite(rate) || rate < 0) continue;
    if (!scopes.has(sample.scopeKey)) scopes.set(sample.scopeKey, []);
    scopes.get(sample.scopeKey).push(rate);
  }
  return {
    predictorVersion: CANDIDATE_VERSION,
    target: TARGET,
    trainingCutoff: new Date(cutoff).toISOString(),
    minimumTrainingTickets,
    scopeRates: [...scopes].filter(([, rates]) => rates.length >= minimumTrainingTickets)
      .map(([scopeKey, rates]) => ({ scopeKey, minutesPerPosition: median(rates), trainingTickets: rates.length }))
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

module.exports = { CANDIDATE_VERSION, TARGET, fitWaitTimeCandidate, predictWaitTimeWithFallback };
