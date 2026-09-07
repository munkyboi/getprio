const db = require("../config/db");

function clientFor(options = {}) {
  return options.client || db.pool;
}

function mapChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: String(row.user_id),
    email: row.email,
    codeHash: row.code_hash,
    codeExpiresAt: row.code_expires_at,
    codeAttempts: Number(row.code_attempts || 0),
    usedAt: row.used_at,
    createdAt: row.created_at
  };
}

async function createChallenge(data, options = {}) {
  const result = await clientFor(options).query(
    `INSERT INTO customer_registration_otps (
       id, user_id, email, code_hash, code_expires_at
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.id, Number(data.userId), data.email, data.codeHash, data.codeExpiresAt]
  );
  return mapChallenge(result.rows[0]);
}

async function findByIdForUpdate(id, options = {}) {
  const result = await clientFor(options).query(
    `SELECT * FROM customer_registration_otps WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return mapChallenge(result.rows[0]);
}

async function recordAttempt(id, options = {}) {
  const result = await clientFor(options).query(
    `UPDATE customer_registration_otps
     SET code_attempts = code_attempts + 1, updated_at = NOW()
     WHERE id = $1 AND used_at IS NULL AND code_attempts < 5
     RETURNING *`,
    [id]
  );
  return mapChallenge(result.rows[0]);
}

async function replaceCode(id, data, options = {}) {
  const result = await clientFor(options).query(
    `UPDATE customer_registration_otps
     SET code_hash = $2, code_expires_at = $3, code_attempts = 0, updated_at = NOW()
     WHERE id = $1 AND used_at IS NULL
     RETURNING *`,
    [id, data.codeHash, data.codeExpiresAt]
  );
  return mapChallenge(result.rows[0]);
}

async function markUsed(id, options = {}) {
  const result = await clientFor(options).query(
    `UPDATE customer_registration_otps
     SET used_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND used_at IS NULL
     RETURNING *`,
    [id]
  );
  return mapChallenge(result.rows[0]);
}

module.exports = {
  createChallenge,
  findByIdForUpdate,
  markUsed,
  recordAttempt,
  replaceCode
};
