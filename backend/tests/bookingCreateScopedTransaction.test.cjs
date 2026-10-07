const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;

function loadService(mocks) {
  const target = require.resolve('../src/services/bookingService');
  const saved = new Map();
  try {
    for (const [name, exports] of Object.entries(mocks)) {
      const id = require.resolve(path.resolve(path.dirname(target), name));
      saved.set(id, require.cache[id]);
      require.cache[id] = { id, filename: id, loaded: true, exports };
    }
    delete require.cache[target];
    return require(target);
  } finally {
    delete require.cache[target];
    for (const [id, original] of saved) {
      if (original) require.cache[id] = original;
      else delete require.cache[id];
    }
  }
}

test('customer booking creation under real scoped PostgreSQL transaction', { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_ledger_test', '/getprio_test'].includes(url.pathname));
  const { Pool } = require('pg');
  const schema = `booking_writer_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 8 });
  const tenant = { _id:'1', slug:'demo', name:'Demo', publicProfileEnabled:true, vendorApprovalStatus:'approved' };
  const location = { _id:'10', tenantId:'1', slug:'main', name:'Main', isActive:true, timezone:'Asia/Manila' };
  const catalog = { _id:'100', slug:'consultation', name:'Consultation', isActive:true, durationMinutes:60, priceAmountCents:1000 };
  const scheduledStartAt = `${new Date(Date.now()+86400000).toISOString().slice(0,10)}T01:00:00.000Z`;
  const user = { _id:'1', name:'Customer One', email:'customer@example.com', phone:'09171234567' };
  const body = { tenantSlug:'demo', locationSlug:'main', serviceSlug:'consultation', scheduledStartAt, bookingVerificationToken:'verified-token' };
  let allowanceFails = false;
  let lockedCatalogChanged = false;
  let lockedAvailabilityChanged = false;
  let lockedTenantRevoked = false;
  let lockedLocationRevoked = false;
  let notified = 0;
  const noop = async () => {};
  try {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE TABLE users(id BIGINT PRIMARY KEY,deletion_requested_at TIMESTAMPTZ);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT);
      CREATE TABLE resource_ledger_scopes(tenant_id BIGINT,location_id BIGINT,revision BIGINT DEFAULT 1,
        writer_coverage_complete BOOLEAN DEFAULT FALSE CHECK(writer_coverage_complete=FALSE),PRIMARY KEY(tenant_id,location_id));
      CREATE TABLE bookings(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,
        starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,status TEXT);
      CREATE TABLE booking_items(id BIGSERIAL PRIMARY KEY,booking_id BIGINT,price INTEGER);
      CREATE TABLE allowances(booking_id BIGINT);
      INSERT INTO users VALUES(1,NULL); INSERT INTO store_locations VALUES(10,1)`);
    const bookingService = loadService({
      '../config/db': { pool },
      '../repositories/bookings': {
        expirePendingBookings: async () => [],
        countOverlappingActiveBookings: async (_tenant, options) => {
          const result = await (options.client || pool).query('SELECT COUNT(*)::int AS count FROM bookings WHERE tenant_id=$1 AND location_id=$2 AND starts_at<$4 AND ends_at>$3', [_tenant, options.locationId,options.startsAt,options.endsAt]);
          return result.rows[0].count;
        },
        createBooking: async (data, { client }) => {
          const result = await client.query("INSERT INTO bookings(tenant_id,location_id,starts_at,ends_at,status) VALUES($1,$2,$3,$4,'pending') RETURNING id::text", [data.tenantId,data.locationId,data.scheduledStartAt,data.scheduledEndAt]);
          const id = result.rows[0].id;
          await client.query('INSERT INTO booking_items(booking_id,price) VALUES($1,$2)', [id,data.bundleItems[0].priceAmountCents]);
          return { ...data, _id:id, reference:`BKG-${id}`, notifyByEmail:false };
        }
      },
      '../repositories/tenants': { findTenantBySlug: async (_slug,options={}) => ({...tenant,publicProfileEnabled:!(options.client && lockedTenantRevoked)}) },
      '../repositories/storeLocations': { findLocationByTenantAndSlug: async (_tenant,_slug,options={}) => ({...location,isActive:!(options.client && lockedLocationRevoked)}),
        listHoursByLocationId: async () => [{ weekday: new Date(scheduledStartAt).getUTCDay(),opensAt:'00:00',closesAt:'23:59',isClosed:false }] },
      '../repositories/vendorServices': { normalizeServiceSlug: value => value,
        findServiceByTenantAndSlug: async (_tenant,_slug,options={}) => ({ ...catalog, priceAmountCents: options.client && lockedCatalogChanged ? 2000 : 1000 }) },
      '../repositories/locationServices': { findLocationServiceByLocationAndServiceId: async () => ({ isActive:true,capacity:1 }) },
      '../repositories/vendorAvailability': { listAvailabilityByLocation: async (_tenant,_location,options={}) => ({
        blocks: [], exceptions: options.client && lockedAvailabilityChanged ? [{ exceptionDate: scheduledStartAt.slice(0,10),isAvailable:false }] : []
      }) },
      './bookingOtpService': { getVerifiedBookingPayload: async () => ({ otpId:'1',payload:{ ...body,customerName:user.name,customerEmail:user.email,customerPhone:user.phone },contactVerificationChannel:'email',contactVerifiedAt:new Date().toISOString() }),consumeBookingVerificationToken:noop },
      './bookingSmsAlertPaymentService': { getBookingSmsFeeForTenant:async () => ({}),shouldChargeBookingSmsFee:() => false },
      './entitlementAdmissionService': { admit:async () => ({ allowed:true }) },
      './allowanceService': { consumeAllowance:async (data,{client}) => {
        await client.query('INSERT INTO allowances VALUES($1)',[data.subjectId]);
        if (allowanceFails) throw new Error('Allowance failed');
      } },
      './notificationService': { sendEmail:noop,sendSms:noop },
      './pushNotificationService': { notifyVendorBookingIntake:async () => { notified++; } }
    });
    bookingService._setQueueServiceForTest({ publishSnapshot:noop });
    async function reset() {
      await pool.query('TRUNCATE bookings,booking_items,allowances,resource_ledger_scopes RESTART IDENTITY');
      await pool.query('UPDATE users SET deletion_requested_at=NULL');
      allowanceFails = lockedCatalogChanged = lockedAvailabilityChanged = lockedTenantRevoked = lockedLocationRevoked = false;
      notified = 0;
    }
    await t.test('two simultaneous creates contend for the last slot, with one persisted allowance and revision', async () => {
      await reset();
      const outcomes = await Promise.allSettled([1,2].map(() => bookingService.createCustomerBooking({ user,body })));
      assert.equal(outcomes.filter(value => value.status === 'fulfilled').length,1);
      const conflict = outcomes.find(value => value.status === 'rejected').reason;
      assert.equal(conflict.statusCode,409);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count,1);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM booking_items')).rows[0].count,1);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM allowances')).rows[0].count,1);
      assert.deepEqual((await pool.query('SELECT revision::text,writer_coverage_complete FROM resource_ledger_scopes')).rows[0],{ revision:'2',writer_coverage_complete:false });
      assert.equal(notified,1);
    });
    await t.test('allowance failure rolls back booking, item and revision without notifying', async () => {
      await reset(); allowanceFails=true;
      await assert.rejects(bookingService.createCustomerBooking({user,body}),/Allowance failed/);
      for (const table of ['bookings','booking_items','allowances','resource_ledger_scopes']) assert.equal((await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count,0);
      assert.equal(notified,0);
    });
    await t.test('deletion requested actor is denied before booking writes', async () => {
      await reset(); await pool.query('UPDATE users SET deletion_requested_at=clock_timestamp()');
      await assert.rejects(bookingService.createCustomerBooking({user,body}),{statusCode:403});
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count,0);
    });
    await t.test('tenant and location authorization changes are rechecked before writes', async () => {
      await reset(); lockedTenantRevoked=true;
      await assert.rejects(bookingService.createCustomerBooking({user,body}),{statusCode:403});
      await reset(); lockedLocationRevoked=true;
      await assert.rejects(bookingService.createCustomerBooking({user,body}),{statusCode:403});
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count,0);
    });
    await t.test('changed catalog and availability are rechecked under the scope lock', async () => {
      await reset(); lockedCatalogChanged=true;
      await assert.rejects(bookingService.createCustomerBooking({user,body}),/services changed/);
      await reset(); lockedAvailabilityChanged=true;
      await assert.rejects(bookingService.createCustomerBooking({user,body}),{statusCode:409});
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count,0);
    });
  } finally { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); }
});
