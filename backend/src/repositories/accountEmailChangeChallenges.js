const db = require("../config/db");

function clientFor(options = {}) {
  return options.client || db.pool;
}

function mapChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: String(row.user_id),
    currentEmail: row.current_email,
    newEmail: row.new_email,
    currentEmailVerifiedAt: row.current_email_verified_at,
    currentCodeHash: row.current_code_hash,
    currentCodeExpiresAt: row.current_code_expires_at,
    currentCodeAttempts: Number(row.current_code_attempts || 0),
    newCodeHash: row.new_code_hash,
    newCodeExpiresAt: row.new_code_expires_at,
    newCodeAttempts: Number(row.new_code_attempts || 0),
    usedAt: row.used_at,
    createdAt: row.created_at
  };
}

async function createChallenge(data, options = {}) {
  const result = await clientFor(options).query(
    `INSERT INTO account_email_change_challenges (
       id, user_id, current_email, new_email, current_email_verified_at,
       current_code_hash, current_code_expires_at, new_code_hash, new_code_expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [data.id, Number(data.userId), data.currentEmail, data.newEmail,
      data.currentEmailVerifiedAt || null, data.currentCodeHash || null,
      data.currentCodeExpiresAt || null, data.newCodeHash, data.newCodeExpiresAt]
  );
  return mapChallenge(result.rows[0]);
}

async function findById(id, options = {}) {
  const result = await clientFor(options).query(
    `SELECT * FROM account_email_change_challenges WHERE id = $1 LIMIT 1`, [id]
  );
  return mapChallenge(result.rows[0]);
}

async function invalidateActiveForUser(userId, options = {}) {
  await clientFor(options).query(
    `UPDATE account_email_change_challenges SET used_at = COALESCE(used_at, NOW()), updated_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`, [Number(userId)]
  );
}

async function recordCurrentAttempt(id, options = {}) {
  const result = await clientFor(options).query(
    `UPDATE account_email_change_challenges
     SET current_code_attempts = current_code_attempts + 1, updated_at = NOW()
     WHERE id = $1 AND used_at IS NULL AND current_code_attempts < 5
     RETURNING *`, [id]
  );
  return mapChallenge(result.rows[0]);
}

async function markCurrentVerified(id, options = {}) {
  const result = await clientFor(options).query(
    `UPDATE account_email_change_challenges
     SET current_email_verified_at = NOW(), current_code_hash = NULL, updated_at = NOW()
     WHERE id = $1 AND used_at IS NULL AND current_email_verified_at IS NULL
     RETURNING *`, [id]
  );
  return mapChallenge(result.rows[0]);
}

async function recordNewAttempt(id, options = {}) {
  const result = await clientFor(options).query(
    `UPDATE account_email_change_challenges
     SET new_code_attempts = new_code_attempts + 1, updated_at = NOW()
     WHERE id = $1 AND used_at IS NULL AND new_code_attempts < 5
     RETURNING *`, [id]
  );
  return mapChallenge(result.rows[0]);
}

async function markUsed(id, options = {}) {
  const result = await clientFor(options).query(
    `UPDATE account_email_change_challenges SET used_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND used_at IS NULL RETURNING *`, [id]
  );
  return mapChallenge(result.rows[0]);
}

module.exports = {
  createChallenge,
  findById,
  invalidateActiveForUser,
  recordCurrentAttempt,
  markCurrentVerified,
  recordNewAttempt,
  markUsed
};
