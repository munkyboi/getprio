const db = require("../config/db");

async function claim(data, options = {}) {
  const client = options.client || db.pool;
  const inserted = await client.query(
    `INSERT INTO idempotency_records (
       actor_user_id, scope, idempotency_key, request_hash, status, expires_at
     ) VALUES ($1, $2, $3, $4, 'pending', $5)
     ON CONFLICT (actor_user_id, scope, idempotency_key) DO NOTHING
     RETURNING *`,
    [Number(data.actorId), data.scope, data.key, data.requestHash, data.expiresAt]
  );
  if (inserted.rows[0]) return { state: "claimed", record: inserted.rows[0] };
  const existing = await client.query(
    `SELECT * FROM idempotency_records
     WHERE actor_user_id = $1 AND scope = $2 AND idempotency_key = $3 LIMIT 1`,
    [Number(data.actorId), data.scope, data.key]
  );
  return { state: "existing", record: existing.rows[0] || null };
}

async function complete(id, responseStatus, responseBody, options = {}) {
  await (options.client || db.pool).query(
    `UPDATE idempotency_records
     SET status = 'completed', response_status = $2, response_body = $3::jsonb, updated_at = NOW()
     WHERE id = $1`,
    [Number(id), Number(responseStatus), JSON.stringify(responseBody ?? null)]
  );
}

async function fail(id, options = {}) {
  await (options.client || db.pool).query(
    `UPDATE idempotency_records SET status = 'failed', updated_at = NOW() WHERE id = $1`,
    [Number(id)]
  );
}

module.exports = { claim, complete, fail };
