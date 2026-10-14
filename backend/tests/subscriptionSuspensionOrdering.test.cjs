const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');

const lifecyclePath = require.resolve('../src/services/subscriptionLifecycleService');
const load = (name, mocks) => loadModuleWithMocks(require.resolve(name), mocks);

test('unprepared caller-owned suspension rejects before any SQL', async () => {
  const service = loadModuleWithMocks(lifecyclePath, { '../config/db': {}, '../repositories/subscriptionLifecycle': {}, '../repositories/subscriptionPlans': {} });
  const client = { query: async () => assert.fail('unprepared client attempted a lock') };
  for (const suspensionContext of [undefined, {}]) {
    await assert.rejects(service.suspendSubscription('1', {}, { client, suspensionContext }), { code: 'SUSPENSION_CONTEXT_REQUIRED' });
  }
  await assert.rejects(service.prepareSubscriptionSuspension('1'), /transaction client/);
});

test('suspension reader translates only its scoped NOWAIT conflict', async () => {
  const { readSubscription } = require('../src/repositories/subscriptionSuspension');
  const error = Object.assign(new Error('lock'), { code: '55P03' });
  const client = { query: async () => { throw error; } };
  await assert.rejects(readSubscription(client, '1', true), { code: 'SUBSCRIPTION_BUSY', statusCode: 409 });
  await assert.rejects(readSubscription(client, '1'), value => value === error);
  error.code = '40P01';
  await assert.rejects(readSubscription(client, '1', true), value => value === error);
});

function platformHandler(db, lifecycle, preview, confirmations) {
  const registrations = [];
  const router = new Proxy({}, { get: (_, method) => (...args) => registrations.push({ method, args }) });
  const fallback = new Proxy({}, { get: () => () => undefined });
  const mocks = {
    express: { Router: () => router }, '../middleware/asyncHandler': value => value,
    '../middleware/auth': { authenticate() {}, requirePlatformPermission: permission => ({ permission }) },
    '../middleware/idempotency': { requireIdempotency: scope => ({ scope }) },
    '../middleware/releaseControl': { requireReleaseControl: control => ({ control }) },
    '../config/db': db, '../services/subscriptionLifecycleService': lifecycle,
    '../services/privilegedPreviewService': preview, '../services/privilegedTransactionService': confirmations
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/routes/platformRoutes.js'), 'utf8'), {
    require: name => mocks[name] || fallback, module: { exports: {} }
  });
  const route = registrations.find(({ method, args }) => method === 'post' && args[0] === '/subscriptions/:subscriptionId/suspend');
  assert.equal(route.args[1].permission, 'platform.subscription_lifecycle.manage');
  assert.equal(route.args[2].control, 'subscriptionLifecycle');
  assert.equal(route.args[3].scope, 'platform.subscription.suspend');
  return route.args.at(-1);
}

