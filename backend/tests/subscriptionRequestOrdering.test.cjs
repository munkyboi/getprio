const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');
const { waitForDatabaseLock } = require('./helpers/waitForDatabaseLock.cjs');
const { runIdempotentHandler } = require('./helpers/runIdempotentHandler.cjs');
const load = (name, mocks) => loadModuleWithMocks(require.resolve(name), mocks);

function routeHandler(kind, mocks) {
  const registrations = [];
  const router = new Proxy({}, { get: (_, method) => (...args) => registrations.push({ method, args }) });
  const fallback = new Proxy({}, { get: () => () => undefined });
  const dependencies = {
    express: { Router: () => router }, '../middleware/asyncHandler': handler => handler,
    '../middleware/auth': { authenticate() {}, requirePlatformPermission: permission => ({ permission }) },
    '../middleware/releaseControl': { requireReleaseControl: control => ({ control }) },
    '../middleware/idempotency': { requireIdempotency: (scope, options) => ({ scope, options }) }, ...mocks
  };
  const filename = kind === 'platform' ? 'platformRoutes.js' : 'billingRoutes.js';
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/routes', filename), 'utf8'), { require: name => dependencies[name] || fallback, module: { exports: {} } });
  const route = registrations.find(row => row.method === 'post' && row.args[0] === (kind === 'platform' ? '/subscriptions' : '/tenant/:tenantSlug/subscription-transitions'));
  assert.ok(route); const idempotency = route.args.find(value => value?.scope);
  assert.equal(idempotency.scope, `${kind === 'platform' ? 'platform' : 'tenant'}.subscription_transition.create`);
  assert.ok(Array.from(idempotency.options.retryableErrorCodes).includes('SUBSCRIPTION_BUSY'));
  if (kind === 'platform') assert.equal(route.args[1].permission, 'platform.subscription_lifecycle.manage');
  return route.args.at(-1);
}

