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
    previousRefreshTokenHash: row.previous_refresh_token_hash,
    status: row.status,
    authMethod: row.auth_method,
    mfaVerifiedAt: row.mfa_verified_at,
    primaryAuthenticatedAt: row.primary_authenticated_at,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    deviceLabel: row.device_label,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    inactivityExpiresAt: row.inactivity_expires_at,
    lastRotatedAt: row.last_rotated_at,
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
  previous_refresh_token_hash,
  status,
  auth_method,
  mfa_verified_at,
  primary_authenticated_at,
  ip_address,
  user_agent,
  device_label,
  last_seen_at,
  expires_at,
  absolute_expires_at,
  inactivity_expires_at,
  last_rotated_at,
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
        previous_refresh_token_hash,
        status,
        auth_method,
        mfa_verified_at,
        primary_authenticated_at,
        ip_address,
        user_agent,
        device_label,
        last_seen_at,
        expires_at,
        absolute_expires_at,
        inactivity_expires_at
      )
      VALUES ($1, $2, NULL, 'active', $3, $4, COALESCE($5, NOW()), $6, $7, $8, NOW(), $9, $10, $11)
      RETURNING ${SESSION_COLUMNS}
    `,
    [
      Number(data.userId),
      data.refreshTokenHash,
      data.authMethod,
      data.mfaVerifiedAt || null,
      data.primaryAuthenticatedAt || null,
      data.ipAddress || null,
      data.userAgent || null,
      data.deviceLabel || null,
      data.expiresAt,
      data.absoluteExpiresAt || data.expiresAt,
      data.inactivityExpiresAt || data.expiresAt
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

async function findSessionByPreviousRefreshTokenHash(refreshTokenHash, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${SESSION_COLUMNS} FROM auth_sessions WHERE previous_refresh_token_hash = $1 LIMIT 1`,
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
        previous_refresh_token_hash = refresh_token_hash,
        refresh_token_hash = $2,
        expires_at = $3,
        inactivity_expires_at = $4,
        last_rotated_at = NOW(),
        revoked_at = NULL,
        revoke_reason = NULL,
        status = 'active',
        last_seen_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND status = 'active'
        AND ($5::TEXT IS NULL OR refresh_token_hash = $5)
      RETURNING ${SESSION_COLUMNS}
    `,
    [
      Number(sessionId),
      refreshTokenHash,
      expiresAt,
      options.inactivityExpiresAt || expiresAt,
      options.expectedRefreshTokenHash || null
    ]
  );
  return mapSession(result.rows[0]);
}

async function touchSession(sessionId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      UPDATE auth_sessions
      SET
        last_seen_at = NOW(),
        inactivity_expires_at = LEAST(
          absolute_expires_at,
          NOW() + ($2::INTEGER * INTERVAL '1 minute')
        ),
        updated_at = NOW()
      WHERE id = $1
    `,
    [Number(sessionId), Number(options.inactivityMinutes || 10080)]
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

async function markMfaVerified(sessionId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `UPDATE auth_sessions
     SET mfa_verified_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'active'
     RETURNING ${SESSION_COLUMNS}`,
    [Number(sessionId)]
  );
  return mapSession(result.rows[0]);
}

async function markRecentAuthentication(sessionId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `UPDATE auth_sessions
     SET primary_authenticated_at = NOW(), mfa_verified_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'active'
     RETURNING ${SESSION_COLUMNS}`,
    [Number(sessionId)]
  );
  return mapSession(result.rows[0]);
}

async function clearMfaVerification(sessionId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `UPDATE auth_sessions
     SET primary_authenticated_at = NOW(), mfa_verified_at = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'active'
     RETURNING ${SESSION_COLUMNS}`,
    [Number(sessionId)]
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

async function revokeOtherSessionsForUser(userId, currentSessionId, revokeReason, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `UPDATE auth_sessions SET status = 'revoked', revoked_at = NOW(), revoke_reason = $3, updated_at = NOW()
     WHERE user_id = $1 AND id <> $2 AND status = 'active'`,
    [Number(userId), Number(currentSessionId), revokeReason || null]
  );
}

module.exports = {
  createSession,
  findSessionById,
  findSessionByRefreshTokenHash,
  findSessionByPreviousRefreshTokenHash,
  rotateSessionRefreshToken,
  touchSession,
  markMfaVerified,
  markRecentAuthentication,
  clearMfaVerification,
  revokeSession,
  listActiveSessionsByUserId,
  revokeAllSessionsForUser,
  revokeOtherSessionsForUser
};
