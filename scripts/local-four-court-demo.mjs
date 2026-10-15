#!/usr/bin/env node
// Creates a NEW disposable database only. Never targets an existing app database.
import process from 'node:process';
import console from 'node:console';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, readdir, open, unlink } from 'node:fs/promises';
import { URL, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const mfa = require('../backend/src/services/mfaService');
const root = new URL('../', import.meta.url);
const prefix = 'getprio_local_pool_demo_';
export const disabledProviderKeys = Object.freeze(['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL',
  'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER',
  'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY',
  'FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL', 'FCM_PRIVATE_KEY', 'FCM_SANDBOX_PROJECT_ID', 'FCM_SANDBOX_CLIENT_EMAIL', 'FCM_SANDBOX_PRIVATE_KEY',
  'PAYMONGO_SECRET_KEY', 'PAYMONGO_WEBHOOK_SECRET', 'PAYMONGO_SANDBOX_SECRET_KEY', 'PAYMONGO_SANDBOX_WEBHOOK_SECRET',
  'PAYMONGO_LIVE_SECRET_KEY', 'PAYMONGO_LIVE_WEBHOOK_SECRET']);

export function validateAdminUrl(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || !['/postgres', '/getprio_test', '/getprio_ledger_test'].includes(url.pathname)
    || url.search || url.hash) throw new Error('Explicit loopback disposable-test administration URL required.');
  return url;
}
async function assertDatabase(client, databaseName, empty = false) {
  const { rows: [row] } = await client.query(`SELECT current_database() AS name,host(inet_server_addr()) AS address,
    (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')) AS tables`);
  if (row.name !== databaseName || row.address !== '127.0.0.1' || (empty && row.tables !== 0)) {
    throw new Error('Fresh local database identity check failed.');
  }
}

