const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

function mapProject(row) {
  if (!row) return null;
  return {
    id: String(row.project_id || row.id),
    developerAccountId: String(row.developer_account_id),
    name: row.name,
    status: row.status,
    accessRole: row.account_role || (row.project_member ? "member" : null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapKey(row) {
  if (!row) return null;
  return {
    id: String(row.key_id || row.id),
    projectId: String(row.developer_project_id),
    name: row.name,
    environment: row.environment,
    keyPrefix: row.key_prefix,
    scopes: row.scopes || [],
    status: row.status,
    createdByUserId: String(row.created_by_user_id),
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listProjectsForUser(userId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT p.id AS project_id, p.developer_account_id, p.name, p.status,
        p.created_at, p.updated_at,
        dam.role AS account_role,
        EXISTS (
          SELECT 1 FROM developer_project_memberships pm
          WHERE pm.developer_project_id = p.id AND pm.user_id = $1 AND pm.status = 'active'
        ) AS project_member
      FROM developer_projects p
      INNER JOIN developer_accounts da ON da.id = p.developer_account_id AND da.status = 'active'
      LEFT JOIN developer_account_memberships dam
        ON dam.developer_account_id = p.developer_account_id
        AND dam.user_id = $1
        AND dam.status = 'active'
      WHERE p.status = 'active'
        AND (dam.role = 'owner' OR EXISTS (
          SELECT 1 FROM developer_project_memberships pm
          WHERE pm.developer_project_id = p.id AND pm.user_id = $1 AND pm.status = 'active'
        ))
      ORDER BY p.created_at ASC
    `,
    [Number(userId)]
  );
  return result.rows.map(mapProject);
}

async function countActiveProjects(developerAccountId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT COUNT(*)::INTEGER AS count FROM developer_projects
     WHERE developer_account_id = $1 AND status = 'active'`,
    [developerAccountId]
  );
  return Number(result.rows[0]?.count || 0);
}

async function getSandboxAllowance(projectId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT issued_tickets
     FROM developer_sandbox_daily_allowances
     WHERE developer_project_id = $1 AND allowance_date = (NOW() AT TIME ZONE 'UTC')::date`,
    [projectId]
  );
  const issuedTickets = Number(result.rows[0]?.issued_tickets || 0);
  return { limit: 100, issuedTickets, remaining: Math.max(0, 100 - issuedTickets) };
}

async function createProject({ developerAccountId, userId, name }, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `INSERT INTO developer_projects (developer_account_id, name, created_by_user_id)
     VALUES ($1, $2, $3)
     RETURNING id AS project_id, developer_account_id, name, status, created_at, updated_at`,
    [developerAccountId, name, Number(userId)]
  );
  const project = mapProject(result.rows[0]);
  await queryClient.query(
    `INSERT INTO developer_project_memberships (developer_project_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (developer_project_id, user_id)
     DO UPDATE SET status = 'active', updated_at = NOW()`,
    [project.id, Number(userId)]
  );
  return project;
}

async function findProjectForUser(projectId, userId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT p.id AS project_id, p.developer_account_id, p.name, p.status,
        p.created_at, p.updated_at,
        dam.role AS account_role,
        EXISTS (
          SELECT 1 FROM developer_project_memberships pm
          WHERE pm.developer_project_id = p.id AND pm.user_id = $2 AND pm.status = 'active'
        ) AS project_member
      FROM developer_projects p
      INNER JOIN developer_accounts da ON da.id = p.developer_account_id AND da.status = 'active'
      LEFT JOIN developer_account_memberships dam
        ON dam.developer_account_id = p.developer_account_id
        AND dam.user_id = $2
        AND dam.status = 'active'
      WHERE p.id = $1 AND p.status = 'active'
        AND (dam.role = 'owner' OR EXISTS (
          SELECT 1 FROM developer_project_memberships pm
          WHERE pm.developer_project_id = p.id AND pm.user_id = $2 AND pm.status = 'active'
        ))
      LIMIT 1
    `,
    [projectId, Number(userId)]
  );
  return mapProject(result.rows[0]);
}

async function findProjectById(projectId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT id AS project_id, developer_account_id, name, status, created_at, updated_at
     FROM developer_projects
     WHERE id = $1
     LIMIT 1`,
    [projectId]
  );
  return mapProject(result.rows[0]);
}

async function listApiKeys(projectId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT id AS key_id, developer_project_id, name, environment, key_prefix,
        scopes, status, created_by_user_id, last_used_at, revoked_at,
        revoke_reason, created_at, updated_at
     FROM developer_api_keys
     WHERE developer_project_id = $1
     ORDER BY created_at DESC`,
    [projectId]
  );
  return result.rows.map(mapKey);
}

async function findApiKeyById(projectId, keyId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT id AS key_id, developer_project_id, name, environment, key_prefix,
        scopes, status, created_by_user_id, last_used_at, revoked_at,
        revoke_reason, created_at, updated_at
     FROM developer_api_keys
     WHERE developer_project_id = $1 AND id = $2
     LIMIT 1`,
    [projectId, keyId]
  );
  return mapKey(result.rows[0]);
}

async function createApiKey({ projectId, userId, name, environment, keyPrefix, secretHash, scopes }, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `INSERT INTO developer_api_keys
       (developer_project_id, name, environment, key_prefix, secret_hash, scopes, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id AS key_id, developer_project_id, name, environment, key_prefix,
       scopes, status, created_by_user_id, last_used_at, revoked_at,
       revoke_reason, created_at, updated_at`,
    [projectId, name, environment, keyPrefix, secretHash, scopes, Number(userId)]
  );
  return mapKey(result.rows[0]);
}

async function findApiKeyByHash(secretHash, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT k.id AS key_id, k.developer_project_id, k.name, k.environment, k.key_prefix,
        k.scopes, k.status, k.created_by_user_id, k.last_used_at, k.revoked_at,
        k.revoke_reason, k.created_at, k.updated_at, p.status AS project_status,
        a.status AS account_status
     FROM developer_api_keys k
     INNER JOIN developer_projects p ON p.id = k.developer_project_id
     INNER JOIN developer_accounts a ON a.id = p.developer_account_id
     WHERE k.secret_hash = $1
     LIMIT 1`,
    [secretHash]
  );
  const row = result.rows[0];
  return row ? { ...mapKey(row), projectStatus: row.project_status, accountStatus: row.account_status } : null;
}

async function revokeApiKey(keyId, userId, reason, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `UPDATE developer_api_keys k
     SET status = 'revoked', revoked_at = NOW(), revoke_reason = $2, updated_at = NOW()
     FROM developer_projects p
     WHERE k.id = $1 AND p.id = k.developer_project_id AND k.status = 'active'
       AND (
         EXISTS (
           SELECT 1 FROM developer_account_memberships dam
           WHERE dam.developer_account_id = p.developer_account_id
             AND dam.user_id = $3 AND dam.status = 'active' AND dam.role = 'owner'
         )
         OR EXISTS (
           SELECT 1 FROM developer_project_memberships pm
           WHERE pm.developer_project_id = p.id
             AND pm.user_id = $3 AND pm.status = 'active'
         )
       )
     RETURNING k.id AS key_id, k.developer_project_id, k.name, k.environment, k.key_prefix,
       k.scopes, k.status, k.created_by_user_id, k.last_used_at, k.revoked_at,
       k.revoke_reason, k.created_at, k.updated_at`,
    [keyId, reason || "revoked", Number(userId)]
  );
  return mapKey(result.rows[0]);
}

async function archiveProject(projectId, userId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `UPDATE developer_projects p
     SET status = 'archived', updated_at = NOW()
     WHERE p.id = $1 AND p.status = 'active'
       AND EXISTS (
         SELECT 1 FROM developer_account_memberships dam
         WHERE dam.developer_account_id = p.developer_account_id
           AND dam.user_id = $2 AND dam.status = 'active' AND dam.role = 'owner'
       )
     RETURNING p.id AS project_id, p.developer_account_id, p.name, p.status, p.created_at, p.updated_at`,
    [projectId, Number(userId)]
  );
  return mapProject(result.rows[0]);
}

async function touchApiKey(keyId, options = {}) {
  await buildQueryClient(options.client).query(
    `UPDATE developer_api_keys SET last_used_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'active'`,
    [keyId]
  );
}

module.exports = {
  countActiveProjects,
  createApiKey,
  createProject,
  archiveProject,
  findApiKeyByHash,
  findApiKeyById,
  findProjectById,
  findProjectForUser,
  getSandboxAllowance,
  listApiKeys,
  listProjectsForUser,
  mapKey,
  mapProject,
  revokeApiKey,
  touchApiKey
};
