#!/usr/bin/env node
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import process from "node:process";
import console from "node:console";
import { generateSyntheticDataset, REFERENCE_SIMULATOR_VERSION, SENSITIVITY_SIMULATOR_VERSION, SCENARIO_PROFILES } from "./wait-time-simulator.mjs";
import { RESOURCE_REFERENCE_VERSION } from "./wait-time-resource-reference.mjs";
import { timestamp, validateDataset } from "./wait-time-dataset-contract.mjs";
import { metrics } from "./wait-time-metrics.mjs";

const require = createRequire(import.meta.url);
const { fitWaitTimeCandidate, describeTrainingCoverage, predictWaitTimeWithFallback } = require("../backend/src/services/waitTimeCandidate");
const { predictWaitTime } = require("../backend/src/services/waitTimePredictor");

function positiveInteger(value, maximum, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw new Error(`Invalid ${name}.`);
  return number;
}

function seedsFrom(value) {
  if (!/^\d+(?:,\d+){0,4}$/.test(value)) throw new Error("Use a comma-separated list of 1 to 5 integer seeds.");
  const seeds = value.split(",").map(Number);
  if (!seeds.length || seeds.length > 5 || seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) {
    throw new Error("Use 1 to 5 unsigned 32-bit seeds.");
  }
  const streams = seeds.flatMap((seed) => [0, 1, 2, 3].map((index) => (seed + index) >>> 0));
  if (new Set(streams).size !== streams.length) throw new Error("Seeds must have distinct, non-overlapping four-scenario random streams.");
  return seeds;
}

function optionsFrom(args) {
  const options = { seeds: "42,314,2718", tickets: "120", start: "2026-01-01T00:00:00Z", training: "360", end: "960", profile: "baseline" };
  const keys = new Map([["--seeds", "seeds"], ["--tickets-per-scenario", "tickets"], ["--start", "start"],
    ["--training-seed", "trainingSeed"], ["--scenario-profile", "profile"], ["--training-minutes", "training"], ["--holdout-end-minutes", "end"], ["--output", "output"]]);
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const key = keys.get(args[index]);
    if (!key || seen.has(key) || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Unknown, duplicate, or missing comparison option.");
    seen.add(key);
    options[key] = args[index + 1];
  }
  if (!options.output) throw new Error("Use --output <new-private-file>.");
  if (!Object.hasOwn(SCENARIO_PROFILES, options.profile)) {
    throw new Error("Use --scenario-profile baseline, dense-arrivals, or variable-durations.");
  }
  options.seeds = seedsFrom(options.seeds);
  if (options.trainingSeed !== undefined) {
    if (!/^\d+$/.test(options.trainingSeed)) throw new Error("Use one unsigned 32-bit training seed.");
    options.trainingSeed = seedsFrom(options.trainingSeed)[0];
    if (options.seeds.length > 4) throw new Error("Cross-seed comparison supports up to four evaluation seeds plus one training seed.");
    // Include the training block in the same modulo-2^32 overlap check.
    seedsFrom([options.trainingSeed, ...options.seeds].join(","));
  }
  options.tickets = positiveInteger(options.tickets, 200, "tickets per scenario (maximum 200)");
  options.training = positiveInteger(options.training, 100000, "training minutes");
  options.end = positiveInteger(options.end, 100000, "holdout end minutes");
  if (options.training >= options.end) throw new Error("Training cutoff must precede holdout end.");
  const start = timestamp(options.start);
  options.cutoff = new Date(start + options.training * 60000).toISOString();
  options.holdoutEnd = new Date(start + options.end * 60000).toISOString();
  return options;
}

function emptyErrors(scopeKey) {
  return { scopeKey, baseline: [], candidateWithFallback: [], candidateOnly: [], resourceWithFallback: [], resourceOnly: [],
    candidateFallbackReasons: {}, resourceFallbackReasons: {},
    selection: { calledTickets: 0, historicalTickets: 0, overlappingTickets: 0, observedAfterHoldout: 0,
      calledAfterHoldout: 0, scoredTickets: 0 }, issuedTickets: 0, censoredTickets: 0 };
}

