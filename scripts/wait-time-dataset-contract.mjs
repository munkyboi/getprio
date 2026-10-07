import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { Buffer } from "node:buffer";

function validDatasetScope(source, scopeKey) {
  if (typeof scopeKey !== "string") return false;
  if (source === "synthetic") return /^synthetic:[a-z][a-z0-9-]{0,39}$/.test(scopeKey);
  if (source === "vendors") return /^vendors:[1-9]\d{0,19}:(?:[1-9]\d{0,19}|unknown)$/.test(scopeKey);
  const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
  return source === "developer-sandbox" && new RegExp(`^developer-sandbox:${uuid}:${uuid}$`).test(scopeKey);
}

export function timestamp(value) {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error("Use valid timestamps with explicit timezone.");
  }
  return Date.parse(value);
}

function validFeatures(features) {
  return features && Number.isSafeInteger(features.position) && features.position >= 0 &&
    typeof features.averageServiceMinutes === "number" && Number.isFinite(features.averageServiceMinutes) && features.averageServiceMinutes >= 0 &&
    typeof features.queuePaused === "boolean" && ["normal", "checked_in_booking", "recovery", "carry_over"].includes(features.priorityBand);
}

function validateSample(sample, source, from, to) {
  if (!sample || typeof sample !== "object") throw new Error("Invalid dataset sample.");
  const observed = timestamp(sample.sampledAt);
  const called = timestamp(sample.calledAt);
  if (!validDatasetScope(source, sample.scopeKey) ||
      typeof sample.ticketKey !== "string" || !/^[a-f0-9]{64}$/.test(sample.ticketKey) ||
      observed < from || observed >= to || called < observed || called >= to) {
    throw new Error("Dataset contains an invalid scope, ticket key, or timestamp.");
  }
  if (typeof sample.actualWaitMinutes !== "number" || !Number.isFinite(sample.actualWaitMinutes) || sample.actualWaitMinutes < 0 ||
      Math.abs(sample.actualWaitMinutes - (called - observed) / 60000) > 0.02 || !validFeatures(sample.features)) {
    throw new Error("Dataset contains an invalid feature or label.");
  }
}

function validateDatasetKind(dataset, kind) {
  if (kind === "synthetic") {
    if (dataset.datasetVersion !== "wait-time-synthetic-dataset-v1" || dataset.source !== "synthetic" ||
        dataset.provenance !== "synthetic-simulation" || dataset.simulation?.simulatorVersion !== "synthetic-queue-v1") {
      throw new Error("Explicit synthetic mode requires a labeled simulator dataset.");
    }
    return;
  }
  if (kind !== "operational" || dataset.datasetVersion !== "wait-time-dataset-v1" ||
      !["vendors", "developer-sandbox"].includes(dataset.source) || dataset.provenance !== "unverified-operational-data") {
    throw new Error("Operational mode requires an unverified operational export; synthetic inputs require explicit synthetic mode.");
  }
}

export function validateDataset(dataset, options = null, kind = "operational") {
  if (dataset?.baselineVersion !== "baseline-v1" || !Array.isArray(dataset.samples) || dataset.samples.length > 100000) {
    throw new Error("Unsupported dataset contract or size.");
  }
  validateDatasetKind(dataset, kind);
  const from = timestamp(dataset.from);
  const to = timestamp(dataset.to);
  if (from >= to || to > timestamp(dataset.capturedAt)) throw new Error("Dataset must have a closed exported window.");
  if (options && (timestamp(options.cutoff) <= from || timestamp(options.end) > to)) throw new Error("Evaluation window must fit inside a closed exported dataset window.");
  const seen = new Set();
  for (const sample of dataset.samples) {
    validateSample(sample, dataset.source, from, to);
    const key = `${sample.scopeKey}:${sample.ticketKey}`;
    if (seen.has(key)) throw new Error("Dataset contains duplicate tickets; re-export distinct observations.");
    seen.add(key);
  }
}

export async function readBoundedJson(path, maximumBytes) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maximumBytes) throw new Error("Input must be a regular file within the size limit.");
    const bytes = Buffer.alloc(maximumBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await file.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > maximumBytes) throw new Error("Input exceeds the size limit.");
    return { bytes: bytes.subarray(0, length), value: JSON.parse(bytes.subarray(0, length).toString("utf8")) };
  } finally {
    await file.close();
  }
}
