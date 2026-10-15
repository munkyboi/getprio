const test = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('../src/repositories/resourceLedger');
const sessions = require('../src/services/serviceResourceSessionService');
const timing = require('../src/repositories/serviceTiming');
const { mkdtemp, readFile, stat, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const exec = promisify(execFile);

test('local fixture rejects non-loopback, existing app names and connection overrides before connecting', async () => {
  const { validateAdminUrl } = await import('../../scripts/local-four-court-demo.mjs');
  for (const url of ['postgresql://postgres@localhost/getprio_test', 'postgresql://postgres@192.0.2.1/getprio_test',
    'postgresql://postgres@127.0.0.1/getprio', 'postgresql://postgres@127.0.0.1/getprio_test?hostaddr=192.0.2.1']) {
    assert.throws(() => validateAdminUrl(url), /loopback/);
  }
});

const adminUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
test('full local fixture CLI writes exclusive private credentials without leaking them to stdout', { skip: !adminUrl, timeout: 90000 }, async t => {
  const { validateAdminUrl } = await import('../../scripts/local-four-court-demo.mjs');
  validateAdminUrl(adminUrl);
  const directory = await mkdtemp(path.join(tmpdir(), 'four-court-cli-'));
  let databaseName;
  t.after(async () => {
    if (databaseName) {
      assert.match(databaseName, /^getprio_local_pool_demo_[a-f0-9]{32}$/u);
      const { Pool } = require('pg');
      const root = new Pool({ connectionString: adminUrl });
      try { await root.query(`DROP DATABASE "${databaseName}"`); } finally { await root.end(); }
    }
    await rm(directory, { recursive: true, force: true });
  });
  const output = path.join(directory, 'private.json');
  const args = [path.resolve(__dirname, '../../scripts/local-four-court-demo.mjs'), output];
  const env = { ...process.env, LOCAL_POOL_DEMO_ADMIN_URL: adminUrl };
  const result = await exec(process.execPath, args, { env });
  const bytes = await readFile(output);
  const artifact = JSON.parse(bytes);
  databaseName = artifact.databaseName;
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  assert.equal(artifact.tenantSlug, 'vd-sports-club');
  assert.equal(artifact.locationSlug, 'demo-courts');
  assert.equal(artifact.counterSlug, 'court-dispatch');
  assert.equal(artifact.fixture.ticketIds.length, 8);
  // Use the actual configuration and notification implementation in a fresh
  // process; EMAIL_PROVIDER is not an application transport selector.
  const { disabledProviderKeys } = await import('../../scripts/local-four-court-demo.mjs');
  const verifyConsole = `const assert=require('node:assert/strict');
    const env=require('./backend/src/config/env');
    for(const key of ['resendApiKey','sendgridApiKey','smtpHost','smtpUser','smtpPass','smsAccountSid','smsAuthToken','fcmProjectId','fcmSandboxProjectId','paymongoSecretKey']) assert.ok(!env[key]);
    global.fetch=()=>{throw new Error('External network forbidden');};
    let fallback=0; console.log=(tag)=>{if(tag==='[email-fallback]')fallback++;};
    require('./backend/src/services/notificationService').sendEmail({to:'local@example.test',subject:'Local fixture',text:'Fixture transport check'})
      .then(ok=>{assert.equal(ok,true);assert.equal(fallback,1);}).catch(()=>{process.exitCode=1;});`;
  await exec(process.execPath, ['-e', verifyConsole], { cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, ...Object.fromEntries(disabledProviderKeys.map(key => [key, 'inherited-provider-must-not-survive'])), ...artifact.env } });
  for (const secret of [artifact.databaseUrl, artifact.admin.email, artifact.admin.password, artifact.admin.totpSecret, artifact.env.JWT_SECRET]) {
    assert.ok(!result.stdout.includes(secret));
    assert.ok(!result.stderr.includes(secret));
  }
  await assert.rejects(exec(process.execPath, args, { env }));
  assert.equal(createHash('sha256').update(await readFile(output)).digest('hex'), createHash('sha256').update(bytes).digest('hex'));
});

