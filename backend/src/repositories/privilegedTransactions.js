const db = require("../config/db");

function clientFor(options = {}) {
  return options.client || db.pool;
}

async function createConfirmation(data, options = {}) {
  const result = await clientFor(options).query(
    `
      INSERT INTO privileged_transaction_confirmations (
        token_hash, actor_user_id, session_id, action_key, target_key, reason,
        payload_digest, preview_revision, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, expires_at
    `,
    [
      data.tokenHash,
      Number(data.actorId),
      Number(data.sessionId),
      data.action,
      data.target,
      data.reason,
      data.payloadDigest,
      data.previewRevision,
      data.expiresAt
    ]
  );
  return { _id: String(result.rows[0].id), expiresAt: result.rows[0].expires_at };
}

async function consumeConfirmation(data, options = {}) {
  const result = await clientFor(options).query(
    `
      UPDATE privileged_transaction_confirmations
      SET used_at = NOW()
      WHERE token_hash = $1
        AND actor_user_id = $2
        AND session_id = $3
        AND action_key = $4
        AND target_key = $5
        AND reason = $6
        AND payload_digest = $7
        AND preview_revision = $8
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING id, expires_at, used_at
    `,
    [
      data.tokenHash,
      Number(data.actorId),
      Number(data.sessionId),
      data.action,
      data.target,
      data.reason,
      data.payloadDigest,
      data.previewRevision
    ]
  );
  return result.rows[0] ? { _id: String(result.rows[0].id), ...result.rows[0] } : null;
}

module.exports = { createConfirmation, consumeConfirmation };
