const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');
const { waitForDatabaseLock } = require('./helpers/waitForDatabaseLock.cjs');
const load = (name, mocks) => loadModuleWithMocks(require.resolve(name), mocks);
const { readHeldTenantEntitlements } = require('../src/services/heldTenantEntitlements');

test('held entitlements reject missing clients and inexact identities before SQL', async () => {
  await assert.rejects(readHeldTenantEntitlements('1'), error => error.code === 'ENTITLEMENT_TRANSACTION_REQUIRED');
  for (const id of [9007199254740992, '0', '-1', '9223372036854775808', null]) {
    await assert.rejects(readHeldTenantEntitlements(id, { client: { query: () => assert.fail('unexpected SQL') } }), error => error.code === 'INVALID_TENANT_ID');
  }
});

const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
test('selected held entitlement policy uses real row and FK locks without changing ordinary reads', { skip: !databaseUrl, timeout: 45000 }, async t => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_test', '/getprio_ledger_test'].includes(url.pathname));
  const { Pool } = require('pg');
  const schema = `held_entitlements_${randomUUID().replaceAll('-', '')}`;
  const root = new Pool({ connectionString: url.href });
  await root.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema} -c statement_timeout=5000`, max: 8 });
  t.after(async () => { await pool.end(); await root.query(`DROP SCHEMA ${schema} CASCADE`); await root.end(); });
  await pool.query(`CREATE TABLE tenants(id BIGINT PRIMARY KEY);
    CREATE TABLE subscription_plans(slug TEXT PRIMARY KEY,name TEXT,entitlements JSONB);
    CREATE TABLE tenant_subscriptions(id BIGINT PRIMARY KEY,tenant_id BIGINT NOT NULL REFERENCES tenants(id),plan_slug TEXT,status TEXT,updated_at TIMESTAMPTZ,entitlements JSONB);
    INSERT INTO tenants VALUES (9007199254740992),(9007199254740993);
    INSERT INTO subscription_plans VALUES ('pro','Pro','{"staffSeats":3,"emailAlerts":true}');`);
  const db = { pool: { query: () => assert.fail('default pool escape') } };
  const planRepository = load('../src/repositories/subscriptionPlans', { '../config/db': db });
  const plans = load('../src/services/subscriptionPlans', { '../repositories/subscriptionPlans': planRepository });
  const billing = load('../src/repositories/billing', { '../config/db': db, '../services/subscriptionPlans': plans });
  const service = load('../src/services/heldTenantEntitlements', { '../repositories/billing': billing, '../services/subscriptionPlans': plans });
  const ordinary = load('../src/services/billingService', { '../repositories/billing': billing, './subscriptionPlans': plans });
  const tenant = '9007199254740993';
  async function reset() {
    await pool.query('TRUNCATE tenant_subscriptions');
    await pool.query(`UPDATE subscription_plans SET entitlements='{"staffSeats":3,"emailAlerts":true}'`);
    await pool.query("INSERT INTO tenant_subscriptions VALUES (1,$1,'pro','active',NOW(),$2)", [tenant, JSON.stringify({ publicFacingBranding: true })]);
  }
  async function begin(name) {
    const client = await pool.connect();
    await client.query('SELECT set_config($1,$2,false)', ['application_name', name]);
    await client.query('BEGIN');
    return client;
  }
  async function end(client, commit = false) { await client.query(commit ? 'COMMIT' : 'ROLLBACK'); client.release(); }
  await t.test('caller-owned read holds composed current policy and exact IDs until commit', async () => {
    await reset();
    const reader = await begin('held-reader');
    const writer = await begin('held-writer');
    try {
      const result = await service.readHeldTenantEntitlements(tenant, { client: reader });
      assert.equal(result.staffSeats, 3); assert.equal(result.publicFacingBranding, true);
      const changing = writer.query("UPDATE subscription_plans SET entitlements='{}' WHERE slug='pro'");
      await waitForDatabaseLock(pool, 'held-writer', 'UPDATE subscription_plans');
      await reader.query('COMMIT');
      await changing; await writer.query('COMMIT');
      await reader.query('BEGIN');
      const empty = await service.readHeldTenantEntitlements('9007199254740992', { client: reader });
      assert.deepEqual(empty, {});
    } finally { await end(reader); await end(writer); }
  });
  await t.test('publisher-first plan and subscription contention requires rollback and fresh retry', async () => {
    for (const [sql, code] of [["UPDATE subscription_plans SET name='New'", 'ENTITLEMENT_PLAN_BUSY'], ["UPDATE tenant_subscriptions SET status='suspended'", 'ENTITLEMENT_SUBSCRIPTION_BUSY']]) {
      await reset();
      const writer = await begin('legacy-writer'), reader = await begin('held-reader');
      try {
        await writer.query(sql);
        await assert.rejects(service.readHeldTenantEntitlements(tenant, { client: reader }), error => error.code === code && error.statusCode === 409);
        await reader.query('ROLLBACK'); await writer.query('COMMIT'); await reader.query('BEGIN');
        const result = await service.readHeldTenantEntitlements(tenant, { client: reader });
        assert.equal(result.staffSeats, code === 'ENTITLEMENT_PLAN_BUSY' ? 3 : undefined);
      } finally { await end(reader); await end(writer); }
    }
  });
  await t.test('legacy child-first publisher cannot invert a held tenant FK root', async () => {
    await reset();
    const writer = await begin('inverted-writer'), reader = await begin('held-reader');
    let inserting;
    try {
      await writer.query("UPDATE tenant_subscriptions SET entitlements='{}' WHERE id=1");
      const wrapped = { query: async (sql, values) => {
        const result = await reader.query(sql, values);
        if (sql.includes('FROM tenants')) {
          inserting = writer.query("INSERT INTO tenant_subscriptions VALUES (2,$1,'pro','expired',NOW(),'{}')", [tenant]);
          await waitForDatabaseLock(pool, 'inverted-writer', 'INSERT INTO tenant_subscriptions');
        }
        return result;
      } };
      await assert.rejects(service.readHeldTenantEntitlements(tenant, { client: wrapped }), error => error.code === 'ENTITLEMENT_SUBSCRIPTION_BUSY');
      await reader.query('ROLLBACK'); await inserting; await writer.query('COMMIT');
      await reader.query('BEGIN');
      assert.equal((await service.readHeldTenantEntitlements(tenant, { client: reader })).staffSeats, 3);
    } finally { await end(reader); await end(writer); }
  });
  await t.test('tenant root protects absent subscription insertion and releases on rollback', async () => {
    await reset();
    const reader = await begin('empty-reader'), writer = await begin('insert-writer');
    try {
      assert.deepEqual(await service.readHeldTenantEntitlements('9007199254740992', { client: reader }), {});
      const inserted = writer.query("INSERT INTO tenant_subscriptions VALUES (2,9007199254740992,'pro','active',NOW(),'{}')");
      await waitForDatabaseLock(pool, 'insert-writer', 'INSERT INTO tenant_subscriptions');
      await reader.query('ROLLBACK'); await inserted; await writer.query('COMMIT'); await reader.query('BEGIN');
      assert.equal((await service.readHeldTenantEntitlements('9007199254740992', { client: reader })).staffSeats, 3);
    } finally { await end(reader); await end(writer); }
  });
  await t.test('current history holds block subscription changes and tenant movement', async () => {
    for (const sql of ["UPDATE tenant_subscriptions SET entitlements='{}' WHERE id=1", 'UPDATE tenant_subscriptions SET tenant_id=9007199254740992 WHERE id=1']) {
      await reset();
      const reader = await begin('held-reader'), writer = await begin('subscription-writer');
      try {
        await service.readHeldTenantEntitlements(tenant, { client: reader });
        const changed = writer.query(sql);
        await waitForDatabaseLock(pool, 'subscription-writer', 'UPDATE tenant_subscriptions');
        await reader.query('COMMIT'); await changed; await writer.query('COMMIT');
      } finally { await end(reader); await end(writer); }
    }
  });
  await t.test('ambiguous active rows missing plans and bounded history reject without writes', async () => {
    await reset();
    const reader = await begin('held-reader');
    try {
      await reader.query("INSERT INTO tenant_subscriptions VALUES (2,$1,'pro','active',NOW(),'{}')", [tenant]);
      await assert.rejects(service.readHeldTenantEntitlements(tenant, { client: reader }), error => error.code === 'SUBSCRIPTION_AMBIGUOUS');
      await reader.query('DELETE FROM tenant_subscriptions WHERE id=2');
      await reader.query("UPDATE tenant_subscriptions SET plan_slug='missing'");
      await assert.rejects(service.readHeldTenantEntitlements(tenant, { client: reader }), error => error.code === 'ENTITLEMENT_PLAN_UNAVAILABLE');
      await reader.query("INSERT INTO tenant_subscriptions SELECT n,$1,'pro','expired',NOW(),'{}' FROM generate_series(2,1001) n", [tenant]);
      await assert.rejects(service.readHeldTenantEntitlements(tenant, { client: reader }), error => error.code === 'ENTITLEMENT_HISTORY_LIMIT');
      await reader.query('ROLLBACK');
      assert.equal((await pool.query('SELECT COUNT(*) FROM tenant_subscriptions')).rows[0].count, '1');
    } finally { await end(reader); }
  });
  await t.test('ordinary optional-client reads remain compatible with READ ONLY transactions', async () => {
    await reset();
    const reader = await pool.connect();
    try {
      await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      assert.equal((await ordinary.getTenantEntitlements(tenant, { client: reader })).staffSeats, 3);
      await assert.rejects(service.readHeldTenantEntitlements(tenant, { client: reader }), error => error.code === '25006');
    } finally { await end(reader); }
  });
});
