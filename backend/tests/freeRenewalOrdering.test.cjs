const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');
const { waitForDatabaseLock } = require('./helpers/waitForDatabaseLock.cjs');
const { runIdempotentHandler } = require('./helpers/runIdempotentHandler.cjs');
const load = (name, mocks) => loadModuleWithMocks(require.resolve(name), mocks);
const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;

test('Free renewal serializes current periods under exact tenant roots', { skip: !databaseUrl, timeout: 45000 }, async t => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_test', '/getprio_ledger_test'].includes(url.pathname));
  const { Pool } = require('pg');
  const schema = `renewal_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: databaseUrl, application_name: schema, options: `-c search_path=${schema} -c statement_timeout=5000`, max: 8 });
  let barrier, fault;
  const db = { pool, withTransaction: async callback => {
    const raw = await pool.connect();
    const client = { query: async (sql, values) => {
      const result = await raw.query(sql, values);
      if (fault && sql.includes('UPDATE tenant_subscriptions subscription')) throw new Error('renewal post-write fault');
      if (barrier && sql.includes(barrier.fragment)) { barrier.reached(); await barrier.release; }
      return result;
    } };
    try { await raw.query('BEGIN'); const result = await callback(client); await raw.query('COMMIT'); return result; }
    catch (error) { await raw.query('ROLLBACK'); throw error; }
    finally { raw.release(); }
  } };
  const repository = load('../src/repositories/subscriptionLifecycle', { '../config/db': db, './billing': {} });
  const service = load('../src/services/subscriptionLifecycleService', { '../config/db': db, '../repositories/subscriptionLifecycle': repository, '../repositories/subscriptionPlans': {} });
  const run = () => repository.renewFreeSubscriptions();
  const state = async () => (await pool.query('SELECT id::text,tenant_id::text,plan_slug,status,current_period_start,current_period_end FROM tenant_subscriptions ORDER BY id')).rows;
  const reset = async () => {
    fault = false;
    await pool.query(`TRUNCATE tenants,users,subscription_plans,tenant_subscriptions,subscription_transitions,idempotency_records,refs RESTART IDENTITY CASCADE;
      INSERT INTO tenants VALUES(1),(2); INSERT INTO users VALUES(1); INSERT INTO subscription_plans VALUES('free'),('pro');
      INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status,current_period_start,current_period_end)
      VALUES(1,'free','active',clock_timestamp()-INTERVAL '2 months',clock_timestamp()-INTERVAL '1 month');`);
  };
  const hold = async (sql, operation) => {
    const holder = await pool.connect();
    try { await holder.query('BEGIN'); await holder.query(sql); await operation(holder); }
    finally { await holder.query('ROLLBACK'); holder.release(); }
  };
  try {
    await pool.query(`CREATE SCHEMA ${schema}; CREATE TABLE tenants(id BIGINT PRIMARY KEY); CREATE TABLE users(id BIGINT PRIMARY KEY); CREATE TABLE subscription_plans(slug TEXT PRIMARY KEY); CREATE TABLE refs(tenant_id BIGINT REFERENCES tenants(id));`);
    const init = fs.readFileSync(path.resolve(__dirname, '../../database/init.sql'), 'utf8');
    for (const table of ['tenant_subscriptions', 'subscription_transitions', 'idempotency_records']) await pool.query(init.match(new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?\\n\\);`))[0]);
    await t.test('catch-up retains successive PostgreSQL month anchors and one current interval', async () => {
      await reset();
      await pool.query("UPDATE tenant_subscriptions SET current_period_end=date_trunc('year',clock_timestamp())-INTERVAL '1 month'+INTERVAL '30 days'");
      const expected = (await pool.query(`WITH RECURSIVE p AS (SELECT current_period_end AS start,current_period_end+INTERVAL '1 month' AS finish FROM tenant_subscriptions UNION ALL SELECT finish,finish+INTERVAL '1 month' FROM p WHERE finish<=clock_timestamp()) SELECT start,finish FROM p WHERE finish>clock_timestamp()`)).rows[0];
      const result = await run();
      assert.equal(result.length, 1); assert.equal(result[0].current_period_start.toISOString(), expected.start.toISOString()); assert.equal(result[0].current_period_end.toISOString(), expected.finish.toISOString());
      assert.deepEqual(await run(), []); assert.equal((await state()).length, 1);
    });
    await t.test('competing renewals commit exactly once', async () => {
      await reset(); const results = await Promise.all([run(), run()]); assert.equal(results.flat().length, 1);
    });
    for (const update of ["status='suspended'", "status='past_due'", "status='expired'", "plan_slug='pro'", 'current_period_end=NULL', "current_period_end=clock_timestamp()+INTERVAL '1 day'"]) {
      await t.test(`tenant wait rereads ${update} without renewal`, async () => {
        await reset();
        await hold('SELECT id FROM tenants WHERE id=1 FOR UPDATE', async holder => {
          const pending = run(); pending.catch(() => {}); await waitForDatabaseLock(pool, schema, 'SELECT id FROM tenants');
          await holder.query(`UPDATE tenant_subscriptions SET ${update} WHERE id=1`); await holder.query('COMMIT');
          assert.deepEqual(await pending, []);
        });
      });
    }
    await t.test('tenant wait rejects moved linkage without changing either period', async () => {
      await reset();
      await hold('SELECT id FROM tenants WHERE id=1 FOR UPDATE', async holder => {
        const pending = assert.rejects(run(), { code: 'SUBSCRIPTION_RENEWAL_SCOPE_CHANGED' }); await waitForDatabaseLock(pool, schema, 'SELECT id FROM tenants');
        await holder.query('UPDATE tenant_subscriptions SET tenant_id=2 WHERE id=1'); await holder.query('COMMIT'); const before = await state(); await pending; assert.deepEqual(await state(), before);
      });
    });
    await t.test('deleted subscription after tenant wait is a no-op', async () => {
      await reset();
      await hold('SELECT id FROM tenants WHERE id=1 FOR UPDATE', async holder => {
        const pending = run(); pending.catch(() => {}); await waitForDatabaseLock(pool, schema, 'SELECT id FROM tenants');
        await holder.query('DELETE FROM tenant_subscriptions WHERE id=1'); await holder.query('COMMIT'); assert.deepEqual(await pending, []);
      });
    });
    await t.test('renewal observes database time after the tenant wait rather than transaction start', async () => {
      await reset();
      await hold('SELECT id FROM tenants WHERE id=1 FOR UPDATE', async holder => {
        const pending = run(); pending.catch(() => {}); await waitForDatabaseLock(pool, schema, 'SELECT id FROM tenants');
        const changed = (await holder.query("UPDATE tenant_subscriptions SET current_period_end=clock_timestamp()+INTERVAL '150 milliseconds' RETURNING current_period_end")).rows[0];
        await holder.query('SELECT pg_sleep(0.3)'); await holder.query('COMMIT');
        const result = await pending; assert.equal(result.length, 1); assert.equal(result[0].current_period_start.toISOString(), changed.current_period_end.toISOString());
      });
    });
    await t.test('legacy child-first FK writer receives tenant after busy renewal rollback then retry', async () => {
      await reset(); let reached, release;
      const entered = new Promise(resolve => { reached = resolve; }); barrier = { fragment: 'FROM tenants', reached, release: new Promise(resolve => { release = resolve; }) };
      await hold('SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE', async holder => {
        const before = await state(); const pending = assert.rejects(run(), { code: 'SUBSCRIPTION_BUSY' }); await entered;
        const write = holder.query('INSERT INTO refs VALUES(1)'); write.catch(() => {});
        try { await waitForDatabaseLock(pool, schema, 'INSERT INTO refs'); } finally { barrier = null; release(); }
        await pending; await write; await holder.query('COMMIT'); assert.deepEqual(await state(), before);
      });
      assert.equal((await run()).length, 1);
    });
    await t.test('renewal-first retains both accepted rows through commit and rollback', async () => {
      await reset(); let reached, release;
      const entered = new Promise(resolve => { reached = resolve; }); barrier = { fragment: 'UPDATE tenant_subscriptions subscription', reached, release: new Promise(resolve => { release = resolve; }) };
      const pending = run(); pending.catch(() => {}); await entered;
      try {
        for (const sql of ['SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT', 'SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE NOWAIT']) await assert.rejects(pool.query(sql), { code: '55P03' });
      } finally { barrier = null; release(); }
      await pending;
      await reset(); const before = await state(); fault = true; await assert.rejects(run(), /post-write fault/); assert.deepEqual(await state(), before); fault = false; assert.equal((await run()).length, 1);
    });
    await t.test('caller-owned transaction rolls renewal back with subsequent domain failure', async () => {
      await reset(); const before = await state();
      await assert.rejects(db.withTransaction(async client => { assert.equal((await repository.renewFreeSubscriptions({ client })).length, 1); throw new Error('caller failure'); }), /caller failure/);
      assert.deepEqual(await state(), before);
    });
    await t.test('adjacent BIGINT tenant and subscription identities remain exact', async () => {
      await reset(); await pool.query('TRUNCATE tenants,tenant_subscriptions,subscription_transitions RESTART IDENTITY CASCADE');
      for (const id of ['9007199254740992', '9007199254740993']) {
        await pool.query('INSERT INTO tenants VALUES($1)', [id]); await pool.query("INSERT INTO tenant_subscriptions(id,tenant_id,plan_slug,status,current_period_end) VALUES($1,$1,'free','active',clock_timestamp()-INTERVAL '1 second')", [id]);
      }
      const result = await run(); assert.deepEqual(result.map(row => row.id), ['9007199254740992', '9007199254740993']); assert.deepEqual(result.map(row => row.tenant_id), result.map(row => row.id));
    });
    await t.test('nonfinite due period fails closed without unbounded recursion', async () => {
      await reset(); await pool.query("UPDATE tenant_subscriptions SET current_period_end='-infinity'");
      await assert.rejects(run(), { code: 'FREE_SUBSCRIPTION_PERIOD_INVALID' });
    });
    await t.test('same-key partial execute-due renewal retry preserves earlier commit and replays success', async () => {
      await reset(); await pool.query("INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status,current_period_end) VALUES(2,'free','active',clock_timestamp()-INTERVAL '1 minute')");
      const records = load('../src/repositories/idempotency', { '../config/db': db });
      const claims = load('../src/services/idempotencyService', { '../repositories/idempotency': records });
      let completion;
      const observedRecords = { ...records, complete: (...args) => { completion = records.complete(...args); return completion; } };
      const middleware = load('../src/middleware/idempotency', { '../services/idempotencyService': claims, '../repositories/idempotency': observedRecords }).requireIdempotency('platform.subscription_transition.execute_due', { retryableErrorCodes: ['SUBSCRIPTION_BUSY', 'SUBSCRIPTION_RENEWAL_SCOPE_CHANGED'] });
      const request = () => runIdempotentHandler(middleware, async (_req, res) => res.json(await service.executeDue()), { user: { _id: '1' }, body: {}, get: () => 'renewal-retry-1' });
      let first;
      await hold('SELECT id FROM tenant_subscriptions WHERE id=2 FOR UPDATE', async () => {
        const result = await request(); assert.equal(result.status, 409); assert.equal(result.body.code, 'SUBSCRIPTION_BUSY');
        first = (await state())[0]; assert.ok(first.current_period_end > new Date()); assert.equal((await pool.query('SELECT * FROM idempotency_records')).rows.length, 0);
      });
      const success = await request(); await completion; assert.equal(success.status, 200); assert.equal(success.body.renewals.length, 1); assert.deepEqual((await state())[0], first); assert.deepEqual(await request(), success);
    });
  } finally { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); }
});
