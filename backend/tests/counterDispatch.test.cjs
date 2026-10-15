const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const dispatch = require('../src/services/counterDispatchService');
const tickets = require('../src/repositories/tickets');
const { withVendorQueueTransaction } = require('../src/services/vendorQueueTransactionService');

const scope = { tenantId: '1', locationId: '10', dateKey: '20261012' };
const lane = id => ({ serviceCounter: id ? { _id: String(id) } : null });

test('dispatch advice distinguishes occupied, inactive, empty, closed and legacy lanes', () => {
  const counters = [{ _id: '1', slug: 'one', name: 'One', isActive: true },
    { _id: '2', slug: 'two', name: 'Two', isActive: true },
    { _id: '3', slug: 'three', name: 'Three', isActive: false }];
  const called = [{ id: '7', serviceCounterId: '1' }, { id: '8', serviceCounterId: null }];
  const advice = dispatch.buildCounterDispatch(counters, called, 1, true);
  assert.equal(advice[0].blockReason, 'COUNTER_OCCUPIED');
  assert.equal(advice[0].currentTicketId, '7');
  assert.equal(advice[1].canCallNext, true);
  assert.equal(advice[2].blockReason, 'COUNTER_INACTIVE');
  assert.equal(advice[3].currentTicketId, '8');
  assert.equal(advice[3].canCallNext, false);
  assert.equal(dispatch.buildCounterDispatch(counters, [], 0, true)[1].blockReason, 'NO_READY_WAITING_TICKET');
  assert.ok(dispatch.buildCounterDispatch(counters, called, 1, false).every(a => a.blockReason === 'QUEUE_DAY_CLOSED'));
});

test('called ticket projection retains the owning Queue Day for close warnings', () => {
  assert.equal(dispatch.formatCalledTicket({ _id: '1', currentQueueDayId: 'today' }).currentQueueDayId, 'today');
  assert.equal(dispatch.formatCalledTicket({ _id: '2' }).currentQueueDayId, null);
});

test('missing counter, unassigned dispatch and missing ticket fail before database work', async () => {
  const client = { query: () => assert.fail('must not query') };
  await assert.rejects(dispatch.claimNext(client, scope, {}), { code: 'COUNTER_REQUIRED' });
  await assert.rejects(dispatch.claimNext(client, scope, lane(null)), { code: 'COUNTER_REQUIRED' });
  await assert.rejects(dispatch.lockCurrent(client, scope, lane(1)), { code: 'CURRENT_TICKET_REQUIRED' });
});

