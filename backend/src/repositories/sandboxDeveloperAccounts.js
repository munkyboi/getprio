const db = require("../config/db");

const ACCOUNT_SELECT = `
  SELECT ta.developer_project_id AS project_id, ta.user_id, ta.status,
         u.username, u.email, u.is_sandbox_test_account,
         u.sandbox_test_account_expires_at
    FROM developer_project_test_accounts ta
    INNER JOIN users u ON u.id = ta.user_id
   WHERE ta.status = 'active'
     AND (LOWER(u.email) = $1 OR LOWER(u.username) = $1)
   LIMIT 1
`;

function mapSandboxDeveloperAccount(row) {
  if (!row) return null;
  return {
    projectId: String(row.project_id),
    userId: String(row.user_id),
    status: row.status,
    username: row.username,
    email: row.email,
    isSandboxTestAccount: row.is_sandbox_test_account === true,
    credentialExpiresAt: row.sandbox_test_account_expires_at
  };
}

async function findByIdentifier(identifier, options = {}) {
  const client = options.client || db.pool;
  const result = await client.query(ACCOUNT_SELECT, [String(identifier || "").trim().toLowerCase()]);
  return mapSandboxDeveloperAccount(result.rows[0]);
}

async function findByUserId(userId, options = {}) {
  const client = options.client || db.pool;
  const result = await client.query(
    `
      SELECT ta.developer_project_id AS project_id, ta.user_id, ta.status,
             u.username, u.email, u.is_sandbox_test_account,
             u.sandbox_test_account_expires_at
        FROM developer_project_test_accounts ta
        INNER JOIN users u ON u.id = ta.user_id
       WHERE ta.status = 'active' AND ta.user_id = $1
       LIMIT 1
    `,
    [Number(userId)]
  );
  return mapSandboxDeveloperAccount(result.rows[0]);
}

module.exports = { findByIdentifier, findByUserId, mapSandboxDeveloperAccount };
