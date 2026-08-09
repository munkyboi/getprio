const db = require("../config/db");

const OTP_COLUMNS = `
  id,
  tenant_id,
  code_hash,
  delivery_channel,
  delivery_target,
  payload,
  expires_at,
  used_at,
  created_at,
  updated_at
  ,chain_id
  ,parent_otp_id
  ,resend_ordinal
  ,incorrect_attempt_count
  ,locked_until
`;

function buildQueryClient(client) {
  return client || db.pool;
}

function mapOtp(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    codeHash: row.code_hash,
    deliveryChannel: row.delivery_channel,
    deliveryTarget: row.delivery_target,
    payload: row.payload || {},
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
    ,chainId: row.chain_id
    ,parentOtpId: row.parent_otp_id ? String(row.parent_otp_id) : null
    ,resendOrdinal: Number(row.resend_ordinal || 0)
    ,incorrectAttemptCount: Number(row.incorrect_attempt_count || 0)
    ,lockedUntil: row.locked_until
  };
}

async function createOtp(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO queue_join_otps (
        tenant_id,
        code_hash,
        delivery_channel,
        delivery_target,
        payload,
        expires_at,
        chain_id,
        parent_otp_id,
        resend_ordinal
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, gen_random_uuid()), $8, $9)
      RETURNING ${OTP_COLUMNS}
    `,
    [
      Number(data.tenantId),
      data.codeHash,
      data.deliveryChannel,
      data.deliveryTarget,
      JSON.stringify(data.payload || {}),
      data.expiresAt,
      data.chainId || null,
      data.parentOtpId ? Number(data.parentOtpId) : null,
      Number(data.resendOrdinal || 0)
    ]
  );

  return mapOtp(result.rows[0]);
}

async function findOtpByIdForUpdate(otpId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${OTP_COLUMNS}
      FROM queue_join_otps
      WHERE id = $1
      FOR UPDATE
    `,
    [Number(otpId)]
  );

  return mapOtp(result.rows[0]);
}

async function findOtpById(otpId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${OTP_COLUMNS}
      FROM queue_join_otps
      WHERE id = $1
      LIMIT 1
    `,
    [Number(otpId)]
  );

  return mapOtp(result.rows[0]);
}

async function markOtpUsed(otpId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE queue_join_otps
      SET used_at = NOW()
      WHERE id = $1
      RETURNING ${OTP_COLUMNS}
    `,
    [Number(otpId)]
  );

  return mapOtp(result.rows[0]);
}

async function findLatestForChain(chainId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT ${OTP_COLUMNS} FROM queue_join_otps WHERE chain_id = $1 ORDER BY resend_ordinal DESC LIMIT 1`, [chainId]
  );
  return mapOtp(result.rows[0]);
}

async function recordIncorrectAttempt(chainId, otpId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(`SELECT id FROM queue_join_otps WHERE chain_id = $1 FOR UPDATE`, [chainId]);
  const totalResult = await queryClient.query(
    `SELECT COALESCE(SUM(incorrect_attempt_count), 0)::INTEGER AS attempts
     FROM queue_join_otps WHERE chain_id = $1`, [chainId]
  );
  const attempts = Number(totalResult.rows[0]?.attempts || 0) + 1;
  await queryClient.query(`UPDATE queue_join_otps SET incorrect_attempt_count = LEAST(5, incorrect_attempt_count + 1), updated_at = NOW() WHERE id = $1`, [otpId]);
  if (attempts >= 5) await queryClient.query(`UPDATE queue_join_otps SET locked_until = NOW() + INTERVAL '30 minutes', updated_at = NOW() WHERE chain_id = $1`, [chainId]);
  return { attempts, locked: attempts >= 5 };
}

module.exports = {
  createOtp,
  findOtpByIdForUpdate,
  findOtpById,
  findLatestForChain,
  recordIncorrectAttempt,
  markOtpUsed
};
