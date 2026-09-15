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

module.exports = { createLink };
