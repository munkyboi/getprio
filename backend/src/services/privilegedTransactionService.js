const crypto = require("node:crypto");
const repository = require("../repositories/privilegedTransactions");

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const sortedKeys = Object.keys(value).sort((left, right) => left.localeCompare(right, "en"));
    return Object.fromEntries(sortedKeys.map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function buildPayloadDigest(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(payload || {}))).digest("hex");
}

function assertRecentAssurance(session, now = Date.now()) {
  const primaryAge = now - new Date(session?.primaryAuthenticatedAt || 0).getTime();
  if (!Number.isFinite(primaryAge) || primaryAge < 0 || primaryAge > 10 * 60_000) {
    const error = new Error("Please sign in again before continuing.");
    error.statusCode = 403;
    error.code = "RECENT_AUTHENTICATION_REQUIRED";
    throw error;
  }
  const mfaAge = now - new Date(session?.mfaVerifiedAt || 0).getTime();
  if (!Number.isFinite(mfaAge) || mfaAge < 0 || mfaAge > 10 * 60_000) {
    const error = new Error("Please confirm your security code before continuing.");
    error.statusCode = 403;
    error.code = "RECENT_MFA_REQUIRED";
    throw error;
  }
}

function normalizeReason(reason) {
  return String(reason || "").trim().replace(/\s+/g, " ").slice(0, 500);
}

async function issueConfirmation(input, options = {}) {
  assertRecentAssurance(input.session);
  const reason = normalizeReason(input.reason);
  if (reason.length < 8) {
    const error = new Error("Please provide a clear reason for this action.");
    error.statusCode = 400;
    error.code = "REASON_REQUIRED";
    throw error;
  }
  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const data = {
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    actorId: input.actorId,
    sessionId: input.session._id,
    action: String(input.action),
    target: String(input.target),
    reason,
    payloadDigest: buildPayloadDigest(input.payload),
    previewRevision: String(input.previewRevision),
    expiresAt
  };
  await repository.createConfirmation(data, options);
  return { token, expiresAt };
}

async function consumeConfirmation(input, options = {}) {
  assertRecentAssurance(input.session);
  if (input.currentPreviewRevision && String(input.currentPreviewRevision) !== String(input.previewRevision)) {
    const error = new Error("The target changed after preview. Review the current impact and try again.");
    error.statusCode = 409;
    error.code = "TRANSACTION_PREVIEW_STALE";
    throw error;
  }
  const confirmation = await repository.consumeConfirmation({
    tokenHash: crypto.createHash("sha256").update(String(input.token || "")).digest("hex"),
    actorId: input.actorId,
    sessionId: input.session._id,
    action: String(input.action),
    target: String(input.target),
    reason: normalizeReason(input.reason),
    payloadDigest: buildPayloadDigest(input.payload),
    previewRevision: String(input.previewRevision)
  }, options);
  if (!confirmation) {
    const error = new Error("This confirmation is no longer valid. Review the action and try again.");
    error.statusCode = 403;
    error.code = "TRANSACTION_CONFIRMATION_INVALID";
    throw error;
  }
  return confirmation;
}

module.exports = {
  assertRecentAssurance,
  buildPayloadDigest,
  consumeConfirmation,
  issueConfirmation
};
