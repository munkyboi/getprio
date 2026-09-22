const db = require("../src/config/db");

function queryClient(client) {
  return client || db.pool;
}

function mapRegistration(row, options = {}) {
  if (!row) return null;
  const registration = {
    id: String(row.id),
    userId: String(row.user_id),
    installationId: row.installation_id,
    platform: row.platform,
    appVersion: row.app_version || "",
    locale: row.locale || "",
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (options.includeToken) {
    registration.token = row.token;
  }
  return registration;
}

async function upsert(data, options = {}) {
  const client = queryClient(options.client);
  await client.query(
    `
      UPDATE mobile_push_registrations
      SET is_active = FALSE, updated_at = NOW()
      WHERE token = $1
        AND NOT (user_id = $2 AND installation_id = $3)
    `,
    [data.token, Number(data.userId), data.installationId]
  );
  const result = await client.query(
    `
      INSERT INTO mobile_push_registrations (
        user_id, installation_id, token, platform, app_version, locale
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, installation_id)
      DO UPDATE SET
        token = EXCLUDED.token,
        platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version,
        locale = EXCLUDED.locale,
        failure_count = 0,
        is_active = TRUE,
        updated_at = NOW()
      RETURNING *
    `,
    [
      Number(data.userId),
      data.installationId,
      data.token,
      data.platform,
      data.appVersion || null,
      data.locale || null
    ]
  );
  return mapRegistration(result.rows[0]);
}

async function deactivateForUser(userId, installationId, options = {}) {
  const result = await queryClient(options.client).query(
    `
      UPDATE mobile_push_registrations
      SET is_active = FALSE, updated_at = NOW()
      WHERE user_id = $1 AND installation_id = $2
      RETURNING *
    `,
    [Number(userId), installationId]
  );
  return mapRegistration(result.rows[0]);
}

async function deactivateByToken(token, options = {}) {
  await queryClient(options.client).query(
    `
      UPDATE mobile_push_registrations
      SET is_active = FALSE, updated_at = NOW()
      WHERE token = $1
    `,
    [token]
  );
}

async function listActiveByUserId(userId, options = {}) {
  const result = await queryClient(options.client).query(
    `
      SELECT registration.*
      FROM mobile_push_registrations AS registration
      JOIN users AS account_user ON account_user.id = registration.user_id
      LEFT JOIN developer_project_test_accounts AS test_account
        ON test_account.user_id = account_user.id AND test_account.status = 'active'
      LEFT JOIN developer_projects AS test_project
        ON test_project.id = test_account.developer_project_id
      WHERE registration.user_id = $1
        AND registration.is_active = TRUE
        AND NOT (
          account_user.is_sandbox_test_account = TRUE
          AND (
            account_user.sandbox_test_account_expires_at IS NULL
            OR account_user.sandbox_test_account_expires_at <= NOW()
            OR test_project.status IS DISTINCT FROM 'active'
          )
        )
      ORDER BY registration.updated_at DESC
    `,
    [Number(userId)]
  );
  return result.rows.map((row) => mapRegistration(row, { includeToken: true }));
}

async function recordSuccess(id, options = {}) {
  await queryClient(options.client).query(
    `
      UPDATE mobile_push_registrations
      SET last_success_at = NOW(), failure_count = 0, updated_at = NOW()
      WHERE id = $1
    `,
    [Number(id)]
  );
}

async function recordFailure(id, options = {}) {
  await queryClient(options.client).query(
    `
      UPDATE mobile_push_registrations
      SET last_failure_at = NOW(), failure_count = failure_count + 1, updated_at = NOW()
      WHERE id = $1
    `,
    [Number(id)]
  );
}

module.exports = {
  mapRegistration,
  upsert,
  deactivateForUser,
  deactivateByToken,
  listActiveByUserId,
  recordSuccess,
  recordFailure
};
