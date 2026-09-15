const db = require("../config/db");

function queryClient(client) {
  return client || db.pool;
}

function mapRegistration(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    projectId: String(row.developer_project_id),
    environment: row.environment,
    name: row.name,
    url: row.url,
    payloadVersion: Number(row.payload_version),
    events: row.event_types || [],
    previousSigningSecretCiphertext: row.previous_signing_secret_ciphertext,
    previousSigningSecretExpiresAt: row.previous_signing_secret_expires_at,
    status: row.status,
    disabledAt: row.disabled_at,
    createdByUserId: String(row.created_by_user_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const REGISTRATION_COLUMNS = `
  id,
  developer_project_id,
  environment,
  name,
  url,
  payload_version,
  event_types,
  previous_signing_secret_ciphertext,
  previous_signing_secret_expires_at,
  status,
  disabled_at,
  created_by_user_id,
  created_at,
  updated_at
`;

async function listRegistrations(projectId, options = {}) {
  const result = await queryClient(options.client).query(
    `SELECT ${REGISTRATION_COLUMNS}
     FROM developer_webhook_registrations
     WHERE developer_project_id = $1
     ORDER BY created_at DESC, id DESC`,
    [projectId]
  );
  return result.rows.map(mapRegistration);
}

async function createRegistration(data, options = {}) {
  const result = await queryClient(options.client).query(
    `INSERT INTO developer_webhook_registrations (
       developer_project_id, environment, name, url, payload_version,
       event_types, signing_secret_ciphertext, created_by_user_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${REGISTRATION_COLUMNS}`,
    [
      data.projectId,
      data.environment,
      data.name,
      data.url,
      Number(data.payloadVersion),
      data.events,
      data.signingSecretCiphertext,
      Number(data.userId)
    ]
  );
  return mapRegistration(result.rows[0]);
}

async function disableRegistration(projectId, registrationId, options = {}) {
  const result = await queryClient(options.client).query(
    `UPDATE developer_webhook_registrations
     SET status = 'disabled', disabled_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND developer_project_id = $2 AND status = 'active'
     RETURNING ${REGISTRATION_COLUMNS}`,
    [registrationId, projectId]
  );
  return mapRegistration(result.rows[0]);
}

async function rotateRegistration(projectId, registrationId, signingSecretCiphertext, options = {}) {
  const previousCiphertext = options.immediate ? "NULL" : "signing_secret_ciphertext";
  const previousExpiry = options.immediate ? "NULL" : "NOW() + INTERVAL '24 hours'";
  const result = await queryClient(options.client).query(
    `UPDATE developer_webhook_registrations
     SET previous_signing_secret_ciphertext = ${previousCiphertext},
         previous_signing_secret_expires_at = ${previousExpiry},
         signing_secret_ciphertext = $3,
         updated_at = NOW()
     WHERE id = $1 AND developer_project_id = $2 AND status = 'active'
     RETURNING ${REGISTRATION_COLUMNS}`,
    [registrationId, projectId, signingSecretCiphertext]
  );
  return mapRegistration(result.rows[0]);
}

module.exports = {
  createRegistration,
  disableRegistration,
  listRegistrations,
  mapRegistration,
  rotateRegistration
};
