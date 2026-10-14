const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');
const databaseUrl = process.env.ALLOWANCE_TEST_DATABASE_URL;

test('capacity reconciles current-cycle facts without mutating ledger or historical credits', { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/getprio_test');
  const schema = `usage_report_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema} -c timezone=UTC`, max: 4 });
  const period = { start: '2026-10-01T00:00:00Z', end: '2026-11-01T00:00:00Z' };
  const database = { pool, withTransaction: async callback => {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await callback({ query: (sql, values) => client.query(sql === 'SELECT CURRENT_TIMESTAMP AS now' ? "SELECT '2026-10-14T00:00:00Z'::timestamptz AS now" : sql, values) }); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } };
  const load = name => loadModuleWithMocks(require.resolve(`../src/repositories/${name}`), { '../config/db': database });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`
      CREATE TABLE tickets(id bigint PRIMARY KEY,tenant_id bigint,created_at timestamptz,
        email_journey_mode text DEFAULT 'not_eligible' CHECK(email_journey_mode IN ('not_eligible','metered','journey_exhausted')));
      CREATE TABLE bookings(id bigint PRIMARY KEY,tenant_id bigint,created_at timestamptz);
      CREATE TABLE usage_accounts(id bigint PRIMARY KEY,tenant_id bigint,resource_key text);
      CREATE TABLE subscription_allowance_periods(id bigint PRIMARY KEY,subscription_id bigint,period_start timestamptz,period_end timestamptz);
      CREATE TABLE allowance_operations(id bigint PRIMARY KEY,usage_account_id bigint,allowance_period_id bigint,
        operation_type text,subject_type text,subject_id text,signed_units integer);
      CREATE TABLE allowance_allocations(id bigint PRIMARY KEY,operation_id bigint,source_type text,allowance_period_id bigint,credit_lot_id bigint,units integer);
      CREATE TABLE usage_credit_lots(id bigint PRIMARY KEY,tenant_id bigint,resource_key text,granted_units integer,
        revoked_units integer DEFAULT 0,frozen_units integer DEFAULT 0,source_type text,status text,expires_at timestamptz,created_at timestamptz);
      CREATE TABLE allowance_warning_claims(id bigint PRIMARY KEY,usage_account_id bigint,allowance_period_id bigint,
        threshold_percent integer,claimed_at timestamptz,delivered_at timestamptz);
      CREATE TABLE queue_email_journeys(id bigserial PRIMARY KEY,tenant_id bigint,ticket_id bigint UNIQUE,mode text CHECK(mode IN ('metered','journey_exhausted')));
      CREATE TABLE queue_email_slots(id bigserial PRIMARY KEY,journey_id bigint,slot_key text,status text DEFAULT 'unused',
        logical_message_key text,queued_at timestamptz,sent_at timestamptz,failed_at timestamptz,UNIQUE(journey_id,slot_key));
      CREATE TABLE usage_credit_packs(id bigint PRIMARY KEY,code text,state text,current_revision integer,updated_at timestamptz);
      CREATE TABLE usage_credit_pack_revisions(id bigserial PRIMARY KEY,pack_id bigint,revision integer,ticket_units integer,
        journey_units integer,price_cents integer,currency text,reason text,UNIQUE(pack_id,revision));
      CREATE TABLE usage_credit_purchases(id bigint PRIMARY KEY,pack_revision_id bigint,ticket_units integer,journey_units integer,amount_cents integer);
      INSERT INTO tickets(id,tenant_id,created_at) VALUES(1,5,'2026-10-01'),(2,5,'2026-10-02'),(3,5,'2026-10-03'),(4,5,'2026-10-04'),
        (5,6,'2026-10-05'),(6,5,'2026-09-30'),(7,5,'2026-11-01');
      INSERT INTO bookings VALUES(10,5,'2026-10-01'),(11,5,'2026-10-02');
      INSERT INTO usage_accounts VALUES(1,5,'queueTickets'),(2,5,'serviceBookings');
      INSERT INTO subscription_allowance_periods VALUES(1,5,'2026-10-01','2026-11-01'),(2,99,'2026-10-01','2026-11-01');
      INSERT INTO allowance_operations VALUES(1,1,1,'consume','queue_ticket','1',1),(2,1,1,'baseline','queue_ticket','2',1),
        (3,1,1,'consume','queue_ticket','3',1),(4,1,2,'consume','queue_ticket','4',50),
        (5,2,1,'consume','service_booking','10',1),(6,2,1,'reversal','service_booking','10',-1);
      INSERT INTO allowance_allocations VALUES(1,1,'base',1,NULL,1),(2,2,'base',1,NULL,1),(3,3,'credit',NULL,1,1),
        (4,4,'base',2,NULL,50),(5,5,'base',1,NULL,1),(6,6,'base',1,NULL,1);
      INSERT INTO usage_credit_lots VALUES(1,5,'queueTickets',100,0,0,'purchased','active',NULL,NOW()),
        (2,5,'queueEmailJourneys',100,0,0,'purchased','active',NULL,NOW());
      INSERT INTO usage_credit_packs VALUES(1,'P100','enabled',1,NOW()),(2,'P500','archived',1,NOW());
      INSERT INTO usage_credit_pack_revisions(pack_id,revision,ticket_units,journey_units,price_cents,currency) VALUES(1,1,100,100,9900,'PHP'),(2,1,500,500,39900,'PHP');
      INSERT INTO usage_credit_purchases VALUES(1,1,100,100,9900);`);
    const before = (await pool.query('SELECT * FROM allowance_operations ORDER BY id')).rows;
    const service = loadModuleWithMocks(require.resolve('../src/services/usageCreditService'), {
      '../config/db': database, '../repositories/usageCredits': load('usageCredits'),
      '../repositories/allowanceLedger': load('allowanceLedger'), '../repositories/subscriptionUsage': load('subscriptionUsage'),
      './entitlementResolver': { resolveTenantPolicy: async (_id, options) => {
        assert.equal(options.controls.entitlementResolverShadow, false);
        return { lifecycle: { state: 'active', planSlug: 'pro', subscriptionId: '5' }, period,
          allowances: { queueTickets: { limit: 5000 }, serviceBookings: { limit: 1000 } } };
      } }
    });
    await t.test('half-open window, tenant/subscription scope, baseline, credits and reversals', async () => {
      const result = await service.getTenantCapacity('5');
      assert.equal(result.resources.queueTickets.used, 3);
      assert.equal(result.resources.queueTickets.observedUsed, 4);
      assert.equal(result.resources.queueTickets.creditUsed, 1);
      assert.equal(result.resources.queueTickets.unaccountedUsed, 1);
      assert.equal(result.resources.serviceBookings.used, 1);
      assert.equal(result.resources.serviceBookings.baseUsed, 0);
      assert.equal(result.lots.length, 1);
      assert.equal(result.resources.queueTickets.creditRemaining, 99);
      assert.deepEqual((await pool.query('SELECT * FROM allowance_operations ORDER BY id')).rows, before);
    });
    await t.test('rolled back admission does not appear as usage', async () => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); await client.query("INSERT INTO tickets(id,tenant_id,created_at) VALUES(8,5,'2026-10-05')"); await client.query('ROLLBACK'); }
      finally { client.release(); }
      assert.equal((await service.getTenantCapacity('5')).resources.queueTickets.observedUsed, 4);
    });
    await t.test('retained SQL microseconds do not detach accounting from the policy Date window', async () => {
      await pool.query("UPDATE subscription_allowance_periods SET period_start=period_start+interval '456 microseconds',period_end=period_end+interval '456 microseconds' WHERE id=1");
      const result = await service.getTenantCapacity('5');
      assert.equal(result.resources.queueTickets.used, 3);
      assert.equal(result.resources.queueTickets.baseUsed, 2);
      assert.equal(result.resources.queueTickets.unaccountedUsed, 1);
      assert.equal(result.resources.serviceBookings.used, 1);
    });
    await t.test('retirement migration appends revisions idempotently and preserves purchased terms', async () => {
      const sql = fs.readFileSync(path.resolve(__dirname, '../../database/migrations/20261014_retire_queue_email_quotas.sql'), 'utf8');
      await pool.query(sql); await pool.query(sql);
      assert.deepEqual((await pool.query('SELECT ticket_units,journey_units,price_cents,currency FROM usage_credit_pack_revisions WHERE pack_id=1 ORDER BY revision')).rows,
        [{ ticket_units: 100, journey_units: 100, price_cents: 9900, currency: 'PHP' }, { ticket_units: 100, journey_units: 0, price_cents: 9900, currency: 'PHP' }]);
      assert.deepEqual((await pool.query('SELECT state,current_revision FROM usage_credit_packs WHERE id=2')).rows[0], { state: 'archived', current_revision: 1 });
      assert.equal((await pool.query('SELECT journey_units FROM usage_credit_pack_revisions WHERE pack_id=2')).rows[0].journey_units, 500);
      assert.equal((await pool.query('SELECT journey_units FROM usage_credit_purchases')).rows[0].journey_units, 100);
      assert.equal((await pool.query("SELECT granted_units FROM usage_credit_lots WHERE resource_key='queueEmailJourneys'")).rows[0].granted_units, 100);
      await pool.query("UPDATE tickets SET email_journey_mode='unmetered' WHERE id=1");
    });
    await t.test('cycle scans can use tenant and creation-time indexes', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL enable_seqscan=off');
        for (const table of ['tickets', 'bookings']) {
          const result = await client.query(`EXPLAIN SELECT id FROM ${table} WHERE tenant_id=$1 AND created_at >= $2 AND created_at < $3`, ['5', period.start, period.end]);
          assert.match(result.rows.map(row => row['QUERY PLAN']).join('\n'), new RegExp(`${table}_tenant_created_at_idx`));
        }
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await t.test('historically exhausted journey delivers once, retries failures and deduplicates concurrent calls', async () => {
      const journeys = loadModuleWithMocks(require.resolve('../src/services/queueEmailJourneyService'), { '../config/db': database });
      await pool.query("INSERT INTO queue_email_journeys(ticket_id,mode) VALUES(1,'journey_exhausted')");
      let sent = 0;
      await assert.rejects(journeys.withLifecycleSlot('1', 'called', 'called:1', async () => { throw new Error('provider unavailable'); }), /provider unavailable/);
      const results = await Promise.all(Array.from({ length: 5 }, () => journeys.withLifecycleSlot('1', 'called', 'called:1', async () => { sent++; return true; })));
      assert.equal(sent, 1);
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal((await pool.query("SELECT status FROM queue_email_slots WHERE slot_key='called'")).rows[0].status, 'sent');
    });
    await t.test('legacy ticket without a journey retries failures and deduplicates concurrent lifecycle calls', async () => {
      const journeys = loadModuleWithMocks(require.resolve('../src/services/queueEmailJourneyService'), { '../config/db': database });
      assert.equal((await pool.query('SELECT count(*)::integer AS count FROM queue_email_journeys WHERE ticket_id=2')).rows[0].count, 0);
      await assert.rejects(journeys.withLifecycleSlot('2', 'near_turn', 'near:2', async () => { throw new Error('provider unavailable'); }), /provider unavailable/);
      let sent = 0;
      const results = await Promise.all(Array.from({ length: 5 }, () => journeys.withLifecycleSlot('2', 'near_turn', 'near:2', async () => { sent++; return true; })));
      assert.equal(sent, 1);
      assert.equal(results.filter(Boolean).length, 1);
      assert.deepEqual((await pool.query('SELECT tenant_id,mode FROM queue_email_journeys WHERE ticket_id=2')).rows, [{ tenant_id: '5', mode: 'unmetered' }]);
      assert.equal(await journeys.withLifecycleSlot('2', 'near_turn', 'near:2', async () => { sent++; return true; }), false);
      assert.equal(sent, 1);
    });
    await t.test('simultaneous first deliveries create one legacy journey and never deliver for missing tickets', async () => {
      const journeys = loadModuleWithMocks(require.resolve('../src/services/queueEmailJourneyService'), { '../config/db': database });
      let sent = 0;
      const results = await Promise.all(Array.from({ length: 5 }, () => journeys.withLifecycleSlot('3', 'called', 'called:3', async () => { sent++; return true; })));
      assert.equal(sent, 1);
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal((await pool.query('SELECT count(*)::integer AS count FROM queue_email_journeys WHERE ticket_id=3')).rows[0].count, 1);
      assert.equal(await journeys.withLifecycleSlot('999', 'called', 'called:999', async () => { sent++; return true; }), false);
      assert.equal(sent, 1);
    });
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
});
