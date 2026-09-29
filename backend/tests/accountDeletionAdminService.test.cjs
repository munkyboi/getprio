const test = require("node:test");
const assert = require("node:assert/strict");
const { beginScan, completeTask, listRequests, queueCleanup, queueUserReport, TASK_LABELS } = require("../src/services/accountDeletionAdminService");

function clientWith({ request, task, readiness } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("SELECT id, status, retention_notice FROM account_deletion_requests")) return { rows: request ? [request] : [] };
      if (sql.includes("SELECT kind, status FROM account_deletion_tasks")) return { rows: task ? [task] : [] };
      if (sql.includes("UPDATE account_deletion_tasks")) return { rows: [{ kind: params[1], status: "completed", evidence: params[2], completed_at: "2026-09-28T10:00:00.000Z" }] };
      if (sql.includes("SELECT COUNT(*) FILTER")) return { rows: [readiness || { completed: 4, total: 6 }] };
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
    readiness: { completed: 6, total: 6 }
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
    readiness: { completed: 5, total: 6 }
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
      status: "pending", evidence: null, completed_at: null, automation_report: null
    }] };
    throw new Error(`Unexpected query: ${sql}`);
  };
  const [request] = await listRequests({ client });
  assert.equal(request.accountEmail, "carlo@example.test");
  assert.equal(request.tasks[0].label, TASK_LABELS.backup_disposal);
  assert.equal(request.tasks[0].status, "pending");
});

test("the Platform deletion queue exposes the machine-generated inventory report", async () => {
  const report = {
    version: 1,
    generatedAt: "2026-09-28T10:00:00.000Z",
    scope: "Relational user-ID references only.",
    sourceCount: 2,
    referenceCount: 3,
    sources: [
      { source: "public.bookings.customer_user_id", recordCount: 1 },
      { source: "public.users.id", recordCount: 2 }
    ]
  };
  const client = clientWith();
  client.query = async (sql) => {
    if (sql.includes("FROM account_deletion_requests r")) return { rows: [{
      id: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c", user_id: "44", status: "review_required",
      requested_at: "2026-09-28T00:00:00.000Z", due_at: "2026-10-28T00:00:00.000Z",
      retention_notice: null, policy_version: "2026-09-07", attempts: 0,
      account_name: "Carlo", account_email: "carlo@example.test"
    }] };
    if (sql.includes("FROM account_deletion_tasks")) return { rows: [{
      request_id: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c", kind: "application_relational_inventory",
      status: "completed", evidence: "Automated relational inventory.", completed_at: "2026-09-28T10:00:00.000Z",
      automation_report: report
    }] };
    throw new Error(`Unexpected query: ${sql}`);
  };

  const [request] = await listRequests({ client });
  assert.equal(request.tasks[0].label, "Automated application relational inventory");
  assert.deepEqual(request.tasks[0].automationReport, report);
});

test("a legacy aggregate-only report can be rescanned for per-reference items", async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("SELECT id, status, scan_status")) return { rows: [{
        id: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c", status: "processing",
        scan_status: "report_ready", cleanup_status: "not_started",
        scan_report: { referenceCount: 3, sources: [{ source: "public.account_email_change_challenges.user_id", recordCount: 3 }] }
      }] };
      if (sql.includes("UPDATE account_deletion_requests") && sql.includes("SET scan_status='queued'")) return { rows: [{ id: params[0], scan_status: "queued" }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const result = await beginScan("f638fa9b-a637-449b-8a1c-983a8f7a0c1c", { client });
  assert.equal(result.scanStatus, "queued");
  assert.equal(result.alreadyQueued, false);
  assert.ok(calls.some(({ sql }) => sql.includes("scan_report=NULL")));
});

test("an administrator can explicitly redo a current per-reference scan", async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("SELECT id, status, scan_status")) return { rows: [{
        id: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c", status: "processing",
        scan_status: "report_ready", cleanup_status: "not_started",
        scan_report: { inventory: { sources: [{ source: "public.auth_sessions.user_id", recordCount: 1, items: [{ id: "opaque-item-1", ordinal: 1 }], itemsComplete: true }] } }
      }] };
      if (sql.includes("SET scan_status='queued'")) return { rows: [{ id: params[0], scan_status: "queued" }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const result = await beginScan("f638fa9b-a637-449b-8a1c-983a8f7a0c1c", { client });
  assert.equal(result.scanStatus, "queued");
  assert.equal(result.alreadyQueued, false);
  assert.ok(calls.some(({ sql }) => sql.includes("scan_report=NULL")));
});

