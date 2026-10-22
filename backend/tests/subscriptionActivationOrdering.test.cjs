const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID, createHmac } = require('node:crypto');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');

const repositoryPath = require.resolve('../src/repositories/billing');
const servicePath = require.resolve('../src/services/billingService');

test('locked checkout lookup requires a transaction client and preserves BIGINT identities', async () => {
  const calls = [];
  const client = { query: async (sql, args) => { calls.push({ sql, args }); return { rows: [] }; } };
  const repository = loadModuleWithMocks(repositoryPath, {
    '../config/db': { pool: client }, '../services/subscriptionPlans': {}
  });
  await assert.rejects(repository.findCheckoutSessionById('9007199254740993', { forUpdate: true }), /transaction client/);
  assert.equal(calls.length, 0);
  await repository.findCheckoutSessionById('9007199254740993', { client, forUpdate: true });
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.deepEqual(calls[0].args, ['9007199254740993']);
  await repository.findCheckoutSessionById(7);
  assert.doesNotMatch(calls[1].sql, /FOR UPDATE/);
  assert.deepEqual(calls[1].args, ['7']);
});

test('only the scoped subscription NOWAIT conflict becomes retryable', async () => {
  const conflict = Object.assign(new Error('locked'), { code: '55P03' });
  const client = { query: async () => { throw conflict; } };
  const repository = loadModuleWithMocks(repositoryPath, { '../config/db': { pool: client }, '../services/subscriptionPlans': {} });
  await assert.rejects(repository.activateTenantSubscription({ tenantId: '1' }, { client, forUpdateNowait: true }), { statusCode: 409, code: 'SUBSCRIPTION_BUSY' });
  await assert.rejects(repository.activateTenantSubscription({ tenantId: '1' }, { client }), error => error === conflict);
  await assert.rejects(repository.activateTenantSubscription({ tenantId: '1' }, { forUpdateNowait: true }), /transaction client/);
});

