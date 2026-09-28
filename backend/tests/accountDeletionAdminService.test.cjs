const test = require("node:test");
const assert = require("node:assert/strict");
const { completeTask, listRequests, TASK_LABELS } = require("../src/services/accountDeletionAdminService");

function clientWith({ request, task, readiness } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("SELECT id, status, retention_notice FROM account_deletion_requests")) return { rows: request ? [request] : [] };
      if (sql.includes("SELECT kind, status FROM account_deletion_tasks")) return { rows: task ? [task] : [] };
      if (sql.includes("UPDATE account_deletion_tasks")) return { rows: [{ kind: params[1], status: "completed", evidence: params[2], completed_at: "2026-09-28T10:00:00.000Z" }] };
      if (sql.includes("SELECT COUNT(*) FILTER")) return { rows: [readiness || { completed: 4, total: 5 }] };
      if (sql.includes("SET status=CASE WHEN $2")) return { rows: [{ id: params[0], status: params[1] ? "pending" : request.status, due_at: "2026-10-28T00:00:00.000Z", retention_notice: request.retention_notice }] };
      if (sql.includes("UPDATE account_deletion_requests SET retention_notice")) return { rows: [] };
      if (sql.includes("FROM account_deletion_requests r")) return { rows: [] };
      if (sql.includes("FROM account_deletion_tasks")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
}

test("the last evidenced prerequisite and retention notice release the request back to the worker", async () => {
  const client = clientWith({
    request: { id: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c", status: "review_required", retention_notice: null },
    task: { kind: "financial_and_legal_retention", status: "pending" },
    readiness: { completed: 5, total: 5 }
  });
  const result = await completeTask({
    requestId: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c",
    taskKind: "financial_and_legal_retention",
    evidence: "Retention review case PRIV-82",
    retentionNotice: "Invoice metadata retained under the approved schedule."
  }, { client });

  assert.equal(result.readyForErasure, true);
  assert.equal(result.status, "pending");
  assert.equal(result.task.label, TASK_LABELS.financial_and_legal_retention);
  assert.ok(client.calls.some(({ sql, params }) => sql.includes("SET retention_notice=$2") && params[1] === "Invoice metadata retained under the approved schedule."));
  assert.ok(client.calls.some(({ sql }) => sql.includes("next_attempt_at=CASE WHEN $2 THEN NOW()")));
});

test("a missing retention notice cannot complete the financial/legal prerequisite", async () => {
  const client = clientWith({
    request: { id: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c", status: "review_required", retention_notice: null },
    task: { kind: "financial_and_legal_retention", status: "pending" }
  });
  await assert.rejects(() => completeTask({
    requestId: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c",
    taskKind: "financial_and_legal_retention",
    evidence: "Retention review case PRIV-82"
  }, { client }), { code: "INVALID_DELETION_EVIDENCE", statusCode: 400 });
  assert.equal(client.calls.length, 0);
});

test("a task update cannot mark the request ready while any prerequisite remains incomplete", async () => {
  const client = clientWith({
    request: { id: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c", status: "review_required", retention_notice: "Retention reviewed." },
    task: { kind: "backup_disposal", status: "pending" },
    readiness: { completed: 4, total: 5 }
  });
  const result = await completeTask({
    requestId: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c",
    taskKind: "backup_disposal",
    evidence: "Backup purge receipt BKP-12"
  }, { client });
  assert.equal(result.readyForErasure, false);
  assert.equal(result.status, "review_required");
});

test("the data request queue includes only retained account fields and associated tasks", async () => {
  const client = clientWith();
  client.query = async (sql) => {
    if (sql.includes("FROM account_deletion_requests r")) return { rows: [{
      id: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c", user_id: "44", status: "pending",
      requested_at: "2026-09-28T00:00:00.000Z", due_at: "2026-10-28T00:00:00.000Z",
      retention_notice: null, policy_version: "2026-09-07", attempts: 0,
      account_name: "Carlo", account_email: "carlo@example.test"
    }] };
    if (sql.includes("FROM account_deletion_tasks")) return { rows: [{
      request_id: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c", kind: "backup_disposal",
      status: "pending", evidence: null, completed_at: null
    }] };
    throw new Error(`Unexpected query: ${sql}`);
  };
  const [request] = await listRequests({ client });
  assert.equal(request.accountEmail, "carlo@example.test");
  assert.equal(request.tasks[0].label, TASK_LABELS.backup_disposal);
  assert.equal(request.tasks[0].status, "pending");
});