const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
test('interactive transition preparation precedes previews and confirmation under exact tenant locks', { skip: !databaseUrl, timeout: 45000 }, async t => {
  const url = new URL(databaseUrl); assert.equal(url.hostname, '127.0.0.1'); assert.ok(['/getprio_test', '/getprio_ledger_test'].includes(url.pathname));
  const { Pool } = require('pg'); const schema = `request_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: databaseUrl, application_name: schema, options: `-c search_path=${schema} -c statement_timeout=5000`, max: 8 });
  let barrier, fault, previews = 0, confirmations = 0, audits = 0;
  const db = { pool, withTransaction: async callback => {
    const raw = await pool.connect();
    const client = { query: async (sql, values) => {
      const result = await raw.query(sql, values);
      if (fault && sql.includes("SET status = 'effective'")) throw new Error('request completion fault');
      if (barrier && sql.includes(barrier.fragment)) { barrier.reached(); await barrier.release; }
      return result;
    } };
    try { await raw.query('BEGIN'); const result = await callback(client); await raw.query('COMMIT'); return result; }
    catch (error) { await raw.query('ROLLBACK'); throw error; } finally { raw.release(); }
  } };
  const billing = load('../src/repositories/billing', { '../config/db': db, '../services/subscriptionPlans': {} });
  const repository = load('../src/repositories/subscriptionLifecycle', { '../config/db': db, './billing': billing });
  const service = load('../src/services/subscriptionLifecycleService', { '../config/db': db, '../repositories/subscriptionLifecycle': repository });
  const preview = { resolvePreview: async (_input, { client, lock }) => { assert.equal(lock, true); previews++; await client.query('SELECT id FROM tenant_subscriptions ORDER BY id FOR UPDATE'); return { revision: 'fixture' }; } };
  const consume = { consumeConfirmation: async (_input, { client }) => { confirmations++; await client.query('UPDATE confirmations SET consumed=consumed+1'); } };
  const dependencies = {
    '../config/db': db, '../services/subscriptionLifecycleService': service,
    '../repositories/tenants': { findTenantById: async id => ({ _id: String(id) }) },
    '../repositories/subscriptionPlans': { findPlanBySlug: async slug => ({ slug }) },
    '../services/privilegedPreviewService': preview, '../services/privilegedTransactionService': consume,
    '../services/securityAuditService': { record: async () => { audits++; } }
  };
  const handlers = { platform: routeHandler('platform', dependencies), vendor: routeHandler('vendor', dependencies) };
  const input = (changes = {}) => ({ tenantId: '1', actorId: '1', toPlanSlug: 'free', reason: 'Reviewed exit', ...changes });
  const invoke = async (kind = 'platform', changes = {}) => {
    const values = input(changes); let response;
    await handlers[kind]({ body: { tenantId: values.tenantId, planSlug: values.toPlanSlug, toPlanSlug: values.toPlanSlug, reason: values.reason, metadata: values.metadata }, authorizedTenant: { _id: values.tenantId }, user: { _id: values.actorId }, auth: { session: {}, sessionId: '1' }, get: () => 'fixture-token' }, { status() { return this; }, json(body) { response = body; } });
    return response.transition;
  };
  const state = async () => ({ subscriptions: (await pool.query('SELECT id::text,tenant_id::text,plan_slug,status,current_period_end FROM tenant_subscriptions ORDER BY id')).rows, transitions: (await pool.query('SELECT id::text,tenant_id::text,status,created_by_user_id::text FROM subscription_transitions ORDER BY id')).rows, receipt: (await pool.query('SELECT consumed FROM confirmations')).rows[0].consumed });
  const reset = async () => {
    fault = false; previews = 0; confirmations = 0; audits = 0;
    await pool.query(`TRUNCATE tenants,users,subscription_plans,tenant_subscriptions,subscription_transitions,idempotency_records,confirmations,refs RESTART IDENTITY CASCADE;
      INSERT INTO tenants VALUES(1),(2); INSERT INTO users VALUES(1,ARRAY['platform_admin'],NULL,NULL),(2,ARRAY['customer','vendor'],NULL,NULL);
      INSERT INTO subscription_plans VALUES('free'),('pro'),('economical'); INSERT INTO confirmations VALUES(0);
      INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status,current_period_start,current_period_end) VALUES(1,'pro','active',clock_timestamp()-INTERVAL '1 day',clock_timestamp()+INTERVAL '20 days');`);
  };
  const hold = async (sql, operation) => { const holder = await pool.connect(); try { await holder.query('BEGIN'); await holder.query(sql); await operation(holder); } finally { await holder.query('ROLLBACK'); holder.release(); } };
  try {
    await pool.query(`CREATE SCHEMA ${schema}; CREATE TABLE tenants(id BIGINT PRIMARY KEY); CREATE TABLE users(id BIGINT PRIMARY KEY,roles TEXT[],deletion_requested_at TIMESTAMPTZ,platform_access_suspended_at TIMESTAMPTZ); CREATE TABLE subscription_plans(slug TEXT PRIMARY KEY); CREATE TABLE confirmations(consumed INTEGER); CREATE TABLE refs(tenant_id BIGINT REFERENCES tenants(id));`);
    const init = fs.readFileSync(path.resolve(__dirname, '../../database/init.sql'), 'utf8');
    for (const table of ['tenant_subscriptions','subscription_transitions','idempotency_records']) await pool.query(init.match(new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?\\n\\);`))[0]);
    for (const kind of ['platform', 'vendor']) {
      await t.test(`${kind} scheduled exit preserves current term and consumes only after preparation`, async () => {
        await reset(); const before = await state(); const result = await invoke(kind, { actorId: kind === 'vendor' ? '2' : '1' });
        assert.equal(result.status, 'scheduled'); assert.equal(result.transition_type, 'paid_exit'); assert.equal(result.effective_at.toISOString(), before.subscriptions[0].current_period_end.toISOString()); assert.deepEqual((await state()).subscriptions, before.subscriptions); assert.equal((await state()).receipt, 1); assert.equal(previews, 1); assert.equal(audits, kind === 'vendor' ? 1 : 0);
      });
    }
    for (const scenario of [
      { table: 'tenant_subscriptions', where: 'id=1', code: 'SUBSCRIPTION_BUSY' },
      { table: 'users', where: 'id=1', code: 'SUBSCRIPTION_ACTOR_BUSY' },
      { table: 'subscription_plans', where: "slug='free'", code: 'SUBSCRIPTION_PLAN_BUSY' }
    ]) {
      await t.test(`${scenario.table} legacy-first tenant FK writer fails fast before preview and permits retry`, async () => {
        await reset(); let reached, release; const entered = new Promise(resolve => { reached = resolve; }); barrier = { fragment: 'FROM tenants', reached, release: new Promise(resolve => { release = resolve; }) };
        await hold(`SELECT * FROM ${scenario.table} WHERE ${scenario.where} FOR UPDATE`, async holder => {
          const before = await state(); const pending = assert.rejects(invoke(), { code: scenario.code }); await entered;
          const write = holder.query('INSERT INTO refs VALUES(1)'); write.catch(() => {});
          try { await waitForDatabaseLock(pool, schema, 'INSERT INTO refs'); } finally { barrier = null; release(); }
          await pending; await write; await holder.query('COMMIT'); assert.deepEqual(await state(), before); assert.equal(previews, 0); assert.equal(confirmations, 0);
        }); await invoke();
      });
    }
    for (const update of ["status='past_due'", "status='unpaid'", "status='suspended'"]) {
      await t.test(`tenant wait rechecks ${update} and rolls confirmation back`, async () => {
        await reset(); await hold('SELECT id FROM tenants WHERE id=1 FOR UPDATE', async holder => {
          const pending = assert.rejects(invoke(), { code: 'RESTRICTED_PLAN_CHANGE_DENIED' }); await waitForDatabaseLock(pool, schema, 'SELECT id FROM tenants');
          await holder.query(`UPDATE tenant_subscriptions SET ${update}`); await holder.query('COMMIT'); const before = await state(); await pending; assert.deepEqual(await state(), before);
        });
      });
    }
    for (const scenario of [
      { update: "roles=ARRAY['customer']", status: 403 },
      { update: 'deletion_requested_at=clock_timestamp()', status: 401 },
      { update: 'platform_access_suspended_at=clock_timestamp()', code: 'ACCOUNT_ACCESS_SUSPENDED' }
    ]) {
      await t.test(`Platform rechecks current actor ${scenario.update}`, async () => {
        await reset(); await pool.query(`UPDATE users SET ${scenario.update} WHERE id=1`);
        await assert.rejects(invoke(), error => scenario.code ? error.code === scenario.code : error.statusCode === scenario.status); assert.equal(previews, 0); assert.equal((await state()).receipt, 0);
      });
    }
    await t.test('immediate Free assignment and admin resolution use prepared execution and roll back on completion failure', async () => {
      await reset(); await pool.query('DELETE FROM tenant_subscriptions'); const before = await state(); fault = true;
      await assert.rejects(invoke(), /completion fault/); assert.deepEqual(await state(), before); fault = false;
      assert.equal((await invoke()).status, 'effective'); assert.equal((await state()).subscriptions[0].plan_slug, 'free');
      await reset(); assert.equal((await invoke('platform', { toPlanSlug: 'pro' })).status, 'effective'); assert.deepEqual((await state()).subscriptions.map(row => row.status), ['expired','active']);
    });
    await t.test('vendor upgrades and unpaid Platform upgrades retain checkout requirements', async () => {
      await reset(); await pool.query("UPDATE tenant_subscriptions SET plan_slug='economical'"); const before = await state();
      for (const kind of ['platform','vendor']) await assert.rejects(invoke(kind, { actorId: kind === 'vendor' ? '2' : '1', toPlanSlug: 'pro' }), { code: 'PAID_CHECKOUT_REQUIRED' });
      assert.deepEqual(await state(), before); assert.equal(audits, 0);
    });
    await t.test('missing tenant plan and actor reject before consuming confirmation', async () => {
      await reset(); await assert.rejects(invoke('platform', { tenantId: '99' }), { statusCode: 404 });
      await assert.rejects(invoke('platform', { actorId: '99' }), { statusCode: 401 });
      await pool.query("DELETE FROM subscription_plans WHERE slug='free'"); await assert.rejects(invoke(), { statusCode: 404 });
      assert.equal(previews, 0); assert.equal((await state()).receipt, 0);
    });
    await t.test('accepted tenant actor plan and subscription are held through commit', async () => {
      await reset(); let reached, release; const entered = new Promise(resolve => { reached = resolve; }); barrier = { fragment: 'UPDATE confirmations', reached, release: new Promise(resolve => { release = resolve; }) };
      const pending = invoke(); pending.catch(() => {}); await entered;
      try { for (const sql of ['SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM users WHERE id=1 FOR UPDATE NOWAIT',"SELECT slug FROM subscription_plans WHERE slug='free' FOR UPDATE NOWAIT",'SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE NOWAIT']) await assert.rejects(pool.query(sql), { code: '55P03' }); }
      finally { barrier = null; release(); } await pending;
    });
    await t.test('context is opaque client-bound input-bound and one-use', async () => {
      await reset();
      await db.withTransaction(async client => {
        const value = input(); const context = await service.prepareSubscriptionTransition(value, { client, requirePlatformAuthority: true });
        for (const changed of [{ tenantId: '2' }, { actorId: '2' }, { toPlanSlug: 'pro' }, { vendorRequested: true }]) await assert.rejects(service.requestTransition({ ...value, ...changed }, { client, transitionContext: context }), { code: 'SUBSCRIPTION_TRANSITION_CONTEXT_REQUIRED' });
        await assert.rejects(service.requestTransition(value, { client, transitionContext: {} }), { code: 'SUBSCRIPTION_TRANSITION_CONTEXT_REQUIRED' });
        await db.withTransaction(other => assert.rejects(service.requestTransition(value, { client: other, transitionContext: context }), { code: 'SUBSCRIPTION_TRANSITION_CONTEXT_REQUIRED' }));
        await service.requestTransition(value, { client, transitionContext: context });
        await assert.rejects(service.requestTransition(value, { client, transitionContext: context }), { code: 'SUBSCRIPTION_TRANSITION_CONTEXT_REQUIRED' });
      });
    });
    await t.test('system standalone calls remain supported and caller-owned failure rolls all state back', async () => {
      await reset(); assert.equal((await service.requestTransition(input({ actorId: null }))).created_by_user_id, null);
      await reset(); const before = await state(); await assert.rejects(db.withTransaction(async client => { await service.requestTransition(input(), { client }); throw new Error('caller failure'); }), /caller failure/); assert.deepEqual(await state(), before);
    });
    await t.test('adjacent BIGINT tenants and actor references remain exact and unsafe numbers fail before SQL', async () => {
      await reset(); const ids = ['9007199254740992','9007199254740993'];
      for (const id of ids) { await pool.query('INSERT INTO tenants VALUES($1)', [id]); await pool.query("INSERT INTO users(id,roles) VALUES($1,ARRAY['platform_admin'])", [id]); }
      for (const id of ids) await service.requestTransition(input({ tenantId: id, actorId: id }));
      assert.deepEqual((await state()).transitions.map(row => [row.tenant_id,row.created_by_user_id]), ids.map(id => [id,id]));
      const client = { query: () => assert.fail('invalid input reached SQL') };
      for (const changed of [{ tenantId: Number(ids[1]) }, { actorId: Number(ids[1]) }]) await assert.rejects(service.requestTransition(input(changed), { client }), error => error.statusCode === 400);
      await assert.rejects(service.requestTransition(input({ toPlanSlug: '__proto__' }), { client }), { statusCode: 404 });
      await assert.rejects(service.prepareSubscriptionTransition(input(), {}), /transaction client/);
      await assert.rejects(service.prepareSubscriptionTransition(input({ actorId: null }), { client, requirePlatformAuthority: true }), { statusCode: 401 });
    });
    await t.test('same-key busy retry retains confirmation then replays durable success', async () => {
      await reset(); const records = load('../src/repositories/idempotency', { '../config/db': db }); const claims = load('../src/services/idempotencyService', { '../repositories/idempotency': records }); let completion;
      const observed = { ...records, complete: (...args) => { completion = records.complete(...args); return completion; } };
      const middleware = load('../src/middleware/idempotency', { '../services/idempotencyService': claims, '../repositories/idempotency': observed }).requireIdempotency('platform.subscription_transition.create', { retryableErrorCodes: ['SUBSCRIPTION_BUSY','SUBSCRIPTION_ACTOR_BUSY','SUBSCRIPTION_PLAN_BUSY','SUBSCRIPTION_TRANSITION_BUSY'] });
      const request = () => runIdempotentHandler(middleware, async (_req, res) => res.json(await invoke()), { user: { _id: '1' }, body: {}, get: () => 'request-retry' });
      await hold('SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE', async () => { const busy = await request(); assert.equal(busy.body.code, 'SUBSCRIPTION_BUSY'); assert.equal((await state()).receipt, 0); });
      const success = await request(); await completion; assert.equal(success.status, 200); assert.deepEqual(await request(), success); assert.equal((await state()).transitions.length, 1); assert.equal((await state()).receipt, 1);
    });
  } finally { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); }
});
