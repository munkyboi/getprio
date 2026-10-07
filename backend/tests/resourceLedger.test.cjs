const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { executeCommand, withScopeTransaction } = require('../src/repositories/resourceLedger');

const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
const fixtureSchema = `ledger_test_${randomUUID().replaceAll('-', '')}`;
let pool;
const scope = { tenantId: '1', locationId: '10', actorUserId: '1' };
function command(name, payload, operationKey = randomUUID()) {
  return executeCommand({ pool, ...scope, operationKey, command: name, payload });
}

// This is a dedicated disposable test database, never the application URL.
// Normal suite runs skip the real-Postgres cases until explicitly configured.
test('ledger validates scope and command before connecting', async () => {
  const forbiddenPool = { connect: () => assert.fail('must not connect') };
  await assert.rejects(executeCommand({ pool: forbiddenPool, ...scope, tenantId: '9223372036854775808', command: 'allocate', payload: { ticketId: '1' }, operationKey: 'invalid' }), /identifier/);
  await assert.rejects(executeCommand({ pool: forbiddenPool, ...scope, command: 'release', payload: { allocationId: '1', outcome: 'terminated' }, operationKey: 'invalid' }), /reason/);
  await assert.rejects(executeCommand({ pool: forbiddenPool, ...scope, command: 'allocate', payload: { ticketId: '1', units: 0 }, operationKey: 'invalid' }), /Unsupported/);
  await assert.rejects(withScopeTransaction({ pool: forbiddenPool, ...scope }, async () => {}), /authorization/);
  await assert.rejects(withScopeTransaction({ pool: forbiddenPool, ...scope, authorize: async () => true }, null), /callback/);
});