function appendPrediction(scope, actual, candidate, reference, baseline) {
  scope.baseline.push(actual - baseline.estimatedWaitMinutes);
  scope.candidateWithFallback.push(actual - candidate.prediction.estimatedWaitMinutes);
  if (candidate.usedFallback) {
    scope.candidateFallbackReasons[candidate.fallbackReason] = (scope.candidateFallbackReasons[candidate.fallbackReason] || 0) + 1;
  } else scope.candidateOnly.push(actual - candidate.prediction.estimatedWaitMinutes);
  if (reference.usedFallback) {
    scope.resourceWithFallback.push(actual - baseline.estimatedWaitMinutes);
    scope.resourceFallbackReasons[reference.fallbackReason] = (scope.resourceFallbackReasons[reference.fallbackReason] || 0) + 1;
  } else {
    const error = actual - reference.estimatedWaitMinutes;
    scope.resourceWithFallback.push(error);
    scope.resourceOnly.push(error);
  }
}

function support(supportedTickets, scoredTickets) {
  return { supportedTickets, scoredTickets, supportedPercent: scoredTickets
    ? Math.round(supportedTickets / scoredTickets * 10000) / 100 : null };
}

function describeScope(scope) {
  return { scopeKey: scope.scopeKey, baseline: metrics(scope.baseline), candidateWithFallback: metrics(scope.candidateWithFallback),
    candidateOnly: metrics(scope.candidateOnly), resourceWithFallback: metrics(scope.resourceWithFallback),
    resourceOnly: metrics(scope.resourceOnly), candidateFallbackReasons: scope.candidateFallbackReasons,
    resourceFallbackReasons: scope.resourceFallbackReasons,
    coverage: { issuedTickets: scope.issuedTickets, censoredTickets: scope.censoredTickets,
      selection: scope.selection, candidate: support(scope.candidateOnly.length, scope.baseline.length),
      resource: support(scope.resourceOnly.length, scope.baseline.length) } };
}

