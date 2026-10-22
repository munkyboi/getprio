const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/config/db");
const activity = require("../src/repositories/developerApiKeyActivity");

const originalQuery = db.pool.query;

test.after(() => { db.pool.query = originalQuery; });

test("hourly key activity records aggregate counters without request details", async () => {
  let captured;
  db.pool.query = async (sql, params) => { captured = { sql, params }; return { rowCount: 1 }; };
  await activity.record({ apiKeyId: "key-1", kind: "write", statusCode: 429 });
  assert.match(captured.sql, /INSERT INTO developer_api_key_activity_hourly/);
  assert.match(captured.sql, /date_trunc\('hour', NOW\(\)\)/);
  assert.deepEqual(captured.params, ["key-1", 0, 1, 1, 0, 1, 0]);
  assert.doesNotMatch(captured.sql, /request_path|ip_address|request_body|secret_hash/i);
});

test("key activity readout maps bounded project totals and includes empty keys", async () => {
  db.pool.query = async (sql, params) => {
    assert.match(sql, /bucket_start >= NOW\(\) - INTERVAL '24 hours'/);
    assert.deepEqual(params, ["project-1"]);
    return { rows: [{ key_id: "key-1", requests: "14", reads: "10", writes: "4", client_errors: "2", server_errors: "0", rate_limited: "1", auth_failures: "0", last_seen_at: "2026-09-28T12:00:00.000Z" }] };
  };
  const [row] = await activity.listForProject("project-1");
  assert.deepEqual(row, { keyId: "key-1", requests: 14, reads: 10, writes: 4, clientErrors: 2, serverErrors: 0, rateLimited: 1, authFailures: 0, lastSeenAt: "2026-09-28T12:00:00.000Z" });
});

test("activity retention prunes counters older than thirty days", async () => {
  db.pool.query = async (sql) => { assert.match(sql, /bucket_start < NOW\(\) - INTERVAL '30 days'/); return { rowCount: 3 }; };
  assert.equal(await activity.pruneExpired(), 3);
});
