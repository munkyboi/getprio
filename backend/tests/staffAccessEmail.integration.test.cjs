const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Opt-in only: creates and removes its own schema on a localhost database.
test('staff email transactions and workers on PostgreSQL', { skip: process.env.RUN_STAFF_EMAIL_DB_TESTS !== 'true' }, async t => {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
  const env = require('../src/config/env');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.databaseUrl).hostname), 'Only a local database is allowed');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: env.databaseUrl, max: 5, connectionTimeoutMillis: 3000 });
  const schema = 'staff_email_test_' + randomUUID().replaceAll('-', '');
  const database = { async withTransaction(callback) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } };
  const query = (sql, values) => database.withTransaction(client => client.query(sql, values));
  const users = require('../src/repositories/users');
  const locations = require('../src/repositories/tenantMembershipLocations');
  const { createStaffAccessEmailService } = require('../src/services/staffAccessEmailService');
  const { createWorker } = require('../src/services/staffAccessEmailWorker');
  const service = createStaffAccessEmailService({ database, userRepository: users, locationRepository: locations });
  const context = { tenant: { _id: '1', name: 'Test Studio' }, userId: '2', actorId: '3' };
  const add = options => users.addTenantMembership('2', '1', 'staff', options);
  async function reset() {
    await query('TRUNCATE staff_access_email_outbox, tenant_membership_locations, tenant_memberships, oauth_accounts, store_locations, users, tenants RESTART IDENTITY CASCADE');
    await query(`INSERT INTO tenants VALUES (1), (99);
      INSERT INTO users(id,name,email,email_verified) VALUES (2,'Member','member@example.test',TRUE), (3,'Owner','owner@example.test',TRUE), (4,'Other owner','other@example.test',TRUE);
      INSERT INTO tenant_memberships(user_id,tenant_id,role,is_active) VALUES (3,1,'owner',TRUE), (4,99,'owner',TRUE);
      INSERT INTO store_locations VALUES (10,1,TRUE), (11,1,TRUE), (99,99,TRUE)`);
  }
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await query(`CREATE TABLE tenants(id BIGINT PRIMARY KEY);
      CREATE TABLE users (LIKE public.users INCLUDING DEFAULTS);
      ALTER TABLE users ADD PRIMARY KEY(id);
      CREATE TABLE oauth_accounts(user_id BIGINT, provider TEXT, provider_user_id TEXT, email TEXT, email_verified BOOLEAN, linked_at TIMESTAMPTZ);
      CREATE TABLE tenant_memberships(id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id), tenant_id BIGINT REFERENCES tenants(id), role TEXT, is_active BOOLEAN, UNIQUE(user_id,tenant_id));
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY, tenant_id BIGINT, is_active BOOLEAN);
      CREATE TABLE tenant_membership_locations(tenant_membership_id BIGINT REFERENCES tenant_memberships(id) ON DELETE CASCADE, location_id BIGINT, assignment_source TEXT, assigned_by_user_id BIGINT, UNIQUE(tenant_membership_id,location_id))`);
    await query(fs.readFileSync(path.resolve(__dirname, '../../database/migrations/20260912_add_staff_access_email_outbox.sql'), 'utf8'));

    await t.test('concurrent repeated additions persist just one notice', async () => {
      await reset();
      await Promise.all([service.change(context, add), service.change(context, add), service.change(context, add)]);
      const { rows } = await query('SELECT * FROM staff_access_email_outbox');
      assert.equal(rows.length, 1); assert.equal(rows[0].recipient_email, 'member@example.test');
      assert.equal(rows[0].payload.email.resendTemplate.id, 'getprio-vendor-staff-added');
      assert.equal(rows[0].payload.email.html, undefined);
    });

    await t.test('invalid cross-tenant location rolls back access edits and produces no new intent', async () => {
      await reset(); await service.change(context, add);
      await assert.rejects(service.change(context, async options => {
        await users.updateTenantMembershipRole('2', '1', 'admin', options);
        await locations.replaceUserLocationAssignments({ userId: '2', tenantId: '1', locationIds: ['99'], assignedByUserId: '3' }, options);
      }), /invalid/);
      assert.equal((await query('SELECT role FROM tenant_memberships WHERE user_id = 2')).rows[0].role, 'staff');
      assert.equal((await query('SELECT * FROM staff_access_email_outbox')).rows.length, 1);
    });

    await t.test('notification persistence failure rolls back both membership and partial recipient intents', async () => {
      await reset();
      await query("ALTER TABLE staff_access_email_outbox ADD CONSTRAINT simulate_notification_failure CHECK (audience <> 'owner')");
      try {
        await assert.rejects(service.change({ ...context, actorId: '8' }, add), /simulate_notification_failure/);
        assert.equal((await query('SELECT * FROM tenant_memberships WHERE user_id = 2')).rows.length, 0);
        assert.equal((await query('SELECT * FROM staff_access_email_outbox')).rows.length, 0);
      } finally { await query('ALTER TABLE staff_access_email_outbox DROP CONSTRAINT simulate_notification_failure'); }
    });

    await t.test('uncommitted access changes cannot be delivered; concurrent workers claim once', async () => {
      await reset();
      let releaseMutation; const gate = new Promise(resolve => { releaseMutation = resolve; });
      let mutationReached; const reached = new Promise(resolve => { mutationReached = resolve; });
      const change = service.change(context, async options => { await add(options); mutationReached(); await gate; });
      await reached;
      let sent = 0;
      const worker = createWorker({ database, enabled: () => true, sendEmail: async () => { sent++; return true; } });
      try { await worker.runOnce(); assert.equal(sent, 0); } finally { releaseMutation(); }
      await change;
      let releaseSend; const sendingGate = new Promise(resolve => { releaseSend = resolve; });
      let sendReached; const sending = new Promise(resolve => { sendReached = resolve; });
      const workerA = createWorker({ database, enabled: () => true, sendEmail: async () => { sent++; sendReached(); await sendingGate; return true; } });
      const dispatch = workerA.runOnce(); await sending;
      try { await worker.runOnce(); assert.equal(sent, 1); } finally { releaseSend(); }
      await dispatch;
      assert.equal((await query('SELECT status FROM staff_access_email_outbox')).rows[0].status, 'sent');
    });

    await t.test('removed member remains eligible while former owner and another tenant receive nothing', async () => {
      await reset(); await service.change(context, add);
      await query("UPDATE staff_access_email_outbox SET status = 'sent'");
      await service.change({ ...context, actorId: '8' }, options => users.removeTenantMembership('2', '1', options));
      await query("UPDATE tenant_memberships SET is_active = FALSE WHERE user_id = 3");
      const sent = [];
      await createWorker({ database, enabled: () => true, sendEmail: async email => { sent.push(email); return true; } }).runOnce();
      assert.deepEqual(sent.map(x => x.to), ['member@example.test']);
      assert.equal(sent[0].resendTemplate.id, 'getprio-vendor-staff-access-removed');
      assert.equal((await query("SELECT status FROM staff_access_email_outbox WHERE audience = 'owner'")).rows[0].status, 'skipped');
    });

    await t.test('email address changed after enqueue skips delivery', async () => {
      await reset(); await service.change(context, add);
      await query("UPDATE users SET email = 'new@example.test' WHERE id = 2");
      await createWorker({ database, enabled: () => true, sendEmail: async () => assert.fail('Must not send') }).runOnce();
      assert.equal((await query('SELECT status FROM staff_access_email_outbox')).rows[0].status, 'skipped');
    });

    await t.test('ambiguous provider outcome retries the exact saved request and stable key', async () => {
      await reset(); await service.change(context, add);
      const requests = [];
      const worker = createWorker({ database, enabled: () => true, sendEmail: async email => {
        requests.push(email); if (requests.length === 1) throw Error('Timeout after acceptance'); return true;
      } });
      await worker.runOnce();
      let row = (await query('SELECT * FROM staff_access_email_outbox')).rows[0];
      assert.equal(row.status, 'pending'); assert.equal(row.attempts, 1);
      await query('UPDATE staff_access_email_outbox SET available_at = NOW()');
      await worker.runOnce();
      assert.deepEqual(requests[0], requests[1]);
      row = (await query('SELECT * FROM staff_access_email_outbox')).rows[0];
      assert.equal(row.status, 'sent'); assert.equal(row.attempts, 2);
    });

    await t.test('six failed attempts stop retrying', async () => {
      await reset(); await service.change(context, add); let attempts = 0;
      const worker = createWorker({ database, enabled: () => true, sendEmail: async () => { attempts++; throw Error('Unavailable'); } });
      for (let i = 0; i < 7; i++) { await query('UPDATE staff_access_email_outbox SET available_at = NOW()'); await worker.runOnce(); }
      assert.equal(attempts, 6);
      const row = (await query('SELECT * FROM staff_access_email_outbox')).rows[0];
      assert.equal(row.status, 'failed'); assert.ok(row.completed_at);
    });
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