const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
test('PostgreSQL counter dispatch uses vendor authorization and branch resource locks', { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_test', '/getprio_ledger_test'].includes(url.pathname));
  const schema = `counter_test_${randomUUID().replaceAll('-', '')}`;
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 8 });
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    // Reuse real bootstrap ticket constraints; dependencies are scoped fixture tables.
    const init = fs.readFileSync(path.resolve(__dirname, '../../database/init.sql'), 'utf8');
    const ticketTable = init.match(/CREATE TABLE tickets \([\s\S]*?\n\);/)[0]
      .replace(/ REFERENCES \w+\(id\) ON DELETE (?:CASCADE|SET NULL)/g, '');
    await pool.query(`CREATE TABLE tenants(id BIGINT PRIMARY KEY);
      CREATE TABLE users(id BIGINT PRIMARY KEY, roles TEXT[], display_name TEXT, deletion_requested_at TIMESTAMPTZ, platform_access_suspended_at TIMESTAMPTZ);
      CREATE TABLE tenant_memberships(user_id BIGINT,tenant_id BIGINT,role TEXT,is_active BOOLEAN);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT);
      CREATE TABLE service_counters(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,is_active BOOLEAN);
      CREATE TABLE resource_ledger_scopes(tenant_id BIGINT,location_id BIGINT,revision BIGINT DEFAULT 1,PRIMARY KEY(tenant_id,location_id));
      CREATE TABLE resource_allocations(id BIGINT PRIMARY KEY,ticket_id BIGINT,tenant_id BIGINT,location_id BIGINT,released_at TIMESTAMPTZ);
      CREATE TABLE queue_days(tenant_id BIGINT,location_id BIGINT,business_date DATE,state TEXT,current_closes_at TIMESTAMPTZ);
      CREATE TABLE bookings(id BIGINT PRIMARY KEY,queue_ticket_id BIGINT,tenant_id BIGINT,location_id BIGINT,reference TEXT,scheduled_start_at TIMESTAMPTZ,scheduled_end_at TIMESTAMPTZ,execution_mode TEXT);
      CREATE TABLE booking_bundle_items(id BIGINT,booking_id BIGINT,tenant_id BIGINT,location_id BIGINT,scheduled_start_at TIMESTAMPTZ,scheduled_end_at TIMESTAMPTZ,sort_order INT);
      ${ticketTable}
      ALTER TABLE tickets ADD queue_date_key TEXT, ADD original_queue_day_id BIGINT, ADD current_queue_day_id BIGINT,
        ADD status_reason TEXT, ADD pending_carry_over_since TIMESTAMPTZ, ADD carry_over_expires_at TIMESTAMPTZ,
        ADD carry_over_consumed BOOLEAN, ADD terminal_at TIMESTAMPTZ, ADD replacement_for_ticket_id BIGINT, ADD email_journey_mode TEXT;`);
    await pool.query(`INSERT INTO tenants VALUES(1),(2);
      INSERT INTO users VALUES(1,ARRAY['vendor'],NULL,NULL,NULL),(2,ARRAY['vendor'],NULL,NULL,NULL);
      INSERT INTO tenant_memberships VALUES(1,1,'owner',TRUE);
      INSERT INTO store_locations VALUES(10,1),(20,2);
      INSERT INTO service_counters VALUES(1,1,10,TRUE),(2,1,10,TRUE),(3,1,10,FALSE),(4,2,20,TRUE);`);
    const transact = (action, actorUserId = '1') => withVendorQueueTransaction({ pool,
      tenant: { _id: '1' }, location: { _id: '10' }, actorUserId, permission: 'tenant.queue.operate', lockTenantActivity: true }, action);
    const claim = id => transact(client => dispatch.claimNext(client, scope, lane(id)));
    const current = (id, ticketId) => transact(client => dispatch.lockCurrent(client, scope, { ...lane(id), ticketId }));
    const reset = async count => {
      await pool.query('TRUNCATE tickets,bookings,resource_ledger_scopes,resource_allocations RESTART IDENTITY');
      for (let i = 1; i <= count; i++) await pool.query(`INSERT INTO tickets(id,tenant_id,location_id,ticket_number,sequence,date_key,lookup_code,customer_name,join_channel,created_at)
        VALUES($1::bigint,1,10,$2,$1::int,'20261012',$3,'Customer','vendor',clock_timestamp()+$1::bigint*interval '1 millisecond')`, [i, `Q${i}`, String(i).padStart(8, '0')]);
    };
    await t.test('same counter has one winner and leaves the other customer waiting', async () => {
      await reset(2);
      const results = await Promise.allSettled([claim(1), claim(1)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.find(r => r.status === 'rejected').reason.code, 'COUNTER_OCCUPIED');
      assert.equal((await pool.query("SELECT COUNT(*)::int count FROM tickets WHERE status='called'")).rows[0].count, 1);
    });
    await t.test('different counters each call a distinct customer and allocate no resources', async () => {
      await reset(2);
      const results = await Promise.all([claim(1), claim(2)]);
      assert.equal(new Set(results.map(r => r._id)).size, 2);
      assert.deepEqual(new Set(results.map(r => r.serviceCounterId)), new Set(['1', '2']));
      assert.equal((await pool.query('SELECT COUNT(*)::int count FROM resource_allocations')).rows[0].count, 0);
      const all = await tickets.listCalledTickets('1', { ...scope, client: pool });
      assert.equal(all.length, 2);
    });
    await t.test('last waiting ticket has one winner across different counters', async () => {
      await reset(1);
      const results = await Promise.all([claim(1), claim(2)]);
      assert.equal(results.filter(Boolean).length, 1);
    });
    await t.test('scheduled bookings share eligibility rules with claim, without blocking ready walk-ins', async () => {
      await reset(2);
      await pool.query("INSERT INTO bookings VALUES(1,1,1,10,'BKG-FUTURE',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days','parallel')");
      assert.equal(await tickets.countReadyWaitingTickets('1', { ...scope, client: pool }), 1);
      assert.equal((await claim(1))._id, '2');
      await assert.rejects(claim(2), { code: 'NO_READY_WAITING_TICKET' });
      await pool.query("UPDATE bookings SET scheduled_start_at=clock_timestamp()-interval '1 minute'");
      assert.equal(await tickets.countReadyWaitingTickets('1', { ...scope, client: pool }), 1);
      assert.equal((await claim(2))._id, '1');
    });
    await t.test('wrong, stale, inactive and unassigned current targets never select another customer', async () => {
      await reset(2); await claim(1); await claim(2);
      assert.equal((await current(2, '2'))._id, '2');
      await assert.rejects(current(1, '2'), { code: 'CURRENT_TICKET_CHANGED' });
      await assert.rejects(current(null, '1'), { code: 'CURRENT_TICKET_CHANGED' });
      await pool.query("UPDATE tickets SET status='served' WHERE id=1");
      await assert.rejects(current(1, '1'), { code: 'CURRENT_TICKET_CHANGED' });
      await pool.query('UPDATE tickets SET service_counter_id=NULL WHERE id=2');
      assert.equal((await current(null, '2'))._id, '2');
      await pool.query('UPDATE tickets SET service_counter_id=3 WHERE id=2');
      assert.equal((await current(3, '2'))._id, '2');
      await assert.rejects(claim(3), { code: 'COUNTER_NOT_FOUND' });
      await assert.rejects(claim(4), { code: 'COUNTER_NOT_FOUND' });
    });
    await t.test('confirmation and resolution affect only the locked counter ticket, including stale retries', async () => {
      await reset(3); await claim(1); await claim(2);
      await transact(async client => {
        const selected = await dispatch.lockCurrent(client, scope, { ...lane(2), ticketId: '2' });
        await tickets.confirmCurrentCalledTicket('1', selected._id, { ...scope, client });
        await tickets.updateCurrentCalledTicketStatus('1', 'served', { ...scope, client, ticketId: selected._id });
      });
      const other = await current(1, '1');
      assert.equal(other.status, 'called');
      assert.equal(other.customerConfirmedAt, null);
      assert.equal((await claim(2))._id, '3');
      await assert.rejects(current(2, '2'), { code: 'CURRENT_TICKET_CHANGED' });
      assert.equal((await current(2, '3')).status, 'called');
    });
    await t.test('prior-day call occupies only its counter and resolves using its original day', async () => {
      await reset(3);
      await pool.query("UPDATE tickets SET status='called',service_counter_id=1,date_key='20261011',called_at=clock_timestamp()-interval '1 day' WHERE id=1");
      await assert.rejects(claim(1), { code: 'COUNTER_OCCUPIED' });
      assert.equal((await claim(2))._id, '2');
      const all = await tickets.listCalledTickets('1', { locationId: '10', client: pool });
      assert.deepEqual(all.map(ticket => ticket._id), ['1', '2']);
      assert.equal((await current(1, '1')).dateKey, '20261011');
      await assert.rejects(current(2, '1'), { code: 'CURRENT_TICKET_CHANGED' });
      await transact(async client => {
        const old = await dispatch.lockCurrent(client, scope, { ...lane(1), ticketId: '1' });
        await tickets.confirmCurrentCalledTicket('1', old._id, { client, locationId: '10', dateKey: old.dateKey });
        await tickets.updateCurrentCalledTicketStatus('1', 'served', { client, locationId: '10', dateKey: old.dateKey, ticketId: old._id });
      });
      assert.equal((await claim(1))._id, '3');
      await assert.rejects(current(1, '1'), { code: 'CURRENT_TICKET_CHANGED' });
      assert.equal((await current(2, '2')).status, 'called');
    });
    await t.test('dispatch advice rejects unopened, overdue and foreign Queue Days using database time', async () => {
      const days = require('../src/repositories/queueDays');
      const query = { client: pool };
      assert.equal(await days.isOpenForDispatch('1', '10', scope.dateKey, query), false);
      await pool.query("INSERT INTO queue_days VALUES(1,10,'2026-10-12','open',clock_timestamp()+interval '1 hour')");
      assert.equal(await days.isOpenForDispatch('1', '10', scope.dateKey, query), true);
      assert.equal(await days.isOpenForDispatch('2', '10', scope.dateKey, query), false);
      await pool.query("UPDATE queue_days SET current_closes_at=clock_timestamp()-interval '1 second'");
      assert.equal(await days.isOpenForDispatch('1', '10', scope.dateKey, query), false);
      await pool.query("UPDATE queue_days SET state='closed',current_closes_at=clock_timestamp()+interval '1 hour'");
      assert.equal(await days.isOpenForDispatch('1', '10', scope.dateKey, query), false);
    });
    await t.test('pooled lane excludes only actual scoped unreleased service allocations', async () => {
      await reset(5);
      await pool.query(`UPDATE tickets SET status='called',service_counter_id=1,
        service_started_at=clock_timestamp(),called_at=clock_timestamp() WHERE id<=4;
        INSERT INTO resource_allocations(id,ticket_id,tenant_id,location_id) VALUES
          (1,1,1,10),(2,2,1,10),(3,3,1,10),(4,4,1,10)`);
      const query = { client: pool, locationId:'10',serviceCounterId:'1' };
      assert.equal((await tickets.findCurrentCalledTicket('1',query))._id,'1');
      assert.equal(await tickets.findCurrentCalledTicket('1',{...query,excludeAllocatedService:true}),null);
      // Ordinary dispatch retains the legacy lane contract even with allocations.
      await assert.rejects(claim(1),{code:'COUNTER_OCCUPIED'});
      // Timing alone, another scope's allocation, or a released allocation cannot free a lane.
      await pool.query('DELETE FROM resource_allocations WHERE ticket_id=1');
      assert.equal((await tickets.findCurrentCalledTicket('1',{...query,excludeAllocatedService:true}))._id,'1');
      await pool.query('INSERT INTO resource_allocations VALUES(1,1,2,20,NULL)');
      assert.equal((await tickets.findCurrentCalledTicket('1',{...query,excludeAllocatedService:true}))._id,'1');
      await pool.query('UPDATE resource_allocations SET tenant_id=1,location_id=10,released_at=clock_timestamp() WHERE id=1');
      assert.equal((await tickets.findCurrentCalledTicket('1',{...query,excludeAllocatedService:true}))._id,'1');
      await pool.query("UPDATE resource_allocations SET released_at=NULL WHERE id=1; UPDATE tickets SET service_ended_at=clock_timestamp(),service_outcome='completed' WHERE id=1");
      assert.equal((await tickets.findCurrentCalledTicket('1',{...query,excludeAllocatedService:true}))._id,'1');
      assert.equal((await pool.query("SELECT status FROM tickets WHERE id=5")).rows[0].status,'waiting');
    });
    await t.test('revoked vendor access rejects before dispatch', async () => {
      await reset(1);
      await assert.rejects(transact(client => dispatch.claimNext(client, scope, lane(1)), '2'), { statusCode: 403 });
      assert.equal((await pool.query('SELECT status FROM tickets')).rows[0].status, 'waiting');
    });
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});
