const { createHash } = require("crypto");
const { open } = require("fs/promises");
const { constants } = require("fs");
const { isAbsolute } = require("path");
const { CANDIDATE_VERSION, TARGET } = require("./waitTimeCandidate");

const MAX_ARTIFACT_BYTES = 1024 * 1024;
const UUID = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";

function artifactError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validShadowScope(source, scopeKey) {
  if (typeof scopeKey !== "string") return false;
  if (source === "vendors") return /^vendors:[1-9]\d{0,19}:[1-9]\d{0,19}$/.test(scopeKey);
  if (source === "developer-sandbox") return new RegExp(`^developer-sandbox:${UUID}:${UUID}$`).test(scopeKey);
  return false;
}

function validTimestamp(value) {
  return typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

// A checksum pins operator-selected bytes. It is not evidence of provenance,
// database isolation, model accuracy, or permission to publish estimates.
function validateShadowArtifact(bytes, { source, expectedSha256, minimumTrainingTickets = 30 }) {
  if (!["vendors", "developer-sandbox"].includes(source) || typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256) ||
      !Number.isSafeInteger(minimumTrainingTickets) || minimumTrainingTickets < 1 ||
      !Buffer.isBuffer(bytes) || bytes.length > MAX_ARTIFACT_BYTES) throw artifactError("invalid_artifact");
  const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
  if (artifactSha256 !== expectedSha256) throw artifactError("artifact_digest_mismatch");
  let artifact;
  try { artifact = JSON.parse(bytes.toString("utf8")); }
  catch { throw artifactError("invalid_artifact"); }
  if (!artifact || artifact.artifactVersion !== "wait-time-experiment-v1" ||
      artifact.customerEstimateChanged !== false || artifact.rolloutApproved !== false ||
      typeof artifact.provenance !== "string" || artifact.provenance.length > 100) throw artifactError("invalid_artifact");
  if (artifact.source !== source) throw artifactError("artifact_source_mismatch");
  const model = artifact.model;
  if (!model || model.predictorVersion !== CANDIDATE_VERSION || model.target !== TARGET ||
      !validTimestamp(model.trainingCutoff) || !Number.isSafeInteger(model.minimumTrainingTickets) ||
      model.minimumTrainingTickets < minimumTrainingTickets || !Array.isArray(model.scopeRates) || model.scopeRates.length > 10000) {
    throw artifactError("invalid_artifact");
  }
  const seen = new Set();
  const scopeRates = model.scopeRates.map((entry) => {
    if (!entry || !validShadowScope(source, entry.scopeKey) || seen.has(entry.scopeKey) ||
        !Number.isSafeInteger(entry.trainingTickets) || entry.trainingTickets < model.minimumTrainingTickets || entry.trainingTickets > 100000 ||
        typeof entry.minutesPerPosition !== "number" || !Number.isFinite(entry.minutesPerPosition) || entry.minutesPerPosition < 0) {
      throw artifactError("invalid_artifact");
    }
    seen.add(entry.scopeKey);
    return Object.freeze({ scopeKey: entry.scopeKey, trainingTickets: entry.trainingTickets, minutesPerPosition: entry.minutesPerPosition });
  });
  return Object.freeze({ artifactSha256, source, model: Object.freeze({
    predictorVersion: model.predictorVersion, target: model.target, trainingCutoff: model.trainingCutoff,
    minimumTrainingTickets: model.minimumTrainingTickets, scopeRates: Object.freeze(scopeRates)
  }) });
}

// Private operator configuration only. No paths from queue/customer requests.
// Bound the read itself, including files that grow after stat; reject links/FIFOs.
function createFileShadowArtifactProvider(artifactPath) {
  if (typeof artifactPath !== "string" || !isAbsolute(artifactPath)) throw new Error("Use an absolute private artifact path.");
  return async ({ signal }) => {
    signal.throwIfAborted();
    const handle = await open(artifactPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile() || metadata.size > MAX_ARTIFACT_BYTES || (metadata.mode & 0o077) !== 0) throw artifactError("invalid_artifact");
      const buffer = Buffer.alloc(MAX_ARTIFACT_BYTES + 1);
      let offset = 0;
      while (offset < buffer.length) {
        signal.throwIfAborted();
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      signal.throwIfAborted();
      if (offset > MAX_ARTIFACT_BYTES) throw artifactError("invalid_artifact");
      return buffer.subarray(0, offset);
    } finally {
      await handle.close();
    }
  };
}

module.exports = { MAX_ARTIFACT_BYTES, validShadowScope, validateShadowArtifact, createFileShadowArtifactProvider };
