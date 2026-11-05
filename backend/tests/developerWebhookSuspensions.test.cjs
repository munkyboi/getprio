const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/config/db");
const repository = require("../src/repositories/developerWebhookSuspensions");
const deliveries = require("../src/repositories/developerWebhookDeliveries");

const originalQuery = db.pool.query;

test.after(() => {
  db.pool.query = originalQuery;
});

test("suspension repository creates an active production restriction and maps it", async () => {
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return {
      rows: [{
        id: "suspension-1",
        developer_project_id: "project-1",
        environment: "production",
        status: "active",
        reason: "Compromised receiver",
        suspended_by_user_id: 7,
        suspended_at: "2026-09-15T12:00:00.000Z",
        reinstated_by_user_id: null,
        reinstatement_reason: null,
        reinstated_at: null,
        created_at: "2026-09-15T12:00:00.000Z",
        updated_at: "2026-09-15T12:00:00.000Z"
      }]
    };
  };

  const suspension = await repository.suspend({ projectId: "project-1", userId: 7, reason: "Compromised receiver" });
  assert.deepEqual(suspension, {
    id: "suspension-1",
    projectId: "project-1",
    environment: "production",
    status: "active",
    reason: "Compromised receiver",
    suspendedByUserId: "7",
    suspendedAt: "2026-09-15T12:00:00.000Z",
    reinstatedByUserId: null,
    reinstatementReason: null,
    reinstatedAt: null,
    createdAt: "2026-09-15T12:00:00.000Z",
    updatedAt: "2026-09-15T12:00:00.000Z"
  });
  assert.match(calls[0].sql, /ON CONFLICT \(developer_project_id, environment\) WHERE status = 'active'/);
  assert.deepEqual(calls[0].params, ["project-1", "production", "Compromised receiver", 7]);
});

test("reinstatement records the administrator and reason", async () => {
  db.pool.query = async (sql, params) => {
    assert.match(sql, /SET status = 'reinstated'/);
    assert.deepEqual(params, ["project-1", "production", 9, "Receiver remediated"]);
    return { rows: [{ id: "suspension-1", developer_project_id: "project-1", environment: "production", status: "reinstated", reason: "Compromised receiver", suspended_by_user_id: 7, suspended_at: "2026-09-15T12:00:00.000Z", reinstated_by_user_id: 9, reinstatement_reason: "Receiver remediated", reinstated_at: "2026-09-15T14:00:00.000Z", created_at: "2026-09-15T12:00:00.000Z", updated_at: "2026-09-15T14:00:00.000Z" }] };
  };
  const suspension = await repository.reinstate({ projectId: "project-1", userId: 9, reason: "Receiver remediated" });
  assert.equal(suspension.status, "reinstated");
  assert.equal(suspension.reinstatedByUserId, "9");
  assert.equal(suspension.reinstatementReason, "Receiver remediated");
});

test("automatic webhook claims exclude projects with an active production suspension", async () => {
  let sql;
  db.pool.query = async (query) => {
    sql = query;
    return { rows: [] };
  };
  assert.deepEqual(await deliveries.claimBatch("worker-1", 10), []);
  assert.match(sql, /NOT EXISTS \(\s*SELECT 1\s+FROM developer_project_webhook_suspensions/);
  assert.match(sql, /s\.status = 'active'/);
});
