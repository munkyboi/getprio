const { performance } = require("node:perf_hooks");
const { CONTRACT_VERSION, MAX_SNAPSHOT_BYTES, validateResourceOperationalSnapshot } = require("./resourceOperationalSnapshot");
const { PREDICTOR_VERSION, TARGET, predictResourceServiceStartShadow } = require("./resourceShadowProjection");

function fallback(reason, attempted = false) {
  return { predictorVersion: PREDICTOR_VERSION, target: TARGET, attempted, usedFallback: true,
    fallbackReason: reason, predictedServiceStartAt: null, serviceStartWaitMinutes: null,
    customerEstimateChanged: false, rolloutApproved: false, uncertaintyCalibrated: false };
}

// Trusted server configuration only. One instance owns one authorized scope.
// The byte provider must enforce authorization and bounded reads independently.
// No live caller, database imports, capture, or customer publication is added.
function createResourceShadowInference({ enabled = false, expectedScope, readSnapshot,
  timeoutMs = 100, maximumAgeMs = 1000, forecastMinutes = 480 }) {
  if (typeof enabled !== "boolean" || (enabled && typeof readSnapshot !== "function")
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1000
      || !Number.isSafeInteger(forecastMinutes) || forecastMinutes < 5 || forecastMinutes > 480) {
    throw new Error("Invalid private resource inference configuration.");
  }
  // Reuse the accepted contract's exact scope and freshness configuration checks.
  // This configuration probe is never presented as operational inventory.
  const scope = Object.freeze({ ...expectedScope });
  validateResourceOperationalSnapshot(Buffer.from(JSON.stringify({ contractVersion: CONTRACT_VERSION,
    scope, readiness: "not_ready", reasons: ["inventory_incomplete"], snapshot: null })),
  { expectedScope: scope, nowMs: 0, forecastUntilMs: 1, maximumAgeMs });
  let providerPending = false;

  return async function inferResourceServiceStart({ targetWorkRef } = {}) {
    if (!enabled) return fallback("shadow_disabled");
    if (typeof targetWorkRef !== "string" || !targetWorkRef.trim() || targetWorkRef.length > 160) {
      return fallback("invalid_target_reference");
    }
    // A timed-out provider may ignore abort. Keep its slot occupied until it
    // settles; repeated callers must not accumulate abandoned reads.
    if (providerPending) return fallback("snapshot_provider_busy");
    providerPending = true;
    const controller = new AbortController();
    const deadline = performance.now() + timeoutMs;
    const forecastUntilMs = Date.now() + forecastMinutes * 60000;
    let timer;
    try {
      const pending = Promise.resolve().then(() => readSnapshot({ scope, forecastUntilMs, signal: controller.signal }))
        .finally(() => { providerPending = false; });
      const timeout = new Promise(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
      });
      const suppliedBytes = await Promise.race([pending, timeout]);
      if (performance.now() >= deadline || controller.signal.aborted) return fallback("snapshot_provider_timeout", true);
      if (!Buffer.isBuffer(suppliedBytes) || suppliedBytes.length > MAX_SNAPSHOT_BYTES) {
        return fallback("invalid_resource_snapshot", true);
      }
      const snapshotBytes = Buffer.from(suppliedBytes);
      const validation = { expectedScope: scope, nowMs: Date.now(), forecastUntilMs, maximumAgeMs };
      const prediction = predictResourceServiceStartShadow({ snapshotBytes, validation, targetWorkRef });
      // Timer callbacks cannot interrupt synchronous projection. Discard late
      // results and recheck snapshot age/horizon at acceptance, not only at read.
      if (performance.now() >= deadline) return fallback("snapshot_provider_timeout", true);
      if (prediction.usedFallback) return { ...prediction, attempted: true };
      try {
        validateResourceOperationalSnapshot(snapshotBytes, { ...validation, nowMs: Date.now() });
      } catch {
        return fallback("snapshot_expired_before_acceptance", true);
      }
      if (performance.now() >= deadline) return fallback("snapshot_provider_timeout", true);
      return { ...prediction, attempted: true, acceptedAt: new Date().toISOString() };
    } catch {
      if (controller.signal.aborted || performance.now() >= deadline) return fallback("snapshot_provider_timeout", true);
      return fallback("snapshot_provider_error", true);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  };
}

module.exports = { createResourceShadowInference };
