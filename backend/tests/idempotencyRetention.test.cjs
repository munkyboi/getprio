const test = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../src/repositories/idempotency");
const service = require("../src/services/idempotencyService");

const originalClaim = repository.claim;

test.after(() => {
  repository.claim = originalClaim;
});

test("idempotency service supports a seven-day developer replay window", async () => {
  let payload;
  repository.claim = async (input) => { payload = input; return { state: "claimed", record: { id: 1 } }; };
  const before = Date.now();
  await service.claim({ actorId: 7, scope: "developer_api.queue.call_next:key-1", key: "developer-retry-1", payload: { ticket: "42" }, retentionMs: 7 * 24 * 60 * 60_000 });
  const difference = new Date(payload.expiresAt).getTime() - before;
  assert.ok(difference >= 7 * 24 * 60 * 60_000 - 1000);
  assert.ok(difference <= 7 * 24 * 60 * 60_000 + 1000);
  repository.claim = originalClaim;
});

test("expired idempotency keys can be reclaimed without changing active claims", async () => {
  let sql;
  const client = {
    query: async (query, params) => {
      sql = query;
      assert.equal(params[0], 7);
      return { rows: [{ id: 2, status: "pending", expires_at: new Date(Date.now() + 1) }] };
    }
  };
  const result = await repository.claim({ actorId: 7, scope: "developer_api.queue.call_next:key-1", key: "developer-retry-1", requestHash: "hash", expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) }, { client });
  assert.equal(result.state, "claimed");
  assert.match(sql, /DO UPDATE/);
  assert.match(sql, /idempotency_records\.expires_at <= NOW\(\)/);
});
