const db = require("../config/db");

const OTP_COLUMNS = `
  id,
  tenant_id,
  code_hash,
  delivery_channel,
  delivery_target,
  payload,
  expires_at,
  verified_at,
  verification_token_hash,
  consumed_at,
  created_at,
  updated_at
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
    verifiedAt: row.verified_at,
    verificationTokenHash: row.verification_token_hash,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function createOtp(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO booking_otps (
        tenant_id,
        code_hash,
        delivery_channel,
        delivery_target,
        payload,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${OTP_COLUMNS}
    `,
    [
      Number(data.tenantId),
      data.codeHash,
      data.deliveryChannel,
      data.deliveryTarget,
      JSON.stringify(data.payload || {}),
      data.expiresAt
    ]
  );

  return mapOtp(result.rows[0]);
}

async function findOtpById(otpId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT ${OTP_COLUMNS} FROM booking_otps WHERE id = $1 LIMIT 1`,
    [Number(otpId)]
  );

  return mapOtp(result.rows[0]);
}

async function findOtpByIdForUpdate(otpId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT ${OTP_COLUMNS} FROM booking_otps WHERE id = $1 FOR UPDATE`,
    [Number(otpId)]
  );

  return mapOtp(result.rows[0]);
}

async function findVerifiedTokenForUpdate(tokenHash, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${OTP_COLUMNS}
      FROM booking_otps
      WHERE verification_token_hash = $1
      FOR UPDATE
    `,
    [tokenHash]
  );

  return mapOtp(result.rows[0]);
}

async function markOtpVerified(otpId, data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE booking_otps
      SET verified_at = NOW(),
          verification_token_hash = $2
      WHERE id = $1
      RETURNING ${OTP_COLUMNS}
    `,
    [Number(otpId), data.verificationTokenHash]
  );

  return mapOtp(result.rows[0]);
}

async function markTokenConsumed(otpId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE booking_otps
      SET consumed_at = NOW()
      WHERE id = $1
      RETURNING ${OTP_COLUMNS}
    `,
    [Number(otpId)]
  );

  return mapOtp(result.rows[0]);
}

module.exports = {
  createOtp,
  findOtpById,
  findOtpByIdForUpdate,
  findVerifiedTokenForUpdate,
  markOtpVerified,
  markTokenConsumed
};
