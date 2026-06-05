const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

async function createResetToken(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, token_hash, expires_at, used_at, created_at
    `,
    [Number(data.userId), data.tokenHash, data.expiresAt]
  );

  return result.rows[0] || null;
}

async function findByTokenHash(tokenHash, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT id, user_id, token_hash, expires_at, used_at, created_at
      FROM password_reset_tokens
      WHERE token_hash = $1
      LIMIT 1
    `,
    [tokenHash]
  );

  return result.rows[0] || null;
}

async function invalidateUnusedTokensForUser(userId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
        AND expires_at > NOW()
    `,
    [Number(userId)]
  );
}

async function markTokenUsed(tokenId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE id = $1
    `,
    [Number(tokenId)]
  );
}

module.exports = {
  createResetToken,
  findByTokenHash,
  invalidateUnusedTokensForUser,
  markTokenUsed
};
