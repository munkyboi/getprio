#!/usr/bin/env node
import { createRequire } from "node:module";
import process from "node:process";
import console from "node:console";

const require = createRequire(import.meta.url);
const { createFileShadowArtifactProvider } = require("../backend/src/services/waitTimeShadowArtifact");
const { createWaitTimeShadowInference } = require("../backend/src/services/waitTimeShadowInference");

function optionsFrom(args) {
  const keys = new Map([["--artifact", "artifact"], ["--artifact-sha256", "sha"], ["--source", "source"],
    ["--scope-key", "scope"], ["--position", "position"], ["--average-service-minutes", "average"],
    ["--observed-at", "observed"], ["--priority-band", "priority"], ["--queue-paused", "paused"], ["--timeout-ms", "timeout"]]);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = keys.get(args[i]);
    if (!key || Object.hasOwn(options, key) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Unknown, duplicate, or missing shadow option.");
    options[key] = args[i + 1];
  }
  for (const key of ["artifact", "sha", "source", "scope", "position", "average", "observed"]) {
    if (!Object.hasOwn(options, key)) throw new Error("Required: --artifact --artifact-sha256 --source --scope-key --position --average-service-minutes --observed-at.");
  }
  options.position = Number(options.position);
  options.average = Number(options.average);
  options.priority ??= "normal";
  options.paused ??= "false";
  options.timeout = options.timeout === undefined ? 100 : Number(options.timeout);
  if (!Number.isSafeInteger(options.position) || options.position < 0 || !Number.isFinite(options.average) || options.average < 0 ||
      !["normal", "checked_in_booking", "recovery", "carry_over"].includes(options.priority) || !["true", "false"].includes(options.paused) ||
      !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(options.observed) || !Number.isFinite(Date.parse(options.observed))) {
    throw new Error("Invalid shadow observation or features.");
  }
  return options;
}

async function run() {
  const options = optionsFrom(process.argv.slice(2));
  const infer = createWaitTimeShadowInference({ enabled: true, source: options.source, allowedScopeKeys: [options.scope],
    expectedSha256: options.sha, timeoutMs: options.timeout, provider: createFileShadowArtifactProvider(options.artifact) });
  const result = await infer({ position: options.position, averageServiceMinutes: options.average,
    priorityBand: options.priority, queuePaused: options.paused === "true", observedAt: new Date(options.observed) }, options.scope);
  console.log(JSON.stringify({ reportVersion: "wait-time-shadow-v1", source: options.source, scopeKey: options.scope,
    baseline: { predictorVersion: result.prediction.predictorVersion, estimatedWaitMinutes: result.prediction.estimatedWaitMinutes,
      observedAt: result.prediction.observedAt.toISOString() }, shadow: result.shadow,
    customerEstimateChanged: false, rolloutApproved: false }, null, 2));
}

run().catch((error) => { console.error("Private shadow inference failed:", error.message); process.exitCode = 1; });