test("a failed, rolled-back cleanup can be rescanned before retry", async () => {
  const client = {
    async query(sql, params = []) {
      if (sql.includes("SELECT id, status, scan_status")) return { rows: [{
        id: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c", status: "processing",
        scan_status: "report_ready", cleanup_status: "needs_attention"
      }] };
      if (sql.includes("SET scan_status='queued'")) return { rows: [{ id: params[0], scan_status: "queued" }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const result = await beginScan("f638fa9b-a637-449b-8a1c-983a8f7a0c1c", { client });
  assert.equal(result.scanStatus, "queued");
  assert.equal(result.alreadyQueued, false);
});

function workflowClient(request) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("SELECT id,status,scan_status,scan_report,cleanup_status")) return { rows: [request] };
      if (sql.includes("SELECT id,status,cleanup_status,report_status,contact_email")) return { rows: [request] };
      if (sql.includes("UPDATE account_deletion_requests") && sql.includes("SET cleanup_status='queued'")) return { rows: [{ id: request.id, cleanup_status: "queued" }] };
      if (sql.includes("UPDATE account_deletion_requests") && sql.includes("SET report_status='sending'")) return { rows: [{ id: request.id, report_status: "sending" }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
}

const workflowRequest = () => ({
  id: "f638fa9b-a637-449b-8a1c-983a8f7a0c1c", status: "processing", scan_status: "report_ready", cleanup_status: "not_started",
  scan_report: { version: 3, categories: [{ id: "relational_references", label: "Relational references", status: "scanned" }, { id: "object_storage", label: "Object storage", status: "not_scanned" }], inventory: { sources: [{ source: "public.auth_sessions.user_id", recordCount: 1, items: [{ id: "opaque-item-1", ordinal: 1, rowIdentity: { id: "101" } }], itemsComplete: true }] } }
});

test("cleanup approval requires current scan, selects only allowlisted work, and records exclusion reasons", async () => {
  const client = workflowClient(workflowRequest());
  const result = await queueCleanup(workflowRequest().id, {
    reportVersion: 3,
    selection: { relational_references: true, object_storage: false },
    referenceSelection: { "public.auth_sessions.user_id": ["opaque-item-1"] },
    exclusions: { object_storage: "External object inventory is not connected." }
  }, { client });
  assert.equal(result.cleanupStatus, "queued");
  const update = client.calls.find(({ sql }) => sql.includes("SET cleanup_status='queued'"));
  assert.deepEqual(JSON.parse(update.params[1]), {
    reportVersion: 3,
    selected: { relational_references: true, object_storage: false },
    references: { "public.auth_sessions.user_id": ["opaque-item-1"] },
    exclusions: { object_storage: "External object inventory is not connected." }
  });
});

test("cleanup approval rejects selecting unsupported report categories", async () => {
  const client = workflowClient(workflowRequest());
  await assert.rejects(() => queueCleanup(workflowRequest().id, {
    reportVersion: 3,
    selection: { relational_references: true, object_storage: true }, exclusions: {}
  }, { client }), { code: "CLEANUP_CATEGORY_UNSUPPORTED", statusCode: 409 });
  assert.equal(client.calls.length, 1);
});

test("cleanup approval rejects stale reports and missing exclusion reasons", async () => {
  await assert.rejects(() => queueCleanup(workflowRequest().id, {
    reportVersion: 2, selection: { relational_references: true, object_storage: false },
    referenceSelection: { "public.auth_sessions.user_id": ["opaque-item-1"] },
    exclusions: { object_storage: "Not scanned by the external provider" }
  }, { client: workflowClient(workflowRequest()) }), { code: "DELETION_REPORT_CHANGED", statusCode: 409 });
  await assert.rejects(() => queueCleanup(workflowRequest().id, {
    reportVersion: 3, selection: { relational_references: true, object_storage: false }, referenceSelection: { "public.auth_sessions.user_id": ["opaque-item-1"] }, exclusions: {}
  }, { client: workflowClient(workflowRequest()) }), { code: "EXCLUSION_REASON_REQUIRED", statusCode: 400 });
});

test("cleanup approval rejects an unchecked individual reference", async () => {
  await assert.rejects(() => queueCleanup(workflowRequest().id, {
    reportVersion: 3,
    selection: { relational_references: true, object_storage: false },
    referenceSelection: { "public.auth_sessions.user_id": [] },
    exclusions: { object_storage: "External object inventory is not connected." }
  }, { client: workflowClient(workflowRequest()) }), { code: "REFERENCE_SELECTION_INCOMPLETE", statusCode: 409 });
});

test("cleanup approval rejects a saved report that lacks actual row identities", async () => {
  const request = workflowRequest();
  delete request.scan_report.inventory.sources[0].items[0].rowIdentity;
  await assert.rejects(() => queueCleanup(request.id, {
    reportVersion: 3,
    selection: { relational_references: true, object_storage: false },
    referenceSelection: { "public.auth_sessions.user_id": ["opaque-item-1"] },
    exclusions: { object_storage: "External object inventory is not connected." }
  }, { client: workflowClient(request) }), { code: "REFERENCE_SELECTION_INCOMPLETE", statusCode: 409 });
});

test("user report delivery can only be queued after cleanup and with a destination email", async () => {
  const id = workflowRequest().id;
  const ready = workflowClient({ id, cleanup_status: "completed", report_status: "ready", contact_email: "owner@example.test" });
  assert.equal((await queueUserReport(id, { client: ready })).reportStatus, "sending");
  const missingEmail = workflowClient({ id, cleanup_status: "completed", report_status: "ready", contact_email: null });
  await assert.rejects(() => queueUserReport(id, { client: missingEmail }), { code: "DELETION_REPORT_UNAVAILABLE", statusCode: 409 });
});
