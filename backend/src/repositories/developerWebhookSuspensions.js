const db = require("../config/db");

function queryClient(client) {
  return client || db.pool;
}

function mapSuspension(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    projectId: String(row.developer_project_id),
    environment: row.environment,
    status: row.status,
    reason: row.reason,
    suspendedByUserId: row.suspended_by_user_id == null ? null : String(row.suspended_by_user_id),
    suspendedAt: row.suspended_at,
    reinstatedByUserId: row.reinstated_by_user_id == null ? null : String(row.reinstated_by_user_id),
    reinstatementReason: row.reinstatement_reason,
    reinstatedAt: row.reinstated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const COLUMNS = `
  id, developer_project_id, environment, status, reason,
  suspended_by_user_id, suspended_at, reinstated_by_user_id,
  reinstatement_reason, reinstated_at, created_at, updated_at`;

async function findActive(projectId, environment = "production", options = {}) {
  const result = await queryClient(options.client).query(
    `SELECT ${COLUMNS}
     FROM developer_project_webhook_suspensions
     WHERE developer_project_id = $1 AND environment = $2 AND status = 'active'
     LIMIT 1`,
    [projectId, environment]
  );
  return mapSuspension(result.rows[0]);
}

async function suspend({ projectId, userId, reason, environment = "production" }, options = {}) {
  const client = queryClient(options.client);
  const result = await client.query(
    `INSERT INTO developer_project_webhook_suspensions
       (developer_project_id, environment, reason, suspended_by_user_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (developer_project_id, environment) WHERE status = 'active' DO NOTHING
     RETURNING ${COLUMNS}`,
    [projectId, environment, reason, Number(userId)]
  );
  if (result.rows[0]) return mapSuspension(result.rows[0]);
  return findActive(projectId, environment, options);
}

async function reinstate({ projectId, userId, reason, environment = "production" }, options = {}) {
  const result = await queryClient(options.client).query(
    `UPDATE developer_project_webhook_suspensions
     SET status = 'reinstated', reinstated_by_user_id = $3,
         reinstatement_reason = $4, reinstated_at = NOW(), updated_at = NOW()
     WHERE developer_project_id = $1 AND environment = $2 AND status = 'active'
     RETURNING ${COLUMNS}`,
    [projectId, environment, Number(userId), reason]
  );
  return mapSuspension(result.rows[0]);
}

module.exports = { findActive, mapSuspension, reinstate, suspend };
