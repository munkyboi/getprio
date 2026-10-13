const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('tsx/cjs');

const databaseUrl = process.env.MAINTENANCE_TEST_DATABASE_URL;
test('maintenance controls preserve operations and serialize new intake', { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/getprio_test');
  const { Pool } = require('pg');
  const schema = `maintenance_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, application_name: schema, max: 8 });
  const dbPath = require.resolve('../src/config/db');
  const original = require.cache[dbPath];
  const transaction = async callback => {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await callback(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool, withTransaction: transaction } };
  try {
    const service = require('../src/services/platformMaintenanceService');
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE TABLE tenants(id BIGINT PRIMARY KEY);
      CREATE TABLE users(id BIGINT PRIMARY KEY,roles TEXT[],deletion_requested_at TIMESTAMPTZ,platform_access_suspended_at TIMESTAMPTZ,mfa_enabled BOOLEAN);
      CREATE TABLE auth_sessions(id BIGINT PRIMARY KEY,user_id BIGINT,status TEXT,surface TEXT,primary_authenticated_at TIMESTAMPTZ,mfa_verified_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,absolute_expires_at TIMESTAMPTZ,inactivity_expires_at TIMESTAMPTZ);
      INSERT INTO users VALUES(1,ARRAY['platform_admin'],NULL,NULL,TRUE);
      INSERT INTO auth_sessions VALUES(1,1,'active','app',clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',NULL,NULL);`);
    for (const file of ['20260804_02_add_mfa_and_privileged_confirmations.sql', '20260804_04_add_idempotency_and_security_audit.sql', '20261013_add_platform_maintenance.sql']) {
      await pool.query(fs.readFileSync(path.resolve(__dirname, '../../database/migrations', file), 'utf8'));
    }
    const user = { _id: '1', roles: ['platform_admin'] };
    const session = { _id: '1', primaryAuthenticatedAt: new Date(), mfaVerifiedAt: new Date() };
    const reason = 'Scheduled safe maintenance window';
    const draft = { enabled: true, forceScreen: true, message: 'We are improving GetPrio. Please try again shortly.' };
    const preview = await service.preview({ user, session, draft, reason });
    const input = { user, session, draft, reason, expectedRevision: preview.revision, confirmationToken: preview.confirmation.token, operationKey: randomUUID() };
    await t.test('disabled by default; privileged preview, confirmed save and idempotent replay', async () => {
      assert.equal((await service.publicStatus()).enabled, false);
      await service.assertNewIntake();
      await assert.rejects(service.preview({ user: { roles: ['customer'] }, session, draft, reason }), /permission/);
      const responses = await Promise.all([service.update(input), service.update(input)]);
      assert.deepEqual(responses[0], responses[1]);
      assert.equal(responses[0].revision, '2');
      assert.deepEqual(await service.publicStatus(), { enabled: true, forceScreen: true, message: draft.message });
      await assert.rejects(service.assertNewIntake(), { code: 'PLATFORM_MAINTENANCE', statusCode: 503 });
    });
    await t.test('real booking, queue, OTP and checkout entry points reject new intake', async () => {
      const booking = require('../src/services/bookingService');
      const queue = require('../src/services/queueService');
      const join = require('../src/services/queueJoinPaymentService');
      const otp = require('../src/services/queueJoinOtpService');
      const bookingOtp = require('../src/services/bookingOtpService');
      const developerQueues = require('../src/repositories/developerQueues');
      const blocked = { code: 'PLATFORM_MAINTENANCE', statusCode: 503 };
      await assert.rejects(booking.createCustomerBooking({ user, body: {} }), blocked);
      await assert.rejects(join.handleDirectJoin({ tenant: { _id: '1' }, payload: {} }), blocked);
      await assert.rejects(join.handleVerifiedJoin({ tenant: { _id: '1' }, payload: {} }), blocked);
      await assert.rejects(otp.requestJoinOtp({ tenant: { _id: '1' }, payload: {} }), blocked);
      await assert.rejects(bookingOtp.requestBookingOtp({ tenant: { _id: '1' }, payload: {} }), blocked);
      await assert.rejects(transaction(client => queue.createTicketForTenantInTransaction(client, { existingWork: true })), blocked);
      // A client-supplied continuation flag is not the trusted options boundary.
      await assert.rejects(transaction(client => developerQueues.issueTicket({ environment: 'production' }, { client })), blocked);
    });
    await t.test('stale review and tampered confirmation cannot overwrite maintenance', async () => {
      await assert.rejects(service.update({ ...input, operationKey: randomUUID() }), { code: 'MAINTENANCE_STALE' });
      const p = await service.preview({ user, session, draft: { ...draft, enabled: false, forceScreen: false }, reason });
      await assert.rejects(service.update({ ...input, draft: { ...draft, message: 'Tampered' }, expectedRevision: p.revision, confirmationToken: p.confirmation.token, operationKey: randomUUID() }), { code: 'TRANSACTION_CONFIRMATION_INVALID' });
      await service.update({ ...input, draft: p.policy, expectedRevision: p.revision, confirmationToken: p.confirmation.token, operationKey: randomUUID() });
      await service.assertNewIntake();
    });
    await t.test('maintenance enable waits for an admitted transaction, and later intake is rejected', async () => {
      const admission = await pool.connect();
      await admission.query('BEGIN');
      await service.assertNewIntake({ client: admission });
      const p = await service.preview({ user, session, draft, reason });
      const change = service.update({ ...input, draft: p.policy, expectedRevision: p.revision, confirmationToken: p.confirmation.token, operationKey: randomUUID() });
      // The row lock is the synchronization boundary, not process-local cache.
      let waiting = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        waiting = (await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%FROM platform_maintenance%FOR UPDATE%'", [schema])).rows.length > 0;
        if (waiting) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      await admission.query('COMMIT'); admission.release();
      await change;
      assert.equal(waiting, true, 'Maintenance enable must wait for admitted work');
      await assert.rejects(transaction(client => service.assertNewIntake({ client })), { code: 'PLATFORM_MAINTENANCE' });
    });
    await t.test('admin HTTP controls remain accessible; public status contains no audit/session data', async () => {
      const express = require('express');
      const app = express(); app.use(express.json());
      app.use((req, _res, next) => {
        req.user = req.get('x-test-role') === 'customer' ? { _id:'2', roles:['customer'] } : user;
        req.auth = { session, sessionId:session._id }; next();
      });
      app.use('/admin', require('../src/routes/platformMaintenanceRoutes'));
      app.use('/public', require('../src/routes/publicRoutes'));
      app.use(require('../src/middleware/errorHandler'));
      const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
      const base = `http://127.0.0.1:${server.address().port}`;
      try {
        const publicResponse = await fetch(`${base}/public/maintenance`);
        assert.equal(publicResponse.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await publicResponse.json(), {enabled:true,forceScreen:true,message:draft.message});
        assert.equal((await fetch(`${base}/admin`)).status, 200);
        assert.equal((await fetch(`${base}/admin`, {headers:{'x-test-role':'customer'}})).status, 403);
        const denial = await fetch(`${base}/admin/preview`, {method:'POST',headers:{'Content-Type':'application/json','x-test-role':'customer'},body:JSON.stringify({policy:draft,reason})});
        assert.equal(denial.status, 403);
        const review = await fetch(`${base}/admin/preview`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({policy:{...draft,enabled:false,forceScreen:false},reason})});
        const p = await review.json(); assert.equal(review.status, 200);
        const saved = await fetch(`${base}/admin/policy`, {method:'POST',headers:{'Content-Type':'application/json','idempotency-key':randomUUID(),'x-transaction-confirmation':p.confirmation.token},body:JSON.stringify({policy:p.policy,reason,expectedRevision:p.revision})});
        assert.equal(saved.status, 200); assert.equal((await saved.json()).enabled, false);
      } finally { await new Promise(resolve => server.close(resolve)); }
    });
    await t.test('revoked authority and expired assurance cannot change policy', async () => {
      const p = await service.preview({ user, session, draft, reason });
      const save = () => service.update({ ...input, draft: p.policy, expectedRevision: p.revision, confirmationToken: p.confirmation.token, operationKey: randomUUID() });
      await pool.query("UPDATE users SET roles=ARRAY['customer'] WHERE id=1");
      await assert.rejects(save(), {statusCode:403});
      await pool.query("UPDATE users SET roles=ARRAY['platform_admin']; UPDATE auth_sessions SET mfa_verified_at=clock_timestamp()-interval '11 minutes'");
      await assert.rejects(save(), {code:'RECENT_MFA_REQUIRED'});
      await pool.query("UPDATE auth_sessions SET mfa_verified_at=clock_timestamp(),status='revoked'");
      await assert.rejects(save(), {code:'MAINTENANCE_SESSION_REVOKED'});
    });
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
    if (original) require.cache[dbPath] = original; else delete require.cache[dbPath];
  }
});