const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
test('prepared suspension and Platform confirmations preserve PostgreSQL transaction boundaries', { skip: !databaseUrl, timeout: 30000 }, async t => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_test', '/getprio_ledger_test'].includes(url.pathname));
  const { Pool } = require('pg');
  const schema = `subscription_suspension_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema} -c statement_timeout=5000`, application_name: schema, max: 8 });
  let fault = false;
  let barrier = null;
  const db = { pool, withTransaction: async callback => {
    const raw = await pool.connect();
    const client = { query: async (sql, args) => {
      if (fault && sql.includes("UPDATE tenant_subscriptions SET status = 'suspended'")) throw new Error('suspension fault');
      const result = await raw.query(sql, args);
      if (barrier && sql === 'SELECT id FROM tenants WHERE id = $1 FOR UPDATE') { barrier.reached(); await barrier.release; }
      return result;
    } };
    try { await raw.query('BEGIN'); const value = await callback(client); await raw.query('COMMIT'); return value; }
    catch (error) { await raw.query('ROLLBACK'); throw error; }
    finally { raw.release(); }
  } };
  const repository = load('../src/repositories/subscriptionLifecycle', { '../config/db': db, './billing': {} });
  const lifecycle = loadModuleWithMocks(lifecyclePath, { '../config/db': db, '../repositories/subscriptionLifecycle': repository, '../repositories/subscriptionPlans': {} });
  const confirmationRepository = load('../src/repositories/privilegedTransactions', { '../config/db': db });
  const confirmations = load('../src/services/privilegedTransactionService', { '../repositories/privilegedTransactions': confirmationRepository });
  const preview = load('../src/services/privilegedPreviewService', { '../config/db': db, './privilegedTransactionService': confirmations });
  const handler = platformHandler(db, lifecycle, preview, confirmations);
  const session = { _id: '1', primaryAuthenticatedAt: new Date(), mfaVerifiedAt: new Date() };
  const reason = 'Reviewed subscription suspension';
  const action = 'subscription.suspend';
  const issue = async (target = '1') => {
    const payload = { subscriptionId: target };
    const state = await preview.resolvePreview({ action, target, payload });
    const confirmation = await confirmations.issueConfirmation({ actorId: '1', session, action, target, reason, payload, previewRevision: state.revision });
    return { target, token: confirmation.token, revision: state.revision };
  };
  const invoke = async (confirmation, selectedSession = session) => {
    const req = { params: { subscriptionId: confirmation.target }, body: { reason, previewRevision: confirmation.revision }, user: { _id: '1' }, auth: { session: selectedSession }, get: () => confirmation.token };
    let body;
    const res = { json: value => { body = value; } };
    await handler(req, res);
    return body;
  };
  const state = async () => (await pool.query(`SELECT
    (SELECT status FROM tenant_subscriptions WHERE id=1) AS status,
    (SELECT COUNT(*)::int FROM subscription_transitions) AS transitions,
    (SELECT COUNT(*)::int FROM privileged_transaction_confirmations WHERE used_at IS NOT NULL) AS consumed`)).rows[0];
  const reset = async () => {
    fault = false;
    await pool.query(`TRUNCATE tenants,users,auth_sessions,subscription_plans,tenant_subscriptions,subscription_transitions,privileged_transaction_confirmations,billing_checkout_sessions RESTART IDENTITY CASCADE;
      INSERT INTO tenants VALUES(1),(2); INSERT INTO users VALUES(1); INSERT INTO auth_sessions VALUES(1);
      INSERT INTO subscription_plans VALUES('free'); INSERT INTO tenant_subscriptions(id,tenant_id,plan_slug,status) VALUES(1,1,'free','active');`);
  };
  const wait = async fragment => {
    for (let attempt = 0; attempt < 300; attempt++) {
      if ((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE $2", [schema, `%${fragment}%`])).rowCount) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(`No lock waiter for ${fragment}`);
  };
  const holdTenant = async callback => {
    const client = await pool.connect();
    try { await client.query('BEGIN'); await client.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE'); await callback(client); }
    finally { await client.query('ROLLBACK'); client.release(); }
  };
  try {
    await pool.query(`CREATE SCHEMA ${schema}; CREATE TABLE tenants(id BIGINT PRIMARY KEY); CREATE TABLE users(id BIGINT PRIMARY KEY); CREATE TABLE auth_sessions(id BIGINT PRIMARY KEY); CREATE TABLE subscription_plans(slug TEXT PRIMARY KEY);`);
    const sql = fs.readFileSync(path.resolve(__dirname, '../../database/init.sql'), 'utf8');
    for (const table of ['tenant_subscriptions', 'subscription_transitions', 'privileged_transaction_confirmations', 'billing_checkout_sessions']) {
      await pool.query(sql.match(new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?\\n\\);`))[0]);
    }
    await t.test('Platform confirmation and transition commit once; fresh suspended confirmation is a no-op', async () => {
      await reset(); const confirmation = await issue();
      const result = await invoke(confirmation);
      assert.equal(result.subscription.status, 'suspended');
      assert.deepEqual(await state(), { status: 'suspended', transitions: 1, consumed: 1 });
      const transition = (await pool.query('SELECT metadata,created_by_user_id::text FROM subscription_transitions')).rows[0];
      assert.deepEqual(transition.metadata, { operation: 'suspend', previousStatus: 'active' });
      assert.equal(transition.created_by_user_id, '1');
      await assert.rejects(invoke(confirmation), { code: 'TRANSACTION_PREVIEW_STALE' });
      await invoke(await issue());
      assert.deepEqual(await state(), { status: 'suspended', transitions: 1, consumed: 2 });
    });
    await t.test('fault rolls back confirmation, transition and status; original confirmation retries', async () => {
      await reset(); const confirmation = await issue(); fault = true;
      await assert.rejects(invoke(confirmation), /suspension fault/);
      assert.deepEqual(await state(), { status: 'active', transitions: 0, consumed: 0 });
      fault = false; await invoke(confirmation);
      assert.deepEqual(await state(), { status: 'suspended', transitions: 1, consumed: 1 });
    });
    await t.test('Platform assurance and active-only failures do not consume confirmation', async () => {
      await reset(); const confirmation = await issue();
      await assert.rejects(invoke(confirmation, { ...session, mfaVerifiedAt: new Date(0) }), { code: 'RECENT_MFA_REQUIRED' });
      assert.deepEqual(await state(), { status: 'active', transitions: 0, consumed: 0 });
      await pool.query("UPDATE tenant_subscriptions SET status='past_due' WHERE id=1");
      await assert.rejects(invoke(await issue()), /Only an active/);
      assert.deepEqual(await state(), { status: 'past_due', transitions: 0, consumed: 0 });
    });
    for (const [name, callback] of [['Platform', async () => invoke(await issue())], ['standalone', () => lifecycle.suspendSubscription('1', { reason, actorId: '1' })]]) {
      await t.test(`${name} fails fast and releases tenant for a legacy subscription-held FK writer`, async () => {
        await reset();
        const confirmation = name === 'Platform' ? await issue() : null;
        const call = () => name === 'Platform' ? invoke(confirmation) : callback();
        const legacy = await pool.connect(); let reached, release;
        const entered = new Promise(resolve => { reached = resolve; });
        barrier = { reached, release: new Promise(resolve => { release = resolve; }) };
        try {
          await legacy.query('BEGIN'); await legacy.query('SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE');
          const pending = assert.rejects(call(), { code: 'SUBSCRIPTION_BUSY', statusCode: 409 });
          await entered;
          const insert = legacy.query("INSERT INTO subscription_transitions(tenant_id,to_plan_slug,transition_type,status,reason,effective_at) VALUES(1,'free','admin_resolution','effective','legacy publisher',NOW())");
          try { await wait('INSERT INTO subscription_transitions'); } finally { barrier = null; release(); }
          await pending; await insert; await legacy.query('COMMIT');
          assert.deepEqual(await state(), { status: 'active', transitions: 1, consumed: 0 });
          await call();
          assert.deepEqual(await state(), { status: 'suspended', transitions: 2, consumed: name === 'Platform' ? 1 : 0 });
        } finally { barrier = null; release(); await legacy.query('ROLLBACK'); legacy.release(); }
      });
    }
    for (const scenario of [
      { name: 'moved subscription after a tenant wait rejects without consuming confirmation', sql: 'UPDATE tenant_subscriptions SET tenant_id=2 WHERE id=1', code: 'SUBSCRIPTION_SCOPE_CHANGED', status: 'active' },
      { name: 'post-wait changed status keeps original preview stale and confirmation unused', sql: "UPDATE tenant_subscriptions SET status='past_due' WHERE id=1", code: 'TRANSACTION_PREVIEW_STALE', status: 'past_due' }
    ]) {
      await t.test(scenario.name, async () => {
        await reset(); const confirmation = await issue();
        await holdTenant(async holder => {
          const pending = assert.rejects(invoke(confirmation), { code: scenario.code });
          try { await wait('SELECT id FROM tenants'); await holder.query(scenario.sql); }
          finally { await holder.query('COMMIT'); }
          await pending;
        });
        assert.deepEqual(await state(), { status: scenario.status, transitions: 0, consumed: 0 });
      });
    }
    await t.test('provider activation waits for suspension and preserves its restricted outcome', async () => {
      await reset();
      const plans = { findPlanBySlug: async slug => ({ slug, entitlements: {} }), listPlans: async () => [], listAddOns: () => [] };
      const billing = load('../src/repositories/billing', { '../config/db': db, '../services/subscriptionPlans': plans });
      const provider = load('../src/services/billingService', {
        '../config/db': db, '../config/env': { paymongoSecretKey: 'test', paymongoApiUrl: 'https://provider.example.test' },
        '../repositories/billing': billing, './subscriptionPlans': plans,
        './queueJoinPaymentService': {}, './bookingSmsAlertPaymentService': {}, './usageCreditService': {}
      });
      await pool.query("INSERT INTO billing_checkout_sessions(id,tenant_id,plan_slug,provider_checkout_session_id,amount_cents,metadata) VALUES(1,1,'economical','provider-1',1000,$1::jsonb)", [JSON.stringify({ expectedSubscriptionId: '1', expectedPlanSlug: 'free' })]);
      const mock = t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ data: { id: 'provider-1', attributes: { status: 'paid' } } }) }));
      let reached, release;
      const entered = new Promise(resolve => { reached = resolve; });
      barrier = { reached, release: new Promise(resolve => { release = resolve; }) };
      const suspension = lifecycle.suspendSubscription('1', { reason, actorId: '1' });
      try {
        await entered;
        const activation = assert.rejects(provider.syncPayMongoCheckout({ tenant: { _id: '1' }, checkoutId: '1' }), { code: 'SUBSCRIPTION_RESTRICTED' });
        try { await wait('SELECT id FROM tenants'); } finally { barrier = null; release(); }
        await suspension; await activation;
        assert.deepEqual(await state(), { status: 'suspended', transitions: 1, consumed: 0 });
        assert.equal((await pool.query('SELECT status FROM billing_checkout_sessions WHERE id=1')).rows[0].status, 'pending');
      } finally { barrier = null; release(); mock.mock.restore(); }
    });
    for (const status of ['past_due', 'unpaid', 'expired', 'canceled']) {
      await t.test(`standalone ${status} guard preserves current policy`, async () => {
        await reset(); await pool.query('UPDATE tenant_subscriptions SET status=$1 WHERE id=1', [status]);
        await assert.rejects(lifecycle.suspendSubscription('1', { reason }), /Only an active/);
        assert.deepEqual(await state(), { status, transitions: 0, consumed: 0 });
      });
    }
    await t.test('prepared context cannot cross client or target or be reused', async () => {
      await reset();
      await db.withTransaction(async client => {
        const suspensionContext = await lifecycle.prepareSubscriptionSuspension('1', { client });
        for (const [target, selected] of [['2', client], ['1', pool]]) {
          await assert.rejects(lifecycle.suspendSubscription(target, {}, { client: selected, suspensionContext }), { code: 'SUSPENSION_CONTEXT_REQUIRED' });
        }
        await lifecycle.suspendSubscription('1', { reason, actorId: '1' }, { client, suspensionContext });
        await assert.rejects(lifecycle.suspendSubscription('1', {}, { client, suspensionContext }), { code: 'SUSPENSION_CONTEXT_REQUIRED' });
      });
      assert.deepEqual(await state(), { status: 'suspended', transitions: 1, consumed: 0 });
    });
    await t.test('missing targets return null or 404 without confirmation consumption', async () => {
      await reset(); const confirmation = await issue('404');
      assert.equal(await lifecycle.suspendSubscription('404', { reason }), null);
      await assert.rejects(invoke(confirmation), error => error.statusCode === 404);
      assert.deepEqual(await state(), { status: 'active', transitions: 0, consumed: 0 });
    });
    await t.test('adjacent BIGINT subscription and tenant identities stay distinct', async () => {
      await reset(); const ids = ['9007199254740992', '9007199254740993'];
      for (const id of ids) {
        await pool.query('INSERT INTO tenants VALUES($1)', [id]);
        await pool.query("INSERT INTO tenant_subscriptions(id,tenant_id,plan_slug,status) VALUES($1,$1,'free','active')", [id]);
      }
      await invoke(await issue(ids[1]));
      const rows = (await pool.query('SELECT id::text,status FROM tenant_subscriptions WHERE id=ANY($1::bigint[]) ORDER BY id', [ids])).rows;
      assert.deepEqual(rows, [{ id: ids[0], status: 'active' }, { id: ids[1], status: 'suspended' }]);
      assert.equal((await pool.query('SELECT tenant_id::text FROM subscription_transitions')).rows[0].tenant_id, ids[1]);
    });
  } finally { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); }
});
