const db = require("../config/db");

function clientFor(options = {}) {
  return options.client || db.pool;
}

function mapChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: String(row.user_id),
    newPhone: row.new_phone,
    codeHash: row.code_hash,
    codeExpiresAt: row.code_expires_at,
    codeAttempts: Number(row.code_attempts || 0),
    usedAt: row.used_at,
    createdAt: row.created_at
  };
}

async function createChallenge(data, options = {}) {
  const result = await clientFor(options).query(
    `INSERT INTO account_phone_change_challenges (id, user_id, new_phone, code_hash, code_expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.id, Number(data.userId), data.newPhone, data.codeHash, data.codeExpiresAt]
  );
  return mapChallenge(result.rows[0]);
}

async function findById(id, options = {}) {
  const result = await clientFor(options).query(
    `SELECT * FROM account_phone_change_challenges WHERE id = $1 LIMIT 1`, [id]
  );
  return mapChallenge(result.rows[0]);
}

async function invalidateActiveForUser(userId, options = {}) {
  await clientFor(options).query(
    `UPDATE account_phone_change_challenges SET used_at = COALESCE(used_at, NOW()), updated_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`, [Number(userId)]
  );
}

async function recordAttempt(id, options = {}) {
  const result = await clientFor(options).query(
    `UPDATE account_phone_change_challenges
     SET code_attempts = code_attempts + 1, updated_at = NOW()
     WHERE id = $1 AND used_at IS NULL AND code_attempts < 5 RETURNING *`, [id]
  );
  return mapChallenge(result.rows[0]);
}

async function markUsed(id, options = {}) {
  const result = await clientFor(options).query(
    `UPDATE account_phone_change_challenges SET used_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND used_at IS NULL RETURNING *`, [id]
  );
  return mapChallenge(result.rows[0]);
}

module.exports = { createChallenge, findById, invalidateActiveForUser, recordAttempt, markUsed };
