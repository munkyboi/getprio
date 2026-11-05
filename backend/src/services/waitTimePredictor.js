const { createHash } = require("crypto");

const PREDICTOR_VERSION = "baseline-v1";
const SAMPLE_BUCKET_MILLISECONDS = 5 * 60 * 1000;

function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function predictWaitTime(input) {
  const observedAt = input.observedAt instanceof Date ? input.observedAt : new Date();
  const currentTicketElapsedMinutes = input.currentTicketCalledAt
    ? nonNegativeNumber(
        (observedAt.getTime() - new Date(input.currentTicketCalledAt).getTime()) / 60000
      )
    : 0;
  const features = {
    position: Math.trunc(nonNegativeNumber(input.position)),
    waitingCount: Math.trunc(nonNegativeNumber(input.waitingCount)),
    averageServiceMinutes: nonNegativeNumber(input.averageServiceMinutes),
    priorityBand: ["normal", "checked_in_booking", "recovery", "carry_over"].includes(
      input.priorityBand
    ) ? input.priorityBand : "normal",
    currentTicketElapsedMinutes: Math.round(currentTicketElapsedMinutes),
    queuePaused: Boolean(input.queuePaused)
  };
  // Version this additive context independently: baseline-v1's calculation is
  // unchanged, and future rollout can distinguish samples with schedule input.
  if (input.serviceTimeContext) {
    features.serviceTimeContext = input.serviceTimeContext;
  }
  const estimate = features.position * features.averageServiceMinutes;
  const sampleBucket = new Date(
    Math.floor(observedAt.getTime() / SAMPLE_BUCKET_MILLISECONDS) * SAMPLE_BUCKET_MILLISECONDS
  );
  const featureHash = createHash("sha256").update(JSON.stringify(features)).digest("hex");

  return {
    estimatedWaitMinutes: Number.isFinite(estimate) ? estimate : 0,
    predictorVersion: PREDICTOR_VERSION,
    features,
    featureHash,
    observedAt,
    sampleBucket
  };
}

module.exports = {
  PREDICTOR_VERSION,
  predictWaitTime
};
