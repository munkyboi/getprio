const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

async function createAttempt(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      INSERT INTO auth_login_attempts (
        identifier_type,
        identifier_value,
        ip_address,
        user_agent,
        success,
        failure_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      data.identifierType,
      data.identifierValue,
      data.ipAddress || null,
      data.userAgent || null,
      Boolean(data.success),
      data.failureReason || null
    ]
  );
}

async function countRecentFailedAttempts(identifierValue, windowMinutes, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT COUNT(*)::int AS failed_count
      FROM auth_login_attempts
      WHERE identifier_type = 'email'
        AND identifier_value = $1
        AND success = FALSE
        AND attempted_at >= NOW() - ($2::text || ' minutes')::interval
    `,
    [identifierValue, Math.max(1, Number(windowMinutes) || 1)]
  );

  return result.rows[0]?.failed_count || 0;
}

module.exports = {
  countRecentFailedAttempts,
  createAttempt
};