const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
test('subscription entrypoints serialize before child writes in PostgreSQL', { skip: !databaseUrl, timeout: 30000 }, async t => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_test', '/getprio_ledger_test'].includes(url.pathname));
  const { Pool } = require('pg');
  const schema = `subscription_activation_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema} -c statement_timeout=5000`, application_name: schema, max: 8 });
  let fault = false;
  let missingPlan = false;
  let tenantBarrier = null;
  const transactionContext = new AsyncLocalStorage();
  const plans = { findPlanBySlug: async slug => missingPlan ? null : { slug, name: slug, entitlements: { staffSeats: 3 } }, listPlans: async () => [], listAddOns: () => [] };
  const db = { pool, withTransaction: async callback => {
    const raw = await pool.connect();
    const client = { query: async (sql, args) => {
      if (fault && sql.includes('INSERT INTO subscription_transitions')) throw new Error('activation write fault');
      const result = await raw.query(sql, args);
      if (tenantBarrier && sql === 'SELECT id FROM tenants WHERE id = $1 FOR UPDATE') {
        tenantBarrier.reached(); await tenantBarrier.release;
      }
      return result;
    } };
    try {
      await raw.query('BEGIN');
      const result = await transactionContext.run(true, () => callback(client));
      await raw.query('COMMIT'); return result;
    } catch (error) { await raw.query('ROLLBACK'); throw error; }
    finally { raw.release(); }
  } };
  const repository = loadModuleWithMocks(repositoryPath, { '../config/db': db, '../services/subscriptionPlans': plans });
  const service = loadModuleWithMocks(servicePath, {
    '../config/db': db, '../config/env': { paymongoSecretKey: 'test', paymongoApiUrl: 'https://provider.example.test', paymongoWebhookSecret: 'test-signature', paymongoMode: 'test' },
    '../repositories/billing': repository, './subscriptionPlans': plans,
    './queueJoinPaymentService': { handlePayMongoPaidCheckout: async () => ({ handled: false }) },
    './bookingSmsAlertPaymentService': { handlePayMongoPaidCheckout: async () => ({ handled: false }) },
    './usageCreditService': { handlePaidCheckout: async () => ({ handled: false }) }
  });
  const resource = id => ({ id: `provider-${id}`, attributes: { status: 'paid', payments: [{ id: `payment-${id}`, attributes: { amount: 1000, currency: 'PHP' } }] } });
  t.mock.method(global, 'fetch', async url => {
    assert.equal(transactionContext.getStore(), undefined, 'provider HTTP must precede held database locks');
    const id = String(url).split('/').pop().replace('provider-', '');
    return { ok: true, json: async () => ({ data: resource(id) }) };
  });
  const webhook = (id = '1', event = `event-${randomUUID()}`) => {
    const body = Buffer.from(JSON.stringify({ data: { id: event, attributes: { type: 'checkout_session.payment.paid', livemode: false, data: resource(id) } } }));
    const signature = createHmac('sha256', 'test-signature').update(`1.${body}`).digest('hex');
    return service.handlePayMongoWebhook(body, `t=1,te=${signature}`);
  };
  const sync = (id = '1', tenantId = '1') => service.syncPayMongoCheckout({ tenant: { _id: tenantId }, checkoutId: id });
  const counts = async () => (await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM tenant_subscriptions WHERE status='active') AS active,
    (SELECT COUNT(*)::int FROM subscription_transitions) AS transitions,
    (SELECT COUNT(*)::int FROM billing_events) AS events,
    (SELECT COUNT(*)::int FROM billing_checkout_sessions WHERE status='paid') AS paid`)).rows[0];
  const reset = async () => {
    fault = false; missingPlan = false;
    await pool.query(`TRUNCATE tenants,users,subscription_plans,tenant_subscriptions,subscription_transitions,billing_checkout_sessions,billing_events RESTART IDENTITY CASCADE;
      INSERT INTO tenants VALUES(1),(2); INSERT INTO subscription_plans VALUES('free'),('economical');
      INSERT INTO billing_checkout_sessions(id,tenant_id,plan_slug,provider_checkout_session_id,amount_cents) VALUES(1,1,'economical','provider-1',1000),(2,1,'economical','provider-2',1000);`);
  };
  const holdTenant = async () => {
    const client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
    return client;
  };
  const waitForLock = async (fragment, expected = 1) => {
    for (let attempt = 0; attempt < 300; attempt++) {
      const result = await pool.query("SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE $2", [schema, `%${fragment}%`]);
      if (result.rows[0].n >= expected) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(`No expected lock waiter for ${fragment}`);
  };
  const waitForTenant = expected => waitForLock('SELECT id FROM tenants', expected);
  const withHeldTenant = async callback => {
    const client = await holdTenant();
    try { await callback(client); }
    finally { await client.query('ROLLBACK'); client.release(); }
  };
  try {
    await pool.query(`CREATE SCHEMA ${schema}; CREATE TABLE tenants(id BIGINT PRIMARY KEY); CREATE TABLE users(id BIGINT PRIMARY KEY); CREATE TABLE subscription_plans(slug TEXT PRIMARY KEY);`);
    const bootstrap = fs.readFileSync(path.resolve(__dirname, '../../database/init.sql'), 'utf8');
    for (const table of ['tenant_subscriptions', 'subscription_transitions', 'billing_checkout_sessions', 'billing_events']) {
      const statement = bootstrap.match(new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?\\n\\);`));
      assert.ok(statement, `Missing bootstrap table ${table}`);
      await pool.query(statement[0]);
    }
    await t.test('concurrent sync and webhook activate a shared checkout once', async () => {
      await reset();
      await Promise.all([sync(), webhook()]);
      assert.deepEqual(await counts(), { active: 1, transitions: 1, events: 1, paid: 1 });
    });
    await t.test('distinct webhook events wait before acquiring tenant FK locks', async () => {
      await reset();
      let results;
      await withHeldTenant(async holder => {
        const pending = Promise.all([webhook('1'), webhook('1')]);
        try {
          await waitForTenant(2);
          assert.equal((await counts()).events, 0);
        } finally { await holder.query('COMMIT'); }
        results = await pending;
      });
      assert.equal(results.filter(result => result.alreadyPaid).length, 1);
      assert.deepEqual(await counts(), { active: 1, transitions: 1, events: 2, paid: 1 });
    });
    await t.test('zero-current distinct checkouts cannot both activate after waiting', async () => {
      await reset();
      let results;
      await withHeldTenant(async holder => {
        const pending = Promise.allSettled([webhook('1'), webhook('2')]);
        try { await waitForTenant(2); } finally { await holder.query('COMMIT'); }
        results = await pending;
      });
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const rejected = results.find(result => result.status === 'rejected');
      assert.equal(rejected.reason.code, 'SUBSCRIPTION_REVISION_CONFLICT');
      assert.deepEqual(await counts(), { active: 1, transitions: 1, events: 1, paid: 1 });
    });
    for (const [name, operations] of [
      ['sync and webhook', () => [sync('1'), webhook('2')]],
      ['two sync callbacks', () => [sync('1'), sync('2')]]
    ]) {
      await t.test(`distinct checkouts from ${name} revalidate the current subscription`, async () => {
        await reset();
        let results;
        await withHeldTenant(async holder => {
          const pending = Promise.allSettled(operations());
          try { await waitForTenant(2); } finally { await holder.query('COMMIT'); }
          results = await pending;
        });
        assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
        assert.equal(results.find(result => result.status === 'rejected').reason.code, 'SUBSCRIPTION_REVISION_CONFLICT');
        const state = await counts();
        assert.equal(state.active, 1); assert.equal(state.transitions, 1); assert.equal(state.paid, 1);
      });
    }
    await t.test('duplicate event remains idempotent', async () => {
      await reset();
      const results = await Promise.all([webhook('1', 'same'), webhook('1', 'same')]);
      assert.equal(results.filter(result => result.duplicate).length, 1);
      assert.deepEqual(await counts(), { active: 1, transitions: 1, events: 1, paid: 1 });
    });
    await t.test('post-wait checkout reassignment fails without event or activation writes', async () => {
      await reset();
      await withHeldTenant(async holder => {
        const pending = assert.rejects(webhook(), { code: 'SUBSCRIPTION_CHECKOUT_CHANGED' });
        try {
          await waitForTenant();
          await holder.query('UPDATE billing_checkout_sessions SET tenant_id=2 WHERE id=1');
        } finally { await holder.query('COMMIT'); }
        await pending;
      });
      assert.deepEqual(await counts(), { active: 0, transitions: 0, events: 0, paid: 0 });
    });
    await t.test('post-wait paid checkout is not activated again by sync', async () => {
      await reset();
      await withHeldTenant(async holder => {
        const pending = sync();
        try {
          await waitForTenant();
          await holder.query("UPDATE billing_checkout_sessions SET status='paid' WHERE id=1");
        } finally { await holder.query('COMMIT'); }
        assert.equal((await pending).paid, true);
      });
      assert.deepEqual(await counts(), { active: 0, transitions: 0, events: 0, paid: 1 });
    });
    await t.test('activation failure rolls back event, paid checkout and subscription writes', async () => {
      await reset(); fault = true;
      await assert.rejects(webhook(), /activation write fault/);
      assert.deepEqual(await counts(), { active: 0, transitions: 0, events: 0, paid: 0 });
    });
    for (const [name, callback] of [['sync', sync], ['webhook', () => webhook('1', 'legacy-event')]]) {
      await t.test(`${name} rolls back on legacy writer contention and can retry`, async () => {
        await reset();
        await pool.query("INSERT INTO tenant_subscriptions(id,tenant_id,plan_slug,status) VALUES(10,1,'free','active')");
        await pool.query('UPDATE billing_checkout_sessions SET metadata=$1::jsonb WHERE id=1', [JSON.stringify({ expectedSubscriptionId: '10', expectedPlanSlug: 'free' })]);
        const legacy = await pool.connect();
        let reached, release;
        const entered = new Promise(resolve => { reached = resolve; });
        tenantBarrier = { reached, release: new Promise(resolve => { release = resolve; }) };
        try {
          await legacy.query('BEGIN');
          await legacy.query('SELECT id FROM tenant_subscriptions WHERE id=10 FOR UPDATE');
          const pending = assert.rejects(callback(), { statusCode: 409, code: 'SUBSCRIPTION_BUSY' });
          await entered;
          // A legacy writer now waits for the provider-held tenant FK lock.
          const insert = legacy.query("INSERT INTO subscription_transitions(tenant_id,to_plan_slug,transition_type,status,reason,effective_at) VALUES(1,'free','admin_resolution','effective','legacy writer',NOW())");
          try { await waitForLock('INSERT INTO subscription_transitions'); }
          finally { tenantBarrier = null; release(); }
          await pending; // Rejection is exposed only after provider rollback.
          await insert;
          await legacy.query('COMMIT');
          assert.deepEqual(await counts(), { active: 1, transitions: 1, events: 0, paid: 0 });
          await callback();
          assert.deepEqual(await counts(), { active: 1, transitions: 2, events: name === 'webhook' ? 1 : 0, paid: 1 });
        } finally {
          tenantBarrier = null; release();
          await legacy.query('ROLLBACK'); legacy.release();
        }
      });
    }
    await t.test('failed upgrade preserves the existing subscription and expected revision', async () => {
      await reset();
      await pool.query("INSERT INTO tenant_subscriptions(id,tenant_id,plan_slug,status) VALUES(10,1,'free','active')");
      await pool.query("UPDATE billing_checkout_sessions SET metadata=$1::jsonb WHERE id=1", [JSON.stringify({ expectedSubscriptionId: '10', expectedPlanSlug: 'free' })]);
      fault = true;
      await assert.rejects(webhook(), /activation write fault/);
      assert.deepEqual(await counts(), { active: 1, transitions: 0, events: 0, paid: 0 });
      assert.equal((await pool.query('SELECT status FROM tenant_subscriptions WHERE id=10')).rows[0].status, 'active');
      fault = false;
      await webhook();
      assert.equal((await pool.query('SELECT status FROM tenant_subscriptions WHERE id=10')).rows[0].status, 'expired');
      assert.deepEqual(await counts(), { active: 1, transitions: 1, events: 1, paid: 1 });
    });
    await t.test('subscription changed while waiting requires paid reconciliation', async () => {
      await reset();
      await withHeldTenant(async holder => {
        const pending = assert.rejects(sync(), { code: 'SUBSCRIPTION_REVISION_CONFLICT' });
        try {
          await waitForTenant();
          await holder.query("INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status) VALUES(1,'free','active')");
        } finally { await holder.query('COMMIT'); }
        await pending;
      });
      assert.deepEqual(await counts(), { active: 1, transitions: 0, events: 0, paid: 0 });
    });
    for (const status of ['past_due', 'unpaid', 'suspended']) {
      await t.test(`current ${status} subscription remains restricted`, async () => {
        await reset();
        await pool.query('INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status) VALUES(1,\'free\',$1)', [status]);
        await assert.rejects(webhook(), { code: 'SUBSCRIPTION_RESTRICTED' });
        assert.deepEqual(await counts(), { active: 0, transitions: 0, events: 0, paid: 0 });
      });
    }
    await t.test('ambiguous current subscriptions remain rejected', async () => {
      await reset();
      await pool.query("INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status) VALUES(1,'free','active'),(1,'free','active')");
      await assert.rejects(webhook(), { code: 'SUBSCRIPTION_AMBIGUOUS' });
      assert.deepEqual(await counts(), { active: 2, transitions: 0, events: 0, paid: 0 });
    });
    await t.test('missing checkout, missing plan and duplicate missing event retain outcomes', async () => {
      await reset();
      assert.equal((await webhook('404', 'missing')).missingCheckout, true);
      assert.equal((await webhook('404', 'missing')).duplicate, true);
      missingPlan = true;
      assert.equal((await webhook()).missingPlan, true);
      assert.deepEqual(await counts(), { active: 0, transitions: 0, events: 2, paid: 0 });
    });
    await t.test('adjacent BIGINT tenants and checkout IDs stay separate', async () => {
      await reset();
      const ids = ['9007199254740992', '9007199254740993'];
      for (const id of ids) {
        await pool.query('INSERT INTO tenants VALUES($1)', [id]);
        await pool.query("INSERT INTO billing_checkout_sessions(id,tenant_id,plan_slug,provider_checkout_session_id,amount_cents) VALUES($1,$1,'economical',$2,1000)", [id, `provider-${id}`]);
      }
      await Promise.all([sync(ids[0], ids[0]), webhook(ids[1])]);
      const rows = (await pool.query('SELECT tenant_id::text,provider_checkout_session_id FROM tenant_subscriptions ORDER BY tenant_id')).rows;
      assert.deepEqual(rows, ids.map(id => ({ tenant_id: id, provider_checkout_session_id: `provider-${id}` })));
      assert.deepEqual(await counts(), { active: 2, transitions: 2, events: 1, paid: 2 });
      assert.equal((await pool.query('SELECT tenant_id::text FROM billing_events')).rows[0].tenant_id, ids[1]);
    });
  } finally { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); }
});
