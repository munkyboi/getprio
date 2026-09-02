const db = require("../src/config/db");

function queryClient(client) {
  return client || db.pool;
}

async function create(data, options = {}) {
  const result = await queryClient(options.client).query(
    `
      INSERT INTO mobile_oauth_codes (
        code_hash, state, code_challenge, response_body, expires_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5)
      RETURNING id
    `,
    [data.codeHash, data.state, data.codeChallenge, JSON.stringify(data.responseBody), data.expiresAt]
  );
  return result.rows[0] ? String(result.rows[0].id) : null;
}

async function consume(codeHash, options = {}) {
  const result = await queryClient(options.client).query(
    `
      DELETE FROM mobile_oauth_codes
      WHERE code_hash = $1 AND expires_at > NOW()
      RETURNING state, code_challenge, response_body
    `,
    [codeHash]
  );
  return result.rows[0] || null;
}

async function deleteExpired(options = {}) {
  await queryClient(options.client).query(
    `DELETE FROM mobile_oauth_codes WHERE expires_at <= NOW()`
  );
}

module.exports = { create, consume, deleteExpired };
