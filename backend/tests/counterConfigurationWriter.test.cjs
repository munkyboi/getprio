const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createCounterConfigurationService } = require('../src/services/counterConfigurationService');
const counters = require('../src/repositories/serviceCounters');
const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;

test('counter configuration commits as one scoped PostgreSQL operation', { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_test', '/getprio_ledger_test'].includes(url.pathname));
  const schema = `counter_config_${randomUUID().replaceAll('-', '')}`;
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, application_name: schema, max: 8 });
  let fault = null;
  let barrier = null;
  const wrappedPool = { connect: async () => {
    const client = await pool.connect();
    return { release: () => client.release(), query: async (sql, args) => {
      if (fault && sql.includes(fault)) throw new Error('counter writer fault');
      const result = await client.query(sql, args);
      if (barrier && sql.includes(barrier.marker)) { barrier.reached(); await barrier.release; }
      return result;
    } };
  } };
  const service = createCounterConfigurationService({ pool: wrappedPool });
  const scope = { tenantId: '1', locationId: '10', actorUserId: '1' };
  const create = (data = {}, selected = scope) => service.mutate({ ...selected, action: 'create', data: { name: 'Court', slug: 'court', ...data } });
  const update = (data = {}, counterSlug = 'court', selected = scope) => service.mutate({ ...selected, action: 'update', counterSlug, data: { name: 'Court', slug: 'court', ...data } });
  const remove = (counterSlug = 'court', selected = scope) => service.mutate({ ...selected, action: 'delete', counterSlug });
  const revision = async () => (await pool.query('SELECT revision::text FROM resource_ledger_scopes WHERE tenant_id=1 AND location_id=10')).rows[0]?.revision;
  async function reset() {
    fault = null; barrier = null;
    await pool.query(`TRUNCATE users,tenants,store_locations,tenant_memberships,tenant_membership_locations,
      service_counters,service_counter_assignments,subscription_plans,tenant_subscriptions,tickets,
      booking_bundle_items,location_resource_pools,resource_ledger_scopes,resource_allocations,
      resource_ledger_reservations,resource_ledger_commands RESTART IDENTITY CASCADE;
      INSERT INTO users VALUES(1,'{}',NULL,NULL),(2,'{}',NULL,NULL),(3,'{}',NULL,NULL),(4,'{}',NULL,NULL);
      INSERT INTO tenants VALUES(1),(2);
      INSERT INTO store_locations VALUES(10,1),(20,2);
      INSERT INTO tenant_memberships VALUES(1,1,1,'owner',TRUE),(2,2,1,'staff',TRUE),(3,3,2,'owner',TRUE),(4,4,1,'admin',TRUE);
      INSERT INTO subscription_plans(slug,entitlements) VALUES('free','{"counters":1}'),('pro','{"counters":4}');
      INSERT INTO tenant_subscriptions VALUES(1,1,'active','free','{}',NOW());`);
  }
  function hold(marker = 'UPDATE resource_ledger_scopes') {
    let reached, release;
    const entered = new Promise(resolve => { reached = resolve; });
    barrier = { marker, reached, release: new Promise(resolve => { release = resolve; }) };
    return { entered, release: () => { barrier = null; release(); } };
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
  async function transaction() {
    const client = await pool.connect();
    await client.query('BEGIN');
    return client;
  }
  try {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE FUNCTION set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $$;
      CREATE TABLE users(id BIGINT PRIMARY KEY,roles TEXT[],deletion_requested_at TIMESTAMPTZ,platform_access_suspended_at TIMESTAMPTZ);
      CREATE TABLE tenants(id BIGINT PRIMARY KEY);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),UNIQUE(id,tenant_id));
      CREATE TABLE tenant_memberships(id BIGINT PRIMARY KEY,user_id BIGINT REFERENCES users(id),tenant_id BIGINT REFERENCES tenants(id),role TEXT,is_active BOOLEAN);
      CREATE TABLE tenant_membership_locations(tenant_membership_id BIGINT REFERENCES tenant_memberships(id),location_id BIGINT REFERENCES store_locations(id),assignment_source TEXT,assigned_by_user_id BIGINT REFERENCES users(id),UNIQUE(tenant_membership_id,location_id));
      CREATE TABLE service_counters(id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),location_id BIGINT REFERENCES store_locations(id),name TEXT NOT NULL,slug TEXT NOT NULL,is_active BOOLEAN,created_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(location_id,slug));
      CREATE TABLE service_counter_assignments(counter_id BIGINT REFERENCES service_counters(id) ON DELETE CASCADE,user_id BIGINT REFERENCES users(id),PRIMARY KEY(counter_id,user_id));
      CREATE TABLE subscription_plans(slug TEXT PRIMARY KEY,entitlements JSONB);
      CREATE TABLE tenant_subscriptions(id BIGINT PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),status TEXT,plan_slug TEXT REFERENCES subscription_plans(slug),entitlements JSONB,updated_at TIMESTAMPTZ);
      CREATE TABLE tickets(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,status TEXT,service_counter_id BIGINT REFERENCES service_counters(id) ON DELETE SET NULL,UNIQUE(id,tenant_id,location_id));
      CREATE TABLE booking_bundle_items(id BIGINT PRIMARY KEY,booking_id BIGINT,tenant_id BIGINT,location_id BIGINT);
      CREATE TABLE vendor_services(id BIGINT PRIMARY KEY,tenant_id BIGINT,UNIQUE(id,tenant_id));
      CREATE TABLE location_services(location_id BIGINT,service_id BIGINT,UNIQUE(location_id,service_id));`);
    for (const name of ['20261003_add_resource_capacity_foundation.sql', '20261007_add_resource_ledger_foundation.sql']) {
      await pool.query(fs.readFileSync(path.resolve(__dirname, '../../database/migrations', name), 'utf8'));
    }
    await t.test('create commits counter assignments explicit branch grants and one revision; repeat identical update is a no-op', async () => {
      await reset();
      const created = await create({ assignedUserIds: ['2', '4'] });
      assert.deepEqual(created.assignedUserIds, []);
      assert.equal(await revision(), '2');
      assert.equal((await pool.query('SELECT * FROM service_counter_assignments')).rowCount, 2);
      assert.equal((await pool.query('SELECT * FROM tenant_membership_locations')).rowCount, 1);
      await update({ assignedUserIds: ['4', '2', '2'] });
      assert.equal(await revision(), '2');
      await update({ assignedUserIds: [] });
      assert.equal(await revision(), '3');
      assert.equal((await pool.query('SELECT * FROM tenant_membership_locations')).rowCount, 1);
    });
    await t.test('missing explicit staff branch grant is a logical change even if counter assignment is unchanged', async () => {
      await reset(); await create({ assignedUserIds: ['2'] });
      await pool.query('DELETE FROM tenant_membership_locations');
      await update({ assignedUserIds: ['2'] });
      assert.equal(await revision(), '3');
      assert.equal((await pool.query('SELECT * FROM tenant_membership_locations')).rowCount, 1);
    });
    await t.test('last active quota serializes concurrent creation and inactive-to-active updates', async () => {
      await reset();
      const results = await Promise.allSettled([create(), create({ slug: 'other' })]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.find(r => r.status === 'rejected').reason.statusCode, 403);
      await reset(); await create({ isActive: false }); await create({ slug: 'other', isActive: false });
      const activations = await Promise.allSettled([update(), update({ slug: 'other' }, 'other')]);
      assert.equal(activations.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal((await pool.query('SELECT * FROM service_counters WHERE is_active')).rowCount, 1);
    });
    await t.test('subscription status priority JSON overrides missing plans and inactive editing preserve billing semantics', async () => {
      await reset();
      await pool.query(`INSERT INTO tenant_subscriptions VALUES(2,1,'past_due','pro','{"counters":9}',NOW()+interval '1 hour'); UPDATE tenant_subscriptions SET entitlements='{"counters":2}' WHERE id=1`);
      await create(); await create({ slug: 'two' }); await assert.rejects(create({ slug: 'three' }), { statusCode: 403 });
      await pool.query("UPDATE tenant_subscriptions SET status='suspended'");
      await update({ isActive: false });
      await assert.rejects(update(), { statusCode: 403 });
      await assert.rejects(create({ slug: 'inactive', isActive: false }), { statusCode: 403 });
      await pool.query('DELETE FROM tenant_subscriptions');
      await assert.rejects(create(), { statusCode: 403 });
      await pool.query("INSERT INTO tenant_subscriptions VALUES(3,1,'active','free','{}',NOW()); ALTER TABLE tenant_subscriptions DROP CONSTRAINT tenant_subscriptions_plan_slug_fkey; UPDATE tenant_subscriptions SET plan_slug='absent',entitlements='{\"counters\":3}'");
      await create({ slug: 'new' });
    });
    await t.test('subscription-first downgrade conflicts as sanitized 409 and rolls back every write; retry observes downgrade', async () => {
      await reset();
      const client = await transaction();
      try {
        await client.query("UPDATE tenant_subscriptions SET entitlements='{\"counters\":0}' WHERE id=1");
        await assert.rejects(create(), { statusCode: 409, code: 'COUNTER_POLICY_BUSY' });
        assert.equal((await pool.query('SELECT * FROM service_counters')).rowCount, 0);
        assert.equal(await revision(), undefined);
        await client.query('COMMIT');
      } finally { await client.query('ROLLBACK'); client.release(); }
      await assert.rejects(create(), { statusCode: 403 });
    });
    await t.test('accepted subscription and plan rows hold downgrade and plan changes through commit', async () => {
      await reset(); const held = hold(); const saving = create(); await held.entered;
      const client = await transaction();
      try {
        const edit = client.query("UPDATE subscription_plans SET entitlements='{\"counters\":0}' WHERE slug='free'");
        await waitForLock('UPDATE subscription_plans'); held.release(); await saving; await edit; await client.query('COMMIT');
      } finally { held.release(); await client.query('ROLLBACK'); client.release(); }
      await assert.rejects(create({ slug: 'next' }), { statusCode: 403 });
      await reset(); const second = hold(); const another = create(); await second.entered;
      const downgrade = pool.query("UPDATE tenant_subscriptions SET status='suspended' WHERE id=1");
      await waitForLock('UPDATE tenant_subscriptions'); second.release(); await another; await downgrade;
      await assert.rejects(create({ slug: 'next' }), { statusCode: 403 });
    });
    await t.test('held plan writer returns retryable 409 with no scope or counter commit', async () => {
      await reset(); const client = await transaction();
      try { await client.query("UPDATE subscription_plans SET entitlements='{\"counters\":0}' WHERE slug='free'");
        await assert.rejects(create(), { statusCode: 409, code: 'COUNTER_POLICY_BUSY' });
        assert.equal(await revision(), undefined);
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await t.test('FK-backed subscription replacement waits for accepted tenant policy and then changes future admission', async () => {
      await reset(); const held = hold(); const saving = create(); await held.entered;
      const replacement = pool.query("INSERT INTO tenant_subscriptions VALUES(2,1,'active','free','{\"counters\":0}',NOW()+interval '1 hour')");
      await waitForLock('INSERT INTO tenant_subscriptions'); held.release(); await saving; await replacement;
      await assert.rejects(create({ slug: 'next' }), { statusCode: 403 });
    });
    await t.test('absent subscription inserted while branch wait is observed by new admission', async () => {
      await reset(); await pool.query('DELETE FROM tenant_subscriptions');
      const client = await transaction();
      try {
        await client.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        const saving = create(); await waitForLock('SELECT id FROM store_locations');
        await client.query("INSERT INTO tenant_subscriptions VALUES(2,1,'active','free','{}',NOW())");
        await client.query('COMMIT'); await saving;
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await t.test('assignment failure and final revision failure roll back create update delete and branch grants', async () => {
      for (const marker of ['INSERT INTO service_counter_assignments', 'INSERT INTO tenant_membership_locations', 'UPDATE resource_ledger_scopes']) {
        await reset(); fault = marker; await assert.rejects(create({ assignedUserIds: ['2'] }), /counter writer fault/); fault = null;
        assert.equal((await pool.query('SELECT * FROM service_counters')).rowCount, 0);
        assert.equal((await pool.query('SELECT * FROM tenant_membership_locations')).rowCount, 0);
        assert.equal(await revision(), undefined);
      }
      await create({ assignedUserIds: ['2'] }); fault = 'UPDATE resource_ledger_scopes';
      await assert.rejects(update({ name: 'Changed', assignedUserIds: [] }), /counter writer fault/);
      await assert.rejects(remove(), /counter writer fault/); fault = null;
      assert.equal((await pool.query('SELECT name FROM service_counters')).rows[0].name, 'Court');
      assert.equal((await pool.query('SELECT * FROM service_counter_assignments')).rowCount, 1);
      assert.equal(await revision(), '2');
    });
    await t.test('actor and assignee current grants reject suspension inactive membership staff and foreign scope', async () => {
      await reset();
      await assert.rejects(create({}, { ...scope, actorUserId: '2' }), { statusCode: 403 });
      await assert.rejects(create({}, { ...scope, locationId: '20' }), { statusCode: 404 });
      await assert.rejects(create({ assignedUserIds: ['3'] }), { statusCode: 400 });
      await pool.query('UPDATE users SET platform_access_suspended_at=NOW() WHERE id=2');
      await assert.rejects(create({ assignedUserIds: ['2'] }), { statusCode: 400 });
      await pool.query('UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=1');
      await assert.rejects(create(), { statusCode: 403 });
      assert.equal(await revision(), undefined);
    });
    await t.test('branch contention rereads revocation before mutation; accepted assignee grants block suspension until commit', async () => {
      await reset(); const client = await transaction();
      try {
        await client.query('SELECT id FROM store_locations WHERE id=10 FOR NO KEY UPDATE');
        const saving = assert.rejects(create(), { statusCode: 403 }); await waitForLock('SELECT id FROM store_locations');
        await client.query('UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=1');
        await client.query('COMMIT'); await saving;
      } finally { await client.query('ROLLBACK'); client.release(); }
      await reset(); const held = hold(); const saving = create({ assignedUserIds: ['2'] }); await held.entered;
      const suspend = pool.query('UPDATE users SET platform_access_suspended_at=NOW() WHERE id=2');
      await waitForLock('UPDATE users'); held.release(); await saving; await suspend;
      await assert.rejects(update({ assignedUserIds: ['2'] }), { statusCode: 400 });
    });
    await t.test('actor revocation is rechecked after user-row and tenant-row waits', async () => {
      for (const lock of ['user', 'tenant']) {
        await reset(); const client = await transaction();
        try {
          await client.query(lock === 'user' ? 'SELECT id FROM users WHERE id=1 FOR UPDATE' : 'SELECT id FROM tenants WHERE id=1 FOR UPDATE');
          const saving = assert.rejects(create(), { statusCode: 403 });
          await waitForLock(lock === 'user' ? 'SELECT u.roles' : 'SELECT id FROM tenants');
          await client.query('UPDATE users SET deletion_requested_at=NOW() WHERE id=1');
          await client.query('COMMIT'); await saving;
          assert.equal(await revision(), undefined);
        } finally { await client.query('ROLLBACK'); client.release(); }
      }
    });
    await t.test('accepted actor and assignee membership grants are held through the final commit', async () => {
      for (const userId of ['1', '2']) {
        await reset(); const held = hold(); const saving = create({ assignedUserIds: ['2'] }); await held.entered;
        const revocation = pool.query('UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=$1', [userId]);
        await waitForLock('UPDATE tenant_memberships'); held.release(); await saving; await revocation;
        await assert.rejects(update({ assignedUserIds: ['2'] }), { statusCode: userId === '1' ? 403 : 400 });
      }
    });
    await t.test('assignee membership revoked while its row is locked is denied without partial counter or assignment writes', async () => {
      await reset(); const client = await transaction();
      try {
        await client.query('UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=2');
        const saving = assert.rejects(create({ assignedUserIds: ['2'] }), { statusCode: 400 });
        await waitForLock('SELECT u.id::text'); await client.query('COMMIT'); await saving;
        assert.equal((await pool.query('SELECT * FROM service_counters')).rowCount, 0);
        assert.equal(await revision(), undefined);
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await t.test('tenant-first staff removal can use branch FK and remove assignments without a lock cycle', async () => {
      await reset(); await create({ assignedUserIds: ['2'] });
      const client = await transaction();
      try {
        await client.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
        const saving = update({ assignedUserIds: ['2'] }); await waitForLock('SELECT id FROM tenants');
        await client.query("INSERT INTO tenant_membership_locations VALUES(4,10,'explicit',1) ON CONFLICT DO NOTHING");
        await counters.removeAssignmentsForUserAndTenant('2', '1', { client });
        await client.query('UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=2');
        await client.query('COMMIT'); await assert.rejects(saving, { statusCode: 400 });
      } finally { await client.query('ROLLBACK'); client.release(); }
      assert.equal(await revision(), '2');
    });
    await t.test('deactivation retains called attribution and allocation; deletion atomically moves attribution to legacy null', async () => {
      await reset(); const created = await create();
      await pool.query("INSERT INTO tickets VALUES(100,1,10,'called',$1)", [created._id]);
      await pool.query(`INSERT INTO location_resource_pools(tenant_id,location_id,name,capacity) VALUES(1,10,'Courts',4);
        INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,started_at,expected_end_at)
          VALUES(1,10,100,1,1,1,NOW()-interval '2 hours',NOW()-interval '1 hour')`);
      await update({ isActive: false });
      assert.equal((await pool.query('SELECT service_counter_id::text FROM tickets')).rows[0].service_counter_id, created._id);
      await remove();
      assert.equal((await pool.query('SELECT status,service_counter_id FROM tickets')).rows[0].status, 'called');
      assert.equal((await pool.query('SELECT service_counter_id FROM tickets')).rows[0].service_counter_id, null);
      assert.equal((await pool.query('SELECT * FROM resource_allocations WHERE released_at IS NULL')).rowCount, 1);
      assert.equal(await revision(), '4');
    });
    await t.test('dispatch-compatible SQL branch locks serialize deletion and deactivation', async () => {
      await reset(); const created = await create(); const client = await transaction();
      try {
        await client.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        await client.query('SELECT id FROM service_counters WHERE id=$1 FOR SHARE', [created._id]);
        const deleting = remove(); await waitForLock('SELECT id FROM store_locations');
        await client.query("INSERT INTO tickets VALUES(100,1,10,'called',$1)", [created._id]);
        await client.query('COMMIT'); await deleting;
      } finally { await client.query('ROLLBACK'); client.release(); }
      assert.equal((await pool.query('SELECT service_counter_id FROM tickets')).rows[0].service_counter_id, null);
      await reset(); await create(); const held = hold(); const saving = update({ isActive: false }); await held.entered;
      const dispatch = pool.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
      await waitForLock('SELECT id FROM store_locations'); held.release(); await saving; await dispatch;
      assert.equal((await pool.query('SELECT * FROM service_counters WHERE is_active')).rowCount, 0);
    });
    await t.test('adjacent large IDs stay exact through actor counter assignment and automatic branch grants', async () => {
      await reset(); await pool.query(`INSERT INTO users VALUES(9007199254740992,'{}',NULL,NULL),(9007199254740993,'{}',NULL,NULL),(9007199254740995,'{}',NULL,NULL);
        INSERT INTO tenants VALUES(9007199254740993); INSERT INTO store_locations VALUES(9007199254740995,9007199254740993);
        INSERT INTO tenant_memberships VALUES(9007199254740993,9007199254740993,9007199254740993,'owner',TRUE),(9007199254740995,9007199254740995,9007199254740993,'staff',TRUE);
        INSERT INTO tenant_subscriptions VALUES(9007199254740993,9007199254740993,'active','free','{}',NOW());
        ALTER TABLE service_counters ALTER COLUMN id RESTART WITH 9007199254740993`);
      const selected = { tenantId: '9007199254740993', locationId: '9007199254740995', actorUserId: '9007199254740993' };
      const created = await create({ assignedUserIds: ['9007199254740995'] }, selected);
      assert.equal(created._id, '9007199254740993');
      assert.equal((await pool.query('SELECT user_id::text FROM service_counter_assignments')).rows[0].user_id, '9007199254740995');
      assert.equal((await pool.query('SELECT location_id::text,assigned_by_user_id::text FROM tenant_membership_locations')).rows[0].location_id, selected.locationId);
      await update({ assignedUserIds: ['9007199254740995'] }, 'court', selected);
      await assert.rejects(create({}, { ...selected, actorUserId: Number(selected.actorUserId) }), { statusCode: 400 });
      await assert.rejects(update({ assignedUserIds: [Number('9007199254740993')] }, 'court', selected), { statusCode: 400 });
    });
  } finally {
    barrier?.reached();
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  }
});
