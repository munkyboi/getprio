#!/usr/bin/env node
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import process from "node:process";
import console from "node:console";
import { timestamp, validateDataset, readBoundedJson } from "./wait-time-dataset-contract.mjs";

function optionsFrom(args) {
  const options = {};
  const keys = new Map([["--dataset", "dataset"], ["--exclusions", "exclusions"], ["--output", "output"]]);
  for (let index = 0; index < args.length; index += 2) {
    const key = keys.get(args[index]);
    if (!key || Object.hasOwn(options, key) || !args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error("Unknown, duplicate, or missing curation option.");
    }
    options[key] = args[index + 1];
  }
  if (!options.dataset || !options.exclusions || !options.output) {
    throw new Error("Use --dataset <original-export> --exclusions <manifest> --output <new-file>.");
  }
  return options;
}

function hasExactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validateWindow(window, scopes, dataset) {
  if (!hasExactKeys(window, ["scopeKey", "from", "to", "reason"]) ||
      !scopes.has(window.scopeKey) || !["manual_test", "data_quality"].includes(window.reason)) {
    throw new Error("Each exclusion must name an existing dataset scope and an allowed reason, with no extra fields.");
  }
  const from = timestamp(window.from);
  const to = timestamp(window.to);
  if (from >= to || from < timestamp(dataset.from) || to > timestamp(dataset.to)) {
    throw new Error("Exclusion windows must fit inside the exported dataset window.");
  }
  return { from, to, reason: window.reason };
}

function validateManifest(manifest, dataset) {
  if (!hasExactKeys(manifest, ["manifestVersion", "windows"]) ||
      manifest.manifestVersion !== "wait-time-exclusions-v1" || !Array.isArray(manifest.windows) ||
      !manifest.windows.length || manifest.windows.length > 1000) {
    throw new Error("Use an exclusions v1 manifest with 1 to 1000 windows.");
  }
  const scopes = new Set(dataset.samples.map((sample) => sample.scopeKey));
  const grouped = new Map();
  for (const window of manifest.windows) {
    const validated = validateWindow(window, scopes, dataset);
    if (!grouped.has(window.scopeKey)) grouped.set(window.scopeKey, []);
    const windows = grouped.get(window.scopeKey);
    if (windows.some((entry) => entry.from === validated.from && entry.to === validated.to && entry.reason === validated.reason)) {
      throw new Error("Duplicate exclusion window.");
    }
    windows.push(validated);
  }
  return grouped;
}

function curateSamples(samples, windows) {
  const retained = [];
  const coverage = new Map();
  for (const sample of samples) {
    if (!coverage.has(sample.scopeKey)) coverage.set(sample.scopeKey, { scopeKey: sample.scopeKey, inputTickets: 0,
      retainedTickets: 0, excludedTickets: 0, exclusionReasons: {} });
    const scope = coverage.get(sample.scopeKey);
    scope.inputTickets += 1;
    const observed = timestamp(sample.sampledAt);
    const called = timestamp(sample.calledAt);
    const reasons = new Set((windows.get(sample.scopeKey) || [])
      .filter((window) => observed < window.to && called >= window.from).map((window) => window.reason));
    if (reasons.size) {
      scope.excludedTickets += 1;
      for (const reason of reasons) scope.exclusionReasons[reason] = (scope.exclusionReasons[reason] || 0) + 1;
    } else {
      scope.retainedTickets += 1;
      retained.push({ ticketKey: sample.ticketKey, scopeKey: sample.scopeKey, sampledAt: sample.sampledAt,
        calledAt: sample.calledAt, actualWaitMinutes: sample.actualWaitMinutes,
        features: { position: sample.features.position, averageServiceMinutes: sample.features.averageServiceMinutes,
          priorityBand: sample.features.priorityBand, queuePaused: sample.features.queuePaused } });
    }
  }
  return { samples: retained, scopes: [...coverage.values()] };
}

async function run() {
  const options = optionsFrom(process.argv.slice(2));
  const input = await readBoundedJson(options.dataset, 64 * 1024 * 1024);
  const dataset = input.value;
  validateDataset(dataset);
  if (Object.hasOwn(dataset, "curation") || dataset.provenance !== "unverified-operational-data" ||
      !Number.isSafeInteger(dataset.excludedFeatureRows) || dataset.excludedFeatureRows < 0) {
    throw new Error("Use an original unverified export with valid excluded feature counts; chained curation is unsupported.");
  }
  const manifestInput = await readBoundedJson(options.exclusions, 1024 * 1024);
  const windows = validateManifest(manifestInput.value, dataset);
  const result = curateSamples(dataset.samples, windows);
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const curation = { reportVersion: "wait-time-curation-v1", sourceDatasetSha256: digest(input.bytes),
    exclusionsSha256: digest(manifestInput.bytes), curatedAt: new Date().toISOString(),
    policy: "Exclude whole tickets whose observation-to-call interval intersects a declared scope window [from,to).",
    declaredWindows: manifestInput.value.windows, inputTickets: dataset.samples.length,
    retainedTickets: result.samples.length, excludedTickets: dataset.samples.length - result.samples.length,
    scopes: result.scopes, provenanceVerified: false,
    note: "Operator declarations only. Reason counts may overlap. Retained tickets are not verified production traffic." };
  const output = { datasetVersion: dataset.datasetVersion, baselineVersion: dataset.baselineVersion,
    source: dataset.source, provenance: dataset.provenance, capturedAt: dataset.capturedAt,
    from: dataset.from, to: dataset.to, excludedFeatureRows: dataset.excludedFeatureRows,
    samples: result.samples, curation };
  await writeFile(options.output, JSON.stringify(output, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output: options.output, ...curation, customerEstimateChanged: false, rolloutApproved: false }, null, 2));
}

run().catch((error) => { console.error("Offline wait-time curation failed:", error.message); process.exitCode = 1; });
