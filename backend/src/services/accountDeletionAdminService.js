const db = require("../config/db");
const { REQUIRED_TASKS } = require("./accountDeletionService");

const TASK_LABELS = Object.freeze({
  application_relational_inventory: "Automated application relational inventory",
  personal_data_inventory: "Copied identifiers and non-relational review",
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
           r.scan_status, r.scan_report, r.scan_requested_at, r.scan_started_at,
           r.scan_completed_at, r.scan_attempts, r.scan_error_code,
           r.cleanup_status, r.cleanup_selection, r.cleanup_report,
           r.cleanup_started_at, r.cleanup_completed_at,
           r.report_status, r.report_sent_at, r.report_attempts, r.report_error_code,
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
    SELECT request_id, kind, status, evidence, completed_at, automation_report
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
      completedAt: row.completed_at,
      automationReport: row.automation_report || null
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
    scan: {
      status: row.scan_status,
      report: row.scan_report,
      requestedAt: row.scan_requested_at,
      startedAt: row.scan_started_at,
      completedAt: row.scan_completed_at,
      attempts: Number(row.scan_attempts || 0),
      errorCode: row.scan_error_code
    },
    cleanup: {
      status: row.cleanup_status,
      selection: row.cleanup_selection,
      report: row.cleanup_report,
      startedAt: row.cleanup_started_at,
      completedAt: row.cleanup_completed_at
    },
    userReport: {
      status: row.report_status,
      sentAt: row.report_sent_at,
      attempts: Number(row.report_attempts || 0),
      errorCode: row.report_error_code
    },
    tasks: tasksByRequest.get(row.id) || []
  }));
}

async function beginScan(requestId, options = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId || ""))) {
    throw serviceError(400, "INVALID_DELETION_REQUEST", "Deletion request ID is invalid.");
  }

  const enqueue = async (client) => {
    const { rows: [request] } = await client.query(
      "SELECT id, status, scan_status, cleanup_status FROM account_deletion_requests WHERE id=$1 FOR UPDATE",
      [requestId]
    );
    if (!request) throw serviceError(404, "DELETION_REQUEST_NOT_FOUND", "Account-deletion request not found.");
    if (request.status === "completed" || !["not_started", "needs_attention"].includes(request.cleanup_status)) {
      throw serviceError(409, "DELETION_SCAN_UNAVAILABLE", "This request can no longer start or restart its cleanup scan.");
    }
    if (["queued", "running"].includes(request.scan_status)) {
      return { id: request.id, scanStatus: request.scan_status, beforeScanStatus: request.scan_status, alreadyQueued: true };
    }

    const { rows: [updated] } = await client.query(`
      UPDATE account_deletion_requests
      SET scan_status='queued', scan_report=NULL, scan_requested_at=NOW(), scan_started_at=NULL,
          scan_completed_at=NULL, scan_next_attempt_at=NOW(),
          scan_error_code=NULL, updated_at=NOW()
      WHERE id=$1
      RETURNING id, scan_status
    `, [requestId]);
    return { id: updated.id, scanStatus: updated.scan_status, beforeScanStatus: request.scan_status, alreadyQueued: false };
  };

  if (options.client) return enqueue(options.client);
  return db.withTransaction(enqueue);
}

