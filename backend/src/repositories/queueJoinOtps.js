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

module.exports = {
  createOtp,
  findOtpByIdForUpdate,
  findOtpById,
  markOtpUsed
};
