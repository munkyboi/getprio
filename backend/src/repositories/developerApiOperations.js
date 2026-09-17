const crypto = require("node:crypto");
const db = require("../config/db");

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function requestHash(payload) {
  return crypto.createHash("sha256").update(stableJson(payload)).digest("hex");
}

function conflict(message, code) {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = code;
  return error;
}

async function claim(input, options = {}) {
  const client = options.client || db.pool;
  const key = String(input.key || "").trim();
  if (key.length < 8 || key.length > 128) {
    const error = new Error("Idempotency-Key must be between 8 and 128 characters.");
    error.statusCode = 400;
    error.code = "INVALID_IDEMPOTENCY_KEY";
    throw error;
  }
  const hash = requestHash(input.payload || {});
  const inserted = await client.query(
    `INSERT INTO developer_api_operations
       (developer_project_id, environment, developer_api_key_id, operation_scope,
        idempotency_key, request_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '7 days')
     ON CONFLICT (developer_api_key_id, operation_scope, idempotency_key) DO NOTHING
     RETURNING id`,
    [input.projectId, input.environment, input.apiKeyId, input.scope, key, hash]
  );
  if (inserted.rows[0]) return { state: "claimed", recordId: String(inserted.rows[0].id) };

  const existing = await client.query(
    `SELECT id, request_hash, status, response_status, response_body
     FROM developer_api_operations
     WHERE developer_api_key_id = $1 AND operation_scope = $2 AND idempotency_key = $3
     FOR UPDATE`,
    [input.apiKeyId, input.scope, key]
  );
  const record = existing.rows[0];
  if (!record || record.request_hash !== hash) {
    throw conflict("This idempotency key was already used for a different request.", "IDEMPOTENCY_KEY_REUSED");
  }
  if (record.status !== "completed") {
    throw conflict("This idempotency operation is still being processed.", "IDEMPOTENCY_OPERATION_PENDING");
  }
  return {
    state: "replay",
    statusCode: Number(record.response_status),
    body: record.response_body
  };
}

async function complete(recordId, statusCode, body, options = {}) {
  const client = options.client || db.pool;
  await client.query(
    `UPDATE developer_api_operations
     SET status = 'completed', response_status = $2, response_body = $3,
       completed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [recordId, statusCode, body]
  );
}

module.exports = { claim, complete, requestHash };
