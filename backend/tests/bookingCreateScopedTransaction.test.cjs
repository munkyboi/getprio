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
  const tenant = { _id:'1', slug:'demo', name:'Demo', isActive:true, publicProfileEnabled:true, vendorApprovalStatus:'approved' };
  const location = { _id:'10', tenantId:'1', slug:'main', name:'Main', isActive:true, customerSelfCheckInEnabled:true, timezone:'Asia/Manila' };
  const catalog = { _id:'100', slug:'consultation', name:'Consultation', isActive:true, durationMinutes:60, priceAmountCents:1000 };
  const scheduledStartAt = `${new Date(Date.now()+86400000).toISOString().slice(0,10)}T01:00:00.000Z`;
  const user = { _id:'1', name:'Customer One', email:'customer@example.com', phone:'09171234567' };
  const body = { tenantSlug:'demo', locationSlug:'main', serviceSlug:'consultation', scheduledStartAt, bookingVerificationToken:'verified-token' };
  let ordinaryCapacity = 1;
  let catalogSlugRenamed = false;
  let changedLockedOwner = false;
  let allowanceFails = false;
  let lockedCatalogChanged = false;
  let lockedAvailabilityChanged = false;
  let lockedTenantRevoked = false;
  let lockedLocationRevoked = false;
  let notified = 0;
  let cancelled = 0;
  let proofNotified = 0;
  let planFails = false;
  let intakeClosed = false;
  const savedBookings = new Map();
  async function readBooking(id, options = {}) {
    const row = (await (options.client || pool).query(`SELECT * FROM bookings WHERE id=$1 ${options.client ? "FOR UPDATE" : ""}`, [id])).rows[0];
    if (!row) return null;
    const data = savedBookings.get(String(id));
    const items = (await (options.client || pool).query('SELECT * FROM booking_bundle_items WHERE booking_id=$1 ORDER BY sort_order,id',[id])).rows;
    return { ...data, ...row.payment_data, locationSlug:location.slug, serviceSlug:data.bundleItems[0].serviceSlug, _id:String(row.id), tenantId:String(row.tenant_id),locationId:String(row.location_id),
      customerUserId:options.client && changedLockedOwner ? "2" : String(row.customer_user_id),status:row.status,
      checkedInAt:row.checked_in_at,queueTicketId:row.queue_ticket_id,pendingExpiresAt:row.pending_expires_at?.toISOString(),paymentProofObjectKey:row.payment_proof_object_key,expiredAt:row.expired_at?.toISOString(),expirationReason:row.expiration_reason,scheduledStartAt:row.starts_at.toISOString(),scheduledEndAt:row.ends_at.toISOString(),
      bundleItems:items.map((item,index) => ({...data.bundleItems[index],id:String(item.id),scheduledStartAt:item.scheduled_start_at.toISOString(),scheduledEndAt:item.scheduled_end_at.toISOString()})) };
  }
  const noop = async () => {};
  try {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE TABLE users(id BIGINT PRIMARY KEY,deletion_requested_at TIMESTAMPTZ,platform_access_suspended_at TIMESTAMPTZ,roles TEXT[] DEFAULT ARRAY[]::TEXT[]);
      CREATE TABLE tenant_memberships(id BIGINT DEFAULT 2,user_id BIGINT,tenant_id BIGINT,role TEXT,is_active BOOLEAN DEFAULT TRUE);
      CREATE TABLE tenant_membership_locations(tenant_membership_id BIGINT,location_id BIGINT);
      CREATE TABLE service_counters(id BIGINT,tenant_id BIGINT,location_id BIGINT,is_active BOOLEAN);
      CREATE TABLE service_counter_assignments(user_id BIGINT,counter_id BIGINT);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT,UNIQUE(id,tenant_id));
      CREATE TABLE bookings(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,
        starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,status TEXT,customer_user_id BIGINT,
        checked_in_at TIMESTAMPTZ,queue_ticket_id BIGINT,pending_expires_at TIMESTAMPTZ,payment_proof_object_key TEXT,expired_at TIMESTAMPTZ,expiration_reason TEXT,payment_data JSONB NOT NULL DEFAULT '{}');
      CREATE TABLE booking_bundle_items(id BIGSERIAL PRIMARY KEY,booking_id BIGINT,price INTEGER,
        tenant_id BIGINT,location_id BIGINT,service_id BIGINT,booking_quantity INTEGER,
        scheduled_start_at TIMESTAMPTZ,scheduled_end_at TIMESTAMPTZ,sort_order INTEGER);
      CREATE TABLE location_resource_pools(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,
        capacity INTEGER,revision INTEGER,tracking_enabled BOOLEAN DEFAULT FALSE,name TEXT DEFAULT 'Pool',UNIQUE(id,tenant_id,location_id));
      CREATE TABLE service_resource_requirements(tenant_id BIGINT,location_id BIGINT,service_id BIGINT,
        pool_id BIGINT,units_required INTEGER,revision INTEGER);
      CREATE TABLE tickets(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,UNIQUE(id,tenant_id,location_id));
      CREATE TABLE ticket_service_plans(ticket_id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,
        source TEXT,booking_id BIGINT,execution_mode TEXT,items JSONB,created_by_user_id BIGINT);
      CREATE TABLE allowances(booking_id BIGINT);
      INSERT INTO users(id) VALUES(1),(2); INSERT INTO tenant_memberships(user_id,tenant_id,role,is_active) VALUES(2,1,'owner',TRUE); INSERT INTO store_locations VALUES(10,1)`);
    await pool.query(fs.readFileSync(path.resolve(__dirname, '../../database/migrations/20261007_add_resource_ledger_foundation.sql'), 'utf8'));
    const bookingService = loadService({
      '../config/db': { pool },
      '../repositories/bookings': {
        expirePendingBookings: require('../src/repositories/bookings').expirePendingBookings,
        getPendingBookingExpiryCutoff: () => require('../src/repositories/bookings').getPendingBookingExpiryCutoff({client:pool}),
        listPendingBookingExpiryScopes: options => require('../src/repositories/bookings').listPendingBookingExpiryScopes({...options,client:pool}),
        countOverlappingActiveBookings: async (_tenant, options) => {
          const result = await (options.client || pool).query("SELECT COUNT(*)::int AS count FROM bookings WHERE status IN ('pending','confirmed','rescheduled') AND tenant_id=$1 AND location_id=$2 AND starts_at<$4 AND ends_at>$3 AND ($5::bigint IS NULL OR id<>$5)", [_tenant, options.locationId,options.startsAt,options.endsAt,options.excludeBookingId || null]);
          return result.rows[0].count;
        },
        updateBookingBundleItemIntervals: require('../src/repositories/bookings').updateBookingBundleItemIntervals,
        findBookingById: readBooking,
        findBookingByIdForUpdate: readBooking,
        updateBooking: async (id, data, { client }) => {
          await client.query('UPDATE bookings SET status=COALESCE($2,status),starts_at=COALESCE($3,starts_at),ends_at=COALESCE($4,ends_at),payment_proof_object_key=COALESCE($5,payment_proof_object_key),payment_data=payment_data || $6::jsonb,checked_in_at=COALESCE($7,checked_in_at),queue_ticket_id=COALESCE($8,queue_ticket_id) WHERE id=$1', [id,data.status,data.scheduledStartAt,data.scheduledEndAt,data.paymentProofObjectKey,JSON.stringify(data),data.checkedInAt,data.queueTicketId]);
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
      '../repositories/tenants': { findTenantById:async (_id,options={}) => ({...tenant,isActive:!(options.client && lockedTenantRevoked)}), findTenantBySlug: async (_slug,options={}) => ({...tenant,publicProfileEnabled:!(options.client && lockedTenantRevoked)}) },
      '../repositories/storeLocations': { findLocationById:async (_id,options={}) => ({...location,isActive:!(options.client && lockedLocationRevoked)}), findLocationByTenantAndSlug: async (_tenant,_slug,options={}) => ({...location,isActive:!(options.client && lockedLocationRevoked)}),
        listHoursByLocationId: async () => [{ weekday: new Date(scheduledStartAt).getUTCDay(),opensAt:'00:00',closesAt:'23:59',isClosed:false }] },
      '../repositories/vendorServices': { normalizeServiceSlug: value => value,
        findServiceByTenantAndId: async (_tenant,id) => ['100','101'].includes(String(id)) ? ({...catalog,_id:String(id),slug:catalogSlugRenamed ? `renamed-${id}` : String(id) === '100' ? 'consultation' : 'other'}) : null,
        findServiceByTenantAndSlug: async (_tenant,_slug,options={}) => catalogSlugRenamed ? null : ({ ...catalog, _id:_slug === "consultation" ? "100" : "101", slug:_slug, priceAmountCents: options.client && lockedCatalogChanged ? 2000 : 1000 }) },
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
      './ticketServicePlanService': {captureBookingPlan:async (client,data) => {
        await require('../src/services/ticketServicePlanService').captureBookingPlan(client,data);
        if (planFails) throw new Error('Forced service plan failure');
      }},
      './paymentProofStorageService': { assertUploadMetadata:() => {}, assertObjectKeyBelongsToBooking:(_booking,key) => key },
      './notificationService': { sendEmail:noop,sendSms:noop },
      './pushNotificationService': { notifyVendorPaymentProofReview:async () => { proofNotified++; }, notifyVendorBookingIntake:async () => { notified++; }, notifyCustomerBookingUpdate:async () => { cancelled++; } }
    });
    bookingService._setQueueServiceForTest({ publishSnapshot:noop,maybeNotifyUpcomingTickets:noop,maybeAutoPauseQueueDay:noop,
      assertQueueIntakeOpen:async () => { if (intakeClosed) { const error=new Error('Queue closed'); error.statusCode=409; throw error; } },
      createTicketForTenantInTransaction:async client => {
        const row=(await client.query('INSERT INTO tickets(tenant_id,location_id) VALUES(1,10) RETURNING id::text')).rows[0];
        await client.query('INSERT INTO allowances VALUES($1)',[row.id]);
        return {_id:row.id,ticketNumber:'D001',lookupCode:'LOOKUP1',status:'waiting'};
      } });
    async function reset() {
      await pool.query('TRUNCATE tickets,ticket_service_plans,bookings,booking_bundle_items,allowances,resource_ledger_scopes,resource_ledger_commands,resource_ledger_reservations,resource_allocations,service_resource_requirements,location_resource_pools RESTART IDENTITY CASCADE');
      await pool.query('UPDATE users SET deletion_requested_at=NULL; TRUNCATE tenant_membership_locations,service_counters,service_counter_assignments');
      allowanceFails = lockedCatalogChanged = lockedAvailabilityChanged = lockedTenantRevoked = lockedLocationRevoked = false;
      notified = cancelled = proofNotified = 0; planFails = intakeClosed = false; location.customerSelfCheckInEnabled = true;
      savedBookings.clear();
      await pool.query("UPDATE tenant_memberships SET role='owner',is_active=TRUE; UPDATE users SET platform_access_suspended_at=NULL");
      ordinaryCapacity = 1; changedLockedOwner = false; catalogSlugRenamed = false;
      body.scheduledStartAt = scheduledStartAt; delete body.executionMode; delete body.bookingQuantity; delete body.bundleItems; catalog.allowBookingQuantity = false; catalog.durationMinutes = 60;
    }
    async function configureResources(enabled = true, units = 1, capacity = 1) {
      ordinaryCapacity = 10;
      await pool.query('INSERT INTO location_resource_pools(id,tenant_id,location_id,capacity,revision,tracking_enabled) VALUES(1000,1,10,$1,1,$2)', [capacity,enabled]);
      await pool.query('INSERT INTO service_resource_requirements VALUES(1,10,100,1000,$1,1)', [units]);
    }
    async function count(table) {
      return (await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count;
    }
    const proofBody = { paymentReference:'PAY-1',objectKey:'proof-1',contentType:'image/png',sizeBytes:100,fileName:'proof.png' };
    async function proofBooking(enabled = true) {
      await reset(); await configureResources(enabled);
      const booking = await bookingService.createCustomerBooking({user,body});
      savedBookings.get(booking._id).serviceManualPaymentRequired = true;
      return booking;
    }
    const submitProof = booking => bookingService.submitCustomerPaymentProof({user,bookingId:booking._id,body:proofBody});
    const verifyProof = booking => bookingService.verifyVendorBookingPayment({tenant,bookingId:booking._id,user:{_id:'2'}});
    const rejectProof = booking => bookingService.rejectVendorBookingPayment({tenant,bookingId:booking._id,user:{_id:'2'},reason:'Unclear receipt'});
    const revision = async () => (await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
    await t.test('concurrent proof submissions commit once and preserve frozen protection', async () => {
      const booking = await proofBooking();
      const binding = (await pool.query('SELECT * FROM resource_ledger_reservations')).rows[0];
      const outcomes = await Promise.allSettled([submitProof(booking),submitProof(booking)]);
      assert.equal(outcomes.filter(value => value.status === 'fulfilled').length,1);
      assert.equal(outcomes.find(value => value.status === 'rejected').reason.statusCode,409);
      assert.deepEqual((await pool.query('SELECT * FROM resource_ledger_reservations')).rows[0],binding);
      assert.equal((await readBooking(booking._id)).paymentStatus,'pending');
      assert.equal(await revision(),'4'); assert.equal(proofNotified,1);
    });
    await t.test('proof submission rechecks expiry, ownership, arrival and suspension without notifying', async () => {
      for (const scenario of ['expired','owner','arrival','suspended']) {
        const booking = await proofBooking();
        if (scenario === 'expired') await pool.query("UPDATE bookings SET pending_expires_at=clock_timestamp()-interval '1 second'");
        if (scenario === 'owner') changedLockedOwner = true;
        if (scenario === 'arrival') await pool.query('UPDATE bookings SET checked_in_at=clock_timestamp()');
        if (scenario === 'suspended') await pool.query('UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1');
        await assert.rejects(submitProof(booking),{statusCode:scenario === 'owner' ? 404 : scenario === 'suspended' ? 403 : 409});
        assert.equal((await readBooking(booking._id)).paymentProofObjectKey,null);
        assert.equal(await revision(),'3'); assert.equal(proofNotified,0);
      }
    });
    await t.test('verification preserves pending booking and immutable demand after configuration edits', async () => {
      const booking = await proofBooking(); await submitProof(booking);
      await pool.query('UPDATE service_resource_requirements SET units_required=4,revision=2; UPDATE location_resource_pools SET revision=2,tracking_enabled=FALSE');
      const verified = await verifyProof(booking);
      assert.equal(verified.status,'pending'); assert.equal(verified.paymentStatus,'paid'); assert.equal(verified.paymentVerifiedByUserId,'2');
      assert.deepEqual((await pool.query('SELECT state,units,pool_revision FROM resource_ledger_reservations')).rows[0],{state:'protected',units:1,pool_revision:1});
      await assert.rejects(rejectProof(booking),{statusCode:409});
      assert.equal(await revision(),'5'); assert.equal(cancelled,1);
    });
    await t.test('verification and rejection serialize with only one terminal payment decision', async () => {
      const booking = await proofBooking(); await submitProof(booking);
      const outcomes = await Promise.allSettled([verifyProof(booking),rejectProof(booking)]);
      assert.equal(outcomes.filter(value => value.status === 'fulfilled').length,1);
      assert.equal(outcomes.find(value => value.status === 'rejected').reason.statusCode,409);
      const current = await readBooking(booking._id);
      const binding = (await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0];
      assert.equal(binding.state,current.paymentStatus === 'paid' ? 'protected' : 'cancelled');
      assert.equal(cancelled,1);
    });
    await t.test('rejection atomically cancels protection even when tracking was disabled', async () => {
      const booking = await proofBooking(); await submitProof(booking);
      await pool.query('UPDATE location_resource_pools SET tracking_enabled=FALSE');
      await rejectProof(booking);
      const current = await readBooking(booking._id);
      assert.equal(current.status,'canceled'); assert.equal(current.paymentStatus,'failed'); assert.equal(current.paymentRejectionReason,'Unclear receipt');
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'cancelled');
      assert.equal(cancelled,1);
    });
    await t.test('ledger failure rolls back rejection, payment audit, receipt and notification', async () => {
      const booking = await proofBooking(); await submitProof(booking);
      const before = await revision();
      await pool.query(`CREATE FUNCTION reject_payment_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced proof cancel failure'; END $$;
        CREATE TRIGGER reject_payment_cancel BEFORE UPDATE ON resource_ledger_reservations FOR EACH ROW EXECUTE FUNCTION reject_payment_cancel()`);
      try {
        await assert.rejects(rejectProof(booking),/forced proof cancel failure/);
        const current = await readBooking(booking._id);
        assert.equal(current.status,'pending'); assert.equal(current.paymentStatus,'pending'); assert.equal(current.paymentRejectedAt,undefined);
        assert.equal(await revision(),before); assert.equal(await count('resource_ledger_commands'),1); assert.equal(cancelled,0);
      } finally { await pool.query('DROP TRIGGER reject_payment_cancel ON resource_ledger_reservations; DROP FUNCTION reject_payment_cancel()'); }
    });
    await t.test('payment review fails closed for revoked vendor and converted protection', async () => {
      for (const scenario of ['revoked','converted']) {
        const booking = await proofBooking(); await submitProof(booking);
        if (scenario === 'revoked') await pool.query('UPDATE tenant_memberships SET is_active=FALSE');
        else await pool.query("UPDATE resource_ledger_reservations SET state='converted'");
        for (const action of [verifyProof,rejectProof]) await assert.rejects(action(booking),{statusCode:scenario === 'revoked' ? 403 : 409});
        assert.equal((await readBooking(booking._id)).paymentStatus,'pending'); assert.equal(cancelled,0);
      }
    });
    await t.test('missing or converted protection rolls back proof fields and revision', async () => {
      for (const state of ['cancelled','converted']) {
        const booking = await proofBooking(); const before = await revision();
        await pool.query('UPDATE resource_ledger_reservations SET state=$1',[state]);
        await assert.rejects(submitProof(booking),{statusCode:409});
        assert.equal((await readBooking(booking._id)).paymentProofObjectKey,null);
        assert.equal(await revision(),before); assert.equal(proofNotified,0);
      }
    });
    await t.test('ordinary booking proof and verification create no reservation', async () => {
      const booking = await proofBooking(false); await submitProof(booking); await verifyProof(booking);
      assert.equal(await count('resource_ledger_reservations'),0); assert.equal(await count('resource_ledger_commands'),0);
      assert.equal((await readBooking(booking._id)).paymentStatus,'paid');
    });
    async function lateBooking(enabled = true) {
      const booking = await proofBooking(enabled);
      const start = new Date(Date.now()-30*60000).toISOString();
      const end = new Date(Date.now()+30*60000).toISOString();
      await pool.query("UPDATE bookings SET status='confirmed',starts_at=$1,ends_at=$2",[start,end]);
      await pool.query('UPDATE booking_bundle_items SET scheduled_start_at=$1,scheduled_end_at=$2',[start,end]);
      await pool.query('UPDATE resource_ledger_reservations SET starts_at=$1,ends_at=$2',[start,end]);
      return booking;
    }
    const noShow = (booking, selectedLocation = location) => bookingService.markVendorBookingNoShow({tenant,location:selectedLocation,bookingId:booking._id,user:{_id:'2'}});
    await t.test('no-show cancels frozen protection after draft edits and tracking disable', async () => {
      const booking = await lateBooking();
      await pool.query('UPDATE location_resource_pools SET tracking_enabled=FALSE,revision=2; UPDATE service_resource_requirements SET units_required=4,revision=2');
      const updated = await noShow(booking);
      assert.equal(updated.status,'canceled'); assert.equal(updated.noShowByUserId,'2'); assert.ok(updated.noShowAt);
      assert.deepEqual((await pool.query('SELECT state,units,pool_revision FROM resource_ledger_reservations')).rows[0],{state:'cancelled',units:1,pool_revision:1});
      assert.equal(await count('resource_ledger_commands'),2); assert.equal(cancelled,1);
    });
    await t.test('simultaneous no-show requests commit and notify once', async () => {
      const booking = await lateBooking();
      const outcomes = await Promise.allSettled([noShow(booking),noShow(booking)]);
      assert.equal(outcomes.filter(value => value.status === 'fulfilled').length,1);
      assert.equal(outcomes.find(value => value.status === 'rejected').reason.statusCode,409);
      assert.equal(cancelled,1); assert.equal(await count('resource_ledger_commands'),2);
    });
    await t.test('no-show rollback retains booking, audit, protection, receipt and revision', async () => {
      const booking = await lateBooking(); const before = await revision();
      await pool.query(`CREATE FUNCTION reject_no_show_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced no-show cancel failure'; END $$;
        CREATE TRIGGER reject_no_show_cancel BEFORE UPDATE ON resource_ledger_reservations FOR EACH ROW EXECUTE FUNCTION reject_no_show_cancel()`);
      try {
        await assert.rejects(noShow(booking),/forced no-show cancel failure/);
        const current = await readBooking(booking._id);
        assert.equal(current.status,'confirmed'); assert.equal(current.noShowAt,undefined);
        assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
        assert.equal(await revision(),before); assert.equal(await count('resource_ledger_commands'),1); assert.equal(cancelled,0);
      } finally { await pool.query('DROP TRIGGER reject_no_show_cancel ON resource_ledger_reservations; DROP FUNCTION reject_no_show_cancel()'); }
    });
    await t.test('no-show permits assigned staff through explicit branch or active counter only', async () => {
      for (const assignment of ['branch','counter']) {
        const booking = await lateBooking();
        await pool.query("UPDATE tenant_memberships SET role='staff'");
        await assert.rejects(noShow(booking),{statusCode:403});
        if (assignment === 'branch') await pool.query('INSERT INTO tenant_membership_locations VALUES(2,10)');
        else await pool.query('INSERT INTO service_counters VALUES(1,1,10,TRUE); INSERT INTO service_counter_assignments VALUES(2,1)');
        await noShow(booking); assert.equal(cancelled,1);
      }
    });
    await t.test('no-show rechecks membership, suspension and selected branch before mutation', async () => {
      for (const scenario of ['revoked','suspended','wrong_branch','inactive_counter']) {
        const booking = await lateBooking();
        if (scenario === 'revoked') await pool.query('UPDATE tenant_memberships SET is_active=FALSE');
        if (scenario === 'suspended') await pool.query('UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=2');
        if (scenario === 'inactive_counter') await pool.query("UPDATE tenant_memberships SET role='staff'; INSERT INTO service_counters VALUES(1,1,10,FALSE); INSERT INTO service_counter_assignments VALUES(2,1)");
        await assert.rejects(noShow(booking,scenario === 'wrong_branch' ? {...location,_id:'11'} : location),{statusCode:scenario === 'wrong_branch' ? 404 : 403});
        assert.equal((await readBooking(booking._id)).status,'confirmed'); assert.equal(cancelled,0);
      }
    });
    await t.test('no-show refuses pending, on-time and converted bookings without releasing occupancy', async () => {
      for (const scenario of ['pending','on_time','converted']) {
        const booking = await lateBooking();
        if (scenario === 'pending') await pool.query("UPDATE bookings SET status='pending'");
        if (scenario === 'on_time') await pool.query('UPDATE bookings SET starts_at=$1',[new Date().toISOString()]);
        if (scenario === 'converted') {
          await pool.query("UPDATE resource_ledger_reservations SET state='converted'; INSERT INTO tickets VALUES(2,1,10)");
          await pool.query(`INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,reservation_id,started_at,expected_end_at)
            SELECT 1,10,2,1000,1,1,id,clock_timestamp(),clock_timestamp()+interval '1 hour' FROM resource_ledger_reservations`);
        }
        await assert.rejects(noShow(booking),{statusCode:409}); assert.equal(cancelled,0);
        if (scenario === 'converted') assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
      }
    });
    await t.test('ordinary no-show preserves behavior without reservation commands', async () => {
      const booking = await lateBooking(false); await noShow(booking);
      assert.equal((await readBooking(booking._id)).status,'canceled'); assert.equal(cancelled,1);
      assert.equal(await count('resource_ledger_reservations'),0); assert.equal(await count('resource_ledger_commands'),0);
    });
    async function expiringBooking(enabled = true) {
      const booking = await proofBooking(enabled);
      await pool.query("UPDATE bookings SET pending_expires_at=clock_timestamp()-interval '1 minute'");
      return booking;
    }
    const expire = () => bookingService.expirePendingBookingsForLocation('1','10');
    await t.test('system expiry handles a deleted customer and cancels immutable protection', async () => {
      const booking = await expiringBooking();
      await pool.query('UPDATE bookings SET customer_user_id=NULL; DELETE FROM users WHERE id=1; UPDATE location_resource_pools SET tracking_enabled=FALSE,revision=2; UPDATE service_resource_requirements SET units_required=4,revision=2');
      try {
        assert.deepEqual(await expire(),[booking._id]);
        const current = await readBooking(booking._id);
        assert.equal(current.status,'canceled'); assert.ok(current.expiredAt); assert.match(current.expirationReason,/pending booking window/);
        assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'cancelled');
        const receipt = (await pool.query("SELECT actor_user_id,operation_key FROM resource_ledger_commands WHERE command='cancelReservation'")).rows[0];
        assert.equal(receipt.actor_user_id,null); assert.match(receipt.operation_key,/:expiry:cancel$/);
        assert.equal(cancelled,1);
        assert.deepEqual(await expire(),[]); assert.equal(cancelled,1);
      } finally { await pool.query('INSERT INTO users(id) VALUES(1)'); }
    });
    await t.test('system expiry serializes concurrent runs and preserves ordinary behavior', async () => {
      for (const enabled of [true,false]) {
        const booking = await expiringBooking(enabled);
        const outcomes = await Promise.all([expire(),expire()]);
        assert.deepEqual(outcomes.flat(),[booking._id]); assert.equal(cancelled,1);
        assert.equal(await count('resource_ledger_commands'),enabled ? 2 : 0);
      }
    });
    await t.test('expiry excludes proof, arrived, linked, confirmed and future pending bookings', async () => {
      for (const scenario of ['proof','arrived','linked','confirmed','future']) {
        const booking = await expiringBooking();
        if (scenario === 'proof') await pool.query("UPDATE bookings SET payment_proof_object_key='proof'");
        if (scenario === 'arrived') await pool.query('UPDATE bookings SET checked_in_at=clock_timestamp()');
        if (scenario === 'linked') await pool.query('UPDATE bookings SET queue_ticket_id=123');
        if (scenario === 'confirmed') await pool.query("UPDATE bookings SET status='confirmed'");
        if (scenario === 'future') await pool.query("UPDATE bookings SET pending_expires_at=clock_timestamp()+interval '1 minute'");
        const before = await revision(); assert.deepEqual(await expire(),[]);
        assert.equal((await readBooking(booking._id)).status,scenario === 'confirmed' ? 'confirmed' : 'pending');
        assert.equal(await revision(),before); assert.equal(cancelled,0);
      }
    });
    await t.test('expiry cancellation failure rolls back booking expiry fields and ledger history', async () => {
      const booking = await expiringBooking(); const before = await revision();
      await pool.query(`CREATE FUNCTION reject_expiry_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced expiry failure'; END $$;
        CREATE TRIGGER reject_expiry_cancel BEFORE UPDATE ON resource_ledger_reservations FOR EACH ROW EXECUTE FUNCTION reject_expiry_cancel()`);
      try {
        await assert.rejects(expire(),/forced expiry failure/);
        const current = await readBooking(booking._id); assert.equal(current.status,'pending'); assert.equal(current.expiredAt,undefined);
        assert.equal(await revision(),before); assert.equal(await count('resource_ledger_commands'),1); assert.equal(cancelled,0);
      } finally { await pool.query('DROP TRIGGER reject_expiry_cancel ON resource_ledger_reservations; DROP FUNCTION reject_expiry_cancel()'); }
    });
    await t.test('converted expiry binding rolls back cancellation without releasing occupancy', async () => {
      const booking = await expiringBooking();
      await pool.query("UPDATE resource_ledger_reservations SET state='converted'; INSERT INTO tickets VALUES(3,1,10)");
      await pool.query(`INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,reservation_id,started_at,expected_end_at)
        SELECT 1,10,3,1000,1,1,id,clock_timestamp(),clock_timestamp()+interval '1 hour' FROM resource_ledger_reservations`);
      await assert.rejects(expire(),{statusCode:409});
      assert.equal((await readBooking(booking._id)).status,'pending'); assert.equal(cancelled,0);
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
    });
    await t.test('expiry rechecks proof after waiting for the location lock', async () => {
      const booking = await expiringBooking(); const before = await revision();
      const blocker = await pool.connect(); let outcome;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        outcome = expire().then(ids => ({ids}),error => ({error}));
        for (let attempts=0; attempts<100; attempts++) {
          const waiting = await pool.query(`SELECT COUNT(*)::int AS count FROM pg_stat_activity
            WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%store_locations%'
              AND pid<>pg_backend_pid()`,[schema]);
          if (waiting.rows[0].count) break;
          if (attempts === 99) throw new Error('Expiry did not wait on location lock');
          await new Promise(resolve => setTimeout(resolve,5));
        }
        await blocker.query("UPDATE bookings SET payment_proof_object_key='committed-proof' WHERE id=$1",[booking._id]);
        await blocker.query('COMMIT');
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
      assert.deepEqual(await outcome,{ids:[]});
      assert.equal((await readBooking(booking._id)).status,'pending'); assert.equal(cancelled,0); assert.equal(await revision(),before);
    });
    await t.test('customer-scoped expiry never cancels another customer at the same branch', async () => {
      const first = await proofBooking(); await pool.query('UPDATE location_resource_pools SET capacity=2');
      const second = await bookingService.createCustomerBooking({user,body});
      await pool.query("UPDATE bookings SET pending_expires_at=clock_timestamp()-interval '1 minute'");
      await pool.query("UPDATE bookings SET customer_user_id=2 WHERE id=$1",[second._id]);
      assert.deepEqual(await bookingService.expirePendingBookingsForCustomer('1'),[first._id]);
      assert.equal((await readBooking(second._id)).status,'pending'); assert.equal(cancelled,1);
      assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM resource_ledger_reservations WHERE state='protected'")).rows[0].count,1);
    });
    await t.test('expiry keeps BIGINT booking identity above JavaScript safe integer range', async () => {
      await reset(); await configureResources();
      await pool.query("SELECT setval('bookings_id_seq',9007199254740993,FALSE)");
      const booking = await bookingService.createCustomerBooking({user,body});
      assert.equal(booking._id,'9007199254740993');
      await pool.query("UPDATE bookings SET pending_expires_at=clock_timestamp()-interval '1 minute'");
      assert.deepEqual(await expire(),[booking._id]);
      assert.equal((await readBooking(booking._id)).status,'canceled'); assert.equal(cancelled,1);
    });
    await t.test('expiry uses the database cutoff even when application clock is ahead', async () => {
      const booking = await expiringBooking();
      const ActualDate = Date;
      global.Date = class extends ActualDate {
        constructor(...args) { super(...(args.length ? args : [ActualDate.now()+3600000])); }
        static now() { return ActualDate.now()+3600000; }
      };
      try {
        assert.deepEqual(await expire(),[booking._id]);
        const current = await readBooking(booking._id);
        assert.equal(current.status,'canceled');
        assert.ok(new ActualDate(current.expiredAt).getTime() <= ActualDate.now());
        assert.equal(cancelled,1);
      } finally { global.Date = ActualDate; }
    });
    await t.test('system expiry command capability rejects other commands and unexpired bindings', async () => {
      const booking = await proofBooking();
      const {withSystemExpiryTransaction} = require('../src/repositories/resourceLedger');
      const binding = (await pool.query('SELECT id::text FROM resource_ledger_reservations')).rows[0].id;
      for (const command of ['reserve','allocate','release','cancelReservation']) {
        await assert.rejects(withSystemExpiryTransaction({pool,tenantId:'1',locationId:'10'},async (client,ledger) => {
          await client.query('INSERT INTO allowances VALUES(999)');
          try { await ledger.executeCommand({operationKey:`booking:${booking._id}:reservation:${binding}:expiry:cancel`,command,
            payload:command === 'reserve' ? {bookingItemId:'1'} : command === 'allocate' ? {ticketId:'1'} : command === 'release' ? {allocationId:'1',outcome:'completed'} : {reservationId:binding}}); } catch { /* caught command still poisons transaction */ }
        }),{statusCode:403});
        assert.equal(await count('allowances'),1); assert.equal(await count('resource_ledger_commands'),1);
      }
    });
    async function arrivalBooking(enabled = true) {
      const booking = await proofBooking(enabled);
      const startsAt = Date.now();
      const start = new Date(startsAt).toISOString(); const end = new Date(startsAt+3600000).toISOString();
      await pool.query("UPDATE bookings SET status='confirmed',starts_at=$1,ends_at=$2",[start,end]);
      await pool.query('UPDATE booking_bundle_items SET scheduled_start_at=$1,scheduled_end_at=$2',[start,end]);
      await pool.query('UPDATE resource_ledger_reservations SET starts_at=$1,ends_at=$2',[start,end]);
      savedBookings.get(booking._id).serviceManualPaymentRequired = false;
      return booking;
    }
    const arriveStaff = booking => bookingService.checkInVendorBooking({tenant,location,bookingId:booking._id,user:{_id:'2'}});
    const arriveCustomer = booking => bookingService.checkInCustomerBooking({bookingId:booking._id,user});
    await t.test('check-in captures a booking service plan and retains protection without allocating', async () => {
      const booking = await arrivalBooking();
      const before = (await pool.query('SELECT * FROM resource_ledger_reservations')).rows[0];
      const result = await arriveStaff(booking);
      assert.ok(result.booking.checkedInAt); assert.equal(result.booking.queueTicketId,result.ticket.id);
      assert.equal(await count('tickets'),1); assert.equal(await count('ticket_service_plans'),1); assert.equal(await count('resource_allocations'),0);
      assert.deepEqual((await pool.query('SELECT * FROM resource_ledger_reservations')).rows[0],before);
      const plan=(await pool.query('SELECT source,booking_id::text,items FROM ticket_service_plans')).rows[0];
      assert.equal(plan.source,'booking'); assert.equal(plan.booking_id,booking._id); assert.equal(plan.items[0].bookingItemId,'1');
      assert.equal(plan.items[0].durationMinutes,60); assert.equal(plan.items[0].resource.unitsRequired,1);
      assert.equal(await revision(),'4'); assert.equal(cancelled,1);
    });
    await t.test('customer retry returns existing ticket and simultaneous staff/customer arrival creates once', async () => {
      const booking = await arrivalBooking();
      const results = await Promise.allSettled([arriveStaff(booking),arriveCustomer(booking)]);
      assert.ok(results.some(value => value.status === 'fulfilled'));
      const existing = await arriveCustomer(booking);
      assert.equal(existing.ticket.id,String((await readBooking(booking._id)).queueTicketId));
      assert.equal(await count('tickets'),1); assert.equal(await count('ticket_service_plans'),1); assert.equal(cancelled,1);
      await assert.rejects(arriveStaff(booking),{statusCode:409});
    });
    await t.test('no-show and late staff check-in contend with one committed outcome', async () => {
      const booking = await lateBooking();
      const outcomes = await Promise.allSettled([noShow(booking),bookingService.checkInVendorBooking({tenant,location,bookingId:booking._id,user:{_id:'2'},overrideWindow:true})]);
      assert.equal(outcomes.filter(value => value.status === 'fulfilled').length,1);
      assert.equal(outcomes.find(value => value.status === 'rejected').reason.statusCode,409);
      const current=await readBooking(booking._id);
      const arrived=Boolean(current.checkedInAt);
      assert.equal(await count('tickets'),arrived ? 1 : 0);
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,arrived ? 'protected' : 'cancelled');
      assert.equal(cancelled,1); assert.equal(await count('resource_allocations'),0);
    });
    await t.test('plan capture failure rolls back arrival, ticket, allowance and revision', async () => {
      const booking = await arrivalBooking(); const before = await revision(); planFails=true;
      await assert.rejects(arriveStaff(booking),/Forced service plan failure/);
      assert.equal((await readBooking(booking._id)).checkedInAt,null); assert.equal((await readBooking(booking._id)).queueTicketId,null);
      assert.equal(await count('tickets'),0); assert.equal(await count('ticket_service_plans'),0); assert.equal(await count('allowances'),1);
      assert.equal(await revision(),before); assert.equal(cancelled,0);
    });
    await t.test('arrival rechecks staff assignment, customer ownership and actor suspension', async () => {
      let booking = await arrivalBooking(); await pool.query("UPDATE tenant_memberships SET role='staff'");
      await assert.rejects(arriveStaff(booking),{statusCode:403}); await pool.query('INSERT INTO tenant_membership_locations VALUES(2,10)');
      await arriveStaff(booking); assert.equal(cancelled,1);
      booking = await arrivalBooking(); changedLockedOwner=true; await assert.rejects(arriveCustomer(booking),{statusCode:404});
      changedLockedOwner=false; await pool.query('UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1');
      await assert.rejects(arriveCustomer(booking),{statusCode:403}); assert.equal(await count('tickets'),0);
    });
    await t.test('arrival rejects disabled branch, business, self check-in, unpaid proof and closed intake', async () => {
      for (const scenario of ['branch','business','self','payment','queue']) {
        const booking = await arrivalBooking();
        if (scenario === 'branch') lockedLocationRevoked=true;
        if (scenario === 'business') lockedTenantRevoked=true;
        if (scenario === 'self') location.customerSelfCheckInEnabled=false;
        if (scenario === 'payment') savedBookings.get(booking._id).serviceManualPaymentRequired=true;
        if (scenario === 'queue') intakeClosed=true;
        await assert.rejects(arriveCustomer(booking),{statusCode:409});
        assert.equal(await count('tickets'),0); assert.equal(cancelled,0);
      }
    });
    await t.test('arrival rejects missing or converted protection and preserves ordinary disabled behavior', async () => {
      for (const state of ['cancelled','converted']) {
        const booking = await arrivalBooking(); await pool.query('UPDATE resource_ledger_reservations SET state=$1',[state]);
        await assert.rejects(arriveStaff(booking),{statusCode:409}); assert.equal(await count('tickets'),0); assert.equal(cancelled,0);
      }
      const booking = await arrivalBooking(false); await arriveStaff(booking);
      assert.equal(await count('tickets'),1); assert.equal(await count('resource_ledger_reservations'),0); assert.equal(await count('resource_allocations'),0);
    });
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
      for (const action of ['cancel','no-show']) {
        const created = action === 'cancel' ? await proofBooking(false) : await lateBooking();
        const blocker = await pool.connect();
        let cancellation;
        try {
          await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          cancellation = (action === 'cancel' ? bookingService.cancelCustomerBooking({user,bookingId:created._id}) : noShow(created)).then(() => null, error => error);
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
        assert.equal((await readBooking(created._id)).status,action === 'cancel' ? 'pending' : 'confirmed'); assert.equal(cancelled,0);
      }
    });
    const vendor = { _id:'2' };
    const movedStart = new Date(new Date(scheduledStartAt).getTime()+2*3600000).toISOString();
    const move = (bookingId, start = movedStart) => bookingService.rescheduleVendorBooking({tenant,user:vendor,bookingId,scheduledStartAt:start});
    const status = (bookingId, value) => bookingService.updateVendorBookingStatus({tenant,user:vendor,bookingId,status:value});
    await t.test('vendor reschedule preserves composed durations, quantity, prices and item identities', async () => {
      await reset(); await configureResources(false); catalog.allowBookingQuantity = true;
      body.bundleItems = [{serviceSlug:'consultation',bookingQuantity:2},{serviceSlug:'other',bookingQuantity:1}]; body.executionMode = 'sequential';
      const created = await bookingService.createCustomerBooking({user,body});
      const original = await readBooking(created._id); catalog.durationMinutes = 90; catalog.allowBookingQuantity = false;
      await move(created._id);
      const moved = await readBooking(created._id);
      assert.equal(moved.status,'rescheduled'); assert.equal(moved.scheduledStartAt,movedStart);
      assert.equal(new Date(moved.scheduledEndAt)-new Date(movedStart),3*3600000);
      assert.deepEqual(moved.bundleItems.map(item => [item.id,item.bookingQuantity,item.priceAmountCents]),original.bundleItems.map(item => [item.id,item.bookingQuantity,item.priceAmountCents]));
      assert.equal(new Date(moved.bundleItems[0].scheduledEndAt)-new Date(moved.bundleItems[0].scheduledStartAt),2*3600000);
      assert.equal(moved.bundleItems[1].scheduledStartAt,moved.bundleItems[0].scheduledEndAt);
      assert.equal(moved.bundleItems[1].scheduledEndAt,moved.scheduledEndAt);
      const slots = await bookingService.listVendorBookingRescheduleSlots({tenant,bookingId:created._id,date:movedStart.slice(0,10)});
      const slot = slots.find(slot => slot.startAt === movedStart);
      assert.equal(slot.endAt,moved.scheduledEndAt);
      assert.equal(await count('resource_ledger_reservations'),0);
    });
    await t.test('renamed service slug preserves ID-based reschedule and slot access', async () => {
      await reset(); await configureResources(false); const created = await bookingService.createCustomerBooking({user,body});
      const original = await readBooking(created._id); catalogSlugRenamed = true;
      const slots = await bookingService.listVendorBookingRescheduleSlots({tenant,bookingId:created._id,date:movedStart.slice(0,10)});
      assert.ok(slots.some(slot => slot.startAt === movedStart));
      await move(created._id);
      const moved = await readBooking(created._id);
      assert.equal(moved.bundleItems[0].serviceId,original.bundleItems[0].serviceId);
      assert.equal(moved.bundleItems[0].serviceSlug,'consultation'); assert.equal(moved.scheduledStartAt,movedStart);
    });
    await t.test('resource reschedule replaces immutable binding even after tracking disable and can move back', async () => {
      await reset(); await configureResources(); const created = await bookingService.createCustomerBooking({user,body});
      await pool.query('UPDATE location_resource_pools SET tracking_enabled=FALSE'); catalog.durationMinutes = 90;
      await move(created._id); await move(created._id,scheduledStartAt);
      const bindings = (await pool.query('SELECT units,pool_revision,starts_at,ends_at,state FROM resource_ledger_reservations ORDER BY id')).rows;
      assert.deepEqual(bindings.map(item => item.state),['cancelled','cancelled','protected']);
      assert.equal(bindings[2].starts_at.toISOString(),scheduledStartAt); assert.equal(bindings[2].ends_at-bindings[2].starts_at,3600000);
      assert.equal(bindings[2].units,1); assert.equal(bindings[2].pool_revision,1);
      assert.equal(await count('resource_ledger_commands'),5);
    });
    await t.test('replacement capacity conflict rolls back booking, items, old binding and receipts', async () => {
      await reset(); await configureResources(); const created = await bookingService.createCustomerBooking({user,body});
      const before = await readBooking(created._id); body.scheduledStartAt = movedStart;
      await bookingService.createCustomerBooking({user,body});
      const revision = (await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision;
      await assert.rejects(move(created._id),/resource capacity/);
      assert.deepEqual(await readBooking(created._id),before);
      assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM resource_ledger_reservations WHERE state='protected'")).rows[0].count,2);
      assert.equal(await count('resource_ledger_commands'),2); assert.equal(cancelled,0);
      assert.equal((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision,revision);
    });
    await t.test('simultaneous reschedule and create cannot exceed one protected unit at the destination', async () => {
      await reset(); await configureResources(); const created = await bookingService.createCustomerBooking({user,body}); body.scheduledStartAt = movedStart;
      const outcomes = await Promise.allSettled([move(created._id),bookingService.createCustomerBooking({user,body})]);
      assert.equal(outcomes.filter(value => value.status === 'fulfilled').length,1);
      assert.equal(outcomes.find(value => value.status === 'rejected').reason.statusCode,409);
      assert.equal((await pool.query("SELECT SUM(units)::int AS units FROM resource_ledger_reservations WHERE state='protected' AND starts_at=$1",[movedStart])).rows[0].units,1);
    });
    await t.test('resource draft revision changes reject rescheduling without rewriting frozen demand', async () => {
      await reset(); await configureResources(); const created = await bookingService.createCustomerBooking({user,body}); const before = await readBooking(created._id);
      await pool.query('UPDATE service_resource_requirements SET units_required=4,revision=2');
      await assert.rejects(move(created._id),/configuration is stale/);
      assert.deepEqual(await readBooking(created._id),before); assert.equal(await count('resource_ledger_commands'),1);
    });
    await t.test('vendor confirmation preserves protection and cancellation uses bindings after draft edits', async () => {
      await reset(); await configureResources(); const created = await bookingService.createCustomerBooking({user,body});
      await status(created._id,'confirmed'); assert.equal(await count('resource_ledger_commands'),1);
      await pool.query('UPDATE service_resource_requirements SET units_required=4,revision=2; UPDATE location_resource_pools SET tracking_enabled=FALSE');
      await status(created._id,'canceled');
      assert.equal((await readBooking(created._id)).status,'canceled');
      assert.deepEqual((await pool.query('SELECT units,state FROM resource_ledger_reservations')).rows[0],{units:1,state:'cancelled'});
      await assert.rejects(status(created._id,'confirmed'),{statusCode:409});
    });
    await t.test('vendor permission and suspended actor are rechecked inside scoped transaction', async () => {
      await reset(); const created = await bookingService.createCustomerBooking({user,body});
      await pool.query("UPDATE tenant_memberships SET role='staff'");
      await assert.rejects(move(created._id),{statusCode:403});
      await pool.query("UPDATE tenant_memberships SET role='owner',is_active=FALSE");
      await assert.rejects(status(created._id,'canceled'),{statusCode:403});
      await pool.query('UPDATE tenant_memberships SET is_active=TRUE; UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=2');
      await assert.rejects(status(created._id,'confirmed'),{statusCode:403});
      assert.equal((await readBooking(created._id)).status,'pending'); assert.equal(cancelled,0);
    });
    await t.test('missing resource binding and expired pending booking cannot be promoted by vendor', async () => {
      await reset(); await configureResources(); const created = await bookingService.createCustomerBooking({user,body});
      await pool.query('DELETE FROM resource_ledger_reservations');
      await assert.rejects(move(created._id),/Reconciliation/);
      await assert.rejects(status(created._id,'confirmed'),/Reconciliation/);
      await pool.query("UPDATE bookings SET pending_expires_at=clock_timestamp()-interval '1 second'");
      await assert.rejects(status(created._id,'confirmed'),/window has expired/);
      assert.equal((await readBooking(created._id)).status,'pending'); assert.equal(cancelled,0);
    });
    await t.test('converted resource booking cannot be rescheduled or changed through vendor status', async () => {
      await reset(); await configureResources(); const created = await bookingService.createCustomerBooking({user,body});
      await pool.query("UPDATE resource_ledger_reservations SET state='converted'");
      for (const action of [() => move(created._id),() => status(created._id,'confirmed'),() => status(created._id,'canceled')]) await assert.rejects(action(),/started service/);
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
