const db = require("../config/db");
const userRepository = require("./users");
const authSessions = require("./authSessions");
const mfaRepository = require("./mfa");

const MAX_ACCOUNTS = 2;

function clientFor(options = {}) {
  return options.client || db.pool;
}

function mapAccount(row) {
  if (!row) return null;
  const expiresAt = row.sandbox_test_account_expires_at;
  const expired = expiresAt && new Date(expiresAt).getTime() <= Date.now();
  return {
    id: String(row.test_account_id || row.id),
    projectId: String(row.developer_project_id),
    userId: String(row.user_id),
    slot: Number(row.slot),
    username: row.username,
    email: row.email,
    status: row.status === "active" && !expired ? "active" : "expired",
    expiresAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deviceCount: Number(row.device_count || 0)
  };
}

const ACCOUNT_SELECT = `
  SELECT ta.id AS test_account_id, ta.developer_project_id, ta.user_id, ta.slot, ta.status,
    ta.created_at, ta.updated_at, u.username, u.email, u.sandbox_test_account_expires_at,
    (SELECT COUNT(*) FROM mobile_push_registrations mpr
      WHERE mpr.user_id = ta.user_id AND mpr.is_active = TRUE) AS device_count
  FROM developer_project_test_accounts ta
  INNER JOIN users u ON u.id = ta.user_id
`;

async function list(projectId, options = {}) {
  const result = await clientFor(options).query(
    `${ACCOUNT_SELECT}
     WHERE ta.developer_project_id = $1
     ORDER BY ta.slot ASC`,
    [projectId]
  );
  return result.rows.map(mapAccount);
}

async function create({ projectId, name, username, email, passwordHash, expiresAt }, options = {}) {
  const client = clientFor(options);
  const projectResult = await client.query(
    `SELECT id FROM developer_projects WHERE id = $1 AND status = 'active' FOR UPDATE`,
    [projectId]
  );
  if (!projectResult.rows[0]) return null;

  const slotResult = await client.query(
    `SELECT slot FROM developer_project_test_accounts
     WHERE developer_project_id = $1 AND status = 'active'
     ORDER BY slot ASC`,
    [projectId]
  );
  const usedSlots = new Set(slotResult.rows.map((row) => Number(row.slot)));
  const slot = [1, 2].find((candidate) => !usedSlots.has(candidate));
  if (!slot) {
    const error = new Error("This project already has two Sandbox test accounts.");
    error.statusCode = 409;
    error.code = "SANDBOX_TEST_ACCOUNT_LIMIT_REACHED";
    throw error;
  }

  const user = await userRepository.createUser({
    name,
    username,
    email,
    emailVerified: true,
    passwordHash,
    passwordHashAlgorithm: "bcrypt",
    lastLoginProvider: "password",
    roles: ["customer"],
    isSandboxTestAccount: true,
    sandboxTestAccountExpiresAt: expiresAt
  }, { client });
  const result = await client.query(
    `INSERT INTO developer_project_test_accounts (developer_project_id, user_id, slot)
     VALUES ($1, $2, $3)
     RETURNING id AS test_account_id, developer_project_id, user_id, slot, status, created_at, updated_at`,
    [projectId, Number(user._id), slot]
  );
  return mapAccount({ ...result.rows[0], username: user.username, email: user.email, sandbox_test_account_expires_at: expiresAt, device_count: 0 });
}

async function reset(projectId, accountId, { passwordHash, expiresAt }, options = {}) {
  const client = clientFor(options);
  const accountResult = await client.query(
    `SELECT ta.id AS test_account_id, ta.developer_project_id, ta.user_id, ta.slot, ta.status,
        ta.created_at, ta.updated_at, u.username, u.email
     FROM developer_project_test_accounts ta
     INNER JOIN users u ON u.id = ta.user_id
     WHERE ta.id = $1 AND ta.developer_project_id = $2 AND ta.status = 'active'
     FOR UPDATE`,
    [accountId, projectId]
  );
  const account = accountResult.rows[0];
  if (!account) return null;

  await client.query(
    `UPDATE users
     SET password_hash = $2, password_hash_algorithm = 'bcrypt',
         sandbox_test_account_expires_at = $3, last_password_changed_at = NOW(),
         mfa_enabled = FALSE, email_mfa_enabled = FALSE, mfa_required = FALSE,
         failed_login_count = 0, last_failed_login_at = NULL, account_locked_until = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [Number(account.user_id), passwordHash, expiresAt]
  );
  await mfaRepository.revokeFactorsAndRecoveryCodes(account.user_id, { client });
  await client.query(`DELETE FROM auth_mfa_challenges WHERE user_id = $1`, [Number(account.user_id)]);
  await authSessions.revokeAllSessionsForUser(account.user_id, "sandbox_test_account_reset", { client });
  await client.query(
    `DELETE FROM mobile_push_registrations WHERE user_id = $1`,
    [Number(account.user_id)]
  );
  const updatedResult = await client.query(
    `UPDATE developer_project_test_accounts
     SET updated_at = NOW()
     WHERE id = $1
     RETURNING updated_at`,
    [accountId]
  );
  return mapAccount({ ...account, sandbox_test_account_expires_at: expiresAt, device_count: 0, updated_at: updatedResult.rows[0]?.updated_at || account.updated_at });
}

async function findByUserId(userId, options = {}) {
  const result = await clientFor(options).query(
    `${ACCOUNT_SELECT}
     WHERE ta.user_id = $1 AND ta.status = 'active'
     LIMIT 1`,
    [Number(userId)]
  );
  return mapAccount(result.rows[0]);
}

async function countActiveDevices(userId, options = {}) {
  const result = await clientFor(options).query(
    `SELECT COUNT(*)::INTEGER AS count FROM mobile_push_registrations WHERE user_id = $1 AND is_active = TRUE`,
    [Number(userId)]
  );
  return Number(result.rows[0]?.count || 0);
}

async function hasActiveDevice(userId, installationId, options = {}) {
  const result = await clientFor(options).query(
    `SELECT 1 FROM mobile_push_registrations WHERE user_id = $1 AND installation_id = $2 AND is_active = TRUE LIMIT 1`,
    [Number(userId), installationId]
  );
  return Boolean(result.rows[0]);
}

module.exports = { MAX_ACCOUNTS, countActiveDevices, create, findByUserId, hasActiveDevice, list, mapAccount, reset };
