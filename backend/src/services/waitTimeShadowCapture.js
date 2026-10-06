const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const env = require("../config/env");
const repository = require("../repositories/waitTimeShadowSamples");
const { createFileShadowArtifactProvider, validShadowScope } = require("./waitTimeShadowArtifact");
const { createWaitTimeShadowInference } = require("./waitTimeShadowInference");

let state;
const counters = { admitted: 0, completed: 0, failed: 0, busy: 0, rateLimited: 0, sampledOut: 0, disallowed: 0 };

function configurationFromEnvironment(values, databaseUrl) {
  const configuredTarget = new URL(databaseUrl);
  const databaseName = decodeURIComponent(configuredTarget.pathname.replace(/^\//, ""));
  const configuration = {
    databaseName, namespace: values.WAIT_TIME_SHADOW_NAMESPACE || "",
    deploymentSha: values.DEPLOY_SHA || "", artifactSha256: values.WAIT_TIME_SHADOW_ARTIFACT_SHA256 || "",
    artifactPath: values.WAIT_TIME_SHADOW_ARTIFACT_PATH || "",
    allowedScopeKeys: (values.WAIT_TIME_SHADOW_SCOPES || "").split(",").map((value) => value.trim()).filter(Boolean),
    samplingPercent: Number(values.WAIT_TIME_SHADOW_SAMPLING_PERCENT || 10),
    maxPerMinute: Number(values.WAIT_TIME_SHADOW_MAX_PER_MINUTE || 6),
    timeoutMs: Number(values.WAIT_TIME_SHADOW_TIMEOUT_MS || 100)
  };
  if (configuredTarget.hostname !== values.WAIT_TIME_SHADOW_DATABASE_HOST || databaseName !== values.WAIT_TIME_SHADOW_DATABASE_NAME ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(configuration.namespace) || !/^[a-f0-9]{40}$/.test(configuration.deploymentSha) ||
      !/^[a-f0-9]{64}$/.test(configuration.artifactSha256) || !configuration.allowedScopeKeys.length || configuration.allowedScopeKeys.length > 20 ||
      configuration.allowedScopeKeys.some((key) => !validShadowScope("vendors", key)) ||
      !Number.isSafeInteger(configuration.samplingPercent) || configuration.samplingPercent < 1 || configuration.samplingPercent > 100 ||
      !Number.isSafeInteger(configuration.maxPerMinute) || configuration.maxPerMinute < 1 || configuration.maxPerMinute > 60 ||
      !Number.isSafeInteger(configuration.timeoutMs) || configuration.timeoutMs < 1 || configuration.timeoutMs > 1000) {
    throw new Error("Invalid private shadow capture configuration.");
  }
  Object.freeze(configuration.allowedScopeKeys);
  return Object.freeze(configuration);
}

function initialize() {
  if (state) return state;
  if (process.env.WAIT_TIME_SHADOW_ENABLED !== "true" || !env.waitTimePredictionCaptureEnabled) {
    state = { enabled: false, reason: "disabled" };
    return state;
  }
  try {
    const configuration = configurationFromEnvironment(process.env, env.databaseUrl);
    const fileProvider = createFileShadowArtifactProvider(configuration.artifactPath);
    let cachedBytes;
    const provider = async (options) => {
      // The digest is pinned for the process lifetime. Reload requires restart.
      if (!cachedBytes) cachedBytes = await fileProvider(options);
      return cachedBytes;
    };
    state = { enabled: true, configuration, allowed: new Set(configuration.allowedScopeKeys), inFlight: false,
      admissions: [], infer: createWaitTimeShadowInference({
        enabled: true, source: "vendors", allowedScopeKeys: configuration.allowedScopeKeys,
        expectedSha256: configuration.artifactSha256, timeoutMs: configuration.timeoutMs, provider
      }) };
  } catch {
    state = { enabled: false, reason: "invalid_configuration" };
    console.warn("Wait-time shadow capture disabled: invalid private configuration.");
  }
  return state;
}

async function capture(current, sample, scopeKey) {
  const baseline = await repository.readBaseline(sample, current.configuration.databaseName);
  if (!baseline) return;
  // Recheck the canonical stored scope, not just the scheduling descriptor.
  if (`vendors:${baseline.tenant_id}:${baseline.location_id}` !== scopeKey) throw new Error("shadow_scope_mismatch");
  const start = performance.now();
  const result = await current.infer({ position: baseline.features.position,
    averageServiceMinutes: baseline.features.averageServiceMinutes, priorityBand: baseline.features.priorityBand,
    queuePaused: baseline.features.queuePaused, observedAt: new Date(baseline.sampled_at) }, scopeKey);
  let comparison = result.shadow;
  if (!comparison.usedFallback && comparison.estimatedWaitMinutes > 99999999.99) {
    comparison = { ...comparison, usedFallback: true, fallbackReason: "candidate_out_of_storage_range", estimatedWaitMinutes: null };
  }
  await repository.recordComparison(baseline.id, comparison, current.configuration, performance.now() - start);
  counters.completed += 1;
}

function scheduleShadowCapture(sample) {
  const current = initialize();
  if (!current.enabled || sample.predictorVersion !== "baseline-v1") return false;
  const scopeKey = `vendors:${sample.tenantId}:${sample.locationId}`;
  if (!current.allowed.has(scopeKey)) { counters.disallowed += 1; return false; }
  // Snapshot descriptor values before returning to the caller; inference reads
  // canonical persisted features. No identity/contact/context payload is copied.
  const descriptor = { ticketId: String(sample.ticketId), tenantId: String(sample.tenantId), locationId: String(sample.locationId),
    featureHash: sample.featureHash, sampleBucket: new Date(sample.sampleBucket).toISOString() };
  const bucket = createHash("sha256").update(`${descriptor.ticketId}:${descriptor.sampleBucket}:${current.configuration.artifactSha256}`)
    .digest().readUInt32BE(0) % 100;
  if (bucket >= current.configuration.samplingPercent) { counters.sampledOut += 1; return false; }
  if (current.inFlight) { counters.busy += 1; return false; }
  const now = performance.now();
  current.admissions = current.admissions.filter((time) => now - time < 60000);
  if (current.admissions.length >= current.configuration.maxPerMinute) { counters.rateLimited += 1; return false; }
  current.admissions.push(now);
  current.inFlight = true;
  counters.admitted += 1;
  void capture(current, descriptor, scopeKey).catch(() => {
    counters.failed += 1;
    console.warn("Wait-time shadow capture failed; baseline estimate unchanged.");
  }).finally(() => { current.inFlight = false; });
  return true;
}

function getShadowCaptureStatus() {
  const current = initialize();
  return { enabled: current.enabled, reason: current.reason || null, inFlight: Boolean(current.inFlight), counters: { ...counters } };
}

module.exports = { scheduleShadowCapture, getShadowCaptureStatus, configurationFromEnvironment };
