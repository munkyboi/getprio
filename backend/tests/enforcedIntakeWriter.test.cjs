const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;

function loadLifecycle(database) {
  const target = require.resolve('../src/services/queueDayLifecycleService');
  const mocks = { '../config/db': database, '../config/env': { waitTimePredictionCaptureEnabled: false } };
  const saved = new Map();
  try {
    for (const [name, exports] of Object.entries(mocks)) {
      const id = require.resolve(path.resolve(path.dirname(target), name));
      saved.set(id, require.cache[id]); require.cache[id] = { id, filename: id, loaded: true, exports };
    }
    delete require.cache[target]; return require(target);
  } finally {
    delete require.cache[target];
    for (const [id, original] of saved) { if (original) require.cache[id] = original; else delete require.cache[id]; }
  }
}

test('enforced intake and extensions use location-first PostgreSQL transactions', { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl); assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_test', '/getprio_ledger_test'].includes(url.pathname));
  const schema = `enforced_intake_${randomUUID().replaceAll('-', '')}`;
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, application_name: schema, max: 8 });
  let eventBarrier = null, failure = null, beforeEvent = null;
  const database = { pool: { connect: async () => {
    const client = await pool.connect();
    return { release: () => client.release(), query: async (...args) => {
      const sql = String(args[0]);
      if (sql.includes('INSERT INTO queue_events') && beforeEvent) { beforeEvent.reached(); await beforeEvent.release; }
      const result = await client.query(...args);
      if (sql.includes('INSERT INTO queue_events') && eventBarrier) { eventBarrier.reached(); await eventBarrier.release; }
      if (failure && sql.includes(failure)) throw new Error('injected write failure');
      return result;
    } };
  } } };
  database.withTransaction = async callback => {
    const client = await database.pool.connect();
    try { await client.query('BEGIN'); const result = await callback(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  };
  const service = loadLifecycle(database);
  const tenant = { _id: '1' }, location = { _id: '10', queueLifecycleMode: 'enforced' };
  const actions = ['pause', 'resume', 'extend'];
  const run = (action, options = {}, selected = location) => action === 'extend'
    ? service.extendQueueDay(tenant, selected, { actorUserId: '1', actorRole: 'stale', reason: 'Extra service time', ...options })
    : service.setQueueIntake(tenant, selected, action === 'pause' ? 'paused' : 'accepting', { actorUserId: '1', actorRole: 'stale', ...options });
  const count = async table => (await pool.query(`SELECT COUNT(*)::int n FROM ${table}`)).rows[0].n;
  const revision = async () => (await pool.query('SELECT revision::text FROM resource_ledger_scopes WHERE tenant_id=1 AND location_id=10')).rows[0]?.revision;
  const day = async () => (await pool.query('SELECT * FROM queue_days WHERE id=1')).rows[0];
  async function reset(action = 'pause') {
    eventBarrier = null; beforeEvent = null; failure = null;
    await pool.query(`TRUNCATE users,tenants,tenant_memberships,tenant_membership_locations,store_locations,
      service_counter_assignments,service_counters,vendor_services,location_services,location_resource_pools,
      service_resource_requirements,queue_days,queue_events,queue_day_extensions,queue_notification_outbox,
      tickets,bookings,booking_bundle_items,queue_ticket_segments,resource_ledger_scopes,
      resource_ledger_reservations,resource_allocations,resource_ledger_commands RESTART IDENTITY CASCADE;
      INSERT INTO users VALUES(1,'{}',NULL,NULL),(2,'{}',NULL,NULL);
      INSERT INTO tenants VALUES(1,TRUE),(2,TRUE);
      INSERT INTO tenant_memberships VALUES(1,1,1,'owner',TRUE),(2,2,1,'staff',TRUE);
      INSERT INTO store_locations(id,tenant_id,is_active,queue_lifecycle_mode) VALUES(10,1,TRUE,'enforced'),(20,2,TRUE,'enforced');
      INSERT INTO vendor_services VALUES(1000,1,'Court',TRUE);
      INSERT INTO location_services VALUES(10,1000,1,TRUE);
      INSERT INTO location_resource_pools(tenant_id,location_id,name,capacity) VALUES(1,10,'Courts',4);
      INSERT INTO queue_days(tenant_id,location_id,business_date,state,intake_mode,timezone_snapshot,
        initial_closes_at,current_closes_at,effective_closes_at,opened_at)
        VALUES(1,10,CURRENT_DATE,'open','accepting','Asia/Manila',clock_timestamp()-interval '2 hours',
          clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '10 minutes',clock_timestamp()-interval '2 hours');
      INSERT INTO queue_notification_outbox(idempotency_key,queue_day_id,tenant_id,recipient_key,channel,template_name,deadline_version)
        VALUES('old-warning',1,1,'operators','web_push','queue_closing_15m',1)`);
    if (action === 'resume') await pool.query("UPDATE queue_days SET intake_mode='paused' WHERE id=1");
  }
  function hold(kind = 'after') {
    let reached, release;
    const entered = new Promise(resolve => { reached = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    const value = { reached, release: held };
    if (kind === 'before') beforeEvent = value; else eventBarrier = value;
    return { entered, release };
  }
  async function waitForLock(fragment) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const r = await pool.query(`SELECT 1 FROM pg_stat_activity WHERE application_name=$1
        AND wait_event_type='Lock' AND query LIKE $2`, [schema, `%${fragment}%`]);
      if (r.rows.length) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(`Missing lock waiter: ${fragment}`);
  }
  async function history() {
    await pool.query(`INSERT INTO tickets(id,tenant_id,location_id,status,current_queue_day_id) VALUES(1,1,10,'called',1);
      INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,expected_end_at)
        VALUES(1,10,1,1,1,1,clock_timestamp()+interval '1 hour');
      INSERT INTO queue_ticket_segments(ticket_id,queue_day_id,priority_band) VALUES(1,1,'normal');
      INSERT INTO bookings(id,queue_ticket_id,status) VALUES(1,1,'completed')`);
  }
  try {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE FUNCTION set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $$;
      CREATE TABLE users(id BIGINT PRIMARY KEY,roles TEXT[],deletion_requested_at TIMESTAMPTZ,platform_access_suspended_at TIMESTAMPTZ);
      CREATE TABLE tenants(id BIGINT PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE tenant_memberships(id BIGINT PRIMARY KEY,user_id BIGINT REFERENCES users(id),tenant_id BIGINT REFERENCES tenants(id),role TEXT,is_active BOOLEAN);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),is_active BOOLEAN,UNIQUE(id,tenant_id));
      CREATE TABLE tenant_membership_locations(tenant_membership_id BIGINT REFERENCES tenant_memberships(id),location_id BIGINT REFERENCES store_locations(id));
      CREATE TABLE service_counters(id BIGINT PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),location_id BIGINT REFERENCES store_locations(id),is_active BOOLEAN);
      CREATE TABLE service_counter_assignments(user_id BIGINT REFERENCES users(id),counter_id BIGINT REFERENCES service_counters(id));
      CREATE TABLE vendor_services(id BIGINT PRIMARY KEY,tenant_id BIGINT,name TEXT,is_active BOOLEAN,UNIQUE(id,tenant_id));
      CREATE TABLE location_services(location_id BIGINT,service_id BIGINT,tenant_id BIGINT,is_active BOOLEAN,UNIQUE(location_id,service_id));
      CREATE TABLE booking_bundle_items(id BIGINT PRIMARY KEY,booking_id BIGINT,tenant_id BIGINT,location_id BIGINT);
      CREATE TABLE tickets(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,status TEXT,current_queue_day_id BIGINT,
        carry_over_consumed BOOLEAN DEFAULT FALSE,notify_by_email BOOLEAN DEFAULT FALSE,user_id BIGINT,status_reason TEXT,
        pending_carry_over_since TIMESTAMPTZ,carry_over_expires_at TIMESTAMPTZ,unserved_at TIMESTAMPTZ,terminal_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,UNIQUE(id,tenant_id,location_id));
      CREATE TABLE bookings(id BIGINT PRIMARY KEY,queue_ticket_id BIGINT,status TEXT,fulfillment_outcome_reason TEXT,
        refund_eligible BOOLEAN,fulfillment_resolved_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
      CREATE TABLE queue_ticket_segments(ticket_id BIGINT,queue_day_id BIGINT,priority_band TEXT,ended_at TIMESTAMPTZ,segment_outcome TEXT,outcome_reason TEXT);
      CREATE TABLE queue_day_closures(id BIGINT PRIMARY KEY); CREATE TABLE queue_day_pauses(id BIGINT PRIMARY KEY);
      CREATE TABLE queue_events(id BIGSERIAL PRIMARY KEY,ticket_id BIGINT REFERENCES tickets(id),tenant_id BIGINT REFERENCES tenants(id),
        location_id BIGINT REFERENCES store_locations(id),queue_date_key TEXT,event_type TEXT,from_status TEXT,to_status TEXT,
        actor_user_id BIGINT REFERENCES users(id),actor_role TEXT,source TEXT,metadata JSONB,created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE notification_deliveries(id BIGINT PRIMARY KEY,channel TEXT)`);
    for (const migration of ['20260731_01_add_queue_day_lifecycle_foundation.sql',
      '20260731_03_expand_queue_events_and_add_outbox.sql', '20261003_add_resource_capacity_foundation.sql',
      '20261007_add_resource_ledger_foundation.sql']) {
      await pool.query(fs.readFileSync(path.resolve(__dirname, '../../database/migrations', migration), 'utf8'));
    }
    await t.test('pause/resume commit one event and revision per transition; duplicates remain idempotent', async () => {
      await reset(); await history();
      const result = await Promise.all([run('pause', { expectedVersion: 1 }), run('pause', { expectedVersion: 1 })]);
      assert.equal(result.filter(r => r.idempotent).length, 1);
      assert.equal((await day()).version, 2); assert.equal(await revision(), '2'); assert.equal(await count('queue_events'), 1);
      await assert.rejects(run('resume', { expectedVersion: 1 }), { code: 'QUEUE_STATE_CHANGED' });
      await run('resume', { expectedVersion: 2 });
      assert.equal((await day()).version, 3); assert.equal(await revision(), '3');
      assert.equal((await day()).intake_mode, 'accepting');
      assert.equal((await pool.query('SELECT actor_role FROM queue_events LIMIT 1')).rows[0].actor_role, 'owner');
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at, null);
      assert.equal(await count('resource_ledger_commands'), 0);
    });
    await t.test('competing extensions commit one 30-minute extension, event, outbox and revision', async () => {
      await reset('extend'); await history(); const before = await day();
      const results = await Promise.allSettled([run('extend', { expectedVersion: 1 }), run('extend', { expectedVersion: 1 })]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.find(r => r.status === 'rejected').reason.code, 'QUEUE_STATE_CHANGED');
      const after = await day(); assert.equal(after.current_closes_at - before.current_closes_at, 30 * 60 * 1000);
      assert.equal(after.version, 2); assert.equal(after.deadline_version, 2); assert.equal(await revision(), '2');
      assert.equal(await count('queue_day_extensions'), 1); assert.equal(await count('queue_events'), 1);
      assert.deepEqual((await pool.query('SELECT template_name,status FROM queue_notification_outbox ORDER BY id')).rows,
        [{ template_name: 'queue_closing_15m', status: 'obsolete' }, { template_name: 'queue_extended', status: 'pending' }]);
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at, null);
    });
    for (const action of actions) await t.test(`${action} denies current invalid access, scope, mode and activity without changes`, async () => {
      for (const [sql, statusCode] of [
        ['UPDATE tenant_memberships SET is_active=FALSE WHERE id=1', 403],
        ['UPDATE users SET deletion_requested_at=NOW() WHERE id=1', 403],
        ['UPDATE users SET platform_access_suspended_at=NOW() WHERE id=1', 403],
        ["UPDATE tenant_memberships SET role='viewer' WHERE id=1", 403],
        ['UPDATE tenants SET is_active=FALSE WHERE id=1', 409],
        ['UPDATE store_locations SET is_active=FALSE WHERE id=10', 409],
        ["UPDATE store_locations SET queue_lifecycle_mode='legacy' WHERE id=10", 409]
      ]) {
        await reset(action); await pool.query(sql); await assert.rejects(run(action), { statusCode });
        assert.equal((await day()).version, 1); assert.equal(await revision(), undefined); assert.equal(await count('queue_events'), 0);
      }
      await reset(action);
      await assert.rejects(run(action, { actorUserId: '2' }), { statusCode: 403 });
      await assert.rejects(run(action, { actorUserId: undefined }), { statusCode: 403 });
      await assert.rejects(run(action, { actorUserId: '9007199254740993' }), { statusCode: 400 });
      await assert.rejects(run(action, {}, { _id: '20' }), { statusCode: 404 });
      assert.equal(await revision(), undefined);
    });
    for (const action of actions) for (const kind of ['explicit', 'counter']) await t.test(`${action} holds accepted ${kind} staff grants, scope and mode through commit`, async () => {
      await reset(action);
      await pool.query(kind === 'explicit' ? 'INSERT INTO tenant_membership_locations VALUES(2,10)' :
        'INSERT INTO service_counters VALUES(1,1,10,TRUE); INSERT INTO service_counter_assignments VALUES(2,1)');
      const held = hold(); const pending = run(action, { actorUserId: '2' }); pending.catch(() => {});
      try {
        await Promise.race([held.entered, pending.then(() => assert.fail('event barrier missing'))]);
        for (const query of ['SELECT id FROM store_locations WHERE id=10 FOR UPDATE NOWAIT',
          'SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT', 'SELECT id FROM users WHERE id=2 FOR UPDATE NOWAIT',
          'SELECT id FROM tenant_memberships WHERE id=2 FOR UPDATE NOWAIT', kind === 'explicit'
            ? 'SELECT location_id FROM tenant_membership_locations WHERE tenant_membership_id=2 FOR UPDATE NOWAIT'
            : 'SELECT id FROM service_counters WHERE id=1 FOR UPDATE NOWAIT']) await assert.rejects(pool.query(query), { code: '55P03' });
      } finally { held.release(); await pending.catch(() => {}); }
      await pending; assert.equal(await revision(), '2');
      assert.equal((await pool.query('SELECT actor_role FROM queue_events LIMIT 1')).rows[0].actor_role, 'staff');
    });
    for (const action of actions) await t.test(`${action} waits behind tenant-first revocation while its branch FK insert can commit`, async () => {
      await reset(action); const revoker = await pool.connect(); let pending;
      try {
        await revoker.query('BEGIN'); await revoker.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
        pending = run(action); const denied = assert.rejects(pending, { statusCode: 403 });
        await waitForLock('FROM tenants');
        await revoker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
        await revoker.query("SET LOCAL lock_timeout='2s'");
        await revoker.query('INSERT INTO tenant_membership_locations VALUES(1,10)');
        await revoker.query('COMMIT'); await denied;
      } finally { await revoker.query('ROLLBACK'); revoker.release(); if (pending) await pending.catch(() => {}); }
      assert.equal(await revision(), undefined); assert.equal(await count('queue_events'), 0);
    });
    await t.test('mode change committed during a branch lock wait rejects the stale enforced request', async () => {
      await reset(); const blocker = await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending = run('pause'); const denied = assert.rejects(pending, { code: 'QUEUE_LIFECYCLE_NOT_ENFORCED' });
        await waitForLock('FROM store_locations'); await blocker.query("UPDATE store_locations SET queue_lifecycle_mode='legacy' WHERE id=10");
        await blocker.query('COMMIT'); await denied;
      } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
      assert.equal(await revision(), undefined);
    });
    for (const action of actions) await t.test(`${action} post-write failure rolls day, history, outbox and scope back`, async () => {
      await reset(action); const before = await day(); failure = 'INSERT INTO queue_events';
      await assert.rejects(run(action), /injected write failure/); failure = null;
      assert.deepEqual(await day(), before); assert.equal(await revision(), undefined);
      assert.equal(await count('queue_events'), 0); assert.equal(await count('queue_day_extensions'), 0);
      assert.equal((await pool.query('SELECT status FROM queue_notification_outbox')).rows[0].status, 'pending');
    });
    await t.test('extension outbox failure rolls extension, warning obsolescence, event and revision back', async () => {
      await reset('extend'); const before = await day(); failure = 'INSERT INTO queue_notification_outbox';
      await assert.rejects(run('extend'), /injected write failure/); failure = null;
      assert.deepEqual(await day(), before); assert.equal(await revision(), undefined);
      assert.equal(await count('queue_events'), 0); assert.equal(await count('queue_day_extensions'), 0);
      assert.equal((await pool.query('SELECT status FROM queue_notification_outbox')).rows[0].status, 'pending');
    });
    await t.test('extension cannot use transaction-start time after waiting past the deadline', async () => {
      await reset('extend'); const blocker = await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        await pool.query("UPDATE queue_days SET current_closes_at=clock_timestamp()+interval '250 milliseconds' WHERE id=1");
        pending = run('extend'); const denied = assert.rejects(pending, { code: 'QUEUE_STATE_CHANGED' });
        await waitForLock('FROM store_locations'); await blocker.query('SELECT pg_sleep(0.3)');
        await blocker.query('COMMIT'); await denied;
      } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
      assert.equal(await count('queue_day_extensions'), 0); assert.equal(await revision(), undefined);
    });
    await t.test('overdue intake reconciles once and commits a revision before rejecting; occupancy and terminal booking remain', async () => {
      await reset(); await history();
      await pool.query("UPDATE queue_days SET current_closes_at=clock_timestamp()-interval '1 second' WHERE id=1");
      await assert.rejects(run('pause'), { code: 'QUEUE_DAY_OVERDUE' });
      assert.equal((await day()).state, 'closed'); assert.equal(await revision(), '2');
      assert.equal((await pool.query('SELECT status FROM tickets')).rows[0].status, 'unserved');
      assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status, 'completed');
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at, null);
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM queue_events WHERE event_type='queue_day_paused'")).rows[0].n, 0);
      await assert.rejects(run('pause'), { code: 'QUEUE_DAY_UNOPENED' }); assert.equal(await revision(), '2');
    });
    await t.test('overdue reconciliation event failure rolls closure, ticket outcomes and revision back', async () => {
      await reset(); await history(); await pool.query("UPDATE queue_days SET current_closes_at=clock_timestamp()-interval '1 second' WHERE id=1");
      failure = 'INSERT INTO queue_events'; await assert.rejects(run('pause'), /injected write failure/); failure = null;
      assert.equal((await day()).state, 'open'); assert.equal(await revision(), undefined);
      assert.equal((await pool.query('SELECT status FROM tickets')).rows[0].status, 'called');
      assert.equal(await count('queue_events'), 0);
    });
    await t.test('Queue Day-first reconciliation can insert branch-FK events while intake waits without a lock cycle', async () => {
      await reset(); await pool.query("UPDATE queue_days SET current_closes_at=clock_timestamp()-interval '1 second' WHERE id=1");
      const held = hold('before'); const closing = service.reconcileQueueDayById('1'); closing.catch(() => {}); let pending;
      try {
        await Promise.race([held.entered, closing.then(() => assert.fail('pre-event barrier missing'))]);
        pending = run('pause'); const denied = assert.rejects(pending, { code: 'QUEUE_DAY_UNOPENED' });
        await waitForLock('FROM queue_days'); held.release(); await closing; await denied;
      } finally { held.release(); await closing.catch(() => {}); if (pending) await pending.catch(() => {}); }
      assert.equal((await day()).state, 'closed'); assert.equal(await count('queue_events'), 1);
      // This separate worker path still has no coverage certification or ledger revision.
      assert.equal(await revision(), undefined);
    });
  } finally {
    eventBarrier = null; beforeEvent = null;
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end();
  }
});
