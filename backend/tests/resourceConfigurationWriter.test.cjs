const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;

function loadConfiguration(database) {
  const target = require.resolve('../src/services/resourceConfigurationService');
  const dbId = require.resolve('../src/config/db');
  const saved = require.cache[dbId];
  try {
    require.cache[dbId] = { id: dbId, filename: dbId, loaded: true, exports: database };
    delete require.cache[target];
    return require(target);
  } finally {
    delete require.cache[target];
    if (saved) require.cache[dbId] = saved; else delete require.cache[dbId];
  }
}

test('draft resource configuration writer under PostgreSQL constraints', { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_test', '/getprio_ledger_test'].includes(url.pathname));
  const schema = `resource_config_${randomUUID().replaceAll('-', '')}`;
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, application_name: schema, max: 8 });
  let barrier = null;
  let failRevision = false;
  const database = {
    pool: { connect: async () => {
      const client = await pool.connect();
      return { release: () => client.release(), query: async (...args) => {
        const result = await client.query(...args);
        if (args[0].startsWith('UPDATE resource_ledger_scopes')) {
          if (barrier) { barrier.reached(); await barrier.release; }
          if (failRevision) throw new Error('revision write failed');
        }
        return result;
      } };
    } },
    withTransaction: async callback => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK'); throw error;
      } finally { client.release(); }
    }
  };
  const service = loadConfiguration(database);
  const scope = { tenantId: '1', locationId: '10', actorUserId: '1' };
  const get = (selected = scope) => service.getConfiguration(selected);
  const save = (body, selected = scope) => service.saveConfiguration(selected, body);
  async function reset() {
    barrier = null; failRevision = false;
    await pool.query(`TRUNCATE users, tenants, tenant_memberships, tenant_membership_locations,
      store_locations, vendor_services, location_services, location_resource_pools,
      service_resource_requirements, resource_ledger_scopes, resource_ledger_commands,
      resource_allocations, resource_ledger_reservations RESTART IDENTITY CASCADE;
      INSERT INTO users VALUES(1,'{}',NULL,NULL),(2,'{}',NULL,NULL),(3,'{}',NULL,NULL);
      INSERT INTO tenants VALUES(1),(2);
      INSERT INTO tenant_memberships VALUES(1,1,1,'owner',TRUE),(2,2,1,'staff',TRUE),(3,3,2,'admin',TRUE);
      INSERT INTO store_locations VALUES(10,1),(20,2);
      INSERT INTO tenant_membership_locations VALUES(2,10);
      INSERT INTO vendor_services VALUES(1000,1,'Court play',TRUE),(2000,2,'Room rental',TRUE);
      INSERT INTO location_services VALUES(10,1000,1,TRUE),(20,2000,2,TRUE);
      INSERT INTO location_resource_pools(tenant_id,location_id,name,capacity) VALUES(1,10,'Courts',4),(2,20,'Rooms',2)`);
  }
  async function revision() {
    return (await pool.query('SELECT revision::text FROM resource_ledger_scopes WHERE tenant_id=1 AND location_id=10')).rows[0]?.revision;
  }
  async function body(fields = { action: 'pool', poolId: '1', name: 'Courts', capacity: 5 }) {
    return { version: (await get()).version, ...fields };
  }
  function hold() {
    let reached, release;
    const entered = new Promise(resolve => { reached = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    barrier = { reached, release: held };
    return { entered, release };
  }
  async function waitForLock(fragment) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const result = await pool.query(`SELECT 1 FROM pg_stat_activity WHERE application_name=$1
        AND wait_event_type='Lock' AND query LIKE $2`, [schema, `%${fragment}%`]);
      if (result.rows.length) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(`No lock waiter for ${fragment}`);
  }
  try {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE FUNCTION set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $$;
      CREATE TABLE users(id BIGINT PRIMARY KEY,roles TEXT[],deletion_requested_at TIMESTAMPTZ,platform_access_suspended_at TIMESTAMPTZ);
      CREATE TABLE tenants(id BIGINT PRIMARY KEY);
      CREATE TABLE tenant_memberships(id BIGINT PRIMARY KEY,user_id BIGINT REFERENCES users(id),tenant_id BIGINT REFERENCES tenants(id),role TEXT,is_active BOOLEAN);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),UNIQUE(id,tenant_id));
      CREATE TABLE tenant_membership_locations(tenant_membership_id BIGINT REFERENCES tenant_memberships(id),location_id BIGINT REFERENCES store_locations(id));
      CREATE TABLE vendor_services(id BIGINT PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),name TEXT,is_active BOOLEAN,UNIQUE(id,tenant_id));
      CREATE TABLE location_services(location_id BIGINT REFERENCES store_locations(id),service_id BIGINT REFERENCES vendor_services(id),tenant_id BIGINT,is_active BOOLEAN,UNIQUE(location_id,service_id));
      CREATE TABLE booking_bundle_items(id BIGINT PRIMARY KEY,booking_id BIGINT,tenant_id BIGINT,location_id BIGINT);
      CREATE TABLE tickets(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,UNIQUE(id,tenant_id,location_id))`);
    for (const migration of ['20261003_add_resource_capacity_foundation.sql', '20261007_add_resource_ledger_foundation.sql']) {
      await pool.query(fs.readFileSync(path.resolve(__dirname, '../../database/migrations', migration), 'utf8'));
    }
    await t.test('reads create no ledger state; pool and mapping edits advance only their branch', async () => {
      await reset();
      const initial = await get();
      assert.equal(initial.trackingAvailable, false);
      assert.equal(await revision(), undefined);
      const edited = await save(await body());
      assert.equal(edited.pools[0].capacity, 5);
      assert.equal(edited.pools[0].revision, 2);
      assert.equal(await revision(), '2');
      await save(await body({ action: 'requirement', serviceId: '1000', poolId: '1', unitsRequired: 1 }));
      assert.equal(await revision(), '3');
      const mapped = await save(await body({ action: 'requirement', serviceId: '1000', poolId: '1', unitsRequired: 2 }));
      assert.equal(mapped.requirements[0].revision, 2);
      assert.equal(mapped.requirements[0].units_required, 2);
      assert.equal(await revision(), '4');
      await pool.query('UPDATE vendor_services SET is_active=FALSE WHERE id=1000');
      await save(await body({ action: 'removeRequirement', serviceId: '1000' }));
      assert.equal(await revision(), '5');
      const before = await get();
      const absent = await save(await body({ action: 'removeRequirement', serviceId: '1000' }));
      assert.equal(absent.version, before.version);
      assert.equal(await revision(), '5');
      await save(await body({ action: 'pool', name: 'Extra court', capacity: 1 }));
      assert.equal(await revision(), '6');
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM resource_ledger_scopes WHERE tenant_id=2')).rows[0].n, 0);
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM resource_allocations')).rows[0].n, 0);
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM resource_ledger_commands')).rows[0].n, 0);
      await assert.rejects(pool.query('UPDATE location_resource_pools SET tracking_enabled=TRUE'), { code: '23514' });
      await assert.rejects(pool.query('UPDATE resource_ledger_scopes SET writer_coverage_complete=TRUE'), { code: '23514' });
    });
    for (const [label, sql] of [
      ['inactive membership', 'UPDATE tenant_memberships SET is_active=FALSE WHERE id=1'],
      ['demotion to staff', "UPDATE tenant_memberships SET role='staff' WHERE id=1"],
      ['deleted actor', 'UPDATE users SET deletion_requested_at=NOW() WHERE id=1'],
      ['suspended actor', 'UPDATE users SET platform_access_suspended_at=NOW() WHERE id=1']
    ]) await t.test(`${label} rejects stale route access for read and save`, async () => {
      await reset(); const request = await body();
      await pool.query(sql);
      await assert.rejects(get(), { statusCode: 403 });
      await assert.rejects(save(request), { statusCode: 403 });
      assert.equal(await revision(), undefined);
      assert.equal((await pool.query('SELECT capacity FROM location_resource_pools WHERE id=1')).rows[0].capacity, 4);
    });
    await t.test('assigned staff and cross-tenant actors cannot manage configuration; tenant admin can', async () => {
      await reset(); const request = await body();
      for (const actorUserId of ['2', '3']) {
        await assert.rejects(get({ ...scope, actorUserId }), { statusCode: 403 });
        await assert.rejects(save(request, { ...scope, actorUserId }), { statusCode: 403 });
      }
      const other = { tenantId: '2', locationId: '20', actorUserId: '3' };
      const result = await save({ action: 'pool', poolId: '2', name: 'Rooms', capacity: 3, version: (await get(other)).version }, other);
      assert.equal(result.pools[0].capacity, 3);
      assert.equal(await revision(), undefined);
      await assert.rejects(get({ ...scope, locationId: '20' }), { statusCode: 404 });
    });
    await t.test('accepted save holds branch, tenant, user and membership grants through commit', async () => {
      await reset(); const request = await body(); const held = hold();
      const saving = save(request);
      try {
        await held.entered;
        for (const query of ['SELECT id FROM store_locations WHERE id=10 FOR UPDATE NOWAIT',
          'SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT',
          'SELECT id FROM users WHERE id=1 FOR UPDATE NOWAIT',
          'SELECT id FROM tenant_memberships WHERE id=1 FOR UPDATE NOWAIT']) {
          await assert.rejects(pool.query(query), { code: '55P03' });
        }
      } finally { held.release(); }
      await saving;
      await pool.query("UPDATE tenant_memberships SET role='staff' WHERE id=1");
      assert.equal(await revision(), '2');
    });
    await t.test('tenant-first grant change can perform branch FK insert before a queued save rejects', async () => {
      await reset(); const request = await body(); const revoker = await pool.connect();
      let saving;
      try {
        await revoker.query('BEGIN');
        await revoker.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
        saving = save(request);
        // Attach rejection handling before releasing the grant transaction.
        const denied = assert.rejects(saving, { statusCode: 403 });
        await waitForLock('FROM tenants');
        await revoker.query("UPDATE tenant_memberships SET role='staff' WHERE id=1");
        await revoker.query('SET LOCAL lock_timeout=\'2s\'');
        await revoker.query('INSERT INTO tenant_membership_locations VALUES(1,10)');
        await revoker.query('COMMIT');
        await denied;
      } finally { await revoker.query('ROLLBACK'); revoker.release(); if (saving) await saving.catch(() => {}); }
      assert.equal(await revision(), undefined);
    });
    await t.test('competing versions serialize and stale save has no extra revision or edit', async () => {
      await reset(); const request = await body(); const held = hold();
      const first = save(request); let second;
      try {
        await held.entered;
        second = assert.rejects(save({ ...request, capacity: 9 }), { statusCode: 409 });
        await waitForLock('FROM store_locations');
      } finally { held.release(); }
      await first; await second;
      assert.equal(await revision(), '2');
      assert.equal((await get()).pools[0].capacity, 5);
    });
    await t.test('post-write failure rolls configuration and newly inserted ledger scope back', async () => {
      await reset(); const before = await get(); const request = await body(); failRevision = true;
      await assert.rejects(save(request), /revision write failed/);
      failRevision = false;
      assert.deepEqual(await get(), before);
      assert.equal(await revision(), undefined);
    });
    await t.test('mapping failure rolls back an existing branch revision and requirement', async () => {
      await reset(); await save(await body());
      const before = await get();
      const request = await body({ action: 'requirement', serviceId: '1000', poolId: '1', unitsRequired: 1 });
      failRevision = true;
      await assert.rejects(save(request), /revision write failed/);
      failRevision = false;
      assert.deepEqual(await get(), before);
      assert.equal(await revision(), '2');
    });
    await t.test('service deactivation committing first rejects mapping without a revision', async () => {
      await reset(); const request = await body({ action: 'requirement', serviceId: '1000', poolId: '1', unitsRequired: 1 });
      const updater = await pool.connect(); let denied;
      try {
        await updater.query('BEGIN');
        await updater.query('UPDATE vendor_services SET is_active=FALSE WHERE id=1000');
        denied = assert.rejects(save(request), { statusCode: 409 });
        await waitForLock('FOR SHARE OF services');
        await updater.query('COMMIT');
        await denied;
      } finally { await updater.query('ROLLBACK'); updater.release(); }
      assert.equal(await revision(), undefined);
      assert.equal((await get()).requirements.length, 0);
    });
  } finally {
    barrier = null;
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});
