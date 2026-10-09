const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');
const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;

function loadLifecycle(database) {
  const target = require.resolve('../src/services/queueDayLifecycleService');
  return loadModuleWithMocks(target, { '../config/db': database,
    '../config/env': { waitTimePredictionCaptureEnabled: false } });
}

test('enforced vendor Queue Day writers use location-first PostgreSQL transactions', { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl); assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_test', '/getprio_ledger_test'].includes(url.pathname));
  const schema = `enforced_intake_${randomUUID().replaceAll('-', '')}`;
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema} -c timezone=UTC`, application_name: schema, max: 8 });
  let eventBarrier = null, failure = null, beforeEvent = null, failOnce = false, afterRollback = null;
  const database = { pool: { query: (...args) => pool.query(...args), connect: async () => {
    const client = await pool.connect();
    return { release: () => client.release(), query: async (...args) => {
      const sql = String(args[0]);
      if (sql.includes('INSERT INTO queue_events') && beforeEvent) { beforeEvent.reached(); await beforeEvent.release; }
      const result = await client.query(...args);
      if (sql === 'ROLLBACK' && afterRollback) { const callback = afterRollback; afterRollback = null; await callback(); }
      if (sql.includes('INSERT INTO queue_events') && eventBarrier) { eventBarrier.reached(); await eventBarrier.release; }
      if (failure && sql.includes(failure)) { if (failOnce) failure = null; throw new Error('injected write failure'); }
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
  const actions = ['pause', 'resume', 'extend', 'close', 'reopen', 'open'];
  const run = (action, options = {}, selected = location) => {
    const current = { actorUserId: '1', actorRole: 'stale', ...options };
    if (action === 'open') return service.openQueueDay(tenant, selected, current);
    if (action === 'extend') return service.extendQueueDay(tenant, selected, { reason: 'Extra service time', ...current });
    if (action === 'close') return service.closeVendorQueueDay(tenant, selected, current);
    if (action === 'reopen') return service.reopenQueueDay(tenant, selected, current);
    return service.setQueueIntake(tenant, selected, action === 'pause' ? 'paused' : 'accepting', current);
  };
  const count = async table => (await pool.query(`SELECT COUNT(*)::int n FROM ${table}`)).rows[0].n;
  const revision = async () => (await pool.query('SELECT revision::text FROM resource_ledger_scopes WHERE tenant_id=1 AND location_id=10')).rows[0]?.revision;
  const day = async () => (await pool.query('SELECT * FROM queue_days WHERE id=1')).rows[0];
  async function reset(action = 'pause') {
    eventBarrier = null; beforeEvent = null; failure = null; failOnce = false; afterRollback = null;
    await pool.query(`TRUNCATE users,tenants,tenant_memberships,tenant_membership_locations,store_locations,
      store_hours,service_counter_assignments,service_counters,vendor_services,location_services,location_resource_pools,
      service_resource_requirements,queue_days,queue_events,queue_day_extensions,queue_notification_outbox,
      tickets,bookings,booking_bundle_items,queue_ticket_segments,resource_ledger_scopes,
      resource_ledger_reservations,resource_allocations,resource_ledger_commands RESTART IDENTITY CASCADE;
      INSERT INTO users VALUES(1,'{}',NULL,NULL),(2,'{}',NULL,NULL);
      INSERT INTO tenants VALUES(1,TRUE),(2,TRUE);
      INSERT INTO tenant_memberships VALUES(1,1,1,'owner',TRUE),(2,2,1,'staff',TRUE);
      INSERT INTO store_locations(id,tenant_id,is_active,queue_lifecycle_mode) VALUES(10,1,TRUE,'enforced'),(20,2,TRUE,'enforced');
      INSERT INTO store_hours(location_id,weekday,opens_at,closes_at,is_closed) SELECT 10,day,'00:00','00:00',FALSE FROM generate_series(0,6) day;
      INSERT INTO vendor_services VALUES(1000,1,'Court',TRUE);
      INSERT INTO location_services VALUES(10,1000,1,TRUE);
      INSERT INTO location_resource_pools(tenant_id,location_id,name,capacity) VALUES(1,10,'Courts',4);
      INSERT INTO queue_days(tenant_id,location_id,business_date,state,intake_mode,timezone_snapshot,
        initial_closes_at,current_closes_at,effective_closes_at,opened_at)
        VALUES(1,10,(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,'open','accepting','Asia/Manila',clock_timestamp()-interval '2 hours',
          clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '10 minutes',clock_timestamp()-interval '2 hours');
      INSERT INTO queue_notification_outbox(idempotency_key,queue_day_id,tenant_id,recipient_key,channel,template_name,deadline_version)
        VALUES('old-warning',1,1,'operators','web_push','queue_closing_15m',1)`);
    if (action === 'open') await pool.query("UPDATE queue_days SET state='unopened',intake_mode=NULL,opened_at=NULL WHERE id=1");
    if (action === 'resume') await pool.query("UPDATE queue_days SET intake_mode='paused' WHERE id=1");
    if (action === 'reopen') await pool.query("UPDATE queue_days SET state='closed',intake_mode=NULL,closed_at=clock_timestamp(),close_source='manual' WHERE id=1");
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
      UPDATE tickets SET service_started_at=clock_timestamp()-interval '10 minutes' WHERE id=1;
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
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),is_active BOOLEAN,timezone TEXT DEFAULT 'Asia/Manila',UNIQUE(id,tenant_id));
      CREATE TABLE store_hours(id BIGSERIAL PRIMARY KEY,location_id BIGINT REFERENCES store_locations(id),weekday INTEGER,opens_at TIME,closes_at TIME,is_closed BOOLEAN,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE tenant_membership_locations(tenant_membership_id BIGINT REFERENCES tenant_memberships(id),location_id BIGINT REFERENCES store_locations(id));
      CREATE TABLE service_counters(id BIGINT PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),location_id BIGINT REFERENCES store_locations(id),is_active BOOLEAN);
      CREATE TABLE service_counter_assignments(user_id BIGINT REFERENCES users(id),counter_id BIGINT REFERENCES service_counters(id));
      CREATE TABLE vendor_services(id BIGINT PRIMARY KEY,tenant_id BIGINT,name TEXT,is_active BOOLEAN,UNIQUE(id,tenant_id));
      CREATE TABLE location_services(location_id BIGINT,service_id BIGINT,tenant_id BIGINT,is_active BOOLEAN,UNIQUE(location_id,service_id));
      CREATE TABLE booking_bundle_items(id BIGINT PRIMARY KEY,booking_id BIGINT,tenant_id BIGINT,location_id BIGINT);
      CREATE TABLE tickets(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,status TEXT,current_queue_day_id BIGINT,
        carry_over_consumed BOOLEAN DEFAULT FALSE,notify_by_email BOOLEAN DEFAULT FALSE,user_id BIGINT,status_reason TEXT,
        pending_carry_over_since TIMESTAMPTZ,carry_over_expires_at TIMESTAMPTZ,unserved_at TIMESTAMPTZ,terminal_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,service_started_at TIMESTAMPTZ,service_ended_at TIMESTAMPTZ,ticket_number TEXT,sequence INTEGER,date_key TEXT,queue_date_key TEXT,carried_over_at TIMESTAMPTZ,carry_over_count INTEGER DEFAULT 0,service_priority_band TEXT,UNIQUE(id,tenant_id,location_id));
      CREATE TABLE bookings(id BIGINT PRIMARY KEY,queue_ticket_id BIGINT,status TEXT,fulfillment_outcome_reason TEXT,
        refund_eligible BOOLEAN,fulfillment_resolved_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
      CREATE TABLE queue_ticket_segments(ticket_id BIGINT,queue_day_id BIGINT,priority_band TEXT,ended_at TIMESTAMPTZ,segment_outcome TEXT,outcome_reason TEXT,display_number TEXT,sequence INTEGER,UNIQUE(ticket_id,queue_day_id));
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
    async function pendingCarryOver() {
      await history();
      await pool.query("UPDATE tickets SET status='pending_carry_over',current_queue_day_id=NULL,carry_over_expires_at=clock_timestamp()+interval '1 hour' WHERE id=1; DELETE FROM queue_ticket_segments");
    }
    await t.test('concurrent opening activates carry-over once with one revision and retains occupancy/timing', async () => {
      await reset('open'); await pendingCarryOver();
      const timing = (await pool.query('SELECT service_started_at,service_ended_at FROM tickets')).rows;
      await pool.query("INSERT INTO tickets(id,tenant_id,location_id,status,carry_over_expires_at) VALUES(2,1,10,'pending_carry_over',clock_timestamp()-interval '1 second')");
      const results = await Promise.all([run('open', { expectedVersion: 1 }), run('open', { expectedVersion: 1 })]);
      assert.equal(results.filter(result => result.idempotent).length, 1);
      assert.equal(results.reduce((total, result) => total + result.activatedCarryOverCount, 0), 1);
      assert.equal((await day()).version, 2); assert.equal(await revision(), '2');
      assert.deepEqual((await pool.query('SELECT status,carry_over_count FROM tickets ORDER BY id')).rows,
        [{ status: 'waiting', carry_over_count: 1 }, { status: 'pending_carry_over', carry_over_count: 0 }]);
      assert.equal(await count('queue_ticket_segments'), 1); assert.equal(await count('queue_events'), 2);
      assert.equal((await pool.query("SELECT actor_role FROM queue_events WHERE event_type='queue_day_opened'")).rows[0].actor_role, 'owner');
      assert.deepEqual((await pool.query('SELECT service_started_at,service_ended_at FROM tickets WHERE id=1')).rows, timing);
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at, null);
    });
    await t.test('opening rolls prior-day closure, new opening and carry-over activation back on segment failure', async () => {
      await reset('open'); await pendingCarryOver();
      await pool.query(`INSERT INTO queue_days(id,tenant_id,location_id,business_date,state,intake_mode,timezone_snapshot,
        initial_closes_at,current_closes_at,opened_at) VALUES(2,1,10,(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1,'open','accepting','Asia/Manila',
          clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 day');
        INSERT INTO tickets(id,tenant_id,location_id,status,current_queue_day_id) VALUES(2,1,10,'called',2);
        INSERT INTO bookings(id,queue_ticket_id,status) VALUES(2,2,'confirmed')`);
      const before = (await pool.query('SELECT * FROM queue_days ORDER BY id')).rows;
      const tickets = (await pool.query('SELECT * FROM tickets ORDER BY id')).rows;
      failure = 'INSERT INTO queue_ticket_segments';
      await assert.rejects(run('open'), /injected write failure/); failure = null;
      assert.deepEqual((await pool.query('SELECT * FROM queue_days ORDER BY id')).rows, before);
      assert.deepEqual((await pool.query('SELECT * FROM tickets ORDER BY id')).rows, tickets);
      assert.equal((await pool.query('SELECT status FROM bookings WHERE id=2')).rows[0].status, 'confirmed');
      assert.equal(await revision(), undefined); assert.equal(await count('queue_events'), 0);
      assert.equal(await count('queue_notification_outbox'), 1);
      await run('open');
      assert.equal((await pool.query('SELECT state FROM queue_days WHERE id=2')).rows[0].state, 'closed');
      assert.equal((await day()).state, 'open'); assert.equal(await revision(), '2');
      assert.equal((await pool.query('SELECT status FROM bookings WHERE id=2')).rows[0].status, 'unfulfilled');
    });
    await t.test('opening uses current timezone and database time rather than caller snapshots', async () => {
      await reset('open'); await pool.query("UPDATE store_locations SET timezone='UTC' WHERE id=10");
      const result = await run('open', { now: new Date('1980-01-01'), expectedVersion: 1 }, { ...location, timezone: 'invalid-stale-zone' });
      assert.equal(result.queueDay.timezone, 'UTC');
      assert.ok(new Date(result.queueDay.currentClosesAt) > new Date());
    });
    await t.test('opening rereads hours changed during branch contention and rejects outside hours without changes', async () => {
      await reset('open'); const blocker = await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending = run('open'); const denied = assert.rejects(pending, { code: 'QUEUE_OUTSIDE_EFFECTIVE_HOURS' });
        await waitForLock('FROM store_locations'); await blocker.query('UPDATE store_hours SET is_closed=TRUE');
        await blocker.query('COMMIT'); await denied;
      } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
      assert.equal((await day()).state, 'unopened'); assert.equal(await revision(), undefined);
    });
    await t.test('opening cannot activate a carry-over ticket that expires while its row lock waits', async () => {
      await reset('open'); await pendingCarryOver(); const blocker = await pool.connect(); let pending;
      try {
        await pool.query("UPDATE tickets SET carry_over_expires_at=clock_timestamp()+interval '250 milliseconds' WHERE id=1");
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM tickets WHERE id=1 FOR UPDATE');
        pending = run('open'); pending.catch(() => {}); await waitForLock('FROM tickets');
        await blocker.query('SELECT pg_sleep(0.3)'); await blocker.query('COMMIT');
        assert.equal((await pending).activatedCarryOverCount, 0);
      } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
      assert.equal((await pool.query('SELECT status FROM tickets')).rows[0].status, 'pending_carry_over');
      assert.equal(await count('queue_ticket_segments'), 0); assert.equal(await revision(), '2');
    });
    await t.test('late initial opening update cannot use an interval that expired during a row lock wait', async () => {
      await reset('open'); const blocker = await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM queue_days WHERE id=1 FOR UPDATE');
        const interval = { timezone: 'UTC', effectiveOpensAt: new Date(Date.now()-1000),
          effectiveClosesAt: new Date(Date.now()+250), actorUserId: '1' };
        pending = database.withTransaction(async client => {
          const repository = require('../src/repositories/queueDays');
          await repository.findById('1', { client, forUpdate: true });
          return repository.transitionOpen('1', interval, { client });
        });
        await waitForLock('FROM queue_days'); await blocker.query('SELECT pg_sleep(0.3)');
        await blocker.query('COMMIT'); assert.equal(await pending, null);
      } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
      assert.equal((await day()).state, 'unopened');
    });
    await t.test('opening rejects stale versions and already-closed days without a revision', async () => {
      await reset('open'); await assert.rejects(run('open', { expectedVersion: 99 }), { code: 'QUEUE_STATE_CHANGED' });
      assert.equal((await day()).state, 'unopened'); assert.equal(await revision(), undefined);
      await reset('reopen'); await assert.rejects(run('open'), { code: 'QUEUE_DAY_CLOSED' });
      assert.equal(await count('queue_events'), 0); assert.equal(await revision(), undefined);
    });
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
    for (const action of actions.filter(action => action !== 'reopen')) for (const kind of ['explicit', 'counter']) await t.test(`${action} holds accepted ${kind} staff grants, scope and mode through commit`, async () => {
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
    await t.test('reopen requires owner/admin permission even with current staff branch or counter grants', async () => {
      for (const kind of ['explicit', 'counter']) {
        await reset('reopen');
        await pool.query(kind === 'explicit' ? 'INSERT INTO tenant_membership_locations VALUES(2,10)' :
          'INSERT INTO service_counters VALUES(1,1,10,TRUE); INSERT INTO service_counter_assignments VALUES(2,1)');
        await assert.rejects(run('reopen', { actorUserId: '2' }), { statusCode: 403 });
        assert.equal((await day()).state, 'closed'); assert.equal(await revision(), undefined);
      }
      await reset('reopen'); await pool.query("UPDATE tenant_memberships SET role='admin' WHERE id=1");
      await run('reopen'); assert.equal(await revision(), '2');
      assert.equal((await pool.query('SELECT actor_role FROM queue_events LIMIT 1')).rows[0].actor_role, 'admin');
    });
    await t.test('reopen rejects demotion to assigned staff committed while waiting for the branch', async () => {
      await reset('reopen'); await pool.query('INSERT INTO tenant_membership_locations VALUES(1,10)');
      const blocker = await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending = run('reopen'); const denied = assert.rejects(pending, { statusCode: 403 });
        await waitForLock('FROM store_locations');
        await blocker.query("UPDATE tenant_memberships SET role='staff' WHERE id=1");
        await blocker.query('COMMIT'); await denied;
      } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
      assert.equal((await day()).state, 'closed'); assert.equal(await count('queue_events'), 0); assert.equal(await revision(), undefined);
    });
    await t.test('manual close and reopen commit one revision each, preserve occupancy and do not resurrect ticket outcomes', async () => {
      await reset(); await history();
      const timing = (await pool.query('SELECT service_started_at,service_ended_at FROM tickets')).rows;
      const results = await Promise.all([run('close', { expectedVersion: 1 }), run('close', { expectedVersion: 1 })]);
      assert.equal(results.filter(result => result.idempotent).length, 1);
      assert.equal((await day()).state, 'closed'); assert.equal((await day()).version, 2);
      assert.equal(await revision(), '2');
      const outcomes = (await pool.query('SELECT * FROM tickets ORDER BY id')).rows;
      assert.equal(outcomes[0].status, 'unserved');
      assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status, 'completed');
      const reopened = await Promise.allSettled([run('reopen', { expectedVersion: 2 }), run('reopen', { expectedVersion: 2 })]);
      assert.equal(reopened.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(reopened.find(result => result.status === 'rejected').reason.code, 'QUEUE_DAY_UNOPENED');
      assert.equal((await day()).state, 'open'); assert.equal((await day()).version, 3); assert.equal(await revision(), '3');
      assert.deepEqual((await pool.query('SELECT * FROM tickets ORDER BY id')).rows, outcomes);
      assert.deepEqual((await pool.query('SELECT service_started_at,service_ended_at FROM tickets')).rows, timing);
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at, null);
      assert.deepEqual((await pool.query('SELECT event_type,actor_role FROM queue_events WHERE ticket_id IS NULL ORDER BY id')).rows,
        [{ event_type: 'queue_day_closed', actor_role: 'owner' }, { event_type: 'queue_day_reopened', actor_role: 'owner' }]);
      assert.deepEqual((await pool.query('SELECT template_name,status FROM queue_notification_outbox ORDER BY id')).rows,
        [{ template_name: 'queue_closing_15m', status: 'obsolete' }, { template_name: 'ticket_unserved', status: 'pending' },
          { template_name: 'queue_closed', status: 'pending' },
          { template_name: 'queue_reopened', status: 'pending' }]);
      assert.equal(await count('resource_ledger_commands'), 0);
    });
    await t.test('manual closure retains waiting/carry-over/skipped policy and resolves only nonterminal linked bookings', async () => {
      await reset();
      await pool.query(`INSERT INTO tickets(id,tenant_id,location_id,status,current_queue_day_id,carry_over_consumed)
        VALUES(1,1,10,'waiting',1,FALSE),(2,1,10,'waiting',1,TRUE),(3,1,10,'skipped',1,FALSE),(4,1,10,'called',1,FALSE);
        INSERT INTO queue_ticket_segments(ticket_id,queue_day_id,priority_band) VALUES(1,1,'normal'),(2,1,'carry_over'),(3,1,'normal'),(4,1,'normal');
        INSERT INTO bookings(id,queue_ticket_id,status) VALUES(1,1,'confirmed'),(2,2,'confirmed'),(3,3,'confirmed'),(4,4,'confirmed')`);
      const result = await run('close');
      assert.deepEqual(result.outcomes, { pendingCarryOver: 1, expired: 1, unserved: 1, skipped: 1 });
      assert.deepEqual((await pool.query('SELECT status,current_queue_day_id FROM tickets ORDER BY id')).rows,
        ['pending_carry_over', 'expired', 'skipped', 'unserved'].map(status => ({ status, current_queue_day_id: null })));
      assert.deepEqual((await pool.query('SELECT status FROM bookings ORDER BY id')).rows.map(row => row.status),
        ['confirmed', 'unfulfilled', 'missed', 'unfulfilled']);
      assert.equal(await revision(), '2');
    });
    for (const action of ['close', 'reopen']) await t.test(`${action} stale version and outbox failures roll all closure effects back`, async () => {
      await reset(action); await history();
      const before = await day(); const tickets = (await pool.query('SELECT * FROM tickets')).rows;
      const bookings = (await pool.query('SELECT * FROM bookings')).rows;
      const segments = (await pool.query('SELECT * FROM queue_ticket_segments')).rows;
      await assert.rejects(run(action, { expectedVersion: 99 }), { code: 'QUEUE_STATE_CHANGED' });
      failure = 'INSERT INTO queue_notification_outbox';
      await assert.rejects(run(action), /injected write failure/); failure = null;
      assert.deepEqual(await day(), before); assert.equal(await revision(), undefined);
      assert.deepEqual((await pool.query('SELECT * FROM tickets')).rows, tickets);
      assert.deepEqual((await pool.query('SELECT * FROM bookings')).rows, bookings);
      assert.deepEqual((await pool.query('SELECT * FROM queue_ticket_segments')).rows, segments);
      assert.equal(await count('queue_events'), 0);
      assert.equal((await pool.query('SELECT status FROM queue_notification_outbox')).rows[0].status, 'pending');
    });
    await t.test('duplicate manual close still checks current authorization before idempotency', async () => {
      await reset(); await run('close');
      await pool.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
      await assert.rejects(run('close'), { statusCode: 403 }); assert.equal(await revision(), '2');
    });
    await t.test('vendor queue service close/reopen reject missing actors through the enforced boundary', async () => {
      const queue = loadModuleWithMocks(require.resolve('../src/services/queueService'), {
        '../config/db': database, './queueDayLifecycleService': service,
        './queueSnapshotHelpers': { resolveLocation: async () => location }
      });
      for (const [action, method] of [['close', 'closeQueueDay'], ['reopen', 'reopenQueueDay'], ['open', 'openQueueDay']]) {
        await reset(action);
        await assert.rejects(queue[method](tenant, { location }), { code: 'QUEUE_AUTHORIZATION_REQUIRED' });
        assert.equal((await day()).version, 1); assert.equal(await revision(), undefined); assert.equal(await count('queue_events'), 0);
      }
    });
    await t.test('trusted request reconciliation commits a closure revision without releasing occupancy', async () => {
      await reset(); await history();
      await pool.query("UPDATE queue_days SET current_closes_at=clock_timestamp()-interval '1 second' WHERE id=1");
      await service.closeQueueDay(tenant, location);
      assert.equal((await day()).state, 'closed'); assert.equal(await revision(), '2');
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at, null);
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
    for (const action of ['extend', 'open']) await t.test(`${action} outbox failure rolls day, history, warning, event and revision back`, async () => {
      await reset(action); const before = await day(); failure = 'INSERT INTO queue_notification_outbox';
      await assert.rejects(run(action), /injected write failure/); failure = null;
      assert.deepEqual(await day(), before); assert.equal(await revision(), undefined);
      assert.equal(await count('queue_events'), 0); assert.equal(await count('queue_day_extensions'), 0);
      assert.equal((await pool.query('SELECT status FROM queue_notification_outbox')).rows[0].status, 'pending');
    });
    for (const action of ['extend', 'reopen']) await t.test(`${action} cannot use transaction-start time after waiting past the deadline`, async () => {
      await reset(action); const blocker = await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        await pool.query("UPDATE queue_days SET current_closes_at=clock_timestamp()+interval '250 milliseconds' WHERE id=1");
        pending = run(action); const denied = assert.rejects(pending, { code: 'QUEUE_STATE_CHANGED' });
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
    async function overdue() {
      await reset(); await history();
      await pool.query("UPDATE queue_days SET current_closes_at=clock_timestamp()-interval '1 second' WHERE id=1");
    }
    async function withHostClock(instant, callback) {
      const ActualDate = Date;
      globalThis.Date = class extends ActualDate {
        constructor(...args) { super(...(args.length ? args : [instant])); }
      };
      try { return await callback(); } finally { globalThis.Date = ActualDate; }
    }
    await t.test('caller-owned intake ignores caller time and application clock skew without writing closure', async () => {
      await reset();
      await withHostClock('2100-01-01', () => database.withTransaction(async client => {
        const result = await service.assertIntakeOpen(tenant, location, { client, now: new Date('2100-01-01') });
        assert.equal(result.state, 'open');
      }));
      await overdue();
      await withHostClock('1980-01-01', () => assert.rejects(database.withTransaction(client =>
        service.assertIntakeOpen(tenant, location, { client, now: new Date(0) })), { code: 'QUEUE_DAY_OVERDUE' }));
      assert.equal((await day()).state, 'open'); assert.equal(await revision(), undefined); assert.equal(await count('queue_events'), 0);
    });
    await t.test('caller-owned intake reads wall-clock after a Queue Day lock wait', async () => {
      await reset(); const blocker = await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM queue_days WHERE id=1 FOR UPDATE');
        pending = database.withTransaction(client => service.assertIntakeOpen(tenant, location, { client, now: new Date(0) }));
        const denied = assert.rejects(pending, { code: 'QUEUE_DAY_OVERDUE' }); await waitForLock('FROM queue_days');
        await blocker.query("UPDATE queue_days SET current_closes_at=clock_timestamp()-interval '1 second' WHERE id=1");
        await blocker.query('COMMIT'); await denied;
      } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
      assert.equal((await day()).state, 'open'); assert.equal(await revision(), undefined); assert.equal(await count('queue_events'), 0);
    });
    await t.test('vendor intake uses database deadlines despite application clock skew', async () => {
      await reset();
      await withHostClock('2100-01-01', () => run('pause'));
      assert.equal((await day()).state, 'open'); assert.equal((await day()).intake_mode, 'paused'); assert.equal(await revision(), '2');
      await overdue();
      await withHostClock('1980-01-01', () => assert.rejects(run('pause'), { code: 'QUEUE_DAY_OVERDUE' }));
      assert.equal((await day()).state, 'closed'); assert.equal(await revision(), '2');
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at, null);
    });
    await t.test('snapshot and standalone intake contenders commit one closure before intake rejects', async () => {
      await overdue();
      const result = await Promise.allSettled([service.closeQueueDay(tenant, location), service.assertIntakeOpen(tenant, location, { now: new Date(0) })]);
      assert.equal(result[0].status, 'fulfilled'); assert.equal(result[1].status, 'rejected');
      assert.ok(['QUEUE_DAY_OVERDUE', 'QUEUE_DAY_UNOPENED'].includes(result[1].reason.code));
      assert.equal((await day()).state, 'closed'); assert.equal(await revision(), '2');
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM queue_events WHERE event_type='queue_day_closed'")).rows[0].n, 1);
    });
    await t.test('request reconciliation uses current deadlines after branch and day lock waits', async () => {
      for (const method of ['closeQueueDay', 'assertIntakeOpen']) for (const lock of ['store_locations', 'queue_days']) {
        await overdue(); const blocker = await pool.connect(); let pending;
        try {
          await blocker.query('BEGIN'); await blocker.query(`SELECT id FROM ${lock} WHERE id=${lock === 'queue_days' ? 1 : 10} FOR UPDATE`);
          pending = service[method](tenant, location, { now: new Date(0) }); pending.catch(() => {});
          await waitForLock(`FROM ${lock}`);
          await blocker.query("UPDATE queue_days SET current_closes_at=clock_timestamp()+interval '1 hour' WHERE id=1");
          await blocker.query('COMMIT'); await pending;
        } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
        assert.equal((await day()).state, 'open'); assert.equal(await revision(), '1'); assert.equal(await count('queue_events'), 0);
      }
    });
    await t.test('standalone intake ignores caller time and evaluates expiry after day locks', async () => {
      await reset(); const blocker = await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM queue_days WHERE id=1 FOR UPDATE');
        pending = service.assertIntakeOpen(tenant, location, { now: new Date('2100-01-01') });
        const denied = assert.rejects(pending, { code: 'QUEUE_DAY_OVERDUE' }); await waitForLock('FROM queue_days');
        await blocker.query("UPDATE queue_days SET current_closes_at=clock_timestamp()-interval '1 second' WHERE id=1");
        await blocker.query('COMMIT'); await denied;
      } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
      assert.equal((await day()).state, 'closed'); assert.equal(await revision(), '2');
    });
    await t.test('request maintenance permits inactive scope but rejects changed lifecycle mode', async () => {
      for (const method of ['closeQueueDay', 'assertIntakeOpen']) {
        await overdue(); await pool.query('UPDATE tenants SET is_active=FALSE; UPDATE store_locations SET is_active=FALSE; UPDATE tenant_memberships SET is_active=FALSE');
        if (method === 'assertIntakeOpen') await assert.rejects(service[method](tenant, location), { code: 'QUEUE_DAY_OVERDUE' });
        else await service[method](tenant, location);
        assert.equal(await revision(), '2');
        await overdue(); const blocker = await pool.connect(); let pending;
        try {
          await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending = service[method](tenant, location); const denied = assert.rejects(pending, { code: 'QUEUE_LIFECYCLE_NOT_ENFORCED' });
          await waitForLock('FROM store_locations'); await blocker.query("UPDATE store_locations SET queue_lifecycle_mode='legacy' WHERE id=10");
          await blocker.query('COMMIT'); await denied;
        } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
        assert.equal((await day()).state, 'open'); assert.equal(await revision(), undefined); assert.equal(await count('queue_events'), 0);
      }
    });
    await t.test('request failures roll back closure outcomes outbox and revision together', async () => {
      for (const method of ['closeQueueDay', 'assertIntakeOpen']) for (const table of ['queue_events', 'queue_notification_outbox']) {
        await overdue(); failure = `INSERT INTO ${table}`;
        await assert.rejects(service[method](tenant, location), method === 'assertIntakeOpen' ? { code: 'QUEUE_RECONCILIATION_UNAVAILABLE' } : /injected write failure/);
        failure = null; assert.equal((await day()).state, 'open'); assert.equal(await revision(), undefined);
        assert.equal((await pool.query('SELECT status FROM tickets')).rows[0].status, 'called');
        assert.equal(await count('queue_events'), 0);
        assert.equal((await pool.query("SELECT status FROM queue_notification_outbox WHERE idempotency_key='old-warning'")).rows[0].status, 'pending');
      }
    });
    await t.test('request maintenance fails closed for unsafe or mismatched scopes and unsafe days', async () => {
      for (const method of ['closeQueueDay', 'assertIntakeOpen']) {
        await overdue(); await assert.rejects(service[method]({ _id: '9007199254740993' }, location), { code: 'QUEUE_IDENTITY_INVALID' });
        await assert.rejects(service[method](tenant, { _id: '20' }));
        await pool.query(`UPDATE queue_days SET state='closed',intake_mode=NULL WHERE id=1;
          INSERT INTO queue_days(id,tenant_id,location_id,business_date,state,intake_mode,timezone_snapshot,current_closes_at)
          VALUES(9007199254740993,1,10,(SELECT business_date+1 FROM queue_days WHERE id=1),'open','accepting','Asia/Manila',clock_timestamp()-interval '1 second')`);
        await assert.rejects(service[method](tenant, location), { code: 'QUEUE_IDENTITY_INVALID' });
        assert.equal(await revision(), undefined); assert.equal(await count('queue_events'), 0);
      }
    });
    await t.test('competing scheduled and Platform retries close once and retain occupancy and timing', async () => {
      await overdue();
      const timing = (await pool.query('SELECT service_started_at,service_ended_at FROM tickets')).rows;
      let notifications = 0;
      const [batch, retry] = await Promise.all([service.reconcileDueQueueDays(50, { onTransition: async () => { notifications += 1; } }), service.reconcileQueueDayById('1')]);
      assert.equal(batch + Number(!retry.idempotent), 1); assert.equal(notifications, batch);
      assert.equal((await day()).state, 'closed'); assert.equal(await revision(), '2');
      assert.equal((await service.reconcileQueueDayById('1')).idempotent, true);
      assert.equal(await service.reconcileDueQueueDays(), 0); assert.equal(await revision(), '2');
      assert.deepEqual((await pool.query('SELECT service_started_at,service_ended_at FROM tickets')).rows, timing);
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at, null);
      assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status, 'completed');
    });
    await t.test('overdue maintenance needs no actor or active business but still holds branch and tenant through commit', async () => {
      await overdue(); await pool.query('UPDATE tenants SET is_active=FALSE; UPDATE store_locations SET is_active=FALSE; UPDATE tenant_memberships SET is_active=FALSE');
      const held = hold(); const pending = service.reconcileQueueDayById('1'); pending.catch(() => {});
      try {
        await Promise.race([held.entered, pending.then(() => assert.fail('event barrier missing'))]);
        for (const table of ['store_locations', 'tenants']) await assert.rejects(pool.query(`SELECT id FROM ${table} WHERE id=${table === 'tenants' ? 1 : 10} FOR UPDATE NOWAIT`), { code: '55P03' });
      } finally { held.release(); await pending.catch(() => {}); }
      await pending; assert.equal(await revision(), '2');
    });
    for (const method of ['retry', 'scheduled']) await t.test(`${method} rereads extended deadlines after branch contention`, async () => {
      await overdue(); const blocker = await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending = method === 'retry' ? service.reconcileQueueDayById('1') : service.reconcileDueQueueDays();
        const verified = method === 'retry' ? assert.rejects(pending, { code: 'QUEUE_STATE_CHANGED' }) : pending.then(value => assert.equal(value, 0));
        await waitForLock('FROM store_locations');
        await blocker.query("UPDATE queue_days SET current_closes_at=clock_timestamp()+interval '10 minutes' WHERE id=1");
        await blocker.query('COMMIT'); await verified;
      } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
      assert.equal((await day()).state, 'open'); assert.equal(await count('queue_events'), 0);
      assert.ok([undefined, '1'].includes(await revision()));
    });
    await t.test('scheduled stale mode skips; an explicit retry rejects without closing', async () => {
      await overdue(); const blocker = await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending = service.reconcileDueQueueDays(); await waitForLock('FROM store_locations');
        await blocker.query("UPDATE store_locations SET queue_lifecycle_mode='legacy' WHERE id=10");
        await blocker.query('COMMIT'); assert.equal(await pending, 0);
      } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
      await assert.rejects(service.reconcileQueueDayById('1'), { code: 'QUEUE_STATE_CHANGED' });
      assert.equal((await day()).state, 'open'); assert.equal(await count('queue_events'), 0); assert.equal(await revision(), '1');
    });
    for (const statement of ['INSERT INTO queue_events', 'INSERT INTO queue_notification_outbox']) await t.test(`retry rollback after ${statement} retains day, ticket, booking and segment effects`, async () => {
      await overdue(); const before = await day();
      const tickets = (await pool.query('SELECT * FROM tickets')).rows;
      const segments = (await pool.query('SELECT * FROM queue_ticket_segments')).rows;
      failure = statement;
      await assert.rejects(service.reconcileQueueDayById('1'), /injected write failure/); failure = null;
      assert.deepEqual(await day(), before); assert.equal(await revision(), undefined);
      assert.deepEqual((await pool.query('SELECT * FROM tickets')).rows, tickets);
      assert.deepEqual((await pool.query('SELECT * FROM queue_ticket_segments')).rows, segments);
      assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status, 'completed');
      assert.equal(await count('queue_events'), 0); assert.equal(await count('queue_notification_outbox'), 1);
    });
    await t.test('scheduled failure retains separate diagnostics and a later retry commits a revision', async () => {
      await overdue(); failure = 'INSERT INTO queue_events'; failOnce = true;
      assert.equal(await service.reconcileDueQueueDays(), 0);
      assert.equal((await day()).state, 'open'); assert.equal((await day()).reconciliation_attempt_count, 1);
      assert.equal(await revision(), '1');
      assert.deepEqual((await pool.query('SELECT event_type FROM queue_events')).rows, [{ event_type: 'queue_day_reconciliation_failed' }]);
      await service.reconcileQueueDayById('1'); assert.equal(await revision(), '2');
    });
    await t.test('unsafe and missing Queue Day identities reject without numeric-coercion writes', async () => {
      await overdue();
      await assert.rejects(service.reconcileQueueDayById('9007199254740993'), { code: 'QUEUE_IDENTITY_INVALID' });
      await assert.rejects(service.reconcileQueueDayById('999'), { code: 'QUEUE_DAY_NOT_FOUND' });
      assert.equal(await revision(), undefined); assert.equal(await count('queue_events'), 0);
    });
    await t.test('scheduled unsafe candidate skips diagnostic coercion and still processes valid candidates', async () => {
      await overdue();
      await pool.query(`INSERT INTO queue_days(id,tenant_id,location_id,business_date,state,intake_mode,initial_closes_at,current_closes_at)
        VALUES(9007199254740993,1,10,(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1,'open','accepting',
          clock_timestamp()-interval '1 hour',clock_timestamp()-interval '2 seconds')`);
      assert.equal(await service.reconcileDueQueueDays(), 1);
      const unsafe = (await pool.query('SELECT state,reconciliation_attempt_count FROM queue_days WHERE id=9007199254740993')).rows[0];
      assert.deepEqual(unsafe, { state: 'open', reconciliation_attempt_count: 0 });
      assert.equal(await revision(), '2');
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM queue_events WHERE event_type='queue_day_reconciliation_failed'")).rows[0].n, 0);
    });
    await t.test('tenant-first grant revocation can insert its branch FK while maintenance waits', async () => {
      await overdue(); const revoker = await pool.connect(); let pending;
      try {
        await revoker.query('BEGIN'); await revoker.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
        pending = service.reconcileQueueDayById('1'); pending.catch(() => {}); await waitForLock('FROM tenants');
        await revoker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
        await revoker.query("SET LOCAL lock_timeout='2s'"); await revoker.query('INSERT INTO tenant_membership_locations VALUES(1,10)');
        await revoker.query('COMMIT'); await pending;
      } finally { await revoker.query('ROLLBACK'); revoker.release(); if (pending) await pending.catch(() => {}); }
      assert.equal((await day()).state, 'closed'); assert.equal(await revision(), '2');
    });
    await t.test('unsupported oldest identities cannot starve a bounded valid reconciliation batch', async () => {
      await overdue();
      await pool.query(`INSERT INTO queue_days(id,tenant_id,location_id,business_date,state,intake_mode,initial_closes_at,current_closes_at)
        SELECT 9007199254740992+n,1,10,(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-n,'open','accepting',
          clock_timestamp()-interval '100 days',clock_timestamp()-n*interval '1 day' FROM generate_series(1,55) n`);
      assert.equal(await service.reconcileDueQueueDays(1), 1);
      assert.equal((await day()).state, 'closed'); assert.equal(await revision(), '2');
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM queue_days WHERE id>9007199254740991 AND state='open'")).rows[0].n, 55);
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM queue_events WHERE event_type='queue_day_reconciliation_failed'")).rows[0].n, 0);
    });
    await t.test('failure diagnostics do not follow a Queue Day moved after operational rollback', async () => {
      await overdue(); failure = 'INSERT INTO queue_events'; failOnce = true;
      afterRollback = async () => {
        await pool.query('UPDATE queue_days SET tenant_id=2,location_id=20 WHERE id=1');
      };
      assert.equal(await service.reconcileDueQueueDays(), 0);
      const moved = await day(); assert.equal(moved.state, 'open'); assert.equal(moved.reconciliation_attempt_count, 0);
      assert.equal(moved.last_reconciliation_error, null);
      assert.equal(await count('queue_events'), 0); assert.equal(await count('queue_notification_outbox'), 1);
      assert.equal(await revision(), '1');
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM resource_ledger_scopes WHERE tenant_id=2')).rows[0].n, 0);
    });
    await t.test('scope moved during a branch wait rolls back without touching either branch', async () => {
      await overdue(); const blocker = await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending = service.reconcileQueueDayById('1'); const denied = assert.rejects(pending, { code: 'QUEUE_SCOPE_CHANGED' });
        await waitForLock('FROM store_locations'); await blocker.query('UPDATE queue_days SET tenant_id=2,location_id=20 WHERE id=1');
        await blocker.query('COMMIT'); await denied;
      } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
      assert.equal((await day()).state, 'open'); assert.equal(await revision(), undefined); assert.equal(await count('queue_events'), 0);
    });
    await t.test('scoped reconciliation serializes intake behind the branch and commits one closure revision', async () => {
      await reset(); await pool.query("UPDATE queue_days SET current_closes_at=clock_timestamp()-interval '1 second' WHERE id=1");
      const held = hold('before'); const closing = service.reconcileQueueDayById('1'); closing.catch(() => {}); let pending;
      try {
        await Promise.race([held.entered, closing.then(() => assert.fail('pre-event barrier missing'))]);
        pending = run('pause'); const denied = assert.rejects(pending, { code: 'QUEUE_DAY_UNOPENED' });
        await waitForLock('FROM store_locations'); held.release(); await closing; await denied;
      } finally { held.release(); await closing.catch(() => {}); if (pending) await pending.catch(() => {}); }
      assert.equal((await day()).state, 'closed'); assert.equal(await count('queue_events'), 1);
      assert.equal(await revision(), '2');
    });
  } finally {
    eventBarrier = null; beforeEvent = null;
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end();
  }
});
