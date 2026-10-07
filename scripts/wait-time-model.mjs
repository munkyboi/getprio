#!/usr/bin/env node
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { timestamp, validateDataset, readBoundedJson } from "./wait-time-dataset-contract.mjs";
import { metrics } from "./wait-time-metrics.mjs";
import process from "node:process";
import console from "node:console";

const require = createRequire(import.meta.url);
const { fitWaitTimeCandidate, describeTrainingCoverage, predictWaitTimeWithFallback } = require("../backend/src/services/waitTimeCandidate");
const { predictWaitTime } = require("../backend/src/services/waitTimePredictor");

function optionsFrom(args) {
  const options = {};
  const keys = new Map([["--dataset", "dataset"], ["--cutoff", "cutoff"], ["--holdout-end", "end"],
    ["--output", "output"], ["--minimum-training-tickets", "minimum"], ["--dataset-kind", "kind"]]);
  for (let i = 0; i < args.length; i += 2) {
    const key = keys.get(args[i]);
    if (!key || Object.hasOwn(options, key) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Unknown, duplicate, or missing model option.");
    options[key] = args[i + 1];
  }
  if (!options.dataset || !options.cutoff || !options.end || !options.output) {
    throw new Error("Use --dataset <file> --cutoff <timestamp> --holdout-end <timestamp> --output <new-file>.");
  }
  options.minimum = options.minimum === undefined ? 30 : Number(options.minimum);
  options.kind = options.kind ?? "operational";
  if (!["operational", "synthetic"].includes(options.kind)) throw new Error("Dataset kind must be operational or synthetic.");
  if (!Number.isSafeInteger(options.minimum) || options.minimum < 1) throw new Error("Minimum training tickets must be a positive integer.");
  if (timestamp(options.cutoff) >= timestamp(options.end)) throw new Error("Training cutoff must precede holdout end.");
  return options;
}


async function run() {
  const options = optionsFrom(process.argv.slice(2));
  const input = await readBoundedJson(options.dataset, 64 * 1024 * 1024);
  const dataset = input.value;
  const datasetSha256 = createHash("sha256").update(input.bytes).digest("hex");
  validateDataset(dataset, options, options.kind);
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
  const synthetic = options.kind === "synthetic";
  const artifact = { artifactVersion: synthetic ? "wait-time-synthetic-experiment-v1" : "wait-time-experiment-v1", source: dataset.source,
    provenance: dataset.provenance, datasetSha256, model, trainingCoverage, evaluation: { trainingCutoff: model.trainingCutoff,
      holdoutEnd: new Date(end).toISOString(), excludedOverlappingTickets,
      scopes: [...perScope].map(([scopeKey, scope]) => ({ scopeKey, baseline: metrics(scope.baseline),
        candidateWithFallback: metrics(scope.candidate), candidateOnly: metrics(scope.modelOnly), fallbackReasons: scope.fallbackReasons })) },
    customerEstimateChanged: false, rolloutApproved: false, productionPerformanceEstablished: false,
    note: synthetic ? "Synthetic-only experiment. Scores measure simulator assumptions, not vendor accuracy. Not accepted by production shadow inference."
      : "Offline statistical experiment only. Manual tests do not establish production accuracy. No model is loaded by the API." };
  await writeFile(options.output, JSON.stringify(artifact, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output: options.output, source: artifact.source, provenance: artifact.provenance,
    artifactVersion: artifact.artifactVersion, trainedScopes: model.scopeRates.length, trainingCoverage, evaluation: artifact.evaluation,
    customerEstimateChanged: false, rolloutApproved: false, productionPerformanceEstablished: false }, null, 2));
}

run().catch((error) => { console.error("Offline wait-time experiment failed:", error.message); process.exitCode = 1; });
