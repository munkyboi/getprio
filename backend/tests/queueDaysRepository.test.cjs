const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadRepository(pool) {
  const target = require.resolve("../src/repositories/queueDays");
  const dbPath = require.resolve("../src/config/db");
  const original = require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool }
  };
  delete require.cache[target];
  const repository = require(target);
  delete require.cache[target];
  if (original) {
    require.cache[dbPath] = original;
  } else {
    delete require.cache[dbPath];
  }
  return repository;
}

test("lockOrCreate uses the Queue Day row as the aggregate mutex", async () => {
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (/INSERT INTO queue_days/.test(sql)) {
        return { rows: [] };
      }
      return {
        rows: [{
          id: 7,
          tenant_id: 1,
          location_id: 2,
          business_date: "2026-07-31",
          state: "unopened",
          intake_mode: null,
          version: 1,
          deadline_version: 1,
          next_sequence: 1
        }]
      };
    }
  };
  const repository = loadRepository(client);
  const queueDay = await repository.lockOrCreate({
    tenantId: 1,
    locationId: 2,
    businessDate: "2026-07-31"
  }, { client });
  assert.equal(queueDay._id, "7");
  assert.match(queries[0].sql, /ON CONFLICT .* DO NOTHING/s);
  assert.match(queries[1].sql, /FOR UPDATE/);
});

test("due reconciliation claims bounded rows with SKIP LOCKED", async () => {
  let query;
  const client = {
    async query(sql, values) {
      query = { sql, values };
      return { rows: [] };
    }
  };
  const repository = loadRepository(client);
  await repository.listDue(999, { client });
  assert.match(query.sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(query.sql, /state = 'open' AND current_closes_at <= NOW\(\)/);
  assert.equal(query.values[0], 200);
});

test("extension is an optimistic conditional update limited to the warning window", async () => {
  let query;
  const client = {
    async query(sql, values) {
      query = { sql, values };
      return { rows: [] };
    }
  };
  const repository = loadRepository(client);
  await repository.extendDeadline(7, { expectedVersion: 4 }, { client });
  assert.match(query.sql, /current_closes_at <= NOW\(\) \+ INTERVAL '15 minutes'/);
  assert.match(query.sql, /version = version \+ 1/);
  assert.match(query.sql, /deadline_version = deadline_version \+ 1/);
  assert.equal(query.values[1], 4);
});

test("manual opening keeps the initial deadline at version one", async () => {
  let query;
  const client = {
    async query(sql, values) {
      query = { sql, values };
      return { rows: [] };
    }
  };
  const repository = loadRepository(client);
  await repository.transitionOpen(7, {
    timezone: "Asia/Manila",
    effectiveOpensAt: new Date(),
    effectiveClosesAt: new Date(),
    expectedVersion: 1
  }, { client });
  assert.match(query.sql, /deadline_version = 1/);
  assert.doesNotMatch(query.sql, /deadline_version = deadline_version \+ 1/);
});

test("reopening clears prior closure metadata before a later re-close", async () => {
  let query;
  const client = {
    async query(sql, values) {
      query = { sql, values };
      return { rows: [] };
    }
  };
  const repository = loadRepository(client);
  await repository.reopen(7, {
    actorUserId: 9,
    reason: "manual_reopen",
    expectedVersion: 4
  }, { client });
  assert.match(query.sql, /closed_at = NULL/);
  assert.match(query.sql, /close_reason = NULL/);
  assert.match(query.sql, /close_source = NULL/);
  assert.match(query.sql, /closure_note = NULL/);
  assert.match(query.sql, /close_source = 'manual'/);
  assert.match(query.sql, /current_closes_at > NOW\(\)/);
});

test("daily sequence allocation is serialized on the open accepting Queue Day", async () => {
  const client = {
    async query(sql) {
      assert.match(sql, /next_sequence = next_sequence \+ 1/);
      assert.match(sql, /state = 'open' AND intake_mode = 'accepting'/);
      return { rows: [{ sequence: 12 }] };
    }
  };
  const repository = loadRepository(client);
  assert.equal(await repository.allocateSequence(7, { client }), 12);
});
