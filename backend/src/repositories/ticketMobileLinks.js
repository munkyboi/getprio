const db = require("../config/db");

function mapLink(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    developerProjectId: String(row.developer_project_id),
    environment: row.environment,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at
  };
}

async function createLink(data, options = {}) {
  const queryClient = options.client || db.pool;
  const result = await queryClient.query(
    `INSERT INTO ticket_mobile_links
       (ticket_id, developer_project_id, environment, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, ticket_id, developer_project_id, environment, token_hash, expires_at, used_at, revoked_at, created_at`,
    [Number(data.ticketId), data.developerProjectId, data.environment, data.tokenHash, data.expiresAt]
  );
  return mapLink(result.rows[0]);
}

async function findActiveLinkForTicket(data, options = {}) {
  const queryClient = options.client || db.pool;
  const result = await queryClient.query(
    `SELECT id, ticket_id, developer_project_id, environment, token_hash, expires_at, used_at, revoked_at, created_at
       FROM ticket_mobile_links
      WHERE ticket_id = $1
        AND developer_project_id = $2
        AND environment = $3
        AND used_at IS NULL
        AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE`,
    [Number(data.ticketId), data.developerProjectId, data.environment]
  );
  return mapLink(result.rows[0]);
}

async function findUsableLinkByTokenHash(tokenHash, options = {}) {
  const queryClient = options.client || db.pool;
  const lock = options.forUpdate ? " FOR UPDATE" : "";
  const result = await queryClient.query(
    `SELECT id, ticket_id, developer_project_id, environment, token_hash, expires_at, used_at, revoked_at, created_at
       FROM ticket_mobile_links
      WHERE token_hash = $1
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1${lock}`,
    [tokenHash]
  );
  return mapLink(result.rows[0]);
}

async function consumeLink(linkId, options = {}) {
  const queryClient = options.client || db.pool;
  const result = await queryClient.query(
    `UPDATE ticket_mobile_links
        SET used_at = NOW()
      WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
      RETURNING id, ticket_id, developer_project_id, environment, token_hash, expires_at, used_at, revoked_at, created_at`,
    [linkId]
  );
  return mapLink(result.rows[0]);
}

async function revokeLink(linkId, options = {}) {
  const queryClient = options.client || db.pool;
  await queryClient.query(
    `UPDATE ticket_mobile_links
        SET revoked_at = NOW()
      WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
    [linkId]
  );
}

module.exports = { createLink, findActiveLinkForTicket, findUsableLinkByTokenHash, consumeLink, revokeLink };
