const db = require("../config/db");

function clientFor(options = {}) {
  return options.client || db.pool;
}

function mapFactor(row) {
  if (!row) return null;
  return {
    _id: String(row.id),
    userId: String(row.user_id),
    factorType: row.factor_type,
    label: row.label,
    ciphertext: row.secret_ciphertext,
    iv: row.secret_iv,
    authTag: row.secret_auth_tag,
    status: row.status,
    verifiedAt: row.verified_at
  };
}

async function replacePendingTotpFactor(userId, encrypted, options = {}) {
  if (!options.client) {
    return db.withTransaction((client) =>
      replacePendingTotpFactor(userId, encrypted, { client })
    );
  }
  const client = clientFor(options);
  await client.query(
    `UPDATE auth_mfa_factors SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND factor_type = 'totp' AND status = 'pending'`,
    [Number(userId)]
  );
  const result = await client.query(
    `INSERT INTO auth_mfa_factors (
       user_id, factor_type, label, secret_ciphertext, secret_iv, secret_auth_tag, status
     ) VALUES ($1, 'totp', 'Authenticator app', $2, $3, $4, 'pending')
     RETURNING *`,
    [Number(userId), encrypted.ciphertext, encrypted.iv, encrypted.authTag]
  );
  return mapFactor(result.rows[0]);
}

async function findTotpFactor(userId, status = "active", options = {}) {
  const result = await clientFor(options).query(
    `SELECT * FROM auth_mfa_factors
     WHERE user_id = $1 AND factor_type = 'totp' AND status = $2
     ORDER BY created_at DESC LIMIT 1`,
    [Number(userId), status]
  );
  return mapFactor(result.rows[0]);
}

async function revokePendingTotpFactor(userId, options = {}) {
  const result = await clientFor(options).query(
    `UPDATE auth_mfa_factors
     SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND factor_type = 'totp' AND status = 'pending'
     RETURNING id`,
    [Number(userId)]
  );
  return Boolean(result.rows[0]);
}

async function activateFactor(factorId, options = {}) {
  if (!options.client) {
    return db.withTransaction((client) => activateFactor(factorId, { client }));
  }
  const client = clientFor(options);
  const pendingResult = await client.query(
    `SELECT user_id, factor_type FROM auth_mfa_factors
     WHERE id = $1 AND status = 'pending'
     FOR UPDATE`,
    [Number(factorId)]
  );
  const pending = pendingResult.rows[0];
  if (!pending) return null;

  await client.query(
    `UPDATE auth_mfa_factors
     SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND factor_type = $2 AND status = 'active'`,
    [pending.user_id, pending.factor_type]
  );
  const result = await client.query(
    `UPDATE auth_mfa_factors
     SET status = 'active', verified_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [Number(factorId)]
  );
  return mapFactor(result.rows[0]);
}

async function replaceRecoveryCodes(userId, codeHashes, options = {}) {
  const client = clientFor(options);
  await client.query(`DELETE FROM auth_mfa_recovery_codes WHERE user_id = $1`, [Number(userId)]);
  for (const codeHash of codeHashes) {
    await client.query(
      `INSERT INTO auth_mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)`,
      [Number(userId), codeHash]
    );
  }
}

async function consumeRecoveryCode(userId, codeHash, options = {}) {
  const result = await clientFor(options).query(
    `UPDATE auth_mfa_recovery_codes SET used_at = NOW()
     WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
     RETURNING id`,
    [Number(userId), codeHash]
  );
  return Boolean(result.rows[0]);
}

async function revokeFactorsAndRecoveryCodes(userId, options = {}) {
  const client = clientFor(options);
  await client.query(
    `UPDATE auth_mfa_factors
     SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND status IN ('pending', 'active')`,
    [Number(userId)]
  );
  await client.query(
    `DELETE FROM auth_mfa_recovery_codes WHERE user_id = $1`,
    [Number(userId)]
  );
}

async function createChallenge(data, options = {}) {
  const result = await clientFor(options).query(
    `INSERT INTO auth_mfa_challenges (
       user_id, token_hash, challenge_type, primary_authenticated_at,
       ip_address, user_agent, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, expires_at`,
    [
      Number(data.userId), data.tokenHash, data.challengeType,
      data.primaryAuthenticatedAt, data.ipAddress || null, data.userAgent || null, data.expiresAt
    ]
  );
  return { _id: String(result.rows[0].id), expiresAt: result.rows[0].expires_at };
}

async function findChallengeByTokenHash(tokenHash, options = {}) {
  const result = await clientFor(options).query(
    `SELECT * FROM auth_mfa_challenges WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  );
  const row = result.rows[0];
  return row ? {
    _id: String(row.id), userId: String(row.user_id), challengeType: row.challenge_type,
    primaryAuthenticatedAt: row.primary_authenticated_at, ipAddress: row.ip_address,
    userAgent: row.user_agent, attemptCount: row.attempt_count,
    expiresAt: row.expires_at, usedAt: row.used_at
  } : null;
}

async function recordChallengeFailure(challengeId, options = {}) {
  await clientFor(options).query(
    `UPDATE auth_mfa_challenges SET attempt_count = attempt_count + 1 WHERE id = $1`,
    [Number(challengeId)]
  );
}

async function consumeChallenge(challengeId, options = {}) {
  const result = await clientFor(options).query(
    `UPDATE auth_mfa_challenges SET used_at = NOW()
     WHERE id = $1 AND used_at IS NULL AND expires_at > NOW() AND attempt_count < 5
     RETURNING id`,
    [Number(challengeId)]
  );
  return Boolean(result.rows[0]);
}

module.exports = {
  activateFactor,
  consumeChallenge,
  consumeRecoveryCode,
  createChallenge,
  findChallengeByTokenHash,
  findTotpFactor,
  recordChallengeFailure,
  replacePendingTotpFactor,
  replaceRecoveryCodes,
  revokePendingTotpFactor,
  revokeFactorsAndRecoveryCodes
};
