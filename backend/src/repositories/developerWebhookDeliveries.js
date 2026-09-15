const db = require("../config/db");

function queryClient(client) {
  return client || db.pool;
}

function mapDelivery(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    registrationId: String(row.registration_id),
    projectId: String(row.developer_project_id),
    environment: row.environment,
    url: row.url,
    signingSecretCiphertext: row.signing_secret_ciphertext,
    previousSigningSecretCiphertext: row.previous_signing_secret_ciphertext,
    previousSigningSecretExpiresAt: row.previous_signing_secret_expires_at,
    eventId: row.event_id,
    eventType: row.event_type,
    payloadVersion: Number(row.payload_version),
    payloadBody: row.payload_body,
    payload: row.payload,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    availableAt: row.available_at,
    expiresAt: row.expires_at,
    retryUntil: row.retry_until,
    registrationStatus: row.registration_status,
    manualAttemptCount: Number(row.manual_attempt_count || 0),
    lastManualAttemptAt: row.last_manual_attempt_at,
    manualLastError: row.manual_last_error,
    manualResponseStatus: row.manual_response_status == null ? null : Number(row.manual_response_status),
    leaseOwner: row.lease_owner,
    leasedUntil: row.leased_until,
    lastError: row.last_error,
    responseStatus: row.response_status,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const DELIVERY_COLUMNS = `
  d.id,
  d.registration_id,
  r.developer_project_id,
  r.environment,
  r.url,
  r.signing_secret_ciphertext,
  r.previous_signing_secret_ciphertext,
  r.previous_signing_secret_expires_at,
  d.event_id,
  d.event_type,
  d.payload_version,
  d.payload_body,
  d.payload,
  d.status,
  d.attempt_count,
  d.available_at,
  d.expires_at,
  d.retry_until,
  r.status AS registration_status,
  d.manual_attempt_count,
  d.last_manual_attempt_at,
  d.manual_last_error,
  d.manual_response_status,
  d.lease_owner,
  d.leased_until,
  d.last_error,
  d.response_status,
  d.sent_at,
  d.created_at,
  d.updated_at`;

async function enqueueForRegistrations(data, options = {}) {
  if (!options.client) {
    return db.withTransaction((client) => enqueueForRegistrations(data, { ...options, client }));
  }
  const client = queryClient(options.client);
  const registrations = await client.query(
    `SELECT id, payload_version
     FROM developer_webhook_registrations
     WHERE developer_project_id = $1
       AND environment = $2
       AND status = 'active'
       AND event_types @> ARRAY[$3]::TEXT[]`,
    [data.projectId, data.environment, data.eventType]
  );
  const inserted = [];
  for (const registration of registrations.rows) {
    const version = Number(registration.payload_version);
    if (version !== Number(data.payloadVersion) && typeof data.renderPayload !== "function") {
      const error = new Error(`A renderer is required for webhook payload version ${version}.`);
      error.code = "WEBHOOK_VERSION_RENDERER_REQUIRED";
      throw error;
    }
    const rendered = typeof data.renderPayload === "function"
      ? await data.renderPayload(version)
      : { payload: data.payload, payloadBody: data.payloadBody };
    if (typeof rendered?.payloadBody !== "string") {
      throw new Error("Rendered webhook payload must be a string.");
    }
    if (data.maxBodyBytes && Buffer.byteLength(rendered.payloadBody, "utf8") > data.maxBodyBytes) {
      const error = new Error("Webhook payload exceeds the configured body limit.");
      error.code = "WEBHOOK_PAYLOAD_TOO_LARGE";
      throw error;
    }
    const result = await client.query(
      `INSERT INTO developer_webhook_deliveries (
         registration_id, event_id, event_type, payload_version, payload_body,
         payload, expires_at, retry_until
       )
       VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7, $8)
       ON CONFLICT (registration_id, event_id) DO NOTHING
       RETURNING id, registration_id`,
      [
        registration.id,
        String(data.eventId),
        data.eventType,
        version,
        rendered.payloadBody,
        JSON.stringify(rendered.payload || {}),
        data.expiresAt || null,
        data.retryUntil || null
      ]
    );
    if (result.rows[0]) {
      inserted.push({ id: String(result.rows[0].id), registrationId: String(result.rows[0].registration_id) });
    }
  }
  return inserted;
}

async function claimBatch(workerId, limit = 25, options = {}) {
  const result = await queryClient(options.client).query(
    `WITH expired AS (
       UPDATE developer_webhook_deliveries
       SET status = 'failed', lease_owner = NULL, leased_until = NULL,
           last_error = COALESCE(last_error, 'Automatic retry deadline elapsed'), updated_at = NOW()
       WHERE retry_until IS NOT NULL AND retry_until <= NOW()
         AND (status IN ('pending', 'retry') OR (status = 'processing' AND (leased_until IS NULL OR leased_until < NOW())))
       RETURNING id
     ), candidates AS (
       SELECT d.id
       FROM developer_webhook_deliveries d
       INNER JOIN developer_webhook_registrations r ON r.id = d.registration_id
       WHERE r.status = 'active'
         AND (d.status IN ('pending', 'retry') OR (d.status = 'processing' AND d.leased_until < NOW()))
         AND d.available_at <= NOW()
         AND (d.retry_until IS NULL OR d.retry_until > NOW())
         AND (d.leased_until IS NULL OR d.leased_until < NOW())
       ORDER BY d.available_at, d.id
       LIMIT $2
       FOR UPDATE OF d SKIP LOCKED
     ), claimed AS (
       UPDATE developer_webhook_deliveries d
       SET status = 'processing', lease_owner = $1,
           leased_until = NOW() + INTERVAL '2 minutes',
           attempt_count = d.attempt_count + 1, last_attempt_at = NOW(), updated_at = NOW()
       FROM candidates
       WHERE d.id = candidates.id
       RETURNING d.*
     )
     SELECT ${DELIVERY_COLUMNS}
     FROM claimed d
     INNER JOIN developer_webhook_registrations r ON r.id = d.registration_id`,
    [workerId, Math.max(1, Math.min(Number(limit) || 25, 100))]
  );
  return result.rows.map(mapDelivery);
}

async function findDelivery(projectId, registrationId, deliveryId, options = {}) {
  const result = await queryClient(options.client).query(
    `SELECT ${DELIVERY_COLUMNS}
     FROM developer_webhook_deliveries d
     INNER JOIN developer_webhook_registrations r ON r.id = d.registration_id
     WHERE r.developer_project_id = $1
       AND r.id = $2
       AND d.id = $3
     LIMIT 1`,
    [projectId, registrationId, deliveryId]
  );
  return mapDelivery(result.rows[0]);
}

async function listDeliveries(projectId, registrationId, limit = 100, options = {}) {
  const result = await queryClient(options.client).query(
    `SELECT ${DELIVERY_COLUMNS}
     FROM developer_webhook_deliveries d
     INNER JOIN developer_webhook_registrations r ON r.id = d.registration_id
     WHERE r.developer_project_id = $1
       AND r.id = $2
     ORDER BY d.created_at DESC, d.id DESC
     LIMIT $3`,
    [projectId, registrationId, Math.max(1, Math.min(Number(limit) || 100, 100))]
  );
  return result.rows.map(mapDelivery);
}

async function recordManualAttempt(id, result, options = {}) {
  const queryResult = await queryClient(options.client).query(
    `UPDATE developer_webhook_deliveries
     SET manual_attempt_count = manual_attempt_count + 1,
         last_manual_attempt_at = NOW(),
         manual_last_error = $2,
         manual_response_status = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [
      id,
      result?.error ? String(result.error).slice(0, 500) : null,
      result?.responseStatus == null ? null : Number(result.responseStatus)
    ]
  );
  return queryResult.rowCount > 0;
}

async function markSent(id, workerId, responseStatus, options = {}) {
  await queryClient(options.client).query(
    `UPDATE developer_webhook_deliveries
     SET status = 'sent', sent_at = NOW(), response_status = $3,
         lease_owner = NULL, leased_until = NULL, last_error = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'processing' AND lease_owner = $2`,
    [id, workerId, responseStatus == null ? null : Number(responseStatus)]
  );
}

async function markRetry(id, workerId, availableAt, errorMessage, responseStatus, options = {}) {
  await queryClient(options.client).query(
    `UPDATE developer_webhook_deliveries
     SET status = 'retry', available_at = $3, response_status = $5,
         lease_owner = NULL, leased_until = NULL, last_error = $4, updated_at = NOW()
     WHERE id = $1 AND status = 'processing' AND lease_owner = $2`,
    [id, workerId, availableAt, String(errorMessage || "Delivery failed").slice(0, 500), responseStatus == null ? null : Number(responseStatus)]
  );
}

async function markFailed(id, workerId, errorMessage, responseStatus, options = {}) {
  await queryClient(options.client).query(
    `UPDATE developer_webhook_deliveries
     SET status = 'failed', response_status = $3,
         lease_owner = NULL, leased_until = NULL, last_error = $4, updated_at = NOW()
     WHERE id = $1 AND status = 'processing' AND lease_owner = $2`,
    [id, workerId, responseStatus == null ? null : Number(responseStatus), String(errorMessage || "Delivery failed").slice(0, 500)]
  );
}

module.exports = {
  claimBatch,
  enqueueForRegistrations,
  findDelivery,
  listDeliveries,
  mapDelivery,
  markFailed,
  markRetry,
  markSent,
  recordManualAttempt
};
