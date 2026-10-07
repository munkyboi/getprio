const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
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
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, application_name:schema, max: 8 });
  const tenant = { _id:'1', slug:'demo', name:'Demo', publicProfileEnabled:true, vendorApprovalStatus:'approved' };
  const location = { _id:'10', tenantId:'1', slug:'main', name:'Main', isActive:true, timezone:'Asia/Manila' };
  const catalog = { _id:'100', slug:'consultation', name:'Consultation', isActive:true, durationMinutes:60, priceAmountCents:1000 };
  const scheduledStartAt = `${new Date(Date.now()+86400000).toISOString().slice(0,10)}T01:00:00.000Z`;
  const user = { _id:'1', name:'Customer One', email:'customer@example.com', phone:'09171234567' };
  const body = { tenantSlug:'demo', locationSlug:'main', serviceSlug:'consultation', scheduledStartAt, bookingVerificationToken:'verified-token' };
  let ordinaryCapacity = 1;
  let changedLockedOwner = false;
  let allowanceFails = false;
  let lockedCatalogChanged = false;
  let lockedAvailabilityChanged = false;
  let lockedTenantRevoked = false;
  let lockedLocationRevoked = false;
  let notified = 0;
  let cancelled = 0;
  const savedBookings = new Map();
  async function readBooking(id, options = {}) {
    const row = (await (options.client || pool).query(`SELECT * FROM bookings WHERE id=$1 ${options.client ? "FOR UPDATE" : ""}`, [id])).rows[0];
    return row ? { ...savedBookings.get(String(id)), _id:String(row.id), tenantId:String(row.tenant_id),locationId:String(row.location_id),customerUserId:options.client && changedLockedOwner ? "2" : String(row.customer_user_id),status:row.status,checkedInAt:row.checked_in_at,queueTicketId:row.queue_ticket_id } : null;
  }
  const noop = async () => {};
  try {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE TABLE users(id BIGINT PRIMARY KEY,deletion_requested_at TIMESTAMPTZ);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT,UNIQUE(id,tenant_id));
      CREATE TABLE bookings(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,
        starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,status TEXT,customer_user_id BIGINT,
        checked_in_at TIMESTAMPTZ,queue_ticket_id BIGINT,pending_expires_at TIMESTAMPTZ,payment_proof_object_key TEXT);
      CREATE TABLE booking_bundle_items(id BIGSERIAL PRIMARY KEY,booking_id BIGINT,price INTEGER,
        tenant_id BIGINT,location_id BIGINT,service_id BIGINT,booking_quantity INTEGER,
        scheduled_start_at TIMESTAMPTZ,scheduled_end_at TIMESTAMPTZ,sort_order INTEGER);
      CREATE TABLE location_resource_pools(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,
        capacity INTEGER,revision INTEGER,tracking_enabled BOOLEAN DEFAULT FALSE,UNIQUE(id,tenant_id,location_id));
      CREATE TABLE service_resource_requirements(tenant_id BIGINT,location_id BIGINT,service_id BIGINT,
        pool_id BIGINT,units_required INTEGER,revision INTEGER);
      CREATE TABLE tickets(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,UNIQUE(id,tenant_id,location_id));
      CREATE TABLE allowances(booking_id BIGINT);
      INSERT INTO users VALUES(1,NULL); INSERT INTO store_locations VALUES(10,1)`);
    await pool.query(fs.readFileSync(path.resolve(__dirname, '../../database/migrations/20261007_add_resource_ledger_foundation.sql'), 'utf8'));
    const bookingService = loadService({
      '../config/db': { pool },
      '../repositories/bookings': {
        expirePendingBookings: async () => [],
        countOverlappingActiveBookings: async (_tenant, options) => {
          const result = await (options.client || pool).query("SELECT COUNT(*)::int AS count FROM bookings WHERE status IN ('pending','confirmed','rescheduled') AND tenant_id=$1 AND location_id=$2 AND starts_at<$4 AND ends_at>$3", [_tenant, options.locationId,options.startsAt,options.endsAt]);
          return result.rows[0].count;
        },
        findBookingById: readBooking,
        findBookingByIdForUpdate: readBooking,
        updateBooking: async (id, data, { client }) => {
          await client.query('UPDATE bookings SET status=$2 WHERE id=$1', [id,data.status]);
          return { ...await readBooking(id,{client}), ...data };
        },
        createBooking: async (data, { client }) => {
          const result = await client.query("INSERT INTO bookings(tenant_id,location_id,starts_at,ends_at,status,customer_user_id) VALUES($1,$2,$3,$4,'pending',1) RETURNING id::text", [data.tenantId,data.locationId,data.scheduledStartAt,data.scheduledEndAt]);
          const id = result.rows[0].id;
          for (const item of data.bundleItems) await client.query(`INSERT INTO booking_bundle_items
            (booking_id,price,tenant_id,location_id,service_id,booking_quantity,scheduled_start_at,scheduled_end_at,sort_order)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id,item.priceAmountCents,data.tenantId,data.locationId,item.serviceId,item.bookingQuantity,item.scheduledStartAt,item.scheduledEndAt,item.sortOrder]);
          savedBookings.set(id, data);
          return { ...data, _id:id, reference:`BKG-${id}`, notifyByEmail:false };
        }
      },
      '../repositories/tenants': { findTenantBySlug: async (_slug,options={}) => ({...tenant,publicProfileEnabled:!(options.client && lockedTenantRevoked)}) },
      '../repositories/storeLocations': { findLocationByTenantAndSlug: async (_tenant,_slug,options={}) => ({...location,isActive:!(options.client && lockedLocationRevoked)}),
        listHoursByLocationId: async () => [{ weekday: new Date(scheduledStartAt).getUTCDay(),opensAt:'00:00',closesAt:'23:59',isClosed:false }] },
      '../repositories/vendorServices': { normalizeServiceSlug: value => value,
        findServiceByTenantAndSlug: async (_tenant,_slug,options={}) => ({ ...catalog, _id:_slug === "consultation" ? "100" : "101", slug:_slug, priceAmountCents: options.client && lockedCatalogChanged ? 2000 : 1000 }) },
      '../repositories/locationServices': { findLocationServiceByLocationAndServiceId: async () => ({ isActive:true,capacity:ordinaryCapacity }) },
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
      './pushNotificationService': { notifyVendorBookingIntake:async () => { notified++; }, notifyCustomerBookingUpdate:async () => { cancelled++; } }
    });
    bookingService._setQueueServiceForTest({ publishSnapshot:noop });
    async function reset() {
      await pool.query('TRUNCATE bookings,booking_bundle_items,allowances,resource_ledger_scopes,resource_ledger_commands,resource_ledger_reservations,resource_allocations,service_resource_requirements,location_resource_pools RESTART IDENTITY CASCADE');
      await pool.query('UPDATE users SET deletion_requested_at=NULL');
      allowanceFails = lockedCatalogChanged = lockedAvailabilityChanged = lockedTenantRevoked = lockedLocationRevoked = false;
      notified = cancelled = 0;
      savedBookings.clear();
      ordinaryCapacity = 1; changedLockedOwner = false;
      delete body.bookingQuantity; delete body.bundleItems; catalog.allowBookingQuantity = false; catalog.durationMinutes = 60;
    }
    async function configureResources(enabled = true, units = 1, capacity = 1) {
      ordinaryCapacity = 10;
      await pool.query('INSERT INTO location_resource_pools VALUES(1000,1,10,$1,1,$2)', [capacity,enabled]);
      await pool.query('INSERT INTO service_resource_requirements VALUES(1,10,100,1000,$1,1)', [units]);
    }
    async function count(table) {
      return (await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count;
    }
    await t.test('disabled draft pool preserves quantity bookings and creates no binding or receipt', async () => {
      await reset(); await configureResources(false); catalog.allowBookingQuantity = true; body.bookingQuantity = 2;
      const created = await bookingService.createCustomerBooking({user,body});
      assert.ok(created._id);
      assert.equal(await count('resource_ledger_reservations'),0);
      assert.equal(await count('resource_ledger_commands'),0);
      await bookingService.cancelCustomerBooking({user,bookingId:created._id});
      assert.equal((await readBooking(created._id)).status,'canceled');
      assert.equal(cancelled,1);
    });
    await t.test('enabled pool freezes demand and rejects simultaneous resource overflow atomically', async () => {
      await reset(); await configureResources(true,3,4);
      const outcomes = await Promise.allSettled([1,2].map(() => bookingService.createCustomerBooking({user,body})));
      assert.equal(outcomes.filter(value => value.status === 'fulfilled').length,1);
      assert.match(outcomes.find(value => value.status === 'rejected').reason.message,/resource capacity/);
      for (const table of ['bookings','booking_bundle_items','allowances','resource_ledger_reservations','resource_ledger_commands']) assert.equal(await count(table),1);
      const binding = (await pool.query('SELECT units,pool_revision,requirement_revision,starts_at,ends_at,state FROM resource_ledger_reservations')).rows[0];
      assert.equal(binding.units,3); assert.equal(binding.pool_revision,1); assert.equal(binding.requirement_revision,1);
      assert.equal(binding.starts_at.toISOString(),scheduledStartAt); assert.equal(binding.ends_at-binding.starts_at,3600000);
      assert.equal(binding.state,'protected'); assert.equal(notified,1);
      assert.equal((await pool.query('SELECT writer_coverage_complete FROM resource_ledger_scopes')).rows[0].writer_coverage_complete,false);
    });
    await t.test('enabled resource quantity is rejected with all creation writes rolled back', async () => {
      await reset(); await configureResources(); catalog.allowBookingQuantity = true; body.bookingQuantity = 2;
      await assert.rejects(bookingService.createCustomerBooking({user,body}),/quantity one/);
      for (const table of ['bookings','booking_bundle_items','allowances','resource_ledger_reservations','resource_ledger_commands','resource_ledger_scopes']) assert.equal(await count(table),0);
      assert.equal(notified,0);
    });
    await t.test('enabled resource composition and duration remain unsupported', async () => {
      for (const scenario of ['composition','duration']) {
        await reset(); await configureResources();
        if (scenario === 'composition') body.bundleItems = [{ serviceSlug:'consultation' },{ serviceSlug:'other' }];
        else catalog.durationMinutes = 481;
        await assert.rejects(bookingService.createCustomerBooking({user,body}),/one service item/);
        assert.equal(await count('bookings'),0); assert.equal(await count('resource_ledger_reservations'),0);
      }
    });
    await t.test('cancellation uses immutable binding after demand edits and tracking disable, then permits replacement', async () => {
      await reset(); await configureResources();
      const created = await bookingService.createCustomerBooking({user,body});
      await pool.query('UPDATE service_resource_requirements SET units_required=4,revision=2');
      await pool.query('UPDATE location_resource_pools SET tracking_enabled=FALSE,revision=2');
      await bookingService.cancelCustomerBooking({user,bookingId:created._id,reason:'Changed schedule'});
      const binding = (await pool.query('SELECT units,pool_revision,requirement_revision,state FROM resource_ledger_reservations')).rows[0];
      assert.deepEqual(binding,{units:1,pool_revision:1,requirement_revision:1,state:'cancelled'});
      assert.equal((await readBooking(created._id)).status,'canceled'); assert.equal(cancelled,1);
      await pool.query('UPDATE location_resource_pools SET tracking_enabled=TRUE,capacity=4');
      await bookingService.createCustomerBooking({user,body});
      assert.equal(await count('bookings'),2);
      assert.equal((await pool.query("SELECT SUM(units)::int AS units FROM resource_ledger_reservations WHERE state='protected'")).rows[0].units,4);
      await assert.rejects(bookingService.cancelCustomerBooking({user,bookingId:created._id}),{statusCode:409});
      assert.equal(cancelled,1);
    });
    await t.test('reservation cancellation failure rolls back booking status, receipt and revision', async () => {
      await reset(); await configureResources();
      const created = await bookingService.createCustomerBooking({user,body});
      const revision = (await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision;
      await pool.query(`CREATE FUNCTION reject_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced cancel failure'; END $$;
        CREATE TRIGGER reject_cancel BEFORE UPDATE ON resource_ledger_reservations FOR EACH ROW EXECUTE FUNCTION reject_cancel()`);
      try {
        await assert.rejects(bookingService.cancelCustomerBooking({user,bookingId:created._id}),/forced cancel failure/);
        assert.equal((await readBooking(created._id)).status,'pending');
        assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
        assert.equal(await count('resource_ledger_commands'),1);
        assert.equal((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision,revision);
        assert.equal(cancelled,0);
      } finally { await pool.query('DROP TRIGGER reject_cancel ON resource_ledger_reservations; DROP FUNCTION reject_cancel()'); }
    });
    await t.test('converted binding rejects cancellation without releasing actual occupancy', async () => {
      await reset(); await configureResources();
      const created = await bookingService.createCustomerBooking({user,body});
      await pool.query("UPDATE resource_ledger_reservations SET state='converted'; INSERT INTO tickets VALUES(1,1,10)");
      await pool.query(`INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,reservation_id,started_at,expected_end_at)
        SELECT 1,10,1,1000,1,1,id,clock_timestamp(),clock_timestamp()+interval '1 hour' FROM resource_ledger_reservations`);
      await assert.rejects(bookingService.cancelCustomerBooking({user,bookingId:created._id}),/started service/);
      assert.equal((await readBooking(created._id)).status,'pending');
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
      assert.equal(cancelled,0);
    });
    await t.test('customer cancellation rechecks actor and ownership under the scope lock', async () => {
      await reset(); const created = await bookingService.createCustomerBooking({user,body});
      changedLockedOwner = true;
      await assert.rejects(bookingService.cancelCustomerBooking({user,bookingId:created._id}),{statusCode:404});
      changedLockedOwner = false; await pool.query('UPDATE users SET deletion_requested_at=clock_timestamp()');
      await assert.rejects(bookingService.cancelCustomerBooking({user,bookingId:created._id}),{statusCode:403});
      assert.equal((await readBooking(created._id)).status,'pending'); assert.equal(cancelled,0);
    });
    await t.test('two simultaneous customer cancellations commit once and notify once', async () => {
      await reset(); await configureResources(); const created = await bookingService.createCustomerBooking({user,body});
      const outcomes = await Promise.allSettled([1,2].map(() => bookingService.cancelCustomerBooking({user,bookingId:created._id})));
      assert.equal(outcomes.filter(value => value.status === 'fulfilled').length,1);
      assert.equal(outcomes.find(value => value.status === 'rejected').reason.statusCode,409);
      assert.equal(cancelled,1); assert.equal(await count('resource_ledger_commands'),2);
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'cancelled');
    });
    await t.test('arrival is checked again after acquiring the booking lock', async () => {
      await reset(); const created = await bookingService.createCustomerBooking({user,body});
      const blocker = await pool.connect();
      let cancellation;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        cancellation = bookingService.cancelCustomerBooking({user,bookingId:created._id}).then(() => null, error => error);
        // Wait for this production transaction to contend before arriving the booking.
        for (let attempts=0; attempts<100; attempts++) {
          const waiting = await pool.query(`SELECT COUNT(*)::int AS count FROM pg_stat_activity
            WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%store_locations%'
              AND pid<>pg_backend_pid()`,[schema]);
          if (waiting.rows[0].count) break;
          if (attempts === 99) throw new Error('Cancellation did not wait on the location lock');
          await new Promise(resolve => setTimeout(resolve,5));
        }
        await blocker.query('UPDATE bookings SET checked_in_at=clock_timestamp() WHERE id=$1',[created._id]);
        await blocker.query('COMMIT');
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
      const conflict = await cancellation;
      assert.equal(conflict?.statusCode,409);
      assert.match(conflict.message,/checked in/);
      assert.equal((await readBooking(created._id)).status,'pending'); assert.equal(cancelled,0);
    });
    await t.test('two simultaneous creates contend for the last slot, with one persisted allowance and revision', async () => {
      await reset();
      const outcomes = await Promise.allSettled([1,2].map(() => bookingService.createCustomerBooking({ user,body })));
      assert.equal(outcomes.filter(value => value.status === 'fulfilled').length,1);
      const conflict = outcomes.find(value => value.status === 'rejected').reason;
      assert.equal(conflict.statusCode,409);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count,1);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM booking_bundle_items')).rows[0].count,1);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM allowances')).rows[0].count,1);
      assert.deepEqual((await pool.query('SELECT revision::text,writer_coverage_complete FROM resource_ledger_scopes')).rows[0],{ revision:'2',writer_coverage_complete:false });
      assert.equal(notified,1);
    });
    await t.test('allowance failure rolls back booking, item and revision without notifying', async () => {
      await reset(); allowanceFails=true;
      await assert.rejects(bookingService.createCustomerBooking({user,body}),/Allowance failed/);
      for (const table of ['bookings','booking_bundle_items','allowances','resource_ledger_scopes']) assert.equal((await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count,0);
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
