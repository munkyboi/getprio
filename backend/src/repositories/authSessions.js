const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

function mapSession(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    userId: String(row.user_id),
    refreshTokenHash: row.refresh_token_hash,
    status: row.status,
    authMethod: row.auth_method,
    mfaVerifiedAt: row.mfa_verified_at,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    deviceLabel: row.device_label,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SESSION_COLUMNS = `
  id,
  user_id,
  refresh_token_hash,
  status,
  auth_method,
  mfa_verified_at,
  ip_address,
  user_agent,
  device_label,
  last_seen_at,
  expires_at,
  revoked_at,
  revoke_reason,
  created_at,
  updated_at
`;

async function createSession(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO auth_sessions (
        user_id,
        refresh_token_hash,
        status,
        auth_method,
        mfa_verified_at,
        ip_address,
        user_agent,
        device_label,
        last_seen_at,
        expires_at
      )
      VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, NOW(), $8)
      RETURNING ${SESSION_COLUMNS}
    `,
    [
      Number(data.userId),
      data.refreshTokenHash,
      data.authMethod,
      data.mfaVerifiedAt || null,
      data.ipAddress || null,
      data.userAgent || null,
      data.deviceLabel || null,
      data.expiresAt
    ]
  );

  return mapSession(result.rows[0]);
}

async function findSessionById(id, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${SESSION_COLUMNS} FROM auth_sessions WHERE id = $1 LIMIT 1`,
    [Number(id)]
  );
  return mapSession(result.rows[0]);
}

async function findSessionByRefreshTokenHash(refreshTokenHash, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${SESSION_COLUMNS} FROM auth_sessions WHERE refresh_token_hash = $1 LIMIT 1`,
    [refreshTokenHash]
  );
  return mapSession(result.rows[0]);
}

async function rotateSessionRefreshToken(sessionId, refreshTokenHash, expiresAt, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE auth_sessions
      SET
        refresh_token_hash = $2,
        expires_at = $3,
        revoked_at = NULL,
        revoke_reason = NULL,
        status = 'active',
        last_seen_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${SESSION_COLUMNS}
    `,
    [Number(sessionId), refreshTokenHash, expiresAt]
  );
  return mapSession(result.rows[0]);
}

async function touchSession(sessionId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      UPDATE auth_sessions
      SET last_seen_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [Number(sessionId)]
  );
}

async function revokeSession(sessionId, revokeReason, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE auth_sessions
      SET
        status = 'revoked',
        revoked_at = NOW(),
        revoke_reason = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${SESSION_COLUMNS}
    `,
    [Number(sessionId), revokeReason || null]
  );
  return mapSession(result.rows[0]);
}

async function listActiveSessionsByUserId(userId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${SESSION_COLUMNS}
      FROM auth_sessions
      WHERE user_id = $1 AND status = 'active'
      ORDER BY created_at DESC
    `,
    [Number(userId)]
  );
  return result.rows.map(mapSession);
}

async function revokeAllSessionsForUser(userId, revokeReason, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      UPDATE auth_sessions
      SET
        status = 'revoked',
        revoked_at = NOW(),
        revoke_reason = $2,
        updated_at = NOW()
      WHERE user_id = $1 AND status = 'active'
    `,
    [Number(userId), revokeReason || null]
  );
}

module.exports = {
  createSession,
  findSessionById,
  findSessionByRefreshTokenHash,
  rotateSessionRefreshToken,
  touchSession,
  revokeSession,
  listActiveSessionsByUserId,
  revokeAllSessionsForUser
};
