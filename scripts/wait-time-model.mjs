#!/usr/bin/env node
import { createRequire } from "node:module";
import { readFile, writeFile, stat } from "node:fs/promises";
import process from "node:process";
import console from "node:console";

const require = createRequire(import.meta.url);
const { fitWaitTimeCandidate, describeTrainingCoverage, predictWaitTimeWithFallback } = require("../backend/src/services/waitTimeCandidate");
const { predictWaitTime } = require("../backend/src/services/waitTimePredictor");

function timestamp(value) {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error("Use valid timestamps with explicit timezone.");
  }
  return Date.parse(value);
}

function optionsFrom(args) {
  const options = {};
  const keys = new Map([["--dataset", "dataset"], ["--cutoff", "cutoff"], ["--holdout-end", "end"],
    ["--output", "output"], ["--minimum-training-tickets", "minimum"]]);
  for (let i = 0; i < args.length; i += 2) {
    const key = keys.get(args[i]);
    if (!key || Object.hasOwn(options, key) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Unknown, duplicate, or missing model option.");
    options[key] = args[i + 1];
  }
  if (!options.dataset || !options.cutoff || !options.end || !options.output) {
    throw new Error("Use --dataset <file> --cutoff <timestamp> --holdout-end <timestamp> --output <new-file>.");
  }
  options.minimum = options.minimum === undefined ? 30 : Number(options.minimum);
  if (!Number.isSafeInteger(options.minimum) || options.minimum < 1) throw new Error("Minimum training tickets must be a positive integer.");
  if (timestamp(options.cutoff) >= timestamp(options.end)) throw new Error("Training cutoff must precede holdout end.");
  return options;
}

function validateDataset(dataset, options) {
  if (dataset.datasetVersion !== "wait-time-dataset-v1" || dataset.baselineVersion !== "baseline-v1" ||
      !["vendors", "developer-sandbox"].includes(dataset.source) || !Array.isArray(dataset.samples) || dataset.samples.length > 100000) {
    throw new Error("Unsupported dataset contract or size.");
  }
  const from = timestamp(dataset.from);
  const to = timestamp(dataset.to);
  if (from >= to || to > timestamp(dataset.capturedAt) || timestamp(options.cutoff) <= from || timestamp(options.end) > to) throw new Error("Evaluation window must fit inside a closed exported dataset window.");
  const seen = new Set();
  for (const sample of dataset.samples) {
    const observed = timestamp(sample.sampledAt);
    const called = timestamp(sample.calledAt);
    const features = sample.features;
    if (typeof sample.scopeKey !== "string" || !sample.scopeKey.startsWith(`${dataset.source}:`) || sample.scopeKey.length > 200 ||
        typeof sample.ticketKey !== "string" || !/^[a-f0-9]{64}$/.test(sample.ticketKey) ||
        observed < from || observed >= to || called < observed || called >= to ||
        typeof sample.actualWaitMinutes !== "number" || !Number.isFinite(sample.actualWaitMinutes) || sample.actualWaitMinutes < 0 ||
        Math.abs(sample.actualWaitMinutes - (called - observed) / 60000) > 0.02 ||
        !features || !Number.isSafeInteger(features.position) || features.position < 0 ||
        typeof features.averageServiceMinutes !== "number" || !Number.isFinite(features.averageServiceMinutes) || features.averageServiceMinutes < 0 ||
        typeof features.queuePaused !== "boolean" || !["normal", "checked_in_booking", "recovery", "carry_over"].includes(features.priorityBand)) {
      throw new Error("Dataset contains an invalid scope, feature, timestamp, or label.");
    }
    const key = `${sample.scopeKey}:${sample.ticketKey}`;
    if (seen.has(key)) throw new Error("Dataset contains duplicate tickets; re-export distinct observations.");
    seen.add(key);
  }
}

function metrics(errors) {
  if (!errors.length) return { tickets: 0, maeMinutes: null, meanSignedErrorMinutes: null, withinFiveMinutesPercent: null };
  const round = (value) => Math.round(value * 100) / 100;
  return { tickets: errors.length,
    maeMinutes: round(errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length),
    meanSignedErrorMinutes: round(errors.reduce((sum, error) => sum + error, 0) / errors.length),
    withinFiveMinutesPercent: round(100 * errors.filter((error) => Math.abs(error) <= 5).length / errors.length) };
}

async function run() {
  const options = optionsFrom(process.argv.slice(2));
  if ((await stat(options.dataset)).size > 64 * 1024 * 1024) throw new Error("Dataset exceeds 64 MiB; select a smaller export window.");
  const dataset = JSON.parse(await readFile(options.dataset, "utf8"));
  validateDataset(dataset, options);
  const cutoff = timestamp(options.cutoff);
  const end = timestamp(options.end);
  const model = fitWaitTimeCandidate(dataset.samples, options.cutoff, options.minimum);
  const trainingCoverage = describeTrainingCoverage(dataset.samples, options.cutoff, options.minimum);
  const perScope = new Map();
  let excludedOverlappingTickets = 0;
  for (const sample of dataset.samples) {
    const observed = timestamp(sample.sampledAt);
    if (observed < cutoff) {
      if (timestamp(sample.calledAt) >= cutoff) excludedOverlappingTickets += 1;
      continue;
    }
    if (observed >= end || timestamp(sample.calledAt) >= end) continue;
    const input = { ...sample.features, observedAt: new Date(sample.sampledAt) };
    const baseline = predictWaitTime(input);
    const candidate = predictWaitTimeWithFallback(input, model, sample.scopeKey);
    if (!perScope.has(sample.scopeKey)) perScope.set(sample.scopeKey, { baseline: [], candidate: [], modelOnly: [], fallbackReasons: {} });
    const scope = perScope.get(sample.scopeKey);
    scope.baseline.push(sample.actualWaitMinutes - baseline.estimatedWaitMinutes);
    scope.candidate.push(sample.actualWaitMinutes - candidate.prediction.estimatedWaitMinutes);
    if (candidate.usedFallback) scope.fallbackReasons[candidate.fallbackReason] = (scope.fallbackReasons[candidate.fallbackReason] || 0) + 1;
    else scope.modelOnly.push(sample.actualWaitMinutes - candidate.prediction.estimatedWaitMinutes);
  }
  const artifact = { artifactVersion: "wait-time-experiment-v1", source: dataset.source,
    provenance: dataset.provenance, model, trainingCoverage, evaluation: { trainingCutoff: model.trainingCutoff,
      holdoutEnd: new Date(end).toISOString(), excludedOverlappingTickets,
      scopes: [...perScope].map(([scopeKey, scope]) => ({ scopeKey, baseline: metrics(scope.baseline),
        candidateWithFallback: metrics(scope.candidate), candidateOnly: metrics(scope.modelOnly), fallbackReasons: scope.fallbackReasons })) },
    customerEstimateChanged: false, rolloutApproved: false,
    note: "Offline statistical experiment only. Manual tests do not establish production accuracy. No model is loaded by the API." };
  await writeFile(options.output, JSON.stringify(artifact, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output: options.output, trainedScopes: model.scopeRates.length, trainingCoverage, evaluation: artifact.evaluation,
    customerEstimateChanged: false, rolloutApproved: false }, null, 2));
}

run().catch((error) => { console.error("Offline wait-time experiment failed:", error.message); process.exitCode = 1; });
