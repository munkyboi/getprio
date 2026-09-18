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

function mapProductionApproval(row) {
  if (!row) return null;
  const parseJson = (value) => {
    if (!value) return {};
    if (typeof value === "object") return value;
    try { return JSON.parse(value); } catch { return {}; }
  };
  return {
    id: String(row.application_id || row.id),
    projectId: String(row.developer_project_id || row.project_id),
    status: row.status,
    draft: parseJson(row.draft),
    approvedSubmissionId: row.approved_submission_id ? String(row.approved_submission_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submissions: row.submissions || []
  };
}

function mapProductionSubmission(row) {
  if (!row) return null;
  const snapshot = typeof row.snapshot === "object" ? row.snapshot : (() => { try { return JSON.parse(row.snapshot || "{}"); } catch { return {}; } })();
  return {
    id: String(row.id),
    version: Number(row.version),
    snapshot,
    status: row.status,
    submittedByUserId: row.submitted_by_user_id ? String(row.submitted_by_user_id) : null,
    submittedAt: row.submitted_at,
    reviewerUserId: row.reviewer_user_id ? String(row.reviewer_user_id) : null,
    reviewedAt: row.reviewed_at,
    reviewFeedback: row.review_feedback || null
  };
}

async function getProductionApproval(projectId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT a.id AS application_id, a.developer_project_id, a.status, a.draft,
        a.approved_submission_id, a.created_at, a.updated_at,
        COALESCE((SELECT json_agg(json_build_object(
          'id', s.id, 'version', s.version, 'snapshot', s.snapshot,
          'status', s.status, 'submittedByUserId', s.submitted_by_user_id,
          'submittedAt', s.submitted_at, 'reviewerUserId', s.reviewer_user_id,
          'reviewedAt', s.reviewed_at, 'reviewFeedback', s.review_feedback
        ) ORDER BY s.version DESC) FROM developer_project_production_submissions s
        WHERE s.application_id = a.id), '[]'::json) AS submissions
     FROM developer_project_production_applications a
     WHERE a.developer_project_id = $1
     LIMIT 1`,
    [projectId]
  );
  return mapProductionApproval(result.rows[0]);
}

async function saveProductionApprovalDraft({ projectId, draft }, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `INSERT INTO developer_project_production_applications (developer_project_id, draft)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (developer_project_id) DO UPDATE SET draft = $2::jsonb, updated_at = NOW()
     RETURNING id AS application_id, developer_project_id, status, draft,
       approved_submission_id, created_at, updated_at`,
    [projectId, JSON.stringify(draft)]
  );
  return mapProductionApproval(result.rows[0]);
}

async function mergeProductionApprovalDraft({ projectId, changes }, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `INSERT INTO developer_project_production_applications (developer_project_id, draft)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (developer_project_id) DO UPDATE
       SET draft = COALESCE(developer_project_production_applications.draft, '{}'::jsonb) || EXCLUDED.draft,
           updated_at = NOW()
     RETURNING id AS application_id, developer_project_id, status, draft,
       approved_submission_id, created_at, updated_at`,
    [projectId, JSON.stringify(changes)]
  );
  return mapProductionApproval(result.rows[0]);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalJson(value[key]);
    return result;
  }, {});
  return value;
}

async function submitProductionApproval({ projectId, userId, snapshot }, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const applicationResult = await queryClient.query(
    `SELECT id AS application_id, developer_project_id, status, draft,
        approved_submission_id, created_at, updated_at
     FROM developer_project_production_applications
     WHERE developer_project_id = $1
     FOR UPDATE`,
    [projectId]
  );
  const application = applicationResult.rows[0];
  if (!application) return null;
  if (application.status === "pending_review") {
    const error = new Error("This production application is already pending review.");
    error.statusCode = 409;
    error.code = "PRODUCTION_APPLICATION_PENDING_REVIEW";
    throw error;
  }
  if (snapshot && JSON.stringify(canonicalJson(application.draft)) !== JSON.stringify(canonicalJson(snapshot))) {
    const error = new Error("The production application changed while it was being submitted. Review the latest draft and try again.");
    error.statusCode = 409;
    error.code = "PRODUCTION_APPLICATION_CHANGED";
    throw error;
  }
  const versionResult = await queryClient.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
     FROM developer_project_production_submissions
     WHERE application_id = $1`,
    [application.application_id]
  );
  const version = Number(versionResult.rows[0].next_version);
  const submissionResult = await queryClient.query(
    `INSERT INTO developer_project_production_submissions
       (application_id, version, snapshot, submitted_by_user_id)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, version, snapshot, status, submitted_by_user_id,
       submitted_at, reviewer_user_id, reviewed_at, review_feedback`,
    [application.application_id, version, JSON.stringify(application.draft), Number(userId)]
  );
  await queryClient.query(
    `UPDATE developer_project_production_applications
     SET status = 'pending_review', updated_at = NOW()
     WHERE id = $1`,
    [application.application_id]
  );
  const historyResult = await queryClient.query(
    `SELECT id, version, snapshot, status, submitted_by_user_id,
        submitted_at, reviewer_user_id, reviewed_at, review_feedback
     FROM developer_project_production_submissions
     WHERE application_id = $1
     ORDER BY version DESC`,
    [application.application_id]
  );
  const history = historyResult.rows.map(mapProductionSubmission);
  const submission = mapProductionSubmission(submissionResult.rows[0]);
  return {
    ...mapProductionApproval({ ...application, status: "pending_review", submissions: history }),
    submission
  };
}

async function reviewProductionApproval({ projectId, submissionId, status, reviewerUserId, feedback }, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT a.id AS application_id, s.id, s.status AS submission_status
     FROM developer_project_production_applications a
     INNER JOIN developer_project_production_submissions s ON s.application_id = a.id
     WHERE a.developer_project_id = $1 AND s.id = $2
     FOR UPDATE`,
    [projectId, submissionId]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.submission_status !== "pending_review") {
    const error = new Error("Only a pending production application can be reviewed.");
    error.statusCode = 409;
    error.code = "PRODUCTION_APPLICATION_NOT_PENDING";
    throw error;
  }
  await queryClient.query(
    `UPDATE developer_project_production_submissions
     SET status = $3, reviewer_user_id = $4, reviewed_at = NOW(), review_feedback = $5
     WHERE id = $2 AND application_id = $1`,
    [row.application_id, submissionId, status, Number(reviewerUserId), feedback || null]
  );
  await queryClient.query(
    `UPDATE developer_project_production_applications
     SET status = $2, approved_submission_id = CASE WHEN $2 = 'approved' THEN $3 ELSE approved_submission_id END,
         updated_at = NOW()
     WHERE id = $1`,
    [row.application_id, status, submissionId]
  );
  return getProductionApproval(projectId, { client: queryClient });
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
  getProductionApproval,
  mapProductionApproval,
  mapProductionSubmission,
  mergeProductionApprovalDraft,
  mapKey,
  mapProject,
  revokeApiKey,
  reviewProductionApproval,
  saveProductionApprovalDraft,
  submitProductionApproval,
  touchApiKey
};
