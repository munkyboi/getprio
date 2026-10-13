const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('tsx/cjs');

const databaseUrl = process.env.MAINTENANCE_TEST_DATABASE_URL;
test('maintenance controls preserve operations and serialize new intake', { skip: !databaseUrl }, async t => {
  const originalProviderMode = process.env.PAYMONGO_MODE, originalProviderKey = process.env.PAYMONGO_SANDBOX_SECRET_KEY;
  process.env.PAYMONGO_MODE = 'sandbox'; process.env.PAYMONGO_SANDBOX_SECRET_KEY = 'test-only-provider-key';
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
      CREATE TABLE booking_otps(id BIGINT PRIMARY KEY,tenant_id BIGINT,code_hash TEXT,delivery_channel TEXT,delivery_target TEXT,payload JSONB,expires_at TIMESTAMPTZ,verified_at TIMESTAMPTZ,verification_token_hash TEXT,consumed_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE booking_sms_alert_payments(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,booking_otp_id BIGINT,plan_slug TEXT,provider TEXT,provider_checkout_session_id TEXT,provider_payment_id TEXT,status TEXT DEFAULT 'pending',amount_cents INTEGER,currency TEXT,payload JSONB DEFAULT '{}',metadata JSONB DEFAULT '{}',paid_at TIMESTAMPTZ,checkout_url TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(tenant_id,booking_otp_id));
      CREATE TABLE tenant_subscriptions(id BIGINT PRIMARY KEY,tenant_id BIGINT,plan_slug TEXT,status TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE queue_fee_settings(plan_slug TEXT PRIMARY KEY,enabled BOOLEAN,amount_cents INTEGER,currency TEXT,updated_by_user_id BIGINT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
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
      const pendingKey = randomUUID();
      const change = service.update({ ...input, draft: p.policy, expectedRevision: p.revision, confirmationToken: p.confirmation.token, operationKey: pendingKey });
      // The row lock is the synchronization boundary, not process-local cache.
      let waiting = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        waiting = (await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%FROM platform_maintenance%FOR UPDATE%'", [schema])).rows.length > 0;
        if (waiting) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.deepEqual(await service.operationStatus(user,pendingKey),{state:'unknown'});
      await admission.query('COMMIT'); admission.release();
      await change;
      assert.equal(waiting, true, 'Maintenance enable must wait for admitted work');
      assert.equal((await service.operationStatus(user,pendingKey)).state,'committed');
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
    await t.test('SMS booking checkout rechecks maintenance after waiting for verification', async () => {
      const env = require('../src/config/env');
      const sms = require('../src/services/bookingSmsAlertPaymentService');
      const token = 'test-verified-booking';
      const hash = require('node:crypto').createHmac('sha256',env.jwtSecret).update(token).digest('hex');
      const payload = {tenantSlug:'demo',locationSlug:'main',serviceSlug:'consultation',scheduledStartAt:new Date(Date.now()+86400000).toISOString(),bookingQuantity:1,executionMode:'parallel',customerName:'Test customer',customerEmail:'test@example.test',customerPhone:'09171234567',notifyBySms:true};
      await pool.query("INSERT INTO booking_otps(id,tenant_id,payload,verified_at,expires_at,verification_token_hash,delivery_channel) VALUES(1,1,$1,clock_timestamp(),clock_timestamp()+interval '1 hour',$2,'email')", [JSON.stringify(payload),hash]);
      await pool.query("INSERT INTO tenant_subscriptions VALUES(1,1,'pro','active',clock_timestamp())");
      const blocker = await pool.connect();
      const originalFetch = global.fetch;
      global.fetch = async () => ({ok:true,json:async () => ({data:{id:'test-checkout',attributes:{checkout_url:'https://payments.example.test/checkout'}}})});
      let creating;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM booking_otps WHERE id=1 FOR UPDATE');
        creating = sms.createBookingSmsCheckout({tenant:{_id:'1',slug:'demo',name:'Test vendor'},bookingVerificationToken:token});
        creating.catch(() => {});
        let waiting = false;
        for (let attempt=0;attempt<200;attempt++) {
          waiting = (await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%FROM booking_otps%'",[schema])).rows.length > 0;
          if (waiting) break;
          await new Promise(resolve => setTimeout(resolve,10));
        }
        assert.equal(waiting,true);
        const p = await service.preview({user,session,draft,reason});
        await service.update({...input,draft:p.policy,expectedRevision:p.revision,confirmationToken:p.confirmation.token,operationKey:randomUUID()});
        await blocker.query('COMMIT');
        await assert.rejects(creating,{code:'PLATFORM_MAINTENANCE',statusCode:503});
        const resumed = await service.preview({user,session,draft:{...draft,enabled:false,forceScreen:false},reason});
        await service.update({...input,draft:resumed.policy,expectedRevision:resumed.revision,confirmationToken:resumed.confirmation.token,operationKey:randomUUID()});
        const checkout = await sms.createBookingSmsCheckout({tenant:{_id:'1',slug:'demo',name:'Test vendor'},bookingVerificationToken:token});
        assert.equal(checkout.requiresPayment,true);
        assert.equal(checkout.checkoutSession.providerCheckoutSessionId,'test-checkout');
      } finally {
        await blocker.query('ROLLBACK'); blocker.release();
        if (creating) await creating.catch(() => {});
        global.fetch=originalFetch;
      }
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
    if (originalProviderMode === undefined) delete process.env.PAYMONGO_MODE; else process.env.PAYMONGO_MODE=originalProviderMode;
    if (originalProviderKey === undefined) delete process.env.PAYMONGO_SANDBOX_SECRET_KEY; else process.env.PAYMONGO_SANDBOX_SECRET_KEY=originalProviderKey;
  }
});