function prepareTraining(dataset, options) {
  const model = fitWaitTimeCandidate(dataset.samples, options.cutoff, 30);
  return { model, trainingCoverage: describeTrainingCoverage(dataset.samples, options.cutoff, 30),
    evidence: { seed: dataset.simulation.seed, datasetSha256: hashJson(dataset),
      from: dataset.from, to: dataset.to, modelSha256: hashJson(model), trainedScopes: model.scopeRates.length } };
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function evaluate(dataset, options, aggregate, training) {
  const { model } = training;
  const scopeErrors = new Map(dataset.simulation.scenarios.map(({ scopeKey }) => [scopeKey, emptyErrors(scopeKey)]));
  for (const scenario of dataset.simulation.scenarios) {
    const { scopeKey } = scenario;
    if (!aggregate.has(scopeKey)) aggregate.set(scopeKey, emptyErrors(scopeKey));
    for (const errors of [scopeErrors.get(scopeKey), aggregate.get(scopeKey)]) {
      errors.issuedTickets += scenario.issuedTickets;
      errors.censoredTickets += scenario.censoredTickets;
    }
  }
  const cutoff = timestamp(options.cutoff);
  const end = timestamp(options.holdoutEnd);
  let overlappingTickets = 0;
  for (const sample of dataset.samples) {
    const observed = timestamp(sample.sampledAt);
    const called = timestamp(sample.calledAt);
    const rows = [scopeErrors.get(sample.scopeKey), aggregate.get(sample.scopeKey)];
    let category = "scoredTickets";
    if (observed < cutoff) category = called >= cutoff ? "overlappingTickets" : "historicalTickets";
    else if (observed >= end) category = "observedAfterHoldout";
    else if (called >= end) category = "calledAfterHoldout";
    for (const errors of rows) {
      errors.selection.calledTickets++;
      errors.selection[category]++;
    }
    if (category === "overlappingTickets") overlappingTickets++;
    if (category !== "scoredTickets") continue;
    const input = { ...sample.features, observedAt: new Date(sample.sampledAt) };
    const baseline = predictWaitTime(input);
    const candidate = predictWaitTimeWithFallback(input, model, sample.scopeKey);
    for (const errors of [scopeErrors.get(sample.scopeKey), aggregate.get(sample.scopeKey)]) {
      appendPrediction(errors, sample.actualWaitMinutes, candidate, sample.resourceReference, baseline);
    }
  }
  return { trainedScopes: model.scopeRates.length, trainingCoverage: training.trainingCoverage, trainingSeed: training.evidence.seed,
    modelSha256: training.evidence.modelSha256, excludedOverlappingTickets: overlappingTickets, scopes: [...scopeErrors.values()].map(describeScope) };
}

async function run() {
  const options = optionsFrom(process.argv.slice(2));
  const aggregate = new Map();
  const runs = [];
  let transferTraining = null;
  if (options.trainingSeed !== undefined) {
    const trainingDataset = generateSyntheticDataset({ seed: options.trainingSeed, ticketsPerScenario: options.tickets,
      start: options.start, includeResourceReference: true, scenarioProfile: options.profile });
    validateDataset(trainingDataset, { cutoff: options.cutoff, end: options.cutoff }, "synthetic");
    transferTraining = prepareTraining(trainingDataset, options);
  }
  for (const seed of options.seeds) {
    const dataset = generateSyntheticDataset({ seed, ticketsPerScenario: options.tickets, start: options.start, includeResourceReference: true, scenarioProfile: options.profile });
    validateDataset(dataset, { cutoff: options.cutoff, end: options.holdoutEnd }, "synthetic");
    const datasetSha256 = hashJson(dataset);
    runs.push({ seed, datasetSha256, from: dataset.from, to: dataset.to, ...evaluate(dataset, options, aggregate, transferTraining || prepareTraining(dataset, options)) });
  }
  const report = { reportVersion: transferTraining ? "wait-time-synthetic-transfer-v1" : "wait-time-synthetic-comparison-v2", source: "synthetic", provenance: "synthetic-simulation",
    simulatorVersion: options.profile === "baseline" ? REFERENCE_SIMULATOR_VERSION : SENSITIVITY_SIMULATOR_VERSION,
    scenarioProfile: options.profile, resourcePredictorVersion: RESOURCE_REFERENCE_VERSION,
    seeds: options.seeds, ticketsPerScenario: options.tickets, start: options.start,
    trainingCutoff: options.cutoff, holdoutEnd: options.holdoutEnd, minimumTrainingTickets: 30,
    trainingMode: transferTraining ? "cross_seed" : "within_seed",
    transferTraining: transferTraining ? { ...transferTraining.evidence, trainingCoverage: transferTraining.trainingCoverage } : null,
    splitPolicy: transferTraining
      ? "One declared training seed fits historical outcomes strictly before cutoff; its frozen model scores all disjoint evaluation seeds. Only later called tickets within the fixed window are scored. No evaluation-seed outcomes enter training. Shared simulator assumptions remain; this is not cross-profile or production validation."
      : "Each seed fits its own historical model; all methods score the same later called tickets. Overlapping outcomes are excluded. Not cross-seed model-transfer validation.",
    coveragePolicy: "Selection partitions all called tickets by the fixed window. Censored totals cover the full simulation, not just the holdout. Support percentages use scored called tickets only; they are not availability for all issued tickets or production traffic.",
    referencePolicy: "Arrival-time known plans, capacity and observed progress only. No future arrivals, cancellations, actual service durations or actual finish times.",
    datasetHashEncoding: "SHA256 of UTF-8 JSON.stringify(dataset) without whitespace.", runs,
    aggregate: [...aggregate.values()].map(describeScope), customerEstimateChanged: false,
    rolloutApproved: false, productionPerformanceEstablished: false,
    note: "Private synthetic comparison only. Aggregates weight tickets, not seeds equally; inspect every run. Shared simulator assumptions are not independent vendor validation." };
  const output = JSON.stringify(report, null, 2);
  if (Buffer.byteLength(output) > 8 * 1024 * 1024) throw new Error("Comparison report exceeds 8 MiB.");
  await writeFile(options.output, output, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output: options.output, trainingMode: report.trainingMode, trainingSeed: options.trainingSeed ?? null, scenarioProfile: options.profile, seeds: options.seeds, trainingCutoff: options.cutoff,
    holdoutEnd: options.holdoutEnd, aggregate: report.aggregate, customerEstimateChanged: false,
    rolloutApproved: false, productionPerformanceEstablished: false }, null, 2));
}

try {
  await run();
} catch (error) {
  console.error("Synthetic resource comparison failed:", error.message);
  process.exitCode = 1;
}