export async function createFourCourtDemo({ adminUrl }) {
  const url = validateAdminUrl(adminUrl);
  const admin = new Pool({ connectionString: url.href, max: 1 });
  const databaseName = `${prefix}${randomUUID().replaceAll('-', '')}`;
  const target = new URL(url); target.pathname = `/${databaseName}`;
  let created = false;
  let pool;
  try {
    await assertDatabase(admin, url.pathname.slice(1));
    // Generated identifier contains only a fixed prefix and hex, never user SQL.
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    created = true;
    pool = new Pool({ connectionString: target.href, max: 8 });
    await assertDatabase(pool, databaseName, true);
    await pool.query(await readFile(new URL('database/init.sql', root), 'utf8'));
    for (const filename of (await readdir(new URL('database/migrations/', root))).filter(name => name.endsWith('.sql')).sort()) {
      if ((await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename])).rowCount) continue;
      await pool.query(await readFile(new URL(`database/migrations/${filename}`, root), 'utf8'));
      await pool.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]);
    }
    await assertDatabase(pool, databaseName);
    const env = { ...Object.fromEntries(disabledProviderKeys.map(key => [key, ''])), NODE_ENV: 'development', LOCAL_POOL_DEMO_ENABLED: '1', DATABASE_URL: target.href, DATABASE_SSL: 'false', AUTH_COOKIE_SECURE: 'false',
      PORT: '5007', FRONTEND_PORT: '5187', SERVER_URL: 'http://127.0.0.1:5007',
      CLIENT_URL: 'http://127.0.0.1:5187', APP_BASE_URL: 'http://127.0.0.1:5187',
      VITE_API_URL: 'http://127.0.0.1:5007/api',
      PAYMONGO_MODE: 'sandbox', API_ENVIRONMENT: 'sandbox', JWT_SECRET: randomBytes(32).toString('hex'),
      MFA_ENCRYPTION_SECRET: randomBytes(32).toString('hex'), CSRF_SECRET: randomBytes(32).toString('hex') };
    const credentials = { email: 'court-admin@example.test', password: randomBytes(24).toString('base64url'), totpSecret: mfa.createTotpSecret() };
    const encrypted = mfa.encryptSecret(credentials.totpSecret, env.MFA_ENCRYPTION_SECRET);
    const passwordHash = await bcrypt.hash(credentials.password, 10);
    const client = await pool.connect();
    let fixture;
    try {
      await client.query('BEGIN');
      await client.query(`CREATE TABLE public.local_pool_demo_scopes(tenant_id BIGINT NOT NULL,location_id BIGINT NOT NULL,
        fixture_key TEXT NOT NULL CHECK(fixture_key='four-court-v1'),PRIMARY KEY(tenant_id,location_id))`);
      // The sole constraint exception is confined to this just-created database.
      await assertDatabase(client, databaseName);
      await client.query('ALTER TABLE public.location_resource_pools DROP CONSTRAINT resource_pools_tracking_disabled_check');
      const user = (await client.query(`INSERT INTO users(name,email,password_hash,password_hash_algorithm,email_verified,roles,mfa_enabled,mfa_required)
        VALUES('Local Court Admin',$1,$2,'bcrypt',TRUE,ARRAY['vendor'],TRUE,TRUE) RETURNING id::text`, [credentials.email, passwordHash])).rows[0].id;
      await client.query(`INSERT INTO auth_mfa_factors(user_id,factor_type,label,secret_ciphertext,secret_iv,secret_auth_tag,status,verified_at)
        VALUES($1,'totp','Local demo authenticator',$2,$3,$4,'active',NOW())`, [user, encrypted.ciphertext, encrypted.iv, encrypted.authTag]);
      const tenant = (await client.query(`INSERT INTO tenants(name,slug,queue_prefix,average_service_minutes,public_profile_enabled)
        VALUES('VD Sports Club','vd-sports-club','VD',30,FALSE) RETURNING id::text`)).rows[0].id;
      const location = (await client.query(`INSERT INTO store_locations(tenant_id,name,slug,is_primary,service_timing_enabled,queue_lifecycle_mode)
        VALUES($1,'Demo Courts','demo-courts',TRUE,TRUE,'enforced') RETURNING id::text`, [tenant])).rows[0].id;
      await client.query(`INSERT INTO local_pool_demo_scopes VALUES($1,$2,'four-court-v1')`, [tenant, location]);
      const membership = (await client.query("INSERT INTO tenant_memberships(user_id,tenant_id,role) VALUES($1,$2,'owner') RETURNING id", [user, tenant])).rows[0].id;
      await client.query('INSERT INTO tenant_membership_locations(tenant_membership_id,location_id,assigned_by_user_id) VALUES($1,$2,$3)', [membership, location, user]);
      await client.query(`INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status,provider,current_period_start,current_period_end,entitlements,entitlement_model_version)
        SELECT $1,'pro','active','manual',NOW(),NOW()+interval '30 days',entitlements,2 FROM subscription_plans WHERE slug='pro'`, [tenant]);
      await client.query(`INSERT INTO store_hours(location_id,weekday,opens_at,closes_at,is_closed)
        SELECT $1,day,'00:00','23:59',FALSE FROM generate_series(0,6) AS day`, [location]);
      const counter = (await client.query("INSERT INTO service_counters(tenant_id,location_id,name,slug) VALUES($1,$2,'Court dispatch','court-dispatch') RETURNING id::text", [tenant, location])).rows[0].id;
      await client.query('INSERT INTO service_counter_assignments(counter_id,user_id) VALUES($1,$2)', [counter, user]);
      const service = (await client.query(`INSERT INTO vendor_services(tenant_id,name,slug,duration_minutes)
        VALUES($1,'One court session','one-court-session',30) RETURNING id::text`, [tenant])).rows[0].id;
      await client.query('INSERT INTO location_services(tenant_id,location_id,service_id) VALUES($1,$2,$3)', [tenant, location, service]);
      const resourcePool = (await client.query("INSERT INTO location_resource_pools(tenant_id,location_id,name,capacity,tracking_enabled) VALUES($1,$2,'Courts',4,TRUE) RETURNING id::text", [tenant, location])).rows[0].id;
      await client.query('INSERT INTO service_resource_requirements(tenant_id,location_id,service_id,pool_id,units_required) VALUES($1,$2,$3,$4,1)', [tenant, location, service, resourcePool]);
      await client.query('INSERT INTO resource_ledger_scopes(tenant_id,location_id) VALUES($1,$2)', [tenant, location]);
      const day = (await client.query(`INSERT INTO queue_days(tenant_id,location_id,business_date,state,intake_mode,timezone_snapshot,
        effective_opens_at,effective_closes_at,initial_closes_at,current_closes_at,opened_at,opened_by_user_id,next_sequence)
        VALUES($1,$2,(NOW() AT TIME ZONE 'Asia/Manila')::date,'open','accepting','Asia/Manila',NOW()-interval '1 hour',NOW()+interval '12 hours',NOW()+interval '12 hours',NOW()+interval '12 hours',NOW(),$3,9)
        RETURNING id::text,to_char(business_date,'YYYYMMDD') AS date_key`, [tenant, location, user])).rows[0];
      const ticketIds = [];
      const items = [{ serviceId: service, serviceName: 'One court session', durationMinutes: 30,
        resource: { known: true, poolId: resourcePool, poolName: 'Courts', poolRevision: 1, requirementRevision: 1, unitsRequired: 1 } }];
      for (let index = 1; index <= 8; index++) {
        const number = `VD${String(index).padStart(3, '0')}`;
        const ticket = (await client.query(`INSERT INTO tickets(tenant_id,location_id,ticket_number,sequence,date_key,queue_date_key,lookup_code,customer_name,
          join_channel,status,original_queue_day_id,current_queue_day_id,notify_by_email,notify_by_sms)
          VALUES($1,$2,$3,$4,$5,$5,$6,$7,'vendor','waiting',$8,$8,FALSE,FALSE) RETURNING id::text`,
        [tenant, location, number, index, day.date_key, randomUUID(), `Local Player ${index}`, day.id])).rows[0].id;
        ticketIds.push(ticket);
        await client.query("INSERT INTO queue_ticket_segments(ticket_id,queue_day_id,display_number,sequence,priority_band) VALUES($1,$2,$3,$4,'normal')", [ticket, day.id, number, index]);
        await client.query("INSERT INTO ticket_service_plans(ticket_id,tenant_id,location_id,source,execution_mode,items,created_by_user_id) VALUES($1,$2,$3,'staff_selection','parallel',$4,$5)", [ticket, tenant, location, JSON.stringify(items), user]);
      }
      fixture = { tenantId: tenant, locationId: location, actorUserId: user, counterId: counter, serviceId: service, poolId: resourcePool,
        queueDayId: day.id, dateKey: day.date_key, ticketIds, tenantSlug: 'vd-sports-club', locationSlug: 'demo-courts' };
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    let closing;
    const close = () => { closing ||= Promise.all([pool.end(), admin.end()]); return closing; };
    return { databaseName, databaseUrl: target.href, env, credentials, fixture, pool, close,
      cleanup: async () => {
        await close();
        const cleaner = new Pool({ connectionString: url.href, max: 1 });
        try { await cleaner.query(`DROP DATABASE "${databaseName}"`); } finally { await cleaner.end(); }
      } };
  } catch (error) {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.end();
    throw error;
  }
}

