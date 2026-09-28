const db = require("../config/db");
const { REQUIRED_TASKS } = require("./accountDeletionService");

const TASK_LABELS = Object.freeze({
  personal_data_inventory: "Personal data inventory",
  object_storage_versions_and_caches: "Object storage, versions, and caches",
  supplier_data: "Supplier data",
  financial_and_legal_retention: "Financial and legal retention",
  backup_disposal: "Backup disposal"
});

function serviceError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

function requiredText(value, label, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) {
    throw serviceError(400, "INVALID_DELETION_EVIDENCE", `${label} is required and must be at most ${maxLength} characters.`);
  }
  return text;
}

async function listRequests(options = {}) {
  const client = options.client || db.pool;
  const requests = await client.query(`
    SELECT r.id, r.user_id, r.status, r.requested_at, r.due_at, r.completed_at,
           r.retention_notice, r.policy_version, r.attempts, r.next_attempt_at,
           r.last_error_code, r.acknowledgement_sent_at, r.completion_sent_at, r.contact_email,
           COALESCE(u.display_name, u.name, u.username) AS account_name,
           u.email AS account_email
    FROM account_deletion_requests r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.status <> 'completed' OR r.completed_at >= NOW() - INTERVAL '30 days'
    ORDER BY (r.status = 'completed') ASC, r.due_at ASC, r.requested_at ASC
    LIMIT 100
  `);
  const ids = requests.rows.map((row) => row.id);
  const tasks = ids.length ? await client.query(`
    SELECT request_id, kind, status, evidence, completed_at
    FROM account_deletion_tasks
    WHERE request_id = ANY($1::uuid[])
    ORDER BY request_id, kind
  `, [ids]) : { rows: [] };
  const tasksByRequest = new Map();
  for (const row of tasks.rows) {
    const items = tasksByRequest.get(row.request_id) || [];
    items.push({
      kind: row.kind,
      label: TASK_LABELS[row.kind] || row.kind,
      status: row.status,
      evidence: row.evidence,
      completedAt: row.completed_at
    });
    tasksByRequest.set(row.request_id, items);
  }
  return requests.rows.map((row) => ({
    id: row.id,
    userId: row.user_id == null ? null : String(row.user_id),
    accountName: row.account_name || "Deleted account",
    accountEmail: row.account_email || row.contact_email || "Unavailable",
    status: row.status,
    requestedAt: row.requested_at,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    retentionNotice: row.retention_notice,
    policyVersion: row.policy_version,
    attempts: Number(row.attempts || 0),
    nextAttemptAt: row.next_attempt_at,
    lastErrorCode: row.last_error_code,
    acknowledgementSentAt: row.acknowledgement_sent_at,
    completionSentAt: row.completion_sent_at,
    tasks: tasksByRequest.get(row.id) || []
  }));
}

async function completeTask({ requestId, taskKind, evidence, retentionNotice }, options = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId || ""))) {
    throw serviceError(400, "INVALID_DELETION_REQUEST", "Deletion request ID is invalid.");
  }
  if (!REQUIRED_TASKS.includes(taskKind)) {
    throw serviceError(400, "INVALID_DELETION_TASK", "Choose a supported account-deletion prerequisite.");
  }
  const cleanEvidence = requiredText(evidence, "Evidence reference", 2000);
  const cleanRetentionNotice = taskKind === "financial_and_legal_retention"
    ? requiredText(retentionNotice, "Retention notice", 1000)
    : null;

  const complete = async (client) => {
    const { rows: [request] } = await client.query(
      "SELECT id, status, retention_notice FROM account_deletion_requests WHERE id=$1 FOR UPDATE",
      [requestId]
    );
    if (!request) throw serviceError(404, "DELETION_REQUEST_NOT_FOUND", "Account-deletion request not found.");
    if (request.status === "completed") throw serviceError(409, "DELETION_REQUEST_COMPLETED", "This account-deletion request is already complete.");

    const { rows: [task] } = await client.query(
      "SELECT kind, status FROM account_deletion_tasks WHERE request_id=$1 AND kind=$2 FOR UPDATE",
      [requestId, taskKind]
    );
    if (!task) throw serviceError(404, "DELETION_TASK_NOT_FOUND", "The prerequisite is not part of this deletion request.");
    if (task.status === "completed") throw serviceError(409, "DELETION_TASK_COMPLETED", "This prerequisite has already been recorded.");

    const { rows: [updatedTask] } = await client.query(`
      UPDATE account_deletion_tasks
      SET status='completed', evidence=$3, completed_at=NOW()
      WHERE request_id=$1 AND kind=$2 AND status='pending'
      RETURNING kind, status, evidence, completed_at
    `, [requestId, taskKind, cleanEvidence]);
    if (!updatedTask) throw serviceError(409, "DELETION_TASK_CHANGED", "The prerequisite changed before the update completed.");

    if (cleanRetentionNotice) {
      await client.query(
        "UPDATE account_deletion_requests SET retention_notice=$2, updated_at=NOW() WHERE id=$1",
        [requestId, cleanRetentionNotice]
      );
    }

    const { rows: [readiness] } = await client.query(`
      SELECT COUNT(*) FILTER (WHERE status='completed')::INTEGER AS completed,
             COUNT(*)::INTEGER AS total
      FROM account_deletion_tasks WHERE request_id=$1
    `, [requestId]);
    const notice = cleanRetentionNotice || request.retention_notice;
    const ready = Number(readiness.completed) === REQUIRED_TASKS.length
      && Number(readiness.total) === REQUIRED_TASKS.length
      && Boolean(notice);
    const { rows: [updatedRequest] } = await client.query(`
      UPDATE account_deletion_requests
      SET status=CASE WHEN $2 THEN 'pending' ELSE status END,
          next_attempt_at=CASE WHEN $2 THEN NOW() ELSE next_attempt_at END,
          updated_at=NOW()
      WHERE id=$1
      RETURNING id, status, due_at, retention_notice
    `, [requestId, ready]);

    return {
      id: requestId,
      status: updatedRequest.status,
      dueAt: updatedRequest.due_at,
      readyForErasure: ready,
      task: {
        kind: updatedTask.kind,
        label: TASK_LABELS[updatedTask.kind],
        status: updatedTask.status,
        evidence: updatedTask.evidence,
        completedAt: updatedTask.completed_at
      }
    };
  };

  if (options.client) return complete(options.client);
  return db.withTransaction(complete);
}

module.exports = { TASK_LABELS, completeTask, listRequests };