test('PostgreSQL resource ledger interface', { skip: !databaseUrl }, async (t) => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_ledger_test', '/getprio_test'].includes(url.pathname), 'Only explicit isolated/CI test databases are allowed');
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${fixtureSchema}`, max: 8 });
  const setup = await pool.connect();
  try {
    await setup.query(`CREATE SCHEMA ${fixtureSchema}`);
    await setup.query(`CREATE TABLE users(id BIGINT PRIMARY KEY);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY, tenant_id BIGINT, UNIQUE(id,tenant_id));
      CREATE TABLE location_resource_pools(id BIGINT PRIMARY KEY, tenant_id BIGINT, location_id BIGINT,
        capacity INTEGER, revision INTEGER, UNIQUE(id,tenant_id,location_id));
      CREATE TABLE service_resource_requirements(tenant_id BIGINT, location_id BIGINT, service_id BIGINT,
        pool_id BIGINT, units_required INTEGER, revision INTEGER);
      CREATE TABLE bookings(id BIGINT PRIMARY KEY, tenant_id BIGINT, location_id BIGINT, status TEXT,
        pending_expires_at TIMESTAMPTZ, payment_proof_object_key TEXT);
      CREATE TABLE booking_bundle_items(id BIGINT PRIMARY KEY, booking_id BIGINT, tenant_id BIGINT,
        location_id BIGINT, service_id BIGINT, scheduled_start_at TIMESTAMPTZ, scheduled_end_at TIMESTAMPTZ);
      CREATE TABLE tickets(id BIGINT PRIMARY KEY, tenant_id BIGINT, location_id BIGINT, status TEXT,
        join_channel TEXT, customer_confirmed_at TIMESTAMPTZ, UNIQUE(id,tenant_id,location_id));
      CREATE TABLE ticket_service_plans(ticket_id BIGINT PRIMARY KEY, tenant_id BIGINT, location_id BIGINT,
        booking_id BIGINT, source TEXT, items JSONB);`);
    await setup.query(fs.readFileSync(path.resolve(__dirname, '../../database/migrations/20261007_add_resource_ledger_foundation.sql'), 'utf8'));
  } finally { setup.release(); }
  async function reset(capacity = 4) {
    await pool.query(`TRUNCATE resource_ledger_commands,resource_allocations,resource_ledger_reservations,
      resource_ledger_scopes,ticket_service_plans,tickets,booking_bundle_items,bookings,
      service_resource_requirements,location_resource_pools,store_locations,users RESTART IDENTITY CASCADE`);
    await pool.query(`INSERT INTO users VALUES(1);
      INSERT INTO store_locations VALUES(10,1),(20,2);
      INSERT INTO location_resource_pools VALUES(100,1,10,${capacity},1),(200,2,20,4,1);
      INSERT INTO service_resource_requirements VALUES(1,10,1000,100,1,1)`);
  }
  async function ticket(ticketId, { units = 1, durationMinutes = 60, source = 'staff_selection', itemId, interval } = {}) {
    const item = { serviceId: '1000', durationMinutes, resource: { known: true,
      poolId: '100', poolRevision: 1, requirementRevision: 1, unitsRequired: units } };
    if (itemId) Object.assign(item, { bookingItemId: itemId,
      scheduledStartAt: interval.starts_at.toISOString(), scheduledEndAt: interval.ends_at.toISOString() });
    await pool.query("INSERT INTO tickets VALUES($1,1,10,'called','vendor',NULL)", [ticketId]);
    await pool.query('INSERT INTO ticket_service_plans VALUES($1,1,10,$2,$3,$4)',
      [ticketId, source === 'booking' ? '1' : null, source, JSON.stringify([item])]);
  }
  async function bookingItem(itemId, offset = -1, duration = 61) {
    await pool.query("INSERT INTO bookings VALUES(1,1,10,'confirmed',NULL,NULL) ON CONFLICT DO NOTHING");
    const result = await pool.query(`INSERT INTO booking_bundle_items VALUES($1,1,1,10,1000,
      clock_timestamp()+$2*interval '1 minute',clock_timestamp()+$3*interval '1 minute') RETURNING scheduled_start_at AS starts_at,scheduled_end_at AS ends_at`, [itemId, offset, duration]);
    return result.rows[0];
  }
  try {
    await t.test('five concurrent starts cannot exceed four courts', async () => {
      await reset();
      for (let i = 1; i <= 5; i++) await ticket(String(i));
      const starts = await Promise.allSettled([1,2,3,4,5].map(i => command('allocate', { ticketId: String(i) })));
      assert.equal(starts.filter(r => r.status === 'fulfilled').length, 4);
      assert.equal(starts.filter(r => r.status === 'rejected').length, 1);
      assert.equal((await pool.query('SELECT SUM(units)::int AS units FROM resource_allocations WHERE released_at IS NULL')).rows[0].units, 4);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_ledger_commands')).rows[0].count, 4);
    });
    await t.test('idempotent retry has one allocation/revision and changed payload conflicts', async () => {
      await reset(); await ticket('1'); await ticket('2');
      const original = await command('allocate', { ticketId: '1' }, 'start-1');
      assert.deepEqual(await command('allocate', { ticketId: '1' }, 'start-1'), original);
      await assert.rejects(command('allocate', { ticketId: '2' }, 'start-1'), /reused/);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision, '2');
    });
    await t.test('reservation/start contention and conversion count units once', async () => {
      await reset(1);
      const interval = await bookingItem('1'); await ticket('1', { source: 'booking', itemId: '1', interval });
      await ticket('2');
      const held = await command('reserve', { bookingItemId: '1' });
      await assert.rejects(command('allocate', { ticketId: '2' }), /capacity/);
      const started = await command('allocate', { ticketId: '1' });
      assert.equal(started.reservationId, held.reservationId);
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state, 'converted');
      await assert.rejects(command('cancelReservation', { reservationId: held.reservationId }), /protected/);
      await assert.rejects(command('allocate', { ticketId: '2' }), /capacity/);
    });
    await t.test('late booking allocation retains its protected end without implicit extension', async () => {
      await reset(); const interval = await bookingItem('1', -30, 30);
      await ticket('1', { source: 'booking', itemId: '1', interval, durationMinutes: 60 });
      await command('reserve', { bookingItemId: '1' });
      const started = await command('allocate', { ticketId: '1' });
      const allocation = (await pool.query('SELECT started_at,expected_end_at FROM resource_allocations WHERE id=$1', [started.allocationId])).rows[0];
      assert.equal(allocation.expected_end_at.toISOString(), interval.ends_at.toISOString());
      assert.ok(allocation.expected_end_at-allocation.started_at < 60*60000);
    });
    await t.test('new-key repeated allocation conflicts consistently before capacity or SQL uniqueness', async () => {
      for (const capacity of [1, 4]) {
        await reset(capacity); await ticket('1');
        const started = await command('allocate', { ticketId: '1' }, 'original');
        await assert.rejects(command('allocate', { ticketId: '1' }, 'different-key'), error =>
          error.statusCode === 409 && error.message === 'Ticket already has a resource allocation.');
        await command('release', { allocationId: started.allocationId, outcome: 'completed' });
        await assert.rejects(command('allocate', { ticketId: '1' }, 'after-release'), error =>
          error.statusCode === 409 && error.message === 'Ticket already has a resource allocation.');
        assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_allocations')).rows[0].count, 1);
      }
    });
    await t.test('overdue occupancy remains until explicit termination with reason', async () => {
      await reset(1); await ticket('1'); await ticket('2');
      const active = await command('allocate', { ticketId: '1' });
      await pool.query("UPDATE resource_allocations SET started_at=clock_timestamp()-interval '2 hours',expected_end_at=clock_timestamp()-interval '1 hour'");
      await assert.rejects(command('allocate', { ticketId: '2' }), /capacity/);
      await assert.rejects(command('release', { allocationId: active.allocationId, outcome: 'terminated' }), /reason/);
      const released = await command('release', { allocationId: active.allocationId, outcome: 'terminated', reason: 'Session stopped' }, 'finish-1');
      assert.deepEqual(await command('release', { allocationId: active.allocationId, outcome: 'terminated', reason: 'Session stopped' }, 'finish-1'), released);
      await command('allocate', { ticketId: '2' });
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_allocations WHERE released_at IS NULL')).rows[0].count, 1);
    });
    await t.test('protected overlapping intervals reject excess demand, adjacent intervals fit', async () => {
      await reset(1); await bookingItem('1', 5, 65); await bookingItem('2', 10, 70);
      const reserved = await command('reserve', { bookingItemId: '1' });
      await assert.rejects(command('reserve', { bookingItemId: '2' }), /capacity/);
      await pool.query('UPDATE booking_bundle_items SET scheduled_start_at=(SELECT ends_at FROM resource_ledger_reservations WHERE id=$1),scheduled_end_at=(SELECT ends_at FROM resource_ledger_reservations WHERE id=$1)+interval \'1 hour\' WHERE id=2', [reserved.reservationId]);
      await command('reserve', { bookingItemId: '2' });
    });
    await t.test('concurrent booking binding versus allocation has only one winner', async () => {
      await reset(1); await bookingItem('1'); await ticket('1');
      const result = await Promise.allSettled([command('reserve', { bookingItemId: '1' }), command('allocate', { ticketId: '1' })]);
      assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(result.filter(r => r.status === 'rejected').length, 1);
    });
    await t.test('single-item v1 accepts integer duration boundaries and rejects fractional/overflow plans', async () => {
      await reset();
      for (const [index, durationMinutes] of [4, 481, 5.5, 10080].entries()) {
        const ticketId = String(index + 1);
        await ticket(ticketId, { durationMinutes });
        await assert.rejects(command('allocate', { ticketId }), /single-item/);
      }
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_allocations')).rows[0].count, 0);
      for (const [ticketId, durationMinutes] of [['5', 5], ['6', 480]]) {
        await ticket(ticketId, { durationMinutes });
        const started = await command('allocate', { ticketId });
        const result = await pool.query('SELECT EXTRACT(EPOCH FROM expected_end_at-started_at)/60 AS minutes FROM resource_allocations WHERE id=$1', [started.allocationId]);
        assert.equal(Number(result.rows[0].minutes), durationMinutes);
      }
    });
    await t.test('scope, stale plan and unknown demand fail without writes', async () => {
      await reset(); await ticket('1');
      await assert.rejects(executeCommand({ pool, ...scope, locationId: '20', command: 'allocate', payload: { ticketId: '1' }, operationKey: 'wrong-scope' }), /Location/);
      await pool.query('UPDATE location_resource_pools SET revision=2 WHERE id=100');
      await assert.rejects(command('allocate', { ticketId: '1' }), /stale/);
      await pool.query('UPDATE ticket_service_plans SET items=\'[]\'');
      await assert.rejects(command('allocate', { ticketId: '1' }), /single-item/);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_allocations')).rows[0].count, 0);
    });
    await t.test('cancelled booking cannot convert, cancellation binding frees protection', async () => {
      await reset(1); const interval = await bookingItem('1');
      await ticket('1', { source: 'booking', itemId: '1', interval }); await ticket('2');
      const held = await command('reserve', { bookingItemId: '1' });
      await pool.query("UPDATE bookings SET status='cancelled'");
      await assert.rejects(command('allocate', { ticketId: '1' }), /Booking cannot/);
      await command('cancelReservation', { reservationId: held.reservationId });
      await command('allocate', { ticketId: '2' });
    });
    function domainTransaction(callback, authorize = async () => true) {
      return withScopeTransaction({ pool, ...scope, authorize }, callback);
    }
    await t.test('domain authorization runs under the location lock, including receipt replay', async () => {
      await reset(); await ticket('1');
      const original = await command('allocate', { ticketId: '1' }, 'authorized-start');
      let domainCalled = false;
      let checkedScope;
      await assert.rejects(domainTransaction(async () => { domainCalled = true; }, async (client, lockedScope) => {
        checkedScope = lockedScope;
        // A competing connection cannot acquire the location lock while the
        // domain authorizer is checking its server-owned actor/scope.
        const contender = await pool.connect();
        try {
          await contender.query('BEGIN');
          await assert.rejects(contender.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE NOWAIT'), { code: '55P03' });
          await contender.query('ROLLBACK');
        } finally { contender.release(); }
        assert.equal((await client.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision, original.revision);
        return false;
      }), { statusCode: 403 });
      assert.equal(domainCalled, false);
      assert.deepEqual(checkedScope, scope);
      await assert.rejects(domainTransaction(async (_client, ledger) => ledger.executeCommand({
        command: 'allocate', payload: { ticketId: '1' }, operationKey: 'authorized-start'
      }), async () => false), { statusCode: 403 });
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_allocations')).rows[0].count, 1);
    });
    await t.test('booking cancellation and binding cancellation commit together', async () => {
      await reset(1); await bookingItem('1');
      const held = await command('reserve', { bookingItemId: '1' });
      const result = await domainTransaction(async (client, ledger) => {
        await client.query("UPDATE bookings SET status='canceled' WHERE id=1");
        return ledger.executeCommand({ command: 'cancelReservation',
          payload: { reservationId: held.reservationId }, operationKey: 'cancel-booking' });
      });
      assert.equal(result.reservationId, held.reservationId);
      assert.equal((await pool.query('SELECT status FROM bookings WHERE id=1')).rows[0].status, 'canceled');
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state, 'cancelled');
    });
    await t.test('failed reservation replacement rolls back schedule, cancelled binding and receipt', async () => {
      await reset(1); await bookingItem('1');
      const held = await command('reserve', { bookingItemId: '1' });
      const before = (await pool.query('SELECT scheduled_start_at FROM booking_bundle_items WHERE id=1')).rows[0];
      await assert.rejects(domainTransaction(async (client, ledger) => {
        await ledger.executeCommand({ command: 'cancelReservation', payload: { reservationId: held.reservationId }, operationKey: 'replace-cancel' });
        await client.query("UPDATE booking_bundle_items SET scheduled_start_at=scheduled_start_at+interval '1 hour', scheduled_end_at=scheduled_end_at+interval '1 hour' WHERE id=1");
        // Unknown demand makes the replacement invalid. Catching the error must
        // still abort the whole domain transaction, including the cancellation.
        await client.query('DELETE FROM service_resource_requirements');
        await assert.rejects(ledger.executeCommand({ command: 'reserve', payload: { bookingItemId: '1' }, operationKey: 'replace-reserve' }), /unknown/);
      }), /unknown/);
      assert.deepEqual((await pool.query('SELECT scheduled_start_at FROM booking_bundle_items WHERE id=1')).rows[0], before);
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state, 'protected');
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_ledger_commands')).rows[0].count, 1);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision, held.revision);
    });
    await t.test('domain failure after conversion restores protected reservation and called ticket', async () => {
      await reset(1); const interval = await bookingItem('1');
      await ticket('1', { source: 'booking', itemId: '1', interval });
      const held = await command('reserve', { bookingItemId: '1' });
      await assert.rejects(domainTransaction(async (client, ledger) => {
        await ledger.executeCommand({ command: 'allocate', payload: { ticketId: '1' }, operationKey: 'start-domain' });
        await client.query("UPDATE tickets SET status='served' WHERE id=1");
        throw new Error('Timing writer failed');
      }), /Timing writer failed/);
      assert.equal((await pool.query('SELECT status FROM tickets')).rows[0].status, 'called');
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state, 'protected');
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_allocations')).rows[0].count, 0);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision, held.revision);
    });
    await t.test('completion and release commit together; domain failure preserves occupancy', async () => {
      await reset(); await ticket('1');
      const active = await command('allocate', { ticketId: '1' });
      const complete = async (client, ledger) => {
        await client.query("UPDATE tickets SET status='served' WHERE id=1");
        await ledger.executeCommand({ command: 'release', payload: { allocationId: active.allocationId, outcome: 'completed' }, operationKey: 'complete-domain' });
      };
      await assert.rejects(domainTransaction(async (client, ledger) => {
        await complete(client, ledger);
        throw new Error('Booking outcome failed');
      }), /Booking outcome failed/);
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at, null);
      assert.equal((await pool.query('SELECT status FROM tickets')).rows[0].status, 'called');
      await domainTransaction(complete);
      assert.ok((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at);
      assert.equal((await pool.query('SELECT status FROM tickets')).rows[0].status, 'served');
    });
    await t.test('escaped transaction capability cannot write after commit', async () => {
      await reset(); await ticket('1'); let escaped;
      await domainTransaction(async (_client, ledger) => { escaped = ledger; });
      await assert.rejects(escaped.executeCommand({ command: 'allocate', payload: { ticketId: '1' }, operationKey: 'escaped' }), /closed/);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_allocations')).rows[0].count, 0);
    });
    await t.test('unawaited command is drained and rolls back before connection release', async () => {
      await reset(); await ticket('1');
      await assert.rejects(domainTransaction(async (_client, ledger) => {
        void ledger.executeCommand({ command: 'allocate', payload: { ticketId: '1' }, operationKey: 'unawaited' });
      }), /awaited/);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_allocations')).rows[0].count, 0);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_ledger_scopes')).rows[0].count, 0);
    });
    await t.test('unawaited failing command is drained without committing domain writes', async () => {
      await reset();
      await assert.rejects(domainTransaction(async (client, ledger) => {
        await client.query("INSERT INTO bookings VALUES(1,1,10,'confirmed',NULL,NULL)");
        void ledger.executeCommand({ command: 'allocate', payload: { ticketId: '999' }, operationKey: 'unawaited-failure' });
      }), /awaited|Ticket not found/);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count, 0);
    });
    await t.test('concurrent commands poison the domain transaction even when the caller catches the conflict', async () => {
      await reset(); await ticket('1'); await ticket('2');
      await assert.rejects(domainTransaction(async (_client, ledger) => {
        const first = ledger.executeCommand({ command: 'allocate', payload: { ticketId: '1' }, operationKey: 'concurrent-1' });
        await assert.rejects(ledger.executeCommand({ command: 'allocate', payload: { ticketId: '2' }, operationKey: 'concurrent-2' }), /sequentially/);
        await first;
      }), /sequentially/);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_allocations')).rows[0].count, 0);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_ledger_commands')).rows[0].count, 0);
    });
    await t.test('competing start waits for the composed booking transaction to commit', async () => {
      await reset(1); await bookingItem('1'); await ticket('1');
      let unlockDomain;
      const domainGate = new Promise(resolve => { unlockDomain = resolve; });
      let bound;
      const bindingCreated = new Promise(resolve => { bound = resolve; });
      const bookingWrite = domainTransaction(async (client, ledger) => {
        await client.query("UPDATE bookings SET status='rescheduled' WHERE id=1");
        await ledger.executeCommand({ command: 'reserve', payload: { bookingItemId: '1' }, operationKey: 'composed-reserve' });
        bound();
        await domainGate;
      });
      await bindingCreated;
      const contender = command('allocate', { ticketId: '1' });
      // Make a separate NOWAIT probe instead of relying on a timing/sleep check.
      const probe = await pool.connect();
      try {
        await probe.query('BEGIN');
        await assert.rejects(probe.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE NOWAIT'), { code: '55P03' });
        await probe.query('ROLLBACK');
      } finally {
        probe.release();
        unlockDomain();
      }
      await bookingWrite;
      await assert.rejects(contender, /capacity/);
      assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status, 'rescheduled');
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_allocations')).rows[0].count, 0);
    });
    await t.test('database scope/release constraints and disabled coverage are enforced', async () => {
      await reset(); await ticket('1'); const active = await command('allocate', { ticketId: '1' });
      await assert.rejects(pool.query('UPDATE resource_ledger_scopes SET writer_coverage_complete=TRUE'), { code: '23514' });
      await assert.rejects(pool.query("UPDATE resource_allocations SET outcome='terminated',released_at=clock_timestamp(),reason=NULL WHERE id=$1", [active.allocationId]), { code: '23514' });
      await assert.rejects(pool.query('UPDATE resource_allocations SET tenant_id=2 WHERE id=$1', [active.allocationId]), { code: '23503' });
      await pool.query('DELETE FROM users WHERE id=1');
      assert.equal((await pool.query('SELECT actor_user_id FROM resource_ledger_commands')).rows[0].actor_user_id, null);
    });
  } finally {
    await pool.query(`DROP SCHEMA ${fixtureSchema} CASCADE`);
    await pool.end();
  }
});