test('full disposable local four-court fixture exercises real PostgreSQL ledger/session capacity', { skip: !adminUrl, timeout: 90000 }, async t => {
  const { createFourCourtDemo } = await import('../../scripts/local-four-court-demo.mjs');
  const demo = await createFourCourtDemo({ adminUrl });
  t.after(() => demo.cleanup());
  const { pool, fixture: f } = demo;
  const scope = { pool, tenantId: f.tenantId, locationId: f.locationId, actorUserId: f.actorUserId,
    // Explicit fixture authorization only; not authenticated HTTP/RBAC acceptance.
    authorize: async (client, current) => (await client.query(`SELECT 1 FROM public.local_pool_demo_scopes
      WHERE tenant_id=$1 AND location_id=$2 AND fixture_key='four-court-v1'`, [current.tenantId, current.locationId])).rowCount === 1 };
  async function readTicket(client, id) {
    const row = (await client.query('SELECT * FROM tickets WHERE id=$1 AND tenant_id=$2 AND location_id=$3 FOR UPDATE', [id, f.tenantId, f.locationId])).rows[0];
    return { _id: String(row.id), tenantId: String(row.tenant_id), locationId: String(row.location_id),
      status: row.status, joinChannel: row.join_channel, customerConfirmedAt: row.customer_confirmed_at,
      serviceStartedAt: row.service_started_at, serviceEndedAt: row.service_ended_at, serviceOutcome: row.service_outcome };
  }
  async function start(id) {
    return ledger.withScopeTransaction(scope, async (client, domain) => {
      const ticket = await readTicket(client, id);
      const state = await sessions.readState(client, ticket);
      assert.equal(state.required, true);
      const allocationId = await sessions.allocate(domain, ticket, state);
      await timing.start(ticket, f.actorUserId, client, allocationId);
      return { ticketId: id, allocationId };
    });
  }
  async function finish(id, outcome) {
    return ledger.withScopeTransaction(scope, async (client, domain) => {
      const ticket = await readTicket(client, id);
      const state = await sessions.readState(client, ticket);
      const allocationId = await sessions.release(domain, ticket, state, outcome);
      await timing.finish(ticket, outcome, f.actorUserId, client, allocationId);
      sessions.assertFinished(await sessions.readState(client, ticket), outcome);
    });
  }
  async function held() {
    return (await pool.query('SELECT COUNT(*)::int AS sessions,COALESCE(SUM(units),0)::int AS units FROM resource_allocations WHERE released_at IS NULL')).rows[0];
  }
  const marker = (await pool.query('SELECT * FROM public.local_pool_demo_scopes')).rows[0];
  assert.equal(marker.fixture_key, 'four-court-v1');
  assert.equal((await pool.query('SELECT writer_coverage_complete FROM resource_ledger_scopes')).rows[0].writer_coverage_complete, false);
  await assert.rejects(pool.query('UPDATE resource_ledger_scopes SET writer_coverage_complete=TRUE'), error => error.code === '23514');
  // Fixture preconditions only. Queue owns real claim/confirmation dispatch acceptance.
  await pool.query("UPDATE tickets SET status='called',called_at=clock_timestamp(),service_counter_id=$1", [f.counterId]);
  const attempts = await Promise.allSettled(f.ticketIds.slice(0, 5).map(start));
  const accepted = attempts.filter(result => result.status === 'fulfilled').map(result => result.value);
  const rejected = attempts.map((result, index) => ({ result, id: f.ticketIds[index] })).filter(({ result }) => result.status === 'rejected');
  assert.equal(accepted.length, 4);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].result.reason.statusCode, 409);
  assert.match(rejected[0].result.reason.message, /capacity/);
  assert.deepEqual(await held(), { sessions: 4, units: 4 });
  assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM tickets WHERE service_started_at IS NOT NULL AND service_ended_at IS NULL')).rows[0].count, 4);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM resource_ledger_commands')).rows[0].count, 4);
  // Expired expected ends never implicitly free actual occupancy.
  await pool.query("UPDATE resource_allocations SET started_at=clock_timestamp()-interval '2 hours',expected_end_at=clock_timestamp()-interval '1 hour' WHERE released_at IS NULL");
  await assert.rejects(start(rejected[0].id), /capacity/);
  assert.deepEqual(await held(), { sessions: 4, units: 4 });
  await finish(accepted[0].ticketId, 'completed');
  assert.deepEqual(await held(), { sessions: 3, units: 3 });
  const replacement = await start(rejected[0].id);
  assert.deepEqual(await held(), { sessions: 4, units: 4 });
  await finish(accepted[1].ticketId, 'interrupted');
  const sixth = await start(f.ticketIds[5]);
  assert.deepEqual(await held(), { sessions: 4, units: 4 });
  const outcomes = (await pool.query('SELECT outcome,reason FROM resource_allocations WHERE released_at IS NOT NULL ORDER BY id')).rows;
  assert.equal(outcomes[0].outcome, 'completed');
  assert.equal(outcomes[1].outcome, 'terminated');
  assert.ok(outcomes[1].reason.length > 0);
  for (const id of [accepted[2].ticketId, accepted[3].ticketId, replacement.ticketId, sixth.ticketId]) await finish(id, 'completed');
  assert.deepEqual(await held(), { sessions: 0, units: 0 });

  await t.test('protected reservation converts once into actual session occupancy', async () => {
    const booking = (await pool.query(`INSERT INTO bookings(reference,tenant_id,location_id,service_id,customer_name,
      scheduled_start_at,scheduled_end_at,status,notify_by_email,queue_ticket_id)
      VALUES('BKG-LOCAL-PROTECTED',$1,$2,$3,'Local booking fixture',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '59 minutes','confirmed',FALSE,$4)
      RETURNING id::text,scheduled_start_at,scheduled_end_at`, [f.tenantId, f.locationId, f.serviceId, f.ticketIds[6]])).rows[0];
    const item = (await pool.query(`INSERT INTO booking_bundle_items(booking_id,tenant_id,location_id,service_id,service_name_snapshot,service_slug_snapshot,
      scheduled_start_at,scheduled_end_at,booking_quantity,price_amount_cents,currency)
      VALUES($1,$2,$3,$4,'Local protected court','one-court-session',$5,$6,1,0,'PHP') RETURNING id::text`,
    [booking.id, f.tenantId, f.locationId, f.serviceId, booking.scheduled_start_at, booking.scheduled_end_at])).rows[0];
    const frozen = [{ serviceId: f.serviceId, bookingItemId: item.id, durationMinutes: 60,
      scheduledStartAt: booking.scheduled_start_at.toISOString(), scheduledEndAt: booking.scheduled_end_at.toISOString(),
      resource: { known: true, poolId: f.poolId, poolRevision: 1, requirementRevision: 1, unitsRequired: 1 } }];
    await pool.query("UPDATE ticket_service_plans SET source='booking',booking_id=$1,items=$2 WHERE ticket_id=$3", [booking.id, JSON.stringify(frozen), f.ticketIds[6]]);
    const reserved = await ledger.withScopeTransaction(scope, (_client, domain) => domain.executeCommand({ operationKey: 'local:protect', command: 'reserve', payload: { bookingItemId: item.id } }));
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM resource_ledger_reservations WHERE state='protected'")).rows[0].count, 1);
    const active = await start(f.ticketIds[6]);
    assert.deepEqual(await held(), { sessions: 1, units: 1 });
    assert.equal((await pool.query('SELECT reservation_id::text FROM resource_allocations WHERE id=$1', [active.allocationId])).rows[0].reservation_id, reserved.reservationId);
    assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations WHERE id=$1', [reserved.reservationId])).rows[0].state, 'converted');
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM resource_ledger_reservations WHERE state='protected'")).rows[0].count, 0);
    await finish(f.ticketIds[6], 'completed');
    assert.deepEqual(await held(), { sessions: 0, units: 0 });
  });
});