async function queueCleanup(requestId, { selection, exclusions, referenceSelection, reportVersion }, options = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId || ""))) {
    throw serviceError(400, "INVALID_DELETION_REQUEST", "Deletion request ID is invalid.");
  }
  const enqueue = async (client) => {
    const { rows: [request] } = await client.query(`
      SELECT id,status,scan_status,scan_report,cleanup_status
      FROM account_deletion_requests WHERE id=$1 FOR UPDATE
    `, [requestId]);
    if (!request) throw serviceError(404, "DELETION_REQUEST_NOT_FOUND", "Account-deletion request not found.");
    if (["queued", "running", "completed"].includes(request.cleanup_status)) {
      return { id: request.id, cleanupStatus: request.cleanup_status, beforeCleanupStatus: request.cleanup_status, alreadyQueued: true };
    }
    if (request.status === "completed" || request.scan_status !== "report_ready" || !request.scan_report) {
      throw serviceError(409, "DELETION_SCAN_REQUIRED", "A completed cleanup scan is required before deletion can begin.");
    }
    if (Number(reportVersion) !== Number(request.scan_report.version)) {
      throw serviceError(409, "DELETION_REPORT_CHANGED", "The cleanup report changed. Refresh it and review the proposed actions again.");
    }
    const categories = request.scan_report.categories || [];
    const expectedIds = new Set(categories.map((item) => item.id));
    const selectedIds = Object.keys(selection || {});
    if (selectedIds.length !== expectedIds.size || selectedIds.some((id) => !expectedIds.has(id)) || categories.some((item) => typeof selection?.[item.id] !== "boolean")) {
      throw serviceError(400, "INVALID_CLEANUP_SELECTION", "Choose a disposition for every report category.");
    }
    if (selection.relational_references !== true) {
      throw serviceError(400, "ACCOUNT_CLEANUP_REQUIRED", "The account and its relational identity data must be selected for deletion.");
    }
    if (selectedIds.some((id) => selection[id] && id !== "relational_references")) {
      throw serviceError(409, "CLEANUP_CATEGORY_UNSUPPORTED", "One or more selected categories are not connected to a verified deletion action. Unselect them and document why they are excluded.");
    }
    const unsafeSelected = categories.find((item) => selection[item.id] && item.status !== "scanned");
    if (unsafeSelected) throw serviceError(409, "CLEANUP_CATEGORY_NEEDS_REVIEW", `${unsafeSelected.label} has unresolved scan findings and cannot be deleted automatically.`);
    const referenceSources = (request.scan_report.inventory?.sources || []).filter((item) => item.recordCount > 0 && item.source !== "public.users.id");
    const expectedSources = new Set(referenceSources.map((item) => item.source));
    if (!referenceSelection || Object.keys(referenceSelection).length !== expectedSources.size
      || Object.keys(referenceSelection).some((source) => !expectedSources.has(source))) {
      throw serviceError(400, "REFERENCE_SELECTION_INCOMPLETE", "Review every populated relational source before queuing cleanup.");
    }
    for (const source of referenceSources) {
      const items = source.items || [];
      const hasRowIdentities = items.every((item) => item.rowIdentity && typeof item.rowIdentity === "object" && Object.keys(item.rowIdentity).length > 0);
      const expectedItems = items.map((item) => item.id).sort();
      const selectedItems = Array.isArray(referenceSelection[source.source]) ? [...referenceSelection[source.source]].sort() : [];
      if (!source.itemsComplete || !hasRowIdentities || expectedItems.length !== source.recordCount
        || selectedItems.length !== expectedItems.length
        || selectedItems.some((itemId, index) => itemId !== expectedItems[index])) {
        throw serviceError(409, "REFERENCE_SELECTION_INCOMPLETE", `Include every identified reference in ${source.source}, or resolve the excluded records before cleanup.`);
      }
    }
    const normalizedExclusions = {};
    for (const item of categories) {
      if (selection[item.id]) continue;
      const reason = String(exclusions?.[item.id] || "").trim().replace(/\s+/g, " ");
      if (reason.length < 8 || reason.length > 500) throw serviceError(400, "EXCLUSION_REASON_REQUIRED", `Add an 8–500 character reason for excluding ${item.label}.`);
      normalizedExclusions[item.id] = reason;
    }
    const { rows: [updated] } = await client.query(`
      UPDATE account_deletion_requests
      SET cleanup_status='queued', cleanup_selection=$2::jsonb,
          cleanup_report=NULL, cleanup_started_at=NULL, cleanup_completed_at=NULL,
          report_status='not_ready', report_error_code=NULL,
          status='processing', updated_at=NOW()
      WHERE id=$1 RETURNING id,cleanup_status
    `, [requestId, JSON.stringify({ reportVersion: Number(reportVersion), selected: selection, references: referenceSelection, exclusions: normalizedExclusions })]);
    return { id: updated.id, cleanupStatus: updated.cleanup_status, beforeCleanupStatus: request.cleanup_status, alreadyQueued: false };
  };
  if (options.client) return enqueue(options.client);
  return db.withTransaction(enqueue);
}

async function queueUserReport(requestId, options = {}) {
  const enqueue = async (client) => {
    const { rows: [request] } = await client.query(`
      SELECT id,status,cleanup_status,report_status,contact_email
      FROM account_deletion_requests WHERE id=$1 FOR UPDATE
    `, [requestId]);
    if (!request) throw serviceError(404, "DELETION_REQUEST_NOT_FOUND", "Account-deletion request not found.");
    if (request.report_status === "sending" || request.report_status === "sent") {
      return { id: request.id, reportStatus: request.report_status, beforeReportStatus: request.report_status, alreadyQueued: true };
    }
    if (request.cleanup_status !== "completed" || !["ready", "needs_attention"].includes(request.report_status) || !request.contact_email) {
      throw serviceError(409, "DELETION_REPORT_UNAVAILABLE", "A completed cleanup and a deliverable user report are required.");
    }
    const { rows: [updated] } = await client.query(`
      UPDATE account_deletion_requests
      SET report_status='sending', report_error_code=NULL, next_attempt_at=NOW(), updated_at=NOW()
      WHERE id=$1 RETURNING id,report_status
    `, [requestId]);
    return { id: updated.id, reportStatus: updated.report_status, beforeReportStatus: request.report_status, alreadyQueued: false };
  };
  if (options.client) return enqueue(options.client);
  return db.withTransaction(enqueue);
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

module.exports = { TASK_LABELS, beginScan, queueCleanup, queueUserReport, completeTask, listRequests };
