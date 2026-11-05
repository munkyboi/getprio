const { performance } = require("perf_hooks");
const { predictWaitTime } = require("./waitTimePredictor");
const { predictWaitTimeWithFallback } = require("./waitTimeCandidate");
const { validShadowScope, validateShadowArtifact } = require("./waitTimeShadowArtifact");

const SAFE_ERRORS = new Set(["invalid_artifact", "artifact_digest_mismatch", "artifact_source_mismatch", "artifact_provider_timeout"]);

// Dependency boundary for future local/remote providers. No API caller uses this
// yet. Providers return bounded artifact bytes, not customer-facing predictions.
function createWaitTimeShadowInference({ enabled = false, source, allowedScopeKeys = [], expectedSha256,
  provider, timeoutMs = 100, minimumTrainingTickets = 30 }) {
  if (typeof enabled !== "boolean" || !["vendors", "developer-sandbox"].includes(source) ||
      !Array.isArray(allowedScopeKeys) || allowedScopeKeys.length > 10000 ||
      allowedScopeKeys.some((scopeKey) => !validShadowScope(source, scopeKey)) ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000 ||
      !Number.isSafeInteger(minimumTrainingTickets) || minimumTrainingTickets < 1 ||
      (enabled && (typeof provider !== "function" || typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256) || !allowedScopeKeys.length))) {
    throw new Error("Invalid private shadow inference configuration.");
  }
  const allowed = new Set(allowedScopeKeys);
  return async (input, scopeKey) => {
    // Freeze the observation and selected inputs before any asynchronous work.
    const observedAt = input.observedAt instanceof Date ? new Date(input.observedAt.getTime()) : new Date();
    const baseline = predictWaitTime({ ...input, observedAt });
    const finish = (shadow) => ({ prediction: baseline, shadow, customerEstimateChanged: false, rolloutApproved: false });
    const fallback = (reason, attempted = true, artifactSha256 = null) => finish({ attempted, usedFallback: true, fallbackReason: reason,
      estimatedWaitMinutes: null, predictorVersion: null, differenceFromBaselineMinutes: null, artifactSha256 });
    if (!enabled) return fallback("shadow_disabled", false);
    if (!validShadowScope(source, scopeKey) || !allowed.has(scopeKey)) return fallback("scope_not_allowed", false);
    if (!Number.isFinite(observedAt.getTime())) return fallback("invalid_observation", false);
    const candidateInput = { position: baseline.features.position, averageServiceMinutes: baseline.features.averageServiceMinutes,
      priorityBand: baseline.features.priorityBand, queuePaused: baseline.features.queuePaused, observedAt };
    const controller = new AbortController();
    const deadline = performance.now() + timeoutMs;
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error("artifact_provider_timeout"), { code: "artifact_provider_timeout" }));
          controller.abort();
        }, timeoutMs);
      });
      const bytes = await Promise.race([Promise.resolve().then(() => provider({ signal: controller.signal })), timeout]);
      if (performance.now() >= deadline) return fallback("artifact_provider_timeout");
      const bundle = validateShadowArtifact(bytes, { source, expectedSha256, minimumTrainingTickets });
      const candidate = predictWaitTimeWithFallback(candidateInput, bundle.model, scopeKey);
      // Timers cannot interrupt synchronous CPU work. Discard late results too.
      if (performance.now() >= deadline) return fallback("artifact_provider_timeout");
      if (candidate.usedFallback) return fallback(candidate.fallbackReason, true, bundle.artifactSha256);
      return finish({ attempted: true, usedFallback: false, fallbackReason: null,
        estimatedWaitMinutes: candidate.prediction.estimatedWaitMinutes,
        predictorVersion: candidate.prediction.predictorVersion,
        differenceFromBaselineMinutes: candidate.prediction.estimatedWaitMinutes - baseline.estimatedWaitMinutes,
        artifactSha256: bundle.artifactSha256 });
    } catch (error) {
      return fallback(SAFE_ERRORS.has(error?.code) ? error.code : "artifact_provider_error");
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  };
}

module.exports = { createWaitTimeShadowInference };
