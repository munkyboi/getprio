const crypto = require("node:crypto");
const repository = require("../repositories/idempotency");

function requestHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

async function claim(input, options = {}) {
  const key = String(input.key || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    const error = new Error("A valid Idempotency-Key is required for this action.");
    error.statusCode = 400;
    error.code = "IDEMPOTENCY_KEY_REQUIRED";
    throw error;
  }
  const hash = requestHash(input.payload);
  const result = await repository.claim({
    actorId: input.actorId,
    scope: input.scope,
    key,
    requestHash: hash,
    expiresAt: new Date(Date.now() + 24 * 60 * 60_000)
  }, options);
  if (result.state === "claimed") return { state: "claimed", record: result.record };
  if (!result.record || result.record.request_hash !== hash) {
    const error = new Error("This idempotency key was already used for a different request.");
    error.statusCode = 409;
    error.code = "IDEMPOTENCY_PAYLOAD_CONFLICT";
    throw error;
  }
  if (result.record.status === "completed") {
    return {
      state: "replay",
      statusCode: result.record.response_status,
      body: result.record.response_body
    };
  }
  const error = new Error("This action is already being processed. Please wait a moment.");
  error.statusCode = 409;
  error.code = "IDEMPOTENCY_IN_PROGRESS";
  throw error;
}

module.exports = { claim, requestHash };