async function run() {
  const output = process.argv[2];
  if (!output || process.argv.length !== 3 || !process.env.LOCAL_POOL_DEMO_ADMIN_URL) throw new Error('Private new artifact path and explicit local admin URL required.');
  const handle = await open(output, 'wx', 0o600);
  let demo;
  let succeeded = false;
  try {
    demo = await createFourCourtDemo({ adminUrl: process.env.LOCAL_POOL_DEMO_ADMIN_URL });
    await handle.writeFile(JSON.stringify({ databaseName: demo.databaseName, databaseUrl: demo.databaseUrl,
      tenantSlug: demo.fixture.tenantSlug, locationSlug: demo.fixture.locationSlug, counterSlug: 'court-dispatch',
      admin: demo.credentials, env: demo.env, credentials: demo.credentials, fixture: demo.fixture }, null, 2));
    await handle.close();
    await demo.close();
    console.log(JSON.stringify({ output, databaseName: demo.databaseName, capacity: 4, waitingTickets: 8, localOnly: true,
      writerCoverageComplete: false, inferenceReady: false, customerEstimateChanged: false }));
    succeeded = true;
  } catch (error) { if (demo) await demo.cleanup(); throw error; } finally {
    try { await handle.close(); } finally { if (!succeeded) await unlink(output); }
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  run().catch(() => { console.error('Local four-court fixture failed; existing databases were not bootstrapped.'); process.exitCode = 1; });
}
