const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');
const {loadModuleWithMocks} = require('./helpers/loadModuleWithMocks.cjs');
const ledger = require('../src/repositories/resourceLedger');
const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
function loadService(mocks, filename = 'ticketServiceTimingService') {
  const target = require.resolve(`../src/services/${filename}`);
  return loadModuleWithMocks(target, mocks);
}
test('staff assignment lookup preserves exact scoped identifiers', async () => {
  const ids=['9007199254740993','9007199254740995','9007199254740997'];
  const repo=require('../src/repositories/tenantMembershipLocations');
  assert.equal(await repo.userHasLocationAssignment(...ids,{client:{query:async (_sql,args) => {
    assert.deepEqual(args,ids); return {rows:[{}]};
  }}}),true);
});
test('explicit service sessions under scoped PostgreSQL transaction', {skip:!databaseUrl}, async t => {
  const url=new URL(databaseUrl); assert.equal(url.hostname,'127.0.0.1');
  assert.ok(['/getprio_test','/getprio_ledger_test'].includes(url.pathname));
  const schema=`service_session_${randomUUID().replaceAll('-','')}`;
  const {Pool}=require('pg');
  const pool=new Pool({connectionString:databaseUrl,options:`-c search_path=${schema}`,application_name:schema,max:8});
  const tenant={_id:'1'}; const location={_id:'10'};
  let failEvent=false; let failBooking=false; let failWebhook=false; let failReconciliation=false; let snapshots=0; let pushes=0; let failAllowance=false; let dueRead=0; let dayReads=0; let failPayment=false; let subscriptionUnavailable=false; let paidDeadlineRace=false; let paidDeadlineObserved=false; let verifyPaidUserLock=false; let verifyPaidTenantLock=false; const billingEvents=new Set(); let paidEventBarrier=null; let intakeBarrier=null;
  const servicePushes=[]; const servicePushCommitChecks=[]; let failServicePush=false;
  let automaticPushes=0;let failCarryOverOutbox=false;let vendorEventBarrier=null;
  const noop=async () => {};
  async function readTicket(id,{client=pool}={}) {
    const r=(await client.query('SELECT * FROM tickets WHERE id=$1',[id])).rows[0];
    return r && {_id:String(r.id),tenantId:String(r.tenant_id),locationId:String(r.location_id),
      status:r.status,joinChannel:r.join_channel,customerConfirmedAt:r.customer_confirmed_at,
      serviceStartedAt:r.service_started_at,serviceEndedAt:r.service_ended_at,serviceOutcome:r.service_outcome,
      userId:r.user_id && String(r.user_id),customerEmail:r.customer_email,customerPhone:r.customer_phone,
      ticketNumber:String(r.id),dateKey:'2026-10-08',lookupCode:r.lookup_code,updatedAt:r.updated_at};
  }
  try {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE TABLE users(id BIGINT PRIMARY KEY,roles TEXT[],deletion_requested_at TIMESTAMPTZ,platform_access_suspended_at TIMESTAMPTZ,email TEXT,phone TEXT,mfa_required BOOLEAN DEFAULT FALSE,updated_at TIMESTAMPTZ);
      CREATE TABLE queue_fee_settings(plan_slug TEXT PRIMARY KEY,enabled BOOLEAN,amount_cents INTEGER,currency TEXT,
        updated_by_user_id BIGINT,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
      CREATE TABLE tenant_subscriptions(id BIGINT PRIMARY KEY,tenant_id BIGINT,status TEXT,plan_slug TEXT,updated_at TIMESTAMPTZ);
      CREATE TABLE tenants(id BIGINT PRIMARY KEY,is_active BOOLEAN,auto_pause_enabled BOOLEAN DEFAULT FALSE,auto_pause_threshold INTEGER,auto_resume_enabled BOOLEAN DEFAULT FALSE,auto_resume_vacancy_percent INTEGER,queue_prefix TEXT DEFAULT 'Q',name TEXT DEFAULT 'Tenant');
      CREATE TABLE tenant_memberships(id BIGINT PRIMARY KEY,user_id BIGINT,tenant_id BIGINT,role TEXT,is_active BOOLEAN);
      CREATE TABLE tenant_membership_locations(tenant_membership_id BIGINT,location_id BIGINT,assignment_source TEXT DEFAULT 'explicit',assigned_by_user_id BIGINT,UNIQUE(tenant_membership_id,location_id));
      CREATE TABLE service_counters(id BIGINT,tenant_id BIGINT,location_id BIGINT,is_active BOOLEAN);
      CREATE TABLE service_counter_assignments(user_id BIGINT,counter_id BIGINT);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT,is_active BOOLEAN,service_timing_enabled BOOLEAN,UNIQUE(id,tenant_id));
      ALTER TABLE tenant_membership_locations ADD FOREIGN KEY(tenant_membership_id) REFERENCES tenant_memberships(id) ON DELETE CASCADE,
        ADD FOREIGN KEY(location_id) REFERENCES store_locations(id) ON DELETE CASCADE,ADD FOREIGN KEY(assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
      CREATE TABLE location_resource_pools(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,capacity INTEGER,revision INTEGER,tracking_enabled BOOLEAN,UNIQUE(id,tenant_id,location_id));
      CREATE TABLE service_resource_requirements(tenant_id BIGINT,location_id BIGINT,service_id BIGINT,pool_id BIGINT,units_required INTEGER,revision INTEGER);
      CREATE TABLE bookings(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,status TEXT,pending_expires_at TIMESTAMPTZ,payment_proof_object_key TEXT,queue_ticket_id BIGINT,fulfillment_outcome_reason TEXT,refund_eligible BOOLEAN,fulfillment_resolved_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,customer_user_id BIGINT,customer_email TEXT,customer_phone TEXT);
      CREATE TABLE booking_bundle_items(id BIGINT PRIMARY KEY,booking_id BIGINT,tenant_id BIGINT,location_id BIGINT,service_id BIGINT,scheduled_start_at TIMESTAMPTZ,scheduled_end_at TIMESTAMPTZ);
      CREATE TABLE tickets(id BIGINT GENERATED BY DEFAULT AS IDENTITY (START WITH 10000) PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,status TEXT,join_channel TEXT,customer_confirmed_at TIMESTAMPTZ,
        service_started_at TIMESTAMPTZ,service_started_by_user_id BIGINT,service_ended_at TIMESTAMPTZ,service_ended_by_user_id BIGINT,
        service_outcome TEXT,status_reason TEXT,updated_at TIMESTAMPTZ,served_at TIMESTAMPTZ,unserved_at TIMESTAMPTZ,service_priority_band TEXT,rejoin_deadline_at TIMESTAMPTZ,
        lookup_code TEXT,user_id BIGINT,customer_email TEXT,customer_phone TEXT,UNIQUE(id,tenant_id,location_id));
      CREATE TABLE ticket_service_plans(ticket_id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,source TEXT,booking_id BIGINT,items JSONB);
      CREATE TABLE events(id BIGSERIAL PRIMARY KEY,ticket_id BIGINT,event_type TEXT,metadata JSONB,actor_role TEXT,source TEXT,tenant_id BIGINT,location_id BIGINT,event_key TEXT);
      CREATE UNIQUE INDEX events_expiry_key ON events(event_key) WHERE event_key IS NOT NULL;
      CREATE TABLE carry_over_outbox(idempotency_key TEXT PRIMARY KEY,event_id BIGINT,ticket_id BIGINT,channel TEXT,payload JSONB);
      CREATE TABLE queue_day_pauses(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,queue_date_key TEXT,pause_reason TEXT,pause_mode TEXT,paused_by_user_id BIGINT,resumed_by_user_id BIGINT,paused_at TIMESTAMPTZ,resumed_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE UNIQUE INDEX queue_day_pauses_active_scope_idx ON queue_day_pauses(tenant_id,location_id,queue_date_key) WHERE resumed_at IS NULL;
      CREATE TABLE webhooks(event_id BIGINT);
      CREATE TABLE queue_ticket_segments(ticket_id BIGINT,ended_at TIMESTAMPTZ,segment_outcome TEXT,outcome_reason TEXT,queue_day_id BIGINT,display_number TEXT,sequence INTEGER,priority_band TEXT,UNIQUE(ticket_id,queue_day_id));
      CREATE TABLE queue_day_state(state TEXT,closes_at TIMESTAMPTZ DEFAULT clock_timestamp()-interval '1 second',intake_mode TEXT DEFAULT 'accepting',next_sequence INTEGER DEFAULT 1);
      CREATE TABLE intake_state(paused BOOLEAN,closed BOOLEAN DEFAULT FALSE,closure JSONB DEFAULT '{}');
      CREATE TABLE lifecycle_notifications(ticket_id BIGINT,status TEXT);
      CREATE TABLE booking_audit(ticket_id BIGINT,metadata JSONB);
      CREATE TABLE platform_membership_effects(kind TEXT,user_id BIGINT);
      CREATE TABLE counters(tenant_id BIGINT,location_id BIGINT,key TEXT,date_key TEXT,value INTEGER,PRIMARY KEY(tenant_id,location_id,key,date_key));
      CREATE TABLE vendor_services(id BIGINT PRIMARY KEY,tenant_id BIGINT,name TEXT,duration_minutes INTEGER,is_active BOOLEAN,
        slug TEXT,description TEXT,image_url TEXT,allow_booking_quantity BOOLEAN,booking_quantity_label TEXT,manual_payment_required BOOLEAN,
        booking_capacity_scope TEXT,price_amount_cents INTEGER,currency TEXT,price_display TEXT,sort_order INTEGER,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
      CREATE TABLE location_services(service_id BIGINT,tenant_id BIGINT,location_id BIGINT,is_active BOOLEAN);
      CREATE TABLE vendor_availability_blocks(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,service_id BIGINT,
        weekday INTEGER,starts_at TIME,ends_at TIME,ends_next_day BOOLEAN DEFAULT FALSE,capacity INTEGER,is_active BOOLEAN,notes TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE vendor_availability_exceptions(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,service_id BIGINT,
        exception_date DATE,starts_at TIME,ends_at TIME,is_available BOOLEAN,capacity INTEGER,reason TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE store_hours(id BIGSERIAL PRIMARY KEY,location_id BIGINT,weekday INTEGER,opens_at TIME,closes_at TIME,is_closed BOOLEAN,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
      CREATE TABLE allowance_audit(ticket_id BIGINT,resource_key TEXT);
      CREATE TABLE queue_email_journeys(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,ticket_id BIGINT UNIQUE,mode TEXT,otp_chain_id TEXT,email_opted_out_at TIMESTAMPTZ);
      CREATE TABLE queue_email_slots(journey_id BIGINT,slot_key TEXT,status TEXT DEFAULT 'unused',logical_message_key TEXT,sent_at TIMESTAMPTZ,UNIQUE(journey_id,slot_key));
      CREATE TABLE queue_join_payments(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,otp_id BIGINT,plan_slug TEXT DEFAULT 'free',provider TEXT DEFAULT 'paymongo',
        provider_checkout_session_id TEXT,provider_payment_id TEXT,status TEXT DEFAULT 'pending',amount_cents INTEGER DEFAULT 100,currency TEXT DEFAULT 'PHP',checkout_url TEXT,
        payload JSONB DEFAULT '{}',metadata JSONB DEFAULT '{}',ticket_id BIGINT,ticket_lookup_code TEXT,queue_day_id BIGINT,queue_day_version_at_checkout INTEGER,
        ticket_issuance_status TEXT DEFAULT 'pending',ticket_issuance_reason TEXT,ticket_issuance_attempted_at TIMESTAMPTZ,paid_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ,UNIQUE(tenant_id,otp_id));
      CREATE TABLE payment_allowance(reservation_key TEXT PRIMARY KEY,state TEXT,ticket_id BIGINT);
      ALTER TABLE store_locations ADD COLUMN slug TEXT DEFAULT 'main', ADD COLUMN queue_join_id UUID,
        ADD COLUMN name TEXT, ADD COLUMN image_url TEXT, ADD COLUMN address_line1 TEXT, ADD COLUMN address_line2 TEXT,
        ADD COLUMN city TEXT, ADD COLUMN province TEXT, ADD COLUMN postal_code TEXT, ADD COLUMN country TEXT,
        ADD COLUMN contact_email TEXT, ADD COLUMN contact_phone TEXT, ADD COLUMN payment_method_label TEXT,
        ADD COLUMN payment_bank_name TEXT, ADD COLUMN payment_account_display_name TEXT, ADD COLUMN payment_account_identifier_display TEXT,
        ADD COLUMN payment_qr_image_url TEXT, ADD COLUMN payment_qr_active BOOLEAN, ADD COLUMN customer_self_check_in_enabled BOOLEAN,
        ADD COLUMN is_primary BOOLEAN DEFAULT FALSE, ADD COLUMN created_at TIMESTAMPTZ, ADD COLUMN updated_at TIMESTAMPTZ;
      ALTER TABLE location_resource_pools ADD COLUMN name TEXT DEFAULT 'Court';
      ALTER TABLE ticket_service_plans ADD COLUMN execution_mode TEXT, ADD COLUMN created_by_user_id BIGINT;
      ALTER TABLE users ADD COLUMN display_name TEXT;
      ALTER TABLE store_locations ADD COLUMN queue_lifecycle_mode TEXT DEFAULT 'legacy', ADD COLUMN timezone TEXT DEFAULT 'Asia/Manila';
      ALTER TABLE bookings ADD COLUMN reference TEXT DEFAULT 'BK-1', ADD COLUMN scheduled_start_at TIMESTAMPTZ,
        ADD COLUMN scheduled_end_at TIMESTAMPTZ, ADD COLUMN execution_mode TEXT DEFAULT 'single';
      ALTER TABLE booking_bundle_items ADD COLUMN sort_order INTEGER DEFAULT 0;
      ALTER TABLE tickets ADD COLUMN service_counter_id BIGINT, ADD COLUMN ticket_number TEXT,
        ADD COLUMN sequence INTEGER, ADD COLUMN date_key TEXT DEFAULT '20261008', ADD COLUMN queue_date_key TEXT,
        ADD COLUMN developer_project_id BIGINT, ADD COLUMN developer_environment TEXT, ADD COLUMN external_reference TEXT,
        ADD COLUMN customer_name TEXT, ADD COLUMN notify_by_email BOOLEAN DEFAULT FALSE, ADD COLUMN notify_by_sms BOOLEAN DEFAULT FALSE,
        ADD COLUMN notes TEXT, ADD COLUMN notified_almost_there_at TIMESTAMPTZ, ADD COLUMN notified_called_at TIMESTAMPTZ,
        ADD COLUMN called_at TIMESTAMPTZ, ADD COLUMN skipped_at TIMESTAMPTZ, ADD COLUMN cancelled_at TIMESTAMPTZ,
        ADD COLUMN carried_over_at TIMESTAMPTZ, ADD COLUMN carry_over_count INTEGER DEFAULT 0,
        ADD COLUMN original_queue_day_id BIGINT, ADD COLUMN current_queue_day_id BIGINT,
        ADD COLUMN pending_carry_over_since TIMESTAMPTZ, ADD COLUMN carry_over_expires_at TIMESTAMPTZ,
        ADD COLUMN carry_over_consumed BOOLEAN DEFAULT FALSE, ADD COLUMN terminal_at TIMESTAMPTZ,
        ADD COLUMN replacement_for_ticket_id BIGINT, ADD COLUMN email_journey_mode TEXT,
        ADD COLUMN created_at TIMESTAMPTZ DEFAULT clock_timestamp()`);
    await pool.query(fs.readFileSync(path.resolve(__dirname,'../../database/migrations/20261007_add_resource_ledger_foundation.sql'),'utf8'));
    const mocks={
      '../config/db':{pool},
      '../repositories/tickets':{findTicketById:readTicket,findTicketByIdForUpdate:async (id,{client}) => {
        await client.query('SELECT id FROM tickets WHERE id=$1 FOR UPDATE',[id]); return readTicket(id,{client});
      }},
      '../repositories/bookings':{updateBookingByQueueTicketId:async (id,data,{client}) => {
        await client.query('UPDATE bookings SET status=$2 WHERE queue_ticket_id=$1',[id,data.status]);
        await client.query('INSERT INTO booking_audit VALUES($1,$2)',[id,JSON.stringify(data)]);
        if (failBooking) throw new Error('booking failed');
      }},
      '../repositories/queueEvents':{createQueueEvent:async (data,{client}) => {
        const r=await client.query('INSERT INTO events(ticket_id,event_type,metadata,actor_role,source) VALUES($1,$2,$3,$4,$5) RETURNING id',[data.ticketId,data.eventType,JSON.stringify(data.metadata),data.actorRole,data.source]);
        if (vendorEventBarrier) {vendorEventBarrier.reached();await vendorEventBarrier.release;}
        if (paidEventBarrier && data.eventType==='ticket_created') {paidEventBarrier.reached(); await paidEventBarrier.release;}
        if (verifyPaidUserLock && data.eventType==='ticket_created') await assert.rejects(pool.query('SELECT id FROM users WHERE id=1 FOR UPDATE NOWAIT'),{code:'55P03'});
        if (verifyPaidTenantLock && data.eventType==='ticket_created') await assert.rejects(pool.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT'),{code:'55P03'});
        if (failEvent) throw new Error('event failed'); return {_id:String(r.rows[0].id)};
      }},
      './developerWebhookService':{enqueueQueueEvent:async ({event},{client}) => {
        await client.query('INSERT INTO webhooks VALUES($1)',[event._id]);
        if (failWebhook) throw new Error('webhook failed');
      }},
      './queueService':{publishSnapshot:async () => {snapshots++; return {}; }},
      './queueAutomationHelpers':{maybeAutoResumeQueueDay:noop,maybeAutoPauseQueueDay:noop,maybeNotifyUpcomingTickets:noop},
      './notificationService':{notifyJourneyLifecycle:noop},
      './pushNotificationService':{notifyCustomerQueueUpdate:async ({ticket,action}) => {
        if (!action.startsWith('service_')) {pushes++;return;}
        const committed=await readTicket(ticket._id);
        servicePushes.push(action);
        servicePushCommitChecks.push(action==='service_started'
          ? Boolean(committed.serviceStartedAt)
          : Boolean(committed.serviceEndedAt) && committed.serviceOutcome===ticket.serviceOutcome);
        if (failServicePush) throw new Error('provider unavailable');
      }}
    };
    const service=loadService(mocks);
    const record=(id,action,actor='1',selected=location) => service.recordTicketService(tenant,id,action,{location:selected,actorUserId:actor});
    await pool.query(fs.readFileSync(path.resolve(__dirname,'../../database/migrations/20261011_add_rotating_ticket_barcodes.sql'),'utf8'));
    async function reset(capacity=4,enabled=true) {
      await pool.query(`TRUNCATE resource_ledger_commands,resource_allocations,resource_ledger_reservations,resource_ledger_scopes,
        ticket_service_plans,tickets,booking_bundle_items,bookings,service_resource_requirements,location_resource_pools,
        store_locations,tenant_membership_locations,service_counter_assignments,service_counters,tenant_memberships,tenants,users,events,carry_over_outbox,webhooks,booking_audit,platform_membership_effects,queue_ticket_segments,queue_day_state,intake_state,queue_day_pauses,lifecycle_notifications,counters,vendor_services,location_services,vendor_availability_blocks,vendor_availability_exceptions,store_hours,allowance_audit,queue_email_slots,queue_email_journeys,queue_join_payments,payment_allowance,tenant_subscriptions,queue_fee_settings RESTART IDENTITY CASCADE`);
      await pool.query(`INSERT INTO users(id,roles,deletion_requested_at,platform_access_suspended_at,email,phone) VALUES(1,'{}',NULL,NULL,'owner@example.com','09171234567'),(2,'{}',NULL,NULL,'other@example.com','09179876543');
        INSERT INTO tenants(id,is_active) VALUES(1,TRUE),(2,TRUE);
        INSERT INTO tenant_subscriptions VALUES(1,1,'active','free',clock_timestamp());
        INSERT INTO tenant_memberships VALUES(1,1,1,'owner',TRUE),(2,2,1,'staff',TRUE);
        INSERT INTO store_locations(id,tenant_id,is_active,service_timing_enabled) VALUES(10,1,TRUE,TRUE),(20,2,TRUE,TRUE);
        INSERT INTO service_resource_requirements VALUES(1,10,1000,100,1,1);
        INSERT INTO queue_day_state(state) VALUES('open'); INSERT INTO intake_state(paused) VALUES(FALSE);
        INSERT INTO vendor_services(id,tenant_id,name,duration_minutes,is_active,slug) VALUES(1000,1,'Court play',60,TRUE,'court-play'); INSERT INTO location_services VALUES(1000,1,10,TRUE);
        INSERT INTO store_hours(location_id,weekday,opens_at,closes_at,is_closed) SELECT 10,n,'00:00','00:00',FALSE FROM generate_series(0,6) n`);
      await pool.query('INSERT INTO location_resource_pools(id,tenant_id,location_id,capacity,revision,tracking_enabled) VALUES(100,1,10,$1,1,$2)',[capacity,enabled]);
      servicePushes.length=0; failServicePush=false;
      automaticPushes=0; failCarryOverOutbox=false; vendorEventBarrier=null; failEvent=false; failBooking=false; failWebhook=false; failReconciliation=false; snapshots=0; pushes=0; failAllowance=false; dueRead=0; dayReads=0; failPayment=false; subscriptionUnavailable=false; paidDeadlineRace=false; paidDeadlineObserved=false; verifyPaidUserLock=false; verifyPaidTenantLock=false; billingEvents.clear(); paidEventBarrier=null; intakeBarrier=null; queueClosed=false;
      delete location.queueLifecycleMode;
    }
    async function ticket(id,{plan=true,booking=false,channel='vendor'}={}) {
      await pool.query("INSERT INTO tickets(id,tenant_id,location_id,status,join_channel,lookup_code,customer_email,customer_phone) VALUES($1,1,10,'called',$2,$3,'owner@example.com','09171234567')",[id,channel,`LOOKUP-${id}`]);
      const item={serviceId:'1000',durationMinutes:60,resource:{known:true,poolId:'100',poolRevision:1,requirementRevision:1,unitsRequired:1}};
      if (booking) {
        const epoch=Date.now()-60000; const start=new Date(epoch).toISOString(); const end=new Date(epoch+3600000).toISOString();
        await pool.query("INSERT INTO bookings(id,tenant_id,location_id,status,pending_expires_at,payment_proof_object_key,queue_ticket_id,customer_email,customer_phone,scheduled_start_at,scheduled_end_at) VALUES(1,1,10,'confirmed',NULL,NULL,$1,'owner@example.com','09171234567',$2,$3)",[id,start,end]);
        await pool.query('INSERT INTO booking_bundle_items(id,booking_id,tenant_id,location_id,service_id,scheduled_start_at,scheduled_end_at) VALUES(1,1,1,10,1000,$1,$2)',[start,end]);
        Object.assign(item,{bookingItemId:'1',scheduledStartAt:start,scheduledEndAt:end});
        await ledger.executeCommand({pool,tenantId:'1',locationId:'10',actorUserId:'1',operationKey:'booking:1:reserve',command:'reserve',payload:{bookingItemId:'1'}});
      }
      if (plan) await pool.query('INSERT INTO ticket_service_plans(ticket_id,tenant_id,location_id,source,booking_id,items) VALUES($1,1,10,$2,$3,$4)',[id,booking?'booking':'staff_selection',booking?'1':null,JSON.stringify([item])]);
    }
    require('tsx/cjs');
    let queueClosed=false;
    const queueMocks={...mocks,
      '../config/env':{waitTimePredictionCaptureEnabled:false},
      '../repositories/tickets':{...mocks['../repositories/tickets'],
        findCurrentCalledTicket:async (tenantId,{client,locationId}) => {
          const r=(await client.query("SELECT id::text FROM tickets WHERE tenant_id=$1 AND location_id=$2 AND status='called' ORDER BY id LIMIT 1 FOR UPDATE",[tenantId,locationId])).rows[0];
          return r ? readTicket(r.id,{client}) : null;
        },
        updateCurrentCalledTicketStatus:async (tenantId,status,{client,locationId,ticketId}) => {
          const r=await client.query("UPDATE tickets SET status=$4,updated_at=clock_timestamp() WHERE tenant_id=$1 AND location_id=$2 AND id=$3 AND status='called' RETURNING id::text",[tenantId,locationId,ticketId,status]);
          return r.rows[0] ? readTicket(r.rows[0].id,{client}) : null;
        },
        findVendorTicketForUpdate:async (tenantId,locationId,id,{client}) => {
          const r=(await client.query('SELECT id::text FROM tickets WHERE tenant_id=$1 AND location_id=$2 AND id=$3 FOR UPDATE',[tenantId,locationId,id])).rows[0];
          return r ? readTicket(r.id,{client}) : null;
        },
        findTicketByScopedLookupCodeForUpdate:async (tenantId,locationId,code,{client}) => {
          const r=(await client.query('SELECT id::text FROM tickets WHERE tenant_id=$1 AND location_id=$2 AND lookup_code=$3 FOR UPDATE',[tenantId,locationId,code])).rows[0];
          return r ? readTicket(r.id,{client}) : null;
        },
        cancelWaitingTicket:async (tenantId,code,{client,cancelledByVendor}) => {
          const id=code.split('-').at(-1);
          const r=await client.query(`UPDATE tickets SET status='cancelled',status_reason=CASE WHEN status='pending_carry_over' THEN 'carry_over_declined' ELSE $3 END,
            updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND status IN ('waiting','pending_carry_over') RETURNING id::text`,[tenantId,id,cancelledByVendor?'vendor_cancelled':'customer_cancelled']);
          return r.rows[0] ? readTicket(r.rows[0].id,{client}) : null;
        }
      },
      '../repositories/queueDayPauses':{findActivePause:async (_tenant,_location,_date,{client}) => {
        assert.ok(client); const paused=(await client.query('SELECT paused FROM intake_state')).rows[0].paused; if(intakeBarrier) {intakeBarrier.reached(); await intakeBarrier.release;} return paused ? {_id:'1',pauseMode:'auto_threshold'} : null;
      }},
      '../repositories/queueDayClosures':{findActiveClosure:async (_tenant,_location,_date,{client}) => {
        assert.ok(client); return queueClosed || (await client.query('SELECT closed FROM intake_state')).rows[0].closed ? {_id:'1'} : null;
      }},
      './queueDayLifecycleService':{
        getAuthoritativeQueueDay:async (_tenant,_location,{client}) => {
          assert.ok(client);
          const row=(await client.query('SELECT * FROM queue_day_state')).rows[0];
          dayReads++;
          const closesAt=dueRead && dayReads<dueRead ? new Date(Date.now()+60000) : row.closes_at;
          return row.state==='open' ? {_id:'999',businessDate:'2026-10-08',currentClosesAt:closesAt,intakeMode:row.intake_mode,state:row.state} : null;
        },
        closeLockedQueueDay:async client => {
          await client.query("UPDATE queue_day_state SET state='closed'; UPDATE tickets SET status='unserved'; UPDATE bookings SET status='unfulfilled'");
          await client.query("INSERT INTO events(ticket_id,event_type,metadata) VALUES(1,'queue_day_closed','{}'); INSERT INTO lifecycle_notifications VALUES(1,'pending')");
          if(failReconciliation) throw new Error('closure failed');
        }
      },
      './queueSnapshotHelpers':{resolveLocation:async (_tenant,options) => options.location || location,buildQueueSnapshot:async () => ({current:null,queueIntake:{state:"accepting",stateLabel:"Accepting"}})},
      './queueEvents':{publish:()=>{}}
    };
    const intakeLifecycle=loadService({...mocks,'../repositories/queueDays':{
      findLatestByLocation:async (_tenant,_location,{client})=>queueMocks['./queueDayLifecycleService'].getAuthoritativeQueueDay(_tenant,_location,{client})
    }},'queueDayLifecycleService');
    queueMocks['./queueDayLifecycleService'].assertIntakeOpen=intakeLifecycle.assertIntakeOpen;
    queueMocks['./queueDayLifecycleService'].getQueueDayForSnapshot=async () => ({queueDay:await queueMocks['./queueDayLifecycleService'].getAuthoritativeQueueDay('1','10',{client:pool})});
    queueMocks['./queueDayLifecycleService'].formatQueueDayStatus=queueDay => ({state:queueDay.state,intakeMode:queueDay.intakeMode});
    const queueService=loadService(queueMocks,'queueService');
    const realTickets=loadService({'../config/db':{pool}},'../repositories/tickets');
    const realPersistence=loadService({'../repositories/tickets':realTickets},'queueTicketPersistenceHelpers');
    const realLocations=loadService({'../config/db':{pool}},'../repositories/storeLocations');
    const hours=loadService({'../repositories/storeLocations':realLocations},'storeHoursService');
    queueMocks['./queueTicketPersistenceHelpers']=realPersistence;
    queueMocks['./storeHoursService']=hours;
    queueMocks['./allowanceService']={consumeAllowance:async (input,{client}) => {
      await client.query('INSERT INTO allowance_audit VALUES($1,$2)',[input.subjectId,input.resourceKey]);
      if(failAllowance) throw new Error('allowance failed');
      return {consumed:true};
    }};
    queueMocks['../repositories/queueDays']={allocateSequence:async (_id,{client}) => {
      const r=await client.query("UPDATE queue_day_state SET next_sequence=next_sequence+1 WHERE state='open' AND intake_mode='accepting' RETURNING next_sequence-1 AS sequence");
      return r.rows[0]?.sequence ?? null;
    }};
    const barcodeService=loadService({'../config/db':{pool},'../config/env':{jwtSecret:'isolated-ticket-barcode-secret'}},'ticketBarcodeService');
    queueMocks['./ticketBarcodeService']=barcodeService;
    const operationalQueue=loadService({...queueMocks,'../repositories/tickets':{
      ...queueMocks['../repositories/tickets'],createTicket:realTickets.createTicket,findCurrentCalledTicket:realTickets.findCurrentCalledTicket,
      listWaitingTickets:realTickets.listWaitingTickets,callNextWaitingTicket:realTickets.callNextWaitingTicket,
      confirmCurrentCalledTicket:realTickets.confirmCurrentCalledTicket,
      findVendorTicketForUpdate:realTickets.findVendorTicketForUpdate,restoreSkippedTicket:realTickets.restoreSkippedTicket
    }},'queueService');
    const withTransaction=async callback=>{
      const client=await pool.connect();
      try {await client.query('BEGIN'); const result=await callback(client); await client.query('COMMIT'); return result;}
      catch(error) {await client.query('ROLLBACK'); throw error;} finally {client.release();}
    };
    const realPayments=loadService({'../config/db':{pool}},'../repositories/queueJoinPayments');
    const paidDays={findById:async (id,{client=pool,forUpdate=false}={})=>{
      if(String(id)!=='999') return null;
      if(forUpdate) await client.query('SELECT state FROM queue_day_state FOR UPDATE');
      const row=(await client.query('SELECT * FROM queue_day_state')).rows[0];
      const closesAt=paidDeadlineRace && forUpdate && !paidDeadlineObserved ? new Date(Date.now()+60000) : row.closes_at;
      if(forUpdate) paidDeadlineObserved=true;
      return {_id:'999',tenantId:'1',locationId:'10',businessDate:'2026-10-08',state:row.state,intakeMode:row.intake_mode,currentClosesAt:closesAt};
    }};
    const realFee=loadService({'../repositories/billing':require('../src/repositories/billing')},'queueFeeService');
    const paidService=loadService({
      '../config/db':{pool,withTransaction},
      '../config/env':{},
      '../repositories/queueJoinPayments':{...realPayments,findPaymentById:async (id,options={})=>realPayments.findPaymentById(id,{...options,client:options.client || pool}),findPaymentByProviderId:async (id,options={})=>realPayments.findPaymentByProviderId(id,{...options,client:options.client || pool}),markPaidWithTicket:async (...args)=>{
        const result=await realPayments.markPaidWithTicket(...args); if(failPayment) throw new Error('payment failed'); return result;
      }},
      '../repositories/queueDays':paidDays,
      '../repositories/tenants':{findTenantById:async (id,{client=pool}={})=>{
        const row=(await client.query('SELECT * FROM tenants WHERE id=$1',[id])).rows[0];
        return row && {_id:String(row.id),isActive:row.is_active,autoPauseEnabled:row.auto_pause_enabled,autoPauseThreshold:row.auto_pause_threshold,queuePrefix:row.queue_prefix};
      }},
      '../repositories/storeLocations':{findLocationByTenantAndSlug:async (tenantId,slug,{client=pool}={})=>{
        const row=(await client.query('SELECT * FROM store_locations WHERE tenant_id=$1 AND slug=$2',[tenantId,slug])).rows[0];
        return row && {_id:String(row.id),tenantId:String(row.tenant_id),isActive:row.is_active,queueLifecycleMode:row.queue_lifecycle_mode,timezone:row.timezone,slug:row.slug};
      },findLocationById:async (id,{client=pool}={})=>{
        const row=(await client.query('SELECT * FROM store_locations WHERE id=$1',[id])).rows[0];
        return row && {_id:String(row.id),tenantId:String(row.tenant_id),isActive:row.is_active,queueLifecycleMode:row.queue_lifecycle_mode,timezone:row.timezone,slug:row.slug};
      }},
      '../repositories/billing':{recordBillingEvent:async input=>{
        if(billingEvents.has(input.providerEventId)) return null; billingEvents.add(input.providerEventId); return {_id:'1'};
      }},
      './queueFeeService':{assertTenantCanAcceptCustomerJoins:async (_tenant,{client,forShare})=>{
        assert.ok(client); assert.equal(forShare,true); if(subscriptionUnavailable) throw Object.assign(new Error('subscription unavailable'),{code:'SUBSCRIPTION_REQUIRED'});
        return realFee.assertTenantCanAcceptCustomerJoins(_tenant,{client,forShare});
      }},
      './allowanceService':{releaseReservation:async (input,{client})=>{
        await client.query("UPDATE payment_allowance SET state='released' WHERE reservation_key=$1",[input.reservationKey]);
        if(failAllowance) throw new Error('allowance failed');
      }},
      './queueDayLifecycleService':queueMocks['./queueDayLifecycleService'],
      './storeHoursService':hours,
      './queueService':{
        createTicketForTenantInTransaction:loadService({...queueMocks,'./allowanceService':{
          ...queueMocks['./allowanceService'],commitReservation:async (input,{client})=>{
            await client.query("UPDATE payment_allowance SET state='consumed',ticket_id=$2 WHERE reservation_key=$1",[input.reservationKey,input.subjectId]);
            if(failAllowance) throw new Error('allowance failed');
          }
        }},'queueService').createTicketForTenantInTransaction,
        assertQueueIntakeOpen:operationalQueue.assertQueueIntakeOpen,
        assertWaitingIntakeCapacityAvailable:operationalQueue.assertWaitingIntakeCapacityAvailable,
        recordCreatedTicketEvent:operationalQueue.recordCreatedTicketEvent,
        maybeNotifyUpcomingTickets:noop,publishSnapshot:async ()=>({})
      },
      './pushNotificationService':{notifyCustomerQueueUpdate:async ()=>{assert.ok(await count('tickets')); pushes++;}}
    },'queueJoinPaymentService');
    async function payment(id='1') {
      await pool.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10; UPDATE queue_day_state SET closes_at=clock_timestamp()+interval '1 hour'");
      await pool.query("INSERT INTO queue_join_payments(id,tenant_id,provider_checkout_session_id,queue_day_id,payload) VALUES($1,1,$2,999,$3)",[id,`CHECKOUT-${id}`,JSON.stringify({customerName:'Paid customer',joinChannel:'online',locationSlug:'main'})]);
      await pool.query("INSERT INTO payment_allowance VALUES($1,'held',NULL)",[`queue-payment:${id}`]);
    }
    async function legacyPayment() {
      await payment();
      await pool.query("UPDATE store_locations SET queue_lifecycle_mode='legacy' WHERE id=10; UPDATE queue_join_payments SET queue_day_id=NULL,metadata='{\"locationBindingVersion\":1}'::jsonb,payload=payload || '{\"locationId\":\"10\"}'::jsonb WHERE id=1");
    }
    const paid=(id='1')=>paidService.handlePayMongoPaidCheckout({id:`CHECKOUT-${id}`,attributes:{payments:[{id:`PROVIDER-${id}`,attributes:{paid_at:'2026-10-09T00:00:00Z'}}]}},{data:{id:`EVENT-${id}`}});
    const publicJoin=(options={})=>operationalQueue.createTicket({tenant:{...tenant,notificationSettings:{queueJoin:false}},location,joinChannel:'qr',customerName:'Guest',...options});
    const walkin=(options={})=>operationalQueue.createTicket({tenant,location,actorUserId:'1',joinChannel:'vendor',customerName:'Walk in',serviceId:'1000',...options});
    const call=(options={})=>operationalQueue.callNextTicket(tenant,{location,actorUserId:'1',queueDateKey:'20261008',...options});
    const confirm=(code='LOOKUP-1',options={})=>operationalQueue.confirmCurrentTicket(tenant,code,{location,actorUserId:'1',queueDateKey:'20261008',...options});
    const restore=(id='1',options={})=>operationalQueue.restoreSkippedTicket(tenant,id,{location,actorUserId:'1',queueDateKey:'20261008',lookupCode:`LOOKUP-${id}`,...options});
    async function skipped(id='1',options={}) {
      await ticket(id,options);
      await pool.query("UPDATE tickets SET status='skipped',skipped_at=clock_timestamp(),rejoin_deadline_at=clock_timestamp()+interval '10 minutes',called_at=clock_timestamp(),customer_confirmed_at=clock_timestamp(),service_counter_id=123 WHERE id=$1",[id]);
    }
    const legacy=(status,actor='1') => queueService.updateCurrentTicketStatus(tenant,status,{location,actorUserId:actor});
    const cancelVendor=(id,actor='1',selected=location) => queueService.cancelTicket(tenant,'',{location:selected,actorUserId:actor,vendorTicketId:id});
    const cancelCustomer=(id,{actorUserId,contact={customerEmail:'owner@example.com'},selected=location}={}) =>
      queueService.cancelTicket(tenant,`lookup-${id}`,{location:selected,actorUserId,customerContact:contact,source:'public'});
    const count=async table => (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
    async function waitForLocationLock() {
      const deadline=Date.now()+3000;
      while(Date.now()<deadline) {
        const waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT id%FROM store_locations%'",[schema])).rows.length>0;
        if(waiting) return;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.fail('operation must wait for the location lock');
    }
    await t.test('five simultaneous starts fit four courts; timing uses exact persisted allocation clock',async () => {
      await reset(); for (let i=1;i<=5;i++) await ticket(String(i));
      const starts=await Promise.allSettled([1,2,3,4,5].map(id => record(String(id),'start')));
      assert.equal(starts.filter(r=>r.status==='fulfilled').length,4);
      assert.equal(starts.filter(r=>r.status==='rejected').length,1);
      assert.equal(await count('resource_allocations'),4); assert.equal(await count('events'),4); assert.equal(await count('webhooks'),4);
      assert.equal((await pool.query('SELECT bool_and(t.service_started_at=a.started_at) AS exact FROM tickets t JOIN resource_allocations a ON a.ticket_id=t.id')).rows[0].exact,true);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'9');
    });
    await t.test('booking conversion preserves protected end; completion survives draft changes and tracking disable',async () => {
      await reset(1); await ticket('1',{booking:true}); await record('1','start');
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'converted');
      assert.equal((await pool.query('SELECT a.expected_end_at=r.ends_at AS exact FROM resource_allocations a JOIN resource_ledger_reservations r ON r.id=a.reservation_id')).rows[0].exact,true);
      await pool.query('UPDATE location_resource_pools SET tracking_enabled=FALSE,revision=2,capacity=1');
      await pool.query('UPDATE service_resource_requirements SET revision=2,units_required=2');
      await pool.query('UPDATE store_locations SET service_timing_enabled=FALSE,is_active=FALSE');
      await record('1','complete');
      assert.equal((await readTicket('1')).status,'served');
      assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'completed');
      assert.equal((await pool.query('SELECT t.service_ended_at=a.released_at AND t.served_at=a.released_at AS exact FROM tickets t JOIN resource_allocations a ON a.ticket_id=t.id')).rows[0].exact,true);
      assert.equal((await pool.query('SELECT outcome FROM resource_allocations')).rows[0].outcome,'completed');
      assert.deepEqual(servicePushes,['service_started','service_completed']);
      await record('1','complete'); assert.equal(await count('booking_audit'),1); assert.equal(servicePushes.length,2);
    });
    await t.test('start retry and competing completion/interruption create one explicit release',async () => {
      await reset(); await ticket('1');
      await Promise.all([record('1','start'),record('1','start')]);
      assert.equal(await count('resource_allocations'),1); assert.equal(await count('events'),1);
      const outcomes=await Promise.allSettled([record('1','complete'),record('1','interrupt')]);
      assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(await count('resource_ledger_commands'),2); assert.equal(await count('events'),3);
      assert.equal(await count('webhooks'),3);
      const current=await readTicket('1'); await record('1',current.serviceOutcome==='completed'?'complete':'interrupt');
      assert.equal(await count('events'),3);
      await assert.rejects(record('1','start'),{statusCode:409});
      assert.deepEqual(servicePushes,['service_started',`service_${current.serviceOutcome}`]);
    });
    await t.test('overdue occupancy survives queue closure until explicit interruption',async () => {
      await reset(1); await ticket('1'); await ticket('2'); await record('1','start');
      await pool.query("UPDATE resource_allocations SET started_at=clock_timestamp()-interval '2 hours',expected_end_at=clock_timestamp()-interval '1 hour'");
      await pool.query("UPDATE tickets SET status='unserved' WHERE id=1");
      await assert.rejects(record('2','start'),{statusCode:409});
      await record('1','interrupt'); const allocation=(await pool.query('SELECT * FROM resource_allocations')).rows[0];
      assert.equal(allocation.outcome,'terminated'); assert.equal(allocation.reason,'Staff explicitly interrupted service.');
      assert.equal((await readTicket('1')).status,'unserved');
      assert.deepEqual(servicePushes,['service_started','service_interrupted']);
      await record('2','start'); assert.equal(await count('resource_allocations'),2);
    });
    await t.test('event and booking failures roll timing, conversion, release, receipts and revision back',async () => {
      await reset(); await ticket('1',{booking:true}); failEvent=true;
      await assert.rejects(record('1','start'),/event failed/);
      assert.equal((await readTicket('1')).serviceStartedAt,null); assert.equal(await count('resource_allocations'),0);
      assert.deepEqual(servicePushes,[]);
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
      assert.equal(await count('resource_ledger_commands'),1); assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');
      failEvent=false; await record('1','start'); failBooking=true;
      const revision=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
      await assert.rejects(record('1','complete'),/booking failed/);
      assert.equal((await readTicket('1')).serviceEndedAt,null); assert.equal((await readTicket('1')).status,'called');
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
      assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'confirmed');
      assert.equal(await count('resource_ledger_commands'),2); assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1); assert.equal(await count('booking_audit'),0);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,revision);
      assert.deepEqual(servicePushes,['service_started']);
    });
    await t.test('terminal queue tickets still notify explicit completion without rewriting queue status',async () => {
      await reset(); await ticket('1'); await record('1','start');
      await pool.query("UPDATE tickets SET status='unserved' WHERE id=1");
      await record('1','complete'); await record('1','complete');
      assert.equal((await readTicket('1')).status,'unserved');
      assert.equal((await readTicket('1')).serviceOutcome,'completed');
      assert.deepEqual(servicePushes,['service_started','service_completed']);
    });
    await t.test('push failure preserves committed service and repeated actions do not redeliver',async () => {
      await reset(); await ticket('1'); failServicePush=true;
      await record('1','start'); await record('1','start');
      assert.ok((await readTicket('1')).serviceStartedAt);
      await record('1','interrupt'); await record('1','interrupt');
      assert.equal((await readTicket('1')).serviceOutcome,'interrupted');
      assert.deepEqual(servicePushes,['service_started','service_interrupted']);
    });
    await t.test('staff assignment and current actor access are checked under the location lock',async () => {
      await reset(); await ticket('1'); await assert.rejects(record('1','start','2'),{statusCode:403});
      await pool.query('INSERT INTO service_counters VALUES(1,1,10,TRUE); INSERT INTO service_counter_assignments VALUES(2,1)');
      await record('1','start','2'); await pool.query('UPDATE service_counters SET is_active=FALSE');
      await assert.rejects(record('1','complete','2'),{statusCode:403});
      await pool.query('INSERT INTO tenant_membership_locations VALUES(2,10)'); await record('1','complete','2');
      await reset(); await ticket('1');
      const blocker=await pool.connect(); await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
      const waiting=record('1','start'); waiting.catch(()=>{});
      try {
        let locked=false;
        for(let i=0;i<100;i++) {
          locked=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock') AS locked",[schema])).rows[0].locked;
          if(locked) break; await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert.equal(locked,true); await blocker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=1'); await blocker.query('COMMIT');
        await assert.rejects(waiting,{statusCode:403}); assert.equal(await count('resource_allocations'),0);
      } finally {await blocker.query('ROLLBACK'); blocker.release();}
      await pool.query('UPDATE tenant_memberships SET is_active=TRUE; UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1');
      await assert.rejects(record('1','start'),{statusCode:403});
    });
    await t.test('vendor queue transactions hold accepted actor and assignment grants until commit',async () => {
      for(const kind of ['owner','explicit','counter']) {
        await reset();await ticket('1');const actor=kind==='owner'?'1':'2';
        if(kind==='explicit')await pool.query('INSERT INTO tenant_membership_locations VALUES(2,10)');
        if(kind==='counter')await pool.query('INSERT INTO service_counters VALUES(200,1,10,TRUE);INSERT INTO service_counter_assignments VALUES(2,200)');
        let reached;const locked=new Promise(resolve=>{reached=resolve;});let release;const unblock=new Promise(resolve=>{release=resolve;});
        vendorEventBarrier={reached,release:unblock};
        const pending=record('1','start',actor);pending.catch(()=>{});let revocation;
        try {
          await Promise.race([locked,pending.then(()=>{throw new Error('vendor access barrier missing');})]);
          for(const query of [`SELECT id FROM users WHERE id=${actor} FOR UPDATE NOWAIT`,`SELECT id FROM tenant_memberships WHERE id=${actor} FOR UPDATE NOWAIT`]) await assert.rejects(pool.query(query),{code:'55P03'});
          if(kind==='explicit')await assert.rejects(pool.query('SELECT tenant_membership_id FROM tenant_membership_locations WHERE tenant_membership_id=2 FOR UPDATE NOWAIT'),{code:'55P03'});
          if(kind==='counter')for(const query of ['SELECT user_id FROM service_counter_assignments WHERE user_id=2 FOR UPDATE NOWAIT','SELECT id FROM service_counters WHERE id=200 FOR UPDATE NOWAIT'])await assert.rejects(pool.query(query),{code:'55P03'});
          const sql=kind==='owner'?'UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1':kind==='explicit'?'DELETE FROM tenant_membership_locations WHERE tenant_membership_id=2':'UPDATE service_counters SET is_active=FALSE WHERE id=200';
          revocation=pool.query(sql);revocation.catch(()=>{});
          const deadline=Date.now()+3000;let waiting=false;
          while(Date.now()<deadline) {
            waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query=$2) AS waiting",[schema,sql])).rows[0].waiting;
            if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(waiting,true,'access revocation must wait for the accepted queue transaction');
          assert.equal((await readTicket('1')).serviceStartedAt,null);assert.equal(await count('resource_allocations'),0);
          release();await pending;await revocation;vendorEventBarrier=null;
          assert.ok((await readTicket('1')).serviceStartedAt);assert.equal(await count('resource_allocations'),1);assert.equal(await count('events'),1);
          await assert.rejects(record('1','complete',actor),{statusCode:403});
          assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
        } finally {release();await pending.catch(()=>{});if(revocation)await revocation.catch(()=>{});vendorEventBarrier=null;}
      }
    });
    await t.test('vendor queue authorization rereads revoked grants after waiting for the location lock',async () => {
      for(const sql of ["UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=2", "UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=2",
        "UPDATE tenant_memberships SET is_active=FALSE WHERE id=2", "UPDATE tenant_memberships SET role='unknown' WHERE id=2",
        "DELETE FROM tenant_membership_locations WHERE tenant_membership_id=2;UPDATE service_counters SET is_active=FALSE WHERE id=200",
        "DELETE FROM tenant_membership_locations WHERE tenant_membership_id=2;DELETE FROM service_counter_assignments WHERE user_id=2"]) {
        await reset();await ticket('1');await pool.query('INSERT INTO tenant_membership_locations VALUES(2,10);INSERT INTO service_counters VALUES(200,1,10,TRUE);INSERT INTO service_counter_assignments VALUES(2,200)');
        const blocker=await pool.connect();let pending;
        try {
          await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending=record('1','start','2');pending.catch(()=>{});await waitForLocationLock();
          await blocker.query(sql);await blocker.query('COMMIT');await assert.rejects(pending,{statusCode:403});
          assert.equal((await readTicket('1')).serviceStartedAt,null);assert.equal(await count('resource_allocations'),0);assert.equal(await count('events'),0);assert.equal(await count('resource_ledger_scopes'),0);
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      }
    });
    await t.test('vendor grant lock waits reread revocation committed by the competing transaction',async () => {
      for(const sql of ["UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=2", "UPDATE tenant_memberships SET is_active=FALSE WHERE id=2",
        "DELETE FROM tenant_membership_locations WHERE tenant_membership_id=2", "UPDATE service_counters SET is_active=FALSE WHERE id=200", "DELETE FROM service_counter_assignments WHERE user_id=2"]) {
        await reset();await ticket('1');
        await pool.query(sql.includes('service_counter')?'INSERT INTO service_counters VALUES(200,1,10,TRUE);INSERT INTO service_counter_assignments VALUES(2,200)':'INSERT INTO tenant_membership_locations VALUES(2,10)');
        const blocker=await pool.connect();let pending;
        try {
          await blocker.query('BEGIN');await blocker.query(sql);pending=record('1','start','2');pending.catch(()=>{});
          const deadline=Date.now()+3000;let waiting=false;
          while(Date.now()<deadline) {
            waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND (query LIKE 'SELECT u.roles%' OR query LIKE 'SELECT 1 FROM tenant_memberships%' OR query LIKE 'SELECT 1 FROM service_counter_assignments%')) AS waiting",[schema])).rows[0].waiting;
            if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(waiting,true,'authorization must wait for the changing grant');
          await blocker.query('COMMIT');await assert.rejects(pending,{statusCode:403});
          assert.equal((await readTicket('1')).serviceStartedAt,null);assert.equal(await count('resource_allocations'),0);assert.equal(await count('resource_ledger_scopes'),0);assert.equal(await count('events'),0);
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      }
    });
    await t.test('vendor grant locks release on rollback and inactive scopes still allow explicit service release',async () => {
      await reset();await ticket('1');await pool.query('INSERT INTO tenant_membership_locations VALUES(2,10)');
      failEvent=true;await assert.rejects(record('1','start','2'),/event failed/);
      for(const query of ['SELECT id FROM users WHERE id=2 FOR UPDATE NOWAIT','SELECT id FROM tenant_memberships WHERE id=2 FOR UPDATE NOWAIT','SELECT tenant_membership_id FROM tenant_membership_locations WHERE tenant_membership_id=2 FOR UPDATE NOWAIT'])await pool.query(query);
      assert.equal(await count('resource_allocations'),0);assert.equal(await count('events'),0);assert.equal(await count('resource_ledger_scopes'),0);
      failEvent=false;await record('1','start','2');await pool.query('UPDATE tenants SET is_active=FALSE WHERE id=1;UPDATE store_locations SET is_active=FALSE,service_timing_enabled=FALSE WHERE id=10');
      await record('1','interrupt','2');assert.equal((await pool.query('SELECT outcome FROM resource_allocations')).rows[0].outcome,'terminated');
      await ticket('2');await assert.rejects(record('2','start','2'),{statusCode:409});
      assert.equal(await count('resource_allocations'),1);
    });
    const activeVendorActions=['start','walkin','call','confirm','restore'];
    async function prepareActiveVendorAction(action) {
      await reset();
      if(action==='restore')await skipped();
      else if(action!=='walkin')await ticket('1');
      if(action==='call')await pool.query("UPDATE tickets SET status='waiting'");
    }
    const runActiveVendorAction=action => action==='start'?record('1','start'):action==='walkin'?walkin():action==='call'?call():action==='confirm'?confirm():restore();
    await t.test('new vendor service and open-queue actions hold tenant activity until commit',async () => {
      for(const action of activeVendorActions) {
        await prepareActiveVendorAction(action);
        let reached;const locked=new Promise(resolve=>{reached=resolve;});let release;const unblock=new Promise(resolve=>{release=resolve;});
        vendorEventBarrier={reached,release:unblock};
        const pending=runActiveVendorAction(action);pending.catch(()=>{});let deactivation;
        try {
          await Promise.race([locked,pending.then(()=>{throw new Error(`tenant activity barrier missing for ${action}`);})]);
          await assert.rejects(pool.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT'),{code:'55P03'});
          await assert.rejects(pool.query('SELECT id FROM store_locations WHERE id=10 FOR NO KEY UPDATE NOWAIT'),{code:'55P03'});
          await assert.rejects(pool.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE NOWAIT'),{code:'55P03'});
          const sql='UPDATE tenants SET is_active=FALSE WHERE id=1';deactivation=pool.query(sql);deactivation.catch(()=>{});
          const deadline=Date.now()+3000;let waiting=false;
          while(Date.now()<deadline) {
            waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query=$2) AS waiting",[schema,sql])).rows[0].waiting;
            if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(waiting,true,`${action} must keep tenant deactivation behind its commit`);
          assert.equal(await count('events'),0);assert.equal(await count('resource_allocations'),0);
          release();await pending;await deactivation;vendorEventBarrier=null;
          assert.equal(await count('events'),1);assert.equal(await count('resource_allocations'),action==='start'?1:0);
          assert.equal((await pool.query('SELECT is_active FROM tenants WHERE id=1')).rows[0].is_active,false);
          await assert.rejects(runActiveVendorAction(action),{statusCode:409});
        } finally {release();await pending.catch(()=>{});if(deactivation)await deactivation.catch(()=>{});vendorEventBarrier=null;}
      }
    });
    await t.test('new vendor service and open-queue actions reread tenant deactivation after the tenant lock wait',async () => {
      for(const action of activeVendorActions) {
        await prepareActiveVendorAction(action);const blocker=await pool.connect();let pending;
        try {
          await blocker.query('BEGIN');await blocker.query('UPDATE tenants SET is_active=FALSE WHERE id=1');
          pending=runActiveVendorAction(action);pending.catch(()=>{});
          const deadline=Date.now()+3000;let waiting=false;
          while(Date.now()<deadline) {
            waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM tenants%FOR SHARE%') AS waiting",[schema])).rows[0].waiting;
            if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(waiting,true,`${action} must wait for the changing tenant activity row`);
          await blocker.query('COMMIT');await assert.rejects(pending,{statusCode:409});
          assert.equal(await count('events'),0);assert.equal(await count('resource_allocations'),0);assert.equal(await count('resource_ledger_scopes'),0);
          assert.equal(await count('tickets'),action==='walkin'?0:1);
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      }
    });
    await t.test('staff status and FK-backed assignment changes serialize with activity-gated vendor actions in both orderings',async () => {
      const {createStaffAccessEmailService}=require('../src/services/staffAccessEmailService');
      const staffUsers={findUserById:async(id,{client})=>{
        const row=(await client.query('SELECT role,is_active FROM tenant_memberships WHERE user_id=$1 AND tenant_id=1',[id])).rows[0];
        return {_id:String(id),tenantMemberships:row?[{tenantId:'1',role:row.role,isActive:row.is_active}]:[]};
      },listUsersByTenantId:async()=>[]};
      for(const action of activeVendorActions)for(const kind of ['status','assignment'])for(const first of ['staff','queue']) {
        await prepareActiveVendorAction(action);await pool.query('INSERT INTO tenant_membership_locations VALUES(2,10)');
        const run=()=>action==='start'?record('1','start','2'):action==='walkin'?walkin({actorUserId:'2'}):action==='call'?call({actorUserId:'2'}):action==='confirm'?confirm('LOOKUP-1',{actorUserId:'2'}):restore('1',{actorUserId:'2'});
        let reached;const locked=new Promise(resolve=>{reached=resolve;});let release;const unblock=new Promise(resolve=>{release=resolve;});
        const staffService=createStaffAccessEmailService({database:{withTransaction:callback=>withTransaction(async client=>{
          const wrapped={query:async(...args)=>{
            const result=await client.query(...args);
            if(first==='staff' && String(args[0]).includes('FROM tenants') && String(args[0]).includes('FOR UPDATE')){reached();await unblock;}
            return result;
          }};
          return callback(wrapped);
        })},userRepository:staffUsers,locationRepository:require('../src/repositories/tenantMembershipLocations')});
        const change=()=>staffService.change({tenant,userId:'2',actorId:'1'},async({client})=>kind==='status'?client.query('UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=2 AND tenant_id=1'):require('../src/repositories/tenantMembershipLocations').replaceUserLocationAssignments({userId:'2',tenantId:'1',locationIds:['10'],assignedByUserId:'1'},{client}));
        if(first==='queue')vendorEventBarrier={reached,release:unblock};
        const leading=first==='staff'?change():run();leading.catch(()=>{});let trailing;
        try {
          await Promise.race([locked,leading.then(()=>{throw new Error('staff access ordering barrier missing');})]);
          trailing=first==='staff'?run():change();trailing.catch(()=>{});
          const deadline=Date.now()+3000;let waiting=false;
          while(Date.now()<deadline) {
            waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM tenants%FOR %') AS waiting",[schema])).rows[0].waiting;
            if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(waiting,true,'the competing transaction must wait at tenant, before membership');
          if(first==='staff')await pool.query('SELECT id FROM tenant_memberships WHERE id=2 FOR UPDATE NOWAIT');
          release();await leading;
          if(first==='staff'&&kind==='status')await assert.rejects(trailing,{statusCode:403});else await trailing;
          assert.equal((await pool.query('SELECT is_active FROM tenant_memberships WHERE id=2')).rows[0].is_active,kind==='assignment');
          assert.equal(await count('events'),first==='staff'&&kind==='status'?0:1);assert.equal(await count('resource_allocations'),(first==='queue'||kind==='assignment')&&action==='start'?1:0);
          if(kind==='assignment')assert.equal((await pool.query('SELECT count(*)::int AS n FROM tenant_membership_locations WHERE tenant_membership_id=2 AND location_id=10')).rows[0].n,1);
        } finally {release();await leading.catch(()=>{});if(trailing)await trailing.catch(()=>{});vendorEventBarrier=null;}
      }
    });
    await t.test('Platform membership edits and activity-gated queue actions serialize tenant before user in both orderings',async () => {
      for(const action of activeVendorActions)for(const first of ['platform','queue']) {
        await prepareActiveVendorAction(action);await pool.query('INSERT INTO tenant_membership_locations VALUES(2,10)');
        const run=()=>action==='start'?record('1','start','2'):action==='walkin'?walkin({actorUserId:'2'}):action==='call'?call({actorUserId:'2'}):action==='confirm'?confirm('LOOKUP-1',{actorUserId:'2'}):restore('1',{actorUserId:'2'});
        let reached;const locked=new Promise(resolve=>{reached=resolve;});let release;const unblock=new Promise(resolve=>{release=resolve;});let confirmations=0;
        const routes=[];const router=new Proxy({}, {get:(_target,method)=>(...args)=>routes.push({method,args})});
        const fallback=new Proxy({}, {get:()=>()=>undefined});
        const routeMocks={express:{Router:()=>router},'../middleware/asyncHandler':handler=>handler,
          '../config/db':{withTransaction:callback=>withTransaction(client=>callback({query:async(...args)=>{
            const result=await client.query(...args);
            if(first==='platform' && String(args[0]).includes('FROM tenants') && String(args[0]).includes('FOR UPDATE')){reached();await unblock;}
            return result;
          }}))},
          '../services/privilegedPreviewService':require('../src/services/privilegedPreviewService'),
          '../services/privilegedTransactionService':{consumeConfirmation:async(input)=>{assert.equal(input.token,'test-confirmation');assert.ok(input.currentPreviewRevision);confirmations++;}},
          '../services/mfaService':require('../src/services/mfaService'),
          '../repositories/authSessions':{revokeAllSessionsForUser:async(id,_reason,{client})=>{await client.query("INSERT INTO platform_membership_effects VALUES('sessions',$1)",[id]);return 1;}},
          '../services/securityAuditService':{record:async(input,{client})=>client.query("INSERT INTO platform_membership_effects VALUES('audit',$1)",[input.resourceId.split(':').at(-1)])}
        };
        vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../src/routes/platformRoutes.js'),'utf8'),{require:name=>routeMocks[name]||fallback,module:{exports:{}},process:{env:{}}});
        const handler=routes.find(({method,args})=>method==='post'&&args[0]==='/users/:userId/tenant-memberships').args.at(-1);
        const response={code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
        const edit=()=>handler({params:{userId:'2'},body:{tenantId:'1',role:'staff',active:false,reason:'Revoke staff access'},user:{_id:'9'},auth:{session:{_id:'test-session'},sessionId:'test-session'},get:()=> 'test-confirmation'},response);
        if(first==='queue')vendorEventBarrier={reached,release:unblock};
        const leading=first==='platform'?edit():run();leading.catch(()=>{});let trailing;
        try {
          await Promise.race([locked,leading.then(()=>{throw new Error('platform membership ordering barrier missing');})]);
          trailing=first==='platform'?run():edit();trailing.catch(()=>{});
          const deadline=Date.now()+3000;let waiting=false;
          while(Date.now()<deadline) {
            waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT id%FROM tenants%FOR %') AS waiting",[schema])).rows[0].waiting;
            if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(waiting,true,'the competing action must wait at tenant before user');
          if(first==='platform')await pool.query('SELECT id FROM users WHERE id=2 FOR UPDATE NOWAIT');
          release();await leading;if(first==='platform')await assert.rejects(trailing,{statusCode:403});else await trailing;
          assert.equal(response.code,200);assert.equal(response.body.membership.isActive,false);assert.equal(confirmations,1);
          assert.equal(await count('platform_membership_effects'),2);assert.equal(await count('events'),first==='queue'?1:0);
          assert.equal(await count('resource_allocations'),first==='queue'&&action==='start'?1:0);
        } finally {release();await leading.catch(()=>{});if(trailing)await trailing.catch(()=>{});vendorEventBarrier=null;}
      }
    });
    await t.test('tenant activity share locks allow simultaneous service starts at distinct branches',async () => {
      await reset();await pool.query('UPDATE store_locations SET tenant_id=1 WHERE id=20');
      await ticket('1');await ticket('2',{plan:false});await pool.query('UPDATE tickets SET location_id=20 WHERE id=2');
      let reached;const locked=new Promise(resolve=>{reached=resolve;});let release;const unblock=new Promise(resolve=>{release=resolve;});let arrivals=0;
      vendorEventBarrier={reached:()=>{if(++arrivals===2)reached();},release:unblock};
      const pending=Promise.all([record('1','start'),record('2','start','1',{_id:'20'})]);pending.catch(()=>{});let timer;
      try {
        await Promise.race([locked,pending.then(()=>{throw new Error('distinct branch barrier missing');}),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('shared tenant activity must permit distinct branches')),3000);})]);
        release();await pending;assert.equal(await count('events'),2);assert.equal(await count('resource_allocations'),1);assert.equal(await count('resource_ledger_scopes'),2);
      } finally {clearTimeout(timer);release();await pending.catch(()=>{});vendorEventBarrier=null;}
    });
    await t.test('tenant activity locks release on action rollback',async () => {
      for(const action of activeVendorActions) {
        await prepareActiveVendorAction(action);failEvent=true;await assert.rejects(runActiveVendorAction(action),/event failed/);
        await pool.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT');
        assert.equal(await count('events'),0);assert.equal(await count('resource_allocations'),0);assert.equal(await count('resource_ledger_scopes'),0);
        assert.equal(await count('tickets'),action==='walkin'?0:1);
      }
    });
    await t.test('explicit completion and interruption can release occupancy while tenant deactivation is uncommitted',async () => {
      for(const action of ['complete','interrupt']) {
        await reset();await ticket('1');await record('1','start');const blocker=await pool.connect();let pending;
        try {
          await blocker.query('BEGIN');await blocker.query('UPDATE tenants SET is_active=FALSE WHERE id=1');
          pending=record('1',action);pending.catch(()=>{});let timer;
          try {await Promise.race([pending,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('explicit release must not wait for tenant activity')),3000);})]);}
          finally {clearTimeout(timer);}
          assert.equal((await pool.query('SELECT outcome FROM resource_allocations')).rows[0].outcome,action==='complete'?'completed':'terminated');
          await blocker.query('COMMIT');assert.equal((await pool.query('SELECT is_active FROM tenants WHERE id=1')).rows[0].is_active,false);
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      }
    });
    await t.test('start rejects wrong scope, disabled timing, unconfirmed tickets and stale or unknown plans',async () => {
      await reset(); await ticket('1',{plan:false}); await assert.rejects(record('1','start'),{statusCode:409});
      await assert.rejects(record('1','start','1',{_id:'20'}),{statusCode:404});
      await reset(); await ticket('1'); await pool.query('UPDATE service_resource_requirements SET revision=2');
      await assert.rejects(record('1','start'),/stale/); assert.equal(await count('resource_allocations'),0);
      await pool.query('UPDATE service_resource_requirements SET revision=1; UPDATE store_locations SET service_timing_enabled=FALSE');
      await assert.rejects(record('1','start'),/not enabled/);
      await pool.query("UPDATE store_locations SET service_timing_enabled=TRUE; UPDATE tickets SET join_channel='customer'");
      await assert.rejects(record('1','start'),/Confirm/);
      await pool.query("UPDATE tickets SET customer_confirmed_at=clock_timestamp(),status='waiting'");
      await assert.rejects(record('1','start'),/Call/);
      assert.equal(await count('events'),0);
    });
    await t.test('missing booking protection cannot silently become ordinary after tracking disable',async () => {
      await reset(); await ticket('1',{booking:true});
      await pool.query("UPDATE resource_ledger_reservations SET state='cancelled'; UPDATE location_resource_pools SET tracking_enabled=FALSE");
      await assert.rejects(record('1','start'),/binding/); assert.equal(await count('resource_allocations'),0);
    });
    await t.test('a lost booking plan still requires resource handling after tracking disable',async () => {
      await reset(); await ticket('1',{booking:true});
      await pool.query('DELETE FROM ticket_service_plans; UPDATE location_resource_pools SET tracking_enabled=FALSE');
      await assert.rejects(record('1','start'),/plan/); assert.equal(await count('resource_allocations'),0);
      assert.equal((await readTicket('1')).serviceStartedAt,null);
    });
    await t.test('ordinary timing remains explicit without allocating; incomplete resource state fails closed',async () => {
      await reset(4,false); await ticket('1',{plan:false});
      await record('1','start'); await record('1','interrupt');
      const current=await readTicket('1'); assert.ok(current.serviceStartedAt); assert.ok(current.serviceEndedAt); assert.equal(current.status,'unserved');
      assert.equal(await count('resource_allocations'),0); assert.equal(await count('resource_ledger_commands'),0);
      await reset(); await ticket('1'); await pool.query('UPDATE tickets SET service_started_at=clock_timestamp()');
      await assert.rejects(record('1','start'),/reconciliation/); await assert.rejects(record('1','complete'),/reconciliation/);
      assert.equal((await readTicket('1')).serviceEndedAt,null);
    });
    await t.test('configured metadata alone does not activate an ordinary disabled scope',async () => {
      await reset(4,false); await ticket('1'); await record('1','start'); await record('1','complete');
      assert.equal(await count('resource_allocations'),0); assert.equal(await count('resource_ledger_commands'),0);
      assert.equal((await readTicket('1')).status,'served');
    });
    await t.test('a prematurely released allocation cannot be acknowledged as an active service retry',async () => {
      await reset(); await ticket('1'); await record('1','start');
      const allocation=(await pool.query('SELECT id::text FROM resource_allocations')).rows[0].id;
      await ledger.executeCommand({pool,tenantId:'1',locationId:'10',actorUserId:'1',operationKey:'corrupt-state-release',command:'release',payload:{allocationId:allocation,outcome:'completed'}});
      await assert.rejects(record('1','start'),/reconciliation/); await assert.rejects(record('1','complete'),/reconciliation/);
      assert.equal((await readTicket('1')).serviceEndedAt,null); assert.equal(await count('events'),1);
    });
    await t.test('legacy Serve cannot bypass resource protection when timing and tracking are disabled',async () => {
      await reset(); await ticket('1',{booking:true});
      await pool.query('UPDATE store_locations SET service_timing_enabled=FALSE; UPDATE location_resource_pools SET tracking_enabled=FALSE');
      await assert.rejects(legacy('served'),/Use Start service/);
      assert.equal((await readTicket('1')).status,'called'); assert.equal(await count('events'),0);
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
    });
    await t.test('unstarted skip retains protection; every legacy outcome rejects existing occupancy',async () => {
      await reset(); await ticket('1',{booking:true}); await legacy('skipped');
      assert.equal((await readTicket('1')).status,'skipped'); assert.equal(await count('resource_allocations'),0);
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
      await pool.query("UPDATE tickets SET status='called'"); await record('1','start');
      await pool.query('UPDATE store_locations SET service_timing_enabled=FALSE; UPDATE location_resource_pools SET tracking_enabled=FALSE');
      for(const status of ['served','skipped','cancelled','unserved']) await assert.rejects(legacy(status),/Use Start service/);
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
    });
    await t.test('vendor waiting cancellation cancels immutable protection and linked booking once',async () => {
      await reset(); await ticket('1',{booking:true}); await pool.query("UPDATE tickets SET status='waiting'; INSERT INTO queue_ticket_segments(ticket_id) VALUES(1)");
      await pool.query('UPDATE location_resource_pools SET tracking_enabled=FALSE,revision=2; UPDATE service_resource_requirements SET revision=2,units_required=2');
      const results=await Promise.allSettled([cancelVendor('1'),cancelVendor('1')]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.equal(results.filter(r=>r.status==='rejected').length,1);
      assert.equal((await readTicket('1')).status,'cancelled'); assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'canceled');
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'cancelled');
      assert.equal((await pool.query('SELECT segment_outcome FROM queue_ticket_segments')).rows[0].segment_outcome,'cancelled');
      assert.equal(await count('resource_ledger_commands'),2); assert.equal(await count('resource_allocations'),0);
      assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1); assert.equal(pushes,1);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'4');
    });
    await t.test('vendor cancellation event failure rolls ticket, booking, protection, segment and revision back',async () => {
      await reset(); await ticket('1',{booking:true}); await pool.query("UPDATE tickets SET status='waiting'; INSERT INTO queue_ticket_segments(ticket_id) VALUES(1)"); failEvent=true;
      await assert.rejects(cancelVendor('1'),/event failed/);
      assert.equal((await readTicket('1')).status,'waiting'); assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'confirmed');
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
      assert.equal((await pool.query('SELECT ended_at FROM queue_ticket_segments')).rows[0].ended_at,null);
      assert.equal(await count('resource_ledger_commands'),1); assert.equal(await count('events'),0); assert.equal(await count('webhooks'),0); assert.equal(pushes,0);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');
    });
    await t.test('vendor outcomes recheck actor and assignment; closed queue or wrong branch cannot write',async () => {
      await reset(); await ticket('1',{booking:true});
      await assert.rejects(legacy('skipped','2'),{statusCode:403});
      await pool.query('INSERT INTO tenant_membership_locations VALUES(2,10)'); queueClosed=true;
      await assert.rejects(legacy('skipped','2'),{statusCode:409});
      await pool.query('UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=2');
      await assert.rejects(legacy('skipped','2'),{statusCode:403}); queueClosed=false;
      await pool.query("UPDATE tickets SET status='waiting'"); await assert.rejects(cancelVendor('1','2'),{statusCode:403});
      await assert.rejects(cancelVendor('1','1',{_id:'20'}),{statusCode:404});
      await assert.rejects(cancelVendor('9007199254740993'),{statusCode:404});
      assert.equal(await count('events'),0); assert.equal((await readTicket('1')).status,'waiting');
    });
    await t.test('legacy terminal cancellation clears unused protection atomically; ordinary Serve stays supported',async () => {
      await reset(); await ticket('1',{booking:true}); await legacy('cancelled');
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'cancelled');
      assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'canceled');
      assert.equal(await count('resource_allocations'),0);
      await reset(4,false); await ticket('1',{plan:false}); await pool.query('UPDATE store_locations SET service_timing_enabled=FALSE');
      await legacy('served'); assert.equal((await readTicket('1')).status,'served'); assert.equal(await count('resource_ledger_commands'),0);
      assert.equal(await count('resource_allocations'),0);
    });
    await t.test('linked active booking cancellation requires booking management; staff can cancel ordinary tickets',async () => {
      await reset(); await ticket('1',{booking:true}); await pool.query('INSERT INTO tenant_membership_locations VALUES(2,10)');
      await assert.rejects(legacy('cancelled','2'),{statusCode:403});
      await pool.query("UPDATE tickets SET status='waiting'"); await assert.rejects(cancelVendor('1','2'),{statusCode:403});
      assert.equal((await readTicket('1')).status,'waiting'); assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'confirmed');
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected'); assert.equal(await count('events'),0);
      await reset(4,false); await ticket('1',{plan:false}); await pool.query("INSERT INTO tenant_membership_locations VALUES(2,10); UPDATE tickets SET status='waiting'");
      await cancelVendor('1','2'); assert.equal((await readTicket('1')).status,'cancelled'); assert.equal(await count('events'),1);
    });
    await t.test('vendor cancellation preserves terminal booking status',async () => {
      await reset(); await ticket('1',{booking:true}); await pool.query("UPDATE tickets SET status='waiting'; UPDATE bookings SET status='completed'");
      await cancelVendor('1'); assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'completed');
    });
    await t.test('overdue reconciliation commits before rejecting and retains actual occupancy',async () => {
      await reset(); await ticket('1',{booking:true}); await record('1','start'); location.queueLifecycleMode='enforced';
      await assert.rejects(legacy('skipped'),{code:'QUEUE_DAY_OVERDUE'});
      assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,'closed');
      assert.equal((await readTicket('1')).status,'unserved'); assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'unfulfilled');
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
      assert.equal(await count('lifecycle_notifications'),1); assert.equal(await count('events'),2);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'5');
      await assert.rejects(legacy('skipped'),{code:'QUEUE_DAY_UNOPENED'});
      assert.equal(await count('lifecycle_notifications'),1); assert.equal(await count('events'),2);
    });
    await t.test('reconciliation failure still rolls back its partial outcomes',async () => {
      await reset(); await ticket('1',{booking:true}); location.queueLifecycleMode='enforced'; failReconciliation=true;
      await assert.rejects(legacy('skipped'),/closure failed/);
      assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,'open');
      assert.equal((await readTicket('1')).status,'called'); assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'confirmed');
      assert.equal(await count('lifecycle_notifications'),0); assert.equal(await count('events'),0);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');
    });
    await t.test('an unrelated enabled pool does not block ordinary or disabled-pool services',async () => {
      await reset(4,false); await ticket('1'); await ticket('2');
      await pool.query('INSERT INTO location_resource_pools VALUES(101,1,10,4,1,TRUE); INSERT INTO service_resource_requirements VALUES(1,10,2000,101,1,1); UPDATE store_locations SET service_timing_enabled=FALSE');
      await legacy('served'); assert.equal((await readTicket('1')).status,'served');
      await pool.query('DELETE FROM service_resource_requirements WHERE service_id=1000');
      await pool.query(`UPDATE ticket_service_plans SET items=jsonb_set(items,'{0,resource}','{"known":false}') WHERE ticket_id=2`);
      await legacy('served'); assert.equal((await readTicket('2')).status,'served');
      assert.equal(await count('resource_allocations'),0); assert.equal(await count('resource_ledger_commands'),0);
    });
    await t.test('mixed-service explicit starts allocate only the ticket resource and retain unknown-plan denial',async () => {
      await reset(4,false); await ticket('1'); await ticket('2'); await ticket('3',{plan:false});
      await pool.query('INSERT INTO location_resource_pools VALUES(101,1,10,4,1,TRUE); INSERT INTO service_resource_requirements VALUES(1,10,2000,101,1,1)');
      await pool.query(`UPDATE ticket_service_plans SET items=jsonb_set(jsonb_set(items,'{0,serviceId}','"2000"'),'{0,resource,poolId}','"101"') WHERE ticket_id=2`);
      await record('1','start'); await record('2','start');
      assert.equal(await count('resource_allocations'),1);
      const allocation=(await pool.query('SELECT ticket_id::text,pool_id::text FROM resource_allocations')).rows[0];
      assert.deepEqual(allocation,{ticket_id:'2',pool_id:'101'});
      await assert.rejects(record('3','start'),/plan/);
      await record('1','complete'); await record('2','complete');
    });
    await t.test('guest cancellation commits immutable booking protection once after tracking disable',async () => {
      await reset(); await ticket('1',{booking:true});
      await pool.query("UPDATE tickets SET status='waiting'; INSERT INTO queue_ticket_segments(ticket_id) VALUES(1); UPDATE location_resource_pools SET tracking_enabled=FALSE,revision=2");
      const results=await Promise.allSettled([cancelCustomer('1'),cancelCustomer('1')]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.filter(r=>r.status==='rejected' && r.reason.statusCode===409).length,1);
      assert.equal((await readTicket('1')).status,'cancelled');
      assert.equal((await pool.query('SELECT status,fulfillment_outcome_reason,refund_eligible FROM bookings')).rows[0].status,'canceled');
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'cancelled');
      assert.equal((await pool.query("SELECT actor_user_id FROM resource_ledger_commands WHERE command='cancelReservation'")).rows[0].actor_user_id,null);
      assert.equal((await pool.query('SELECT segment_outcome,outcome_reason FROM queue_ticket_segments')).rows[0].outcome_reason,'customer_cancelled');
      assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1); assert.equal(await count('resource_allocations'),0); assert.equal(pushes,1);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'4');
    });
    await t.test('linked ticket and booking require their current account owner',async () => {
      await reset(); await ticket('1',{booking:true});
      await pool.query("UPDATE tickets SET status='waiting',user_id=1; UPDATE bookings SET customer_user_id=1");
      await assert.rejects(cancelCustomer('1'),{statusCode:403});
      await assert.rejects(cancelCustomer('1',{actorUserId:'2'}),{statusCode:403});
      assert.equal((await readTicket('1')).status,'waiting'); assert.equal(await count('events'),0);
      await cancelCustomer('1',{actorUserId:'1',contact:{}});
      assert.equal((await pool.query("SELECT actor_user_id::text FROM resource_ledger_commands WHERE command='cancelReservation'")).rows[0].actor_user_id,'1');
    });
    await t.test('guest carry-over cancellation remains available after closure and preserves terminal booking status',async () => {
      await reset(); await ticket('1',{booking:true});
      await pool.query("UPDATE tickets SET status='pending_carry_over'; UPDATE bookings SET status='completed'; UPDATE store_locations SET is_active=FALSE"); queueClosed=true;
      await cancelCustomer('1',{contact:{customerPhone:'+639171234567'}});
      assert.equal((await readTicket('1')).status,'cancelled');
      assert.equal((await pool.query('SELECT status_reason FROM tickets')).rows[0].status_reason,'carry_over_declined');
      assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'completed');
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'cancelled');
      await reset(4,false); await ticket('1',{plan:false}); await pool.query("UPDATE tickets SET status='waiting'");
      await cancelCustomer('1'); assert.equal((await readTicket('1')).status,'cancelled');
      assert.equal(await count('resource_ledger_commands'),0); assert.equal(await count('resource_allocations'),0);
    });
    await t.test('customer cancellation failures roll all domain effects and receipts back',async () => {
      for(const failure of ['event','webhook']) {
        await reset(); await ticket('1',{booking:true});
        await pool.query("UPDATE tickets SET status='waiting'; INSERT INTO queue_ticket_segments(ticket_id) VALUES(1)");
        failEvent=failure==='event'; failWebhook=failure==='webhook';
        await assert.rejects(cancelCustomer('1'),new RegExp(`${failure} failed`));
        assert.equal((await readTicket('1')).status,'waiting'); assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'confirmed');
        assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
        assert.equal((await pool.query('SELECT ended_at FROM queue_ticket_segments')).rows[0].ended_at,null);
        assert.equal(await count('resource_ledger_commands'),1); assert.equal(await count('events'),0); assert.equal(await count('webhooks'),0); assert.equal(pushes,0);
        assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');
      }
    });
    await t.test('ownership, status and current user are reread after a competing location lock',async () => {
      const changes=[
        {sql:'UPDATE tickets SET user_id=1',code:403},
        {sql:"UPDATE tickets SET customer_email='changed@example.com',customer_phone=NULL",code:403},
        {sql:"UPDATE tickets SET status='called'",code:409},
        {sql:'UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1',actor:'1',code:403},
        {sql:'UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1',actor:'1',code:403}
      ];
      for(const change of changes) {
        await reset(); await ticket('1'); await pool.query("UPDATE tickets SET status='waiting'");
        const blocker=await pool.connect(); let pending;
        try {
          await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending=assert.rejects(cancelCustomer('1',{actorUserId:change.actor}),{statusCode:change.code});
          await waitForLocationLock();
          await blocker.query(change.sql); await blocker.query('COMMIT'); await pending;
          assert.equal(await count('events'),0); assert.equal(await count('resource_ledger_commands'),0);
        } finally {await blocker.query('ROLLBACK'); blocker.release(); if(pending) await pending;}
      }
    });
    await t.test('wrong scope, inconsistent booking owner and active occupancy cannot be cancelled by a customer',async () => {
      await reset(); await ticket('1',{booking:true}); await pool.query("UPDATE tickets SET status='waiting'; UPDATE bookings SET customer_user_id=2");
      await assert.rejects(cancelCustomer('1',{selected:{_id:'20'}}),{statusCode:404});
      await assert.rejects(cancelCustomer('1'),{statusCode:403});
      assert.equal((await readTicket('1')).status,'waiting'); assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
      await pool.query("UPDATE bookings SET customer_user_id=NULL; UPDATE tickets SET status='called'"); await record('1','start');
      await pool.query("UPDATE tickets SET status='waiting'; UPDATE location_resource_pools SET tracking_enabled=FALSE");
      await assert.rejects(cancelCustomer('1'),/Use Start service/);
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
      assert.equal((await readTicket('1')).status,'waiting');
    });
    await t.test('customer cancellation ledger capability rejects other commands and unrelated protection',async () => {
      await reset(); await ticket('1',{booking:true});
      const transact=(callback,actorUserId)=>ledger.withCustomerTicketCancellationTransaction({pool,tenantId:'1',locationId:'10',lookupCode:'LOOKUP-1',actorUserId,authorize:async()=>true},callback);
      for(const actor of [undefined,'1']) {
        for(const command of ['reserve','allocate','release']) {
          await assert.rejects(transact((_client,capability)=>capability.executeCommand({command,payload:{},operationKey:'ticket:1:reservation:1:customer-cancel'}),actor),{statusCode:403});
        }
      }
      const binding=(await pool.query('SELECT id::text FROM resource_ledger_reservations')).rows[0].id;
      await assert.rejects(transact((_client,capability)=>capability.executeCommand({command:'cancelReservation',payload:{reservationId:binding},operationKey:`ticket:2:reservation:${binding}:customer-cancel`})),{statusCode:403});
      await assert.rejects(transact((_client,capability)=>capability.executeCommand({command:'cancelReservation',payload:{reservationId:binding},operationKey:`booking:1:reservation:${binding}:expiry:cancel`})),{statusCode:403});
      await assert.rejects(transact((_client,capability)=>capability.executeCommand({command:'cancelReservation',payload:{reservationId:binding},operationKey:`ticket:1:reservation:${binding}:customer-cancel`})),{statusCode:403});
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected'); assert.equal(await count('resource_ledger_commands'),1);
    });
    await t.test('competing calls use real ticket SQL and preserve one called ticket without allocation',async () => {
      await reset(); await ticket('1'); await ticket('2'); await pool.query("UPDATE tickets SET status='waiting'");
      const results=await Promise.allSettled([call(),call()]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.filter(r=>r.status==='rejected' && r.reason.statusCode===400).length,1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM tickets WHERE status='called'")).rows[0].n,1);
      assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1); assert.equal(pushes,1);
      assert.equal(await count('resource_allocations'),0); assert.equal(await count('resource_ledger_commands'),0);
      assert.equal((await pool.query('SELECT bool_and(service_started_at IS NULL) AS untouched FROM tickets')).rows[0].untouched,true);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');
    });
    await t.test('confirmation checks scanned identity and deduplicates concurrent retries without service start',async () => {
      await reset(); await ticket('1',{channel:'online'});
      await assert.rejects(confirm('WRONG'),{statusCode:409}); assert.equal(await count('events'),0);
      await Promise.all([confirm('lookup-1'),confirm()]);
      const stamp=(await pool.query('SELECT customer_confirmed_at::text FROM tickets')).rows[0].customer_confirmed_at;
      assert.ok(stamp); await confirm();
      assert.equal((await pool.query('SELECT customer_confirmed_at::text FROM tickets')).rows[0].customer_confirmed_at,stamp);
      assert.equal((await readTicket('1')).status,'called'); assert.equal((await readTicket('1')).serviceStartedAt,null);
      assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1); assert.equal(pushes,1);
      assert.equal(await count('resource_allocations'),0); assert.equal(await count('resource_ledger_commands'),0);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');
    });
    const issueBarcode=(id='1',user='1',issuer=barcodeService)=>issuer.issueForOwner(id,user);
    async function ownedTicket() {await reset();await ticket('1',{channel:'online'});await pool.query('UPDATE tickets SET user_id=1 WHERE id=1');}
    await t.test('rotating barcode enrollment is owner scoped stable compact and expires after exactly two database minutes',async () => {
      await ownedTicket();for(const [id,user] of [['1','2'],['2','1'],['0','1'],['9007199254740993','1']])await assert.rejects(issueBarcode(id,user),{statusCode:404});
      const [first,second]=await Promise.all([issueBarcode(),issueBarcode()]);assert.equal(first.barcodeToken,second.barcodeToken);assert.match(first.barcodeToken,/^QB[A-F0-9]{32}$/);assert.equal(Date.parse(first.expiresAt)-Date.parse(first.issuedAt),120000);assert.ok(Date.parse(first.serverNow)>=Date.parse(first.issuedAt));assert.equal(await count('queue_ticket_barcodes'),1);assert.equal(await count('resource_ledger_scopes'),0);assert.equal(await count('events'),0);
      await assert.rejects(pool.query("UPDATE queue_ticket_barcodes SET expires_at=expires_at+INTERVAL '1 second'"),{code:'23514'});
      await pool.query("UPDATE queue_ticket_barcodes SET issued_at=issued_at-INTERVAL '121 seconds',expires_at=expires_at-INTERVAL '121 seconds'");await assert.rejects(confirm(undefined,{barcodeToken:first.barcodeToken}),{code:'TICKET_BARCODE_INVALID'});
      const refreshed=await issueBarcode();assert.notEqual(refreshed.barcodeToken,first.barcodeToken);await assert.rejects(confirm(undefined,{barcodeToken:first.barcodeToken}),{code:'TICKET_BARCODE_INVALID'});await confirm(undefined,{barcodeToken:refreshed.barcodeToken});
      const protectedReference=await realTickets.findTicketByTenantAndLookupCode('1','LOOKUP-1',{client:pool});assert.equal(protectedReference.barcodeRotationEnabled,true);assert.equal(protectedReference.lookupCode,'LOOKUP-1');assert.equal(protectedReference.barcodeToken,undefined);assert.equal(protectedReference.nonce,undefined);
    });
    await t.test('rotating barcode scanner rejects static bypass wrong token scope and replay after confirmation without service start',async () => {
      await ownedTicket();const token=await issueBarcode();await assert.rejects(confirm(),{code:'TICKET_BARCODE_REQUIRED'});await assert.rejects(confirm(undefined,{barcodeToken:'QB'+ '0'.repeat(32)}),{code:'TICKET_BARCODE_INVALID'});
      await ticket('2',{channel:'online'});await pool.query("UPDATE tickets SET user_id=1,status='waiting' WHERE id=2");const other=await issueBarcode('2');await assert.rejects(confirm(undefined,{barcodeToken:other.barcodeToken}),{code:'TICKET_BARCODE_INVALID'});
      assert.equal(await count('events'),0);await confirm(undefined,{barcodeToken:token.barcodeToken});await assert.rejects(confirm(undefined,{barcodeToken:token.barcodeToken}),{code:'TICKET_BARCODE_INVALID'});await assert.rejects(issueBarcode(),{code:'TICKET_BARCODE_UNAVAILABLE'});
      assert.equal(await count('events'),1);assert.equal(await count('webhooks'),1);assert.equal((await readTicket('1')).serviceStartedAt,null);assert.equal(await count('resource_allocations'),0);
    });
    await t.test('rotating confirmation rollback permits retry and competing scans confirm only once',async () => {
      await ownedTicket();const token=await issueBarcode();failEvent=true;await assert.rejects(confirm(undefined,{barcodeToken:token.barcodeToken}),/event failed/);assert.equal((await readTicket('1')).customerConfirmedAt,null);assert.equal(await count('events'),0);failEvent=false;
      const results=await Promise.allSettled([confirm(undefined,{barcodeToken:token.barcodeToken}),confirm(undefined,{barcodeToken:token.barcodeToken})]);assert.equal(results.filter(item=>item.status==='fulfilled').length,1);assert.equal(results.find(item=>item.status==='rejected').reason.code,'TICKET_BARCODE_INVALID');assert.equal(await count('events'),1);assert.equal(await count('webhooks'),1);
    });
    await t.test('rotating barcode issuance and scanner fail closed on current lifecycle and account restrictions',async () => {
      for(const change of ["status='served'","status='cancelled'","status='expired'","status='unserved'","customer_confirmed_at=clock_timestamp()","service_started_at=clock_timestamp()","service_ended_at=clock_timestamp()","service_outcome='interrupted'","terminal_at=clock_timestamp()"]){
        await ownedTicket();const token=await issueBarcode();await pool.query(`UPDATE tickets SET ${change}`);await assert.rejects(issueBarcode(),{code:'TICKET_BARCODE_UNAVAILABLE'});const current=await realTickets.findTicketById('1',{client:pool});await assert.rejects(barcodeService.assertConfirmationCredential(pool,current,{barcodeToken:token.barcodeToken}),{code:'TICKET_BARCODE_INVALID'});
      }
      for(const change of ["UPDATE tickets SET developer_project_id=7,developer_environment='sandbox'","UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1","UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1"]){await ownedTicket();await pool.query(change);await assert.rejects(issueBarcode(),{statusCode:404});assert.equal(await count('queue_ticket_barcodes'),0);}
      for(const status of ['waiting','skipped','pending_carry_over']){await ownedTicket();await pool.query('UPDATE tickets SET status=$1',[status]);assert.match((await issueBarcode()).barcodeToken,/^QB/);}
    });
    await t.test('rotating barcode enrollment rolls back on signing and commit failures and can reuse the connection',async () => {
      await ownedTicket();const unavailable=loadService({'../config/db':{pool},'../config/env':{jwtSecret:'change-me'}},'ticketBarcodeService');await assert.rejects(issueBarcode('1','1',unavailable),{statusCode:503});assert.equal(await count('queue_ticket_barcodes'),0);
      const faultPool={query:(...args)=>pool.query(...args),connect:async()=>{const client=await pool.connect();return {release:()=>client.release(),query:async(sql,args)=>{if(sql==='COMMIT')throw new Error('barcode commit fault');return client.query(sql,args);}};}};
      const issuer=loadService({'../config/db':{pool:faultPool},'../config/env':{jwtSecret:'isolated-ticket-barcode-secret'}},'ticketBarcodeService');await assert.rejects(issueBarcode('1','1',issuer),/barcode commit fault/);assert.equal(await count('queue_ticket_barcodes'),0);await issueBarcode();
    });
    await t.test('rotating barcode enrollment serializes a competing static confirmation and current ownership lifecycle changes',async () => {
      await ownedTicket();let entered;let release;const ready=new Promise(resolve=>{entered=resolve;});const barrier=new Promise(resolve=>{release=resolve;});
      const heldPool={query:(...args)=>pool.query(...args),connect:async()=>{const client=await pool.connect();return {release:()=>client.release(),query:async(sql,args)=>{const result=await client.query(sql,args);if(/INSERT INTO queue_ticket_barcodes/.test(sql)){entered();await barrier;}return result;}};}};
      const issuer=loadService({'../config/db':{pool:heldPool},'../config/env':{jwtSecret:'isolated-ticket-barcode-secret'}},'ticketBarcodeService');const enrollment=issueBarcode('1','1',issuer);enrollment.catch(()=>{});let confirmation;
      try {await Promise.race([ready,enrollment.then(()=>{throw new Error('barcode enrollment barrier missing');})]);confirmation=confirm();confirmation.catch(()=>{});await waitForLocationLock();}
      finally {release();const results=await Promise.allSettled([enrollment,confirmation]);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(results[1].reason.code,'TICKET_BARCODE_REQUIRED');}
      for(const change of ['customer_confirmed_at=clock_timestamp()','user_id=2']) {await ownedTicket();const blocker=await pool.connect();let pending;
        try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');pending=issueBarcode();pending.catch(()=>{});await waitForLocationLock();await blocker.query(`UPDATE tickets SET ${change}`);const denied=assert.rejects(pending,{statusCode:change.startsWith('user_id')?404:409});await blocker.query('COMMIT');await denied;}
        finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}assert.equal(await count('queue_ticket_barcodes'),0);
      }
    });
    await t.test('rotating barcode enrollment preserves exact adjacent owner and ticket identifiers',async () => {
      await reset();const selected='9007199254740993';const neighbor='9007199254740992';await pool.query("INSERT INTO users(id,roles) VALUES($1,'{}'),($2,'{}')",[selected,neighbor]);await ticket(selected);await ticket(neighbor);await pool.query('UPDATE tickets SET user_id=id');await assert.rejects(issueBarcode(selected,neighbor),{statusCode:404});const token=await issueBarcode(selected,selected);assert.match(token.barcodeToken,/^QB/);assert.deepEqual((await pool.query('SELECT ticket_id::text FROM queue_ticket_barcodes')).rows,[{ticket_id:selected}]);
    });
    await t.test('call eligibility keeps early arrived bookings waiting and selects an eligible ordinary ticket',async () => {
      await reset(); await ticket('1',{booking:true}); await pool.query("UPDATE tickets SET status='waiting',service_priority_band='checked_in_booking'; UPDATE bookings SET scheduled_start_at=clock_timestamp()+interval '1 hour'");
      await assert.rejects(call(),{code:'NO_READY_WAITING_TICKET'});
      assert.equal((await readTicket('1')).status,'waiting'); assert.equal(await count('events'),0);
      await ticket('2'); await pool.query("UPDATE tickets SET status='waiting' WHERE id=2; INSERT INTO service_counters VALUES(1,1,10,TRUE)");
      const result=await call({serviceCounter:{_id:'1'}});
      assert.equal(result.ticket._id,'2'); assert.equal(result.ticket.serviceCounterId,'1');
      assert.equal((await readTicket('1')).status,'waiting');
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
      assert.equal(await count('resource_allocations'),0);
    });
    await t.test('a booking becoming ready during lock contention uses the current DB clock for eligibility and call time',async () => {
      await reset(); await ticket('1',{booking:true}); await pool.query("UPDATE tickets SET status='waiting'; UPDATE bookings SET scheduled_start_at=clock_timestamp()+interval '1 hour'");
      const blocker=await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending=call(); pending.catch(()=>{}); await waitForLocationLock();
        await blocker.query('UPDATE bookings SET scheduled_start_at=clock_timestamp()'); await blocker.query('COMMIT');
        const result=await pending; assert.equal(result.ticket._id,'1');
        assert.equal((await pool.query('SELECT t.called_at>=b.scheduled_start_at AS after_ready FROM tickets t JOIN bookings b ON b.queue_ticket_id=t.id')).rows[0].after_ready,true);
        assert.equal(await count('resource_allocations'),0);
      } finally {await blocker.query('ROLLBACK'); blocker.release(); if(pending) await pending.catch(()=>{});}
    });
    await t.test('calling and confirmation roll back on event or webhook failures',async () => {
      for(const action of ['call','confirm']) {
        for(const failure of ['event','webhook']) {
          await reset(); await ticket('1',{booking:true});
          if(action==='call') await pool.query("UPDATE tickets SET status='waiting'");
          failEvent=failure==='event'; failWebhook=failure==='webhook';
          await assert.rejects(action==='call'?call():confirm(),new RegExp(`${failure} failed`));
          assert.equal((await readTicket('1')).status,action==='call'?'waiting':'called');
          assert.equal((await readTicket('1')).customerConfirmedAt,null);
          assert.equal(await count('events'),0); assert.equal(await count('webhooks'),0); assert.equal(pushes,0);
          assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');
          assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
        }
      }
    });
    await t.test('calling and confirmation enforce current staff access, branch and counter scope',async () => {
      await reset(); await ticket('1'); await pool.query("UPDATE tickets SET status='waiting'");
      await assert.rejects(call({actorUserId:'2'}),{statusCode:403});
      await assert.rejects(confirm('LOOKUP-1',{actorUserId:'2'}),{statusCode:403});
      await pool.query('INSERT INTO tenant_membership_locations VALUES(2,10); INSERT INTO service_counters VALUES(1,1,10,FALSE),(2,2,20,TRUE)');
      for(const id of ['1','2','9007199254740993']) await assert.rejects(call({serviceCounter:{_id:id}}),{statusCode:404});
      await pool.query('UPDATE service_counters SET is_active=TRUE WHERE id=1');
      await call({actorUserId:'2',serviceCounter:{_id:'1'}}); await confirm('LOOKUP-1',{actorUserId:'2'});
      await pool.query('UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=2');
      await assert.rejects(confirm('LOOKUP-1',{actorUserId:'2'}),{statusCode:403});
      await pool.query('UPDATE store_locations SET is_active=FALSE WHERE id=10');
      await assert.rejects(confirm(),{statusCode:409});
      assert.equal(await count('events'),2); assert.equal(await count('resource_allocations'),0);
    });
    await t.test('vendor call and confirmation use database deadlines with skewed application clocks',async () => {
      // A fast host clock can request snapshot maintenance after the action.
      // Its real boundary was covered separately; model its database-time no-op.
      queueMocks['./queueDayLifecycleService'].closeQueueDay=async()=>{
        assert.equal((await pool.query('SELECT closes_at<=clock_timestamp() AS due FROM queue_day_state')).rows[0].due,false);
      };
      const ActualDate=Date;
      for(const action of ['call','confirm']) for(const due of [false,true]) {
        await reset();await ticket('1',{booking:true});
        if(action==='call')await pool.query("UPDATE tickets SET status='waiting'");
        await pool.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10");
        await pool.query(`UPDATE queue_day_state SET closes_at=clock_timestamp()+interval '${due ? '-1 second' : '1 hour'}'`);
        globalThis.Date=class extends ActualDate {
          constructor(...args){super(...(args.length?args:[due?'1980-01-01':'2100-01-01']));}
        };
        try {
          const pending=action==='call'?call():confirm();
          if(due)await assert.rejects(pending,{code:'QUEUE_DAY_OVERDUE'});else await pending;
        } finally {globalThis.Date=ActualDate;}
        assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,due?'closed':'open');
        assert.equal((await readTicket('1')).status,due?'unserved':'called');
        assert.equal(await count('resource_allocations'),0);
      }
    });
    await t.test('current enforced mode commits overdue reconciliation before rejecting call or confirmation',async () => {
      for(const action of ['call','confirm']) {
        await reset(); await ticket('1',{booking:true});
        if(action==='call') await pool.query("UPDATE tickets SET status='waiting'");
        else await record('1','start');
        await pool.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10");
        // The caller's stale location object still has legacy mode.
        await assert.rejects(action==='call'?call():confirm(),{code:'QUEUE_DAY_OVERDUE'});
        assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,'closed');
        assert.equal((await readTicket('1')).status,'unserved'); assert.equal(await count('lifecycle_notifications'),1);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM events WHERE event_type IN (\'ticket_called\',\'ticket_confirmed\')')).rows[0].n,0);
        if(action==='confirm') assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
        const revision=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
        await assert.rejects(action==='call'?call():confirm(),{code:'QUEUE_DAY_UNOPENED'});
        assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,revision);
      }
    });
    await t.test('competing restorations commit once and preserve booking protection and frozen service plan',async () => {
      await reset(); await skipped('1',{booking:true});
      const plan=(await pool.query('SELECT items FROM ticket_service_plans')).rows[0].items;
      const results=await Promise.allSettled([restore(),restore()]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.statusCode,409);
      const row=(await pool.query('SELECT * FROM tickets')).rows[0];
      assert.equal(row.status,'waiting'); assert.equal(row.service_priority_band,'recovery');
      for(const key of ['service_counter_id','called_at','notified_called_at','customer_confirmed_at','rejoin_deadline_at','service_started_at']) assert.equal(row[key],null);
      assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1); assert.equal(pushes,1);
      assert.deepEqual((await pool.query('SELECT items FROM ticket_service_plans')).rows[0].items,plan);
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
      assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'confirmed');
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'3');
      assert.equal(await count('resource_allocations'),0); assert.equal(await count('resource_ledger_commands'),1);
      await reset(); await skipped(); await pool.query("UPDATE tickets SET rejoin_deadline_at=clock_timestamp()-interval '1 second'");
      assert.equal((await restore()).ticket.servicePriorityBand,'normal');
      await reset(4,false); await skipped('1',{plan:false});
      assert.equal((await restore()).ticket.status,'waiting');
      assert.equal(await count('resource_allocations'),0);
    });
    await t.test('restoration rechecks scoped identity, current access, metadata and same nonterminal Queue Day',async () => {
      for(const sql of [
        "UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=1",
        "UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1",
        "UPDATE tenant_memberships SET role='customer' WHERE user_id=1",
        "UPDATE tenant_memberships SET role='staff' WHERE user_id=1",
        "UPDATE store_locations SET is_active=FALSE WHERE id=10",
        "UPDATE tenants SET is_active=FALSE WHERE id=1",
        "UPDATE tickets SET skipped_at=NULL",
        "UPDATE tickets SET date_key='20261007'",
        "UPDATE tickets SET terminal_at=clock_timestamp()"
      ]) {
        await reset(); await skipped(); await pool.query(sql);
        await assert.rejects(restore()); assert.equal((await readTicket('1')).status,'skipped');
        assert.equal(await count('events'),0);
      }
      await reset(); await skipped();
      await assert.rejects(restore('1',{lookupCode:'WRONG'}),{statusCode:404});
      await assert.rejects(restore('1',{location:{_id:'20'}}));
      for(const id of ['9007199254740993','-1','1.1','1x']) await assert.rejects(restore(id),{statusCode:404});
      await pool.query("UPDATE tenant_memberships SET role='staff' WHERE user_id=1; INSERT INTO tenant_membership_locations VALUES(1,10)");
      assert.equal((await restore()).ticket.status,'waiting');
    });
    await t.test('restoration reads current intake policy and serializes the last waiting place',async () => {
      await reset(); await skipped(); await pool.query('UPDATE intake_state SET paused=TRUE');
      await assert.rejects(restore(),{code:'QUEUE_INTAKE_PAUSED'});
      await pool.query('UPDATE intake_state SET paused=FALSE; UPDATE tenants SET auto_pause_enabled=TRUE,auto_pause_threshold=1 WHERE id=1');
      await skipped('2');
      const results=await Promise.allSettled([restore('1'),restore('2')]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.code,'QUEUE_RESTORE_THRESHOLD_REACHED');
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM tickets WHERE status='waiting'")).rows[0].n,1);
      assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1);
      await reset(); await skipped(); queueClosed=true;
      await assert.rejects(restore(),{statusCode:409});
    });
    await t.test('restoration rejects service history even after tracking disable and never releases occupancy',async () => {
      await reset(); await ticket('1'); await record('1','start');
      await pool.query("UPDATE tickets SET status='skipped',skipped_at=clock_timestamp(); UPDATE location_resource_pools SET tracking_enabled=FALSE");
      await assert.rejects(restore(),{statusCode:409});
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
      await pool.query("UPDATE resource_allocations SET released_at=clock_timestamp(),outcome='completed'; UPDATE tickets SET service_ended_at=clock_timestamp()");
      await assert.rejects(restore(),{statusCode:409});
      await reset(); await skipped(); await pool.query('UPDATE tickets SET service_started_at=clock_timestamp(),service_ended_at=clock_timestamp()');
      await assert.rejects(restore(),{statusCode:409});
      await reset(); await skipped('1',{booking:true});
      await pool.query("UPDATE resource_ledger_reservations SET state='converted'");
      await assert.rejects(restore(),{statusCode:409});
      await pool.query('UPDATE bookings SET queue_ticket_id=NULL');
      await assert.rejects(restore(),{statusCode:409});
      assert.equal(await count('resource_allocations'),0);
    });
    await t.test('enforced restoration requires the current accepting Queue Day and reads changes after lock contention',async () => {
      await reset(); await skipped();
      await pool.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10; UPDATE queue_day_state SET closes_at=clock_timestamp()+interval '1 hour'; UPDATE tickets SET current_queue_day_id=998");
      await assert.rejects(restore(),{statusCode:409});
      await pool.query("UPDATE tickets SET current_queue_day_id=999; UPDATE queue_day_state SET intake_mode='paused'");
      await assert.rejects(restore(),{code:'QUEUE_INTAKE_PAUSED'});
      await pool.query("UPDATE queue_day_state SET intake_mode='accepting'");
      assert.equal((await restore('1',{queueDateKey:undefined})).ticket.status,'waiting');
      await reset(); await skipped();
      const blocker=await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending=restore(); pending.catch(()=>{}); await waitForLocationLock();
        await blocker.query("UPDATE tickets SET rejoin_deadline_at=clock_timestamp()-interval '1 second'");
        await blocker.query('COMMIT');
        assert.equal((await pending).ticket.servicePriorityBand,'normal');
      } finally {await blocker.query('ROLLBACK'); blocker.release(); if(pending) await pending.catch(()=>{});}
      await reset(); await skipped();
      const revoke=await pool.connect(); pending=undefined;
      try {
        await revoke.query('BEGIN'); await revoke.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending=restore(); pending.catch(()=>{}); await waitForLocationLock();
        await revoke.query('UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=1'); await revoke.query('COMMIT');
        await assert.rejects(pending); assert.equal((await readTicket('1')).status,'skipped');
      } finally {await revoke.query('ROLLBACK'); revoke.release(); if(pending) await pending.catch(()=>{});}
    });
    await t.test('restoration event and webhook failures roll back priority, timestamps, protection and revision',async () => {
      for(const failure of ['event','webhook']) {
        await reset(); await skipped('1',{booking:true});
        const before=(await pool.query('SELECT to_jsonb(t) AS row FROM tickets t')).rows[0].row;
        const revision=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
        failEvent=failure==='event'; failWebhook=failure==='webhook';
        await assert.rejects(restore(),new RegExp(`${failure} failed`));
        assert.deepEqual((await pool.query('SELECT to_jsonb(t) AS row FROM tickets t')).rows[0].row,before);
        assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,revision);
        assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
        assert.equal(await count('events'),0); assert.equal(await count('webhooks'),0); assert.equal(pushes,0);
      }
      await reset(); await skipped(); await pool.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10");
      await assert.rejects(restore(),{code:'QUEUE_DAY_OVERDUE'});
      assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,'closed');
      assert.equal(await count('lifecycle_notifications'),1);
      await assert.rejects(restore(),{code:'QUEUE_DAY_UNOPENED'});
      assert.equal(await count('lifecycle_notifications'),1);
    });
    await t.test('vendor walk-ins commit actual ticket, frozen service plan, allowance fixture, event and scope revision without allocation',async () => {
      await reset();
      const results=await Promise.all([walkin(),walkin()]);
      assert.equal(new Set(results.map(r=>r.ticket.sequence)).size,2);
      assert.equal(results.every(r=>r.ticket.status==='waiting' && r.ticket.ticketNumber.startsWith('Q')),true);
      const plans=(await pool.query('SELECT * FROM ticket_service_plans ORDER BY ticket_id')).rows;
      assert.equal(plans.length,2); assert.equal(plans[0].created_by_user_id,'1');
      assert.equal(plans[0].source,'staff_selection'); assert.equal(plans[0].items[0].resource.poolId,'100');
      assert.equal(await count('allowance_audit'),2); assert.equal(await count('events'),2); assert.equal(await count('webhooks'),2); assert.equal(pushes,2);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'3');
      assert.equal(await count('resource_allocations'),0); assert.equal(await count('resource_ledger_commands'),0);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM tickets WHERE service_started_at IS NOT NULL')).rows[0].n,0);
      await reset(1); await ticket('1',{booking:true}); await record('1','start');
      const before=(await pool.query('SELECT to_jsonb(a) AS row FROM resource_allocations a')).rows[0].row;
      await walkin();
      assert.deepEqual((await pool.query('SELECT to_jsonb(a) AS row FROM resource_allocations a')).rows[0].row,before);
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'converted');
      await reset(4,false); await walkin({serviceId:undefined});
      assert.equal(await count('ticket_service_plans'),0); assert.equal(await count('resource_allocations'),0);
    });
    await t.test('walk-in admission rejects revoked access, inactive scope, paused intake, closed hours and invalid service',async () => {
      for(const sql of [
        "UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=1",
        "UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1",
        "UPDATE tenant_memberships SET role='customer' WHERE user_id=1",
        "UPDATE tenant_memberships SET role='staff' WHERE user_id=1",
        "UPDATE store_locations SET is_active=FALSE WHERE id=10",
        "UPDATE tenants SET is_active=FALSE WHERE id=1",
        "UPDATE intake_state SET paused=TRUE",
        "UPDATE store_hours SET is_closed=TRUE",
        "UPDATE vendor_services SET is_active=FALSE",
        "UPDATE location_services SET is_active=FALSE",
        "UPDATE location_services SET location_id=20"
      ]) {
        await reset(); await pool.query(sql); await assert.rejects(walkin());
        assert.equal(await count('tickets'),0); assert.equal(await count('counters'),0); assert.equal(await count('allowance_audit'),0); assert.equal(await count('events'),0);
      }
      await reset();
      await assert.rejects(walkin({actorUserId:undefined}));
      await assert.rejects(walkin({location:{_id:'20'}}));
      await assert.rejects(walkin({serviceId:'9007199254740993'}));
      await assert.rejects(walkin({serviceId:'1x'}));
      await pool.query("UPDATE tenant_memberships SET role='staff' WHERE user_id=1; INSERT INTO tenant_membership_locations VALUES(1,10)");
      assert.equal((await walkin()).ticket.status,'waiting');
    });
    await t.test('walk-ins and restores serialize the final waiting place using current DB threshold',async () => {
      for(const mixed of [false,true]) {
        await reset(); await pool.query('UPDATE tenants SET auto_pause_enabled=TRUE,auto_pause_threshold=1');
        let second=()=>walkin();
        if(mixed) {
          await skipped();
          const dateKey=require('../src/services/queueHelpers').getDateKey(new Date(),'Asia/Manila');
          await pool.query('UPDATE tickets SET date_key=$1',[dateKey]);
          second=()=>restore('1',{queueDateKey:dateKey});
        }
        const results=await Promise.allSettled([walkin(),second()]);
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
        assert.match(results.find(r=>r.status==='rejected').reason.code,/QUEUE_(INTAKE|RESTORE)_THRESHOLD_REACHED/);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM tickets WHERE status='waiting'")).rows[0].n,1);
        assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1);
      }
    });
    await t.test('walk-in event, webhook and allowance failures roll back ticket, sequence, plan, email journey and revision',async () => {
      for(const failure of ['event','webhook','allowance']) {
        await reset(); failEvent=failure==='event'; failWebhook=failure==='webhook'; failAllowance=failure==='allowance';
        await assert.rejects(walkin({customerEmail:'walkin@example.com',notifyByEmail:true}),new RegExp(`${failure} failed`));
        for(const table of ['tickets','counters','ticket_service_plans','allowance_audit','queue_email_journeys','queue_email_slots','events','webhooks','resource_ledger_scopes']) assert.equal(await count(table),0,table);
        assert.equal(pushes,0);
      }
      await reset(); await walkin({customerEmail:'walkin@example.com',notifyByEmail:true});
      assert.equal(await count('queue_email_journeys'),1); assert.equal(await count('queue_email_slots'),10); assert.equal(await count('allowance_audit'),2);
    });
    await t.test('walk-ins reject membership or operating-hours changes committed while waiting for the location lock',async () => {
      for(const sql of ["UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=1","UPDATE store_hours SET is_closed=TRUE"]) {
        await reset();
        const blocker=await pool.connect(); let pending;
        try {
          await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending=walkin(); pending.catch(()=>{}); await waitForLocationLock();
          await blocker.query(sql); await blocker.query('COMMIT');
          await assert.rejects(pending);
          assert.equal(await count('tickets'),0); assert.equal(await count('allowance_audit'),0); assert.equal(await count('events'),0);
        } finally {await blocker.query('ROLLBACK'); blocker.release(); if(pending) await pending.catch(()=>{});}
      }
    });
    await t.test('walk-ins use current enforced Queue Day after lock wait and commit overdue reconciliation before rejecting',async () => {
      await reset();
      const blocker=await pool.connect(); let pending;
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending=walkin(); pending.catch(()=>{}); await waitForLocationLock();
        await blocker.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10; UPDATE queue_day_state SET closes_at=clock_timestamp()+interval '1 hour'");
        await blocker.query('COMMIT');
        const created=await pending; assert.equal(created.ticket.currentQueueDayId,'999'); assert.equal(created.ticket.dateKey,'20261008');
      } finally {await blocker.query('ROLLBACK'); blocker.release(); if(pending) await pending.catch(()=>{});}
      await reset(); await pool.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10");
      await assert.rejects(walkin(),{code:'QUEUE_DAY_OVERDUE'});
      assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,'closed');
      assert.equal(await count('lifecycle_notifications'),1); assert.equal(await count('tickets'),0);
      await assert.rejects(walkin(),{code:'QUEUE_DAY_UNOPENED'});
      assert.equal(await count('lifecycle_notifications'),1);
    });
    await t.test('expiry between initial open-day and later intake checks commits closure after discarding the requested action',async () => {
      for(const read of [2,3]) {
        await reset(); dueRead=read;
        await ticket('1',{booking:true}); await record('1','start');
        await pool.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10");
        const revision=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
        // Controlled Queue Day lookup models the deadline passing between reads.
        // On the third-read case, a transactional fixture writes during admission;
        // savepoint rollback must remove it before closure can commit.
        const raced=loadService({...queueMocks,
          '../repositories/tickets':{...queueMocks['../repositories/tickets'],createTicket:realTickets.createTicket,listWaitingTickets:realTickets.listWaitingTickets},
          './storeHoursService':{assertLocationOpenForCustomerJoin:async (selected,options) => {
            await hours.assertLocationOpenForCustomerJoin(selected,options);
            await options.client.query("INSERT INTO allowance_audit VALUES(99999,'admission-fixture')");
          }}
        },'queueService');
        await assert.rejects(raced.createTicket({tenant,location,actorUserId:'1',joinChannel:'vendor',customerName:'Walk in',serviceId:'1000'}),{code:'QUEUE_DAY_OVERDUE'});
        assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,'closed');
        assert.equal(await count('tickets'),1); assert.equal((await readTicket('1')).status,'unserved');
        assert.equal(await count('lifecycle_notifications'),1); assert.equal(await count('allowance_audit'),0); assert.equal(await count('counters'),0);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM events WHERE event_type='ticket_created'")).rows[0].n,0);
        assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,String(BigInt(revision)+1n));
        assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
        const after=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
        await assert.rejects(walkin(),{code:'QUEUE_DAY_UNOPENED'});
        assert.equal(await count('lifecycle_notifications'),1);
        assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,after);
      }
      await reset(); dueRead=2; failReconciliation=true;
      await pool.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10");
      await assert.rejects(walkin(),/closure failed/);
      assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,'open');
      for(const table of ['tickets','events','lifecycle_notifications','allowance_audit','resource_ledger_scopes']) assert.equal(await count(table),0,table);
    });
    await t.test('public QR and authenticated online joins atomically create waiting work without allocation',async () => {
      await reset(); const results=await Promise.all([publicJoin(),publicJoin({userId:'1',joinChannel:'online',notifyByEmail:true,customerEmail:'owner@example.com'})]);
      assert.deepEqual(results.map(r=>r.ticket.sequence).sort(),[1,2]);
      assert.equal(await count('tickets'),2); assert.equal(await count('events'),2); assert.equal(await count('webhooks'),2);
      assert.equal(await count('allowance_audit'),3); assert.equal(await count('queue_email_journeys'),1); assert.equal(await count('queue_email_slots'),10);
      assert.equal(await count('ticket_service_plans'),0); assert.equal(await count('resource_allocations'),0); assert.equal(await count('resource_ledger_commands'),0);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'3');
    });
    await t.test('public joins serialize the final waiting place with current database threshold',async () => {
      await reset(); await pool.query("UPDATE tenants SET auto_pause_enabled=TRUE,auto_pause_threshold=1,queue_prefix='NEW' WHERE id=1");
      const results=await Promise.allSettled([publicJoin(),publicJoin({userId:'1',joinChannel:'online'})]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.equal(results.find(r=>r.status==='rejected').reason.code,'QUEUE_INTAKE_THRESHOLD_REACHED');
      assert.equal(await count('tickets'),1); assert.ok(results.find(r=>r.status==='fulfilled').value.ticket.ticketNumber.startsWith('NEW'));
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');
    });
    await t.test('public admission rechecks branch, tenant, customer, subscription, fee, hours and intake',async () => {
      for(const sql of ["UPDATE store_locations SET is_active=FALSE WHERE id=10","UPDATE tenants SET is_active=FALSE WHERE id=1",
        "UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1","UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1",
        "UPDATE tenant_subscriptions SET status='suspended'", "UPDATE tenant_subscriptions SET plan_slug='unknown'", "UPDATE store_locations SET queue_lifecycle_mode='unknown' WHERE id=10", "INSERT INTO queue_fee_settings(plan_slug,enabled,amount_cents,currency) VALUES('free',TRUE,100,'PHP')",
        "UPDATE store_hours SET is_closed=TRUE", "UPDATE intake_state SET paused=TRUE", "UPDATE intake_state SET closed=TRUE"]) {
        await reset(); await pool.query(sql); await assert.rejects(publicJoin({userId:'1',joinChannel:'online'}));
        for(const table of ['tickets','events','allowance_audit','resource_ledger_scopes']) assert.equal(await count(table),0,table);
      }
      await reset(); await assert.rejects(publicJoin({location:{_id:'20'}}),{statusCode:404});
      await assert.rejects(publicJoin({userId:'9007199254740993'}),{statusCode:400}); assert.equal(await count('tickets'),0);
    });
    await t.test('public admission rechecks committed policy and identity after waiting for the location lock',async () => {
      for(const sql of ["UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1",
        "UPDATE tenants SET auto_pause_enabled=TRUE,auto_pause_threshold=1 WHERE id=1; INSERT INTO tickets(id,tenant_id,location_id,status,date_key) VALUES(1,1,10,'waiting',to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','YYYYMMDD'))",
        "INSERT INTO queue_fee_settings(plan_slug,enabled,amount_cents,currency) VALUES('free',TRUE,100,'PHP')"]) {
        await reset(); const blocker=await pool.connect(); let pending;
        try {await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending=publicJoin({userId:'1',joinChannel:'online'}); pending.catch(()=>{}); await waitForLocationLock(); await blocker.query(sql); await blocker.query('COMMIT');
          await assert.rejects(pending); assert.equal(await count('events'),0); assert.equal(await count('allowance_audit'),0);
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      }
    });
    await t.test('public issuance rolls ticket sequence email allowance event webhook and revision back together',async () => {
      for(const failure of ['event','webhook','allowance']) {
        await reset(); failEvent=failure==='event';failWebhook=failure==='webhook';failAllowance=failure==='allowance';
        await assert.rejects(publicJoin({notifyByEmail:true,customerEmail:'owner@example.com'}),new RegExp(`${failure} failed`));
        for(const table of ['tickets','counters','allowance_audit','queue_email_journeys','queue_email_slots','events','webhooks','resource_ledger_scopes']) assert.equal(await count(table),0,table);
      }
      await reset(); await ticket('1'); await record('1','start');
      const binding=(await pool.query('SELECT * FROM resource_allocations')).rows[0]; await publicJoin();
      assert.equal(await count('resource_allocations'),1); assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
      assert.equal((await pool.query('SELECT id FROM resource_allocations')).rows[0].id,binding.id);
    });
    await t.test('public enforced issuance keeps authoritative business date and commits overdue reconciliation',async () => {
      await reset(); const blocker=await pool.connect(); let pending;
      try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending=publicJoin();pending.catch(()=>{});await waitForLocationLock();
        await blocker.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10;UPDATE queue_day_state SET closes_at=clock_timestamp()+interval '1 hour'");await blocker.query('COMMIT');
        const result=await pending;assert.equal(result.ticket.currentQueueDayId,'999');assert.equal(result.ticket.dateKey,'20261008');assert.equal(await count('queue_ticket_segments'),1);
      } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      for(const expiryRead of [1,2,3]) {
        await reset(); await ticket('1');await record('1','start');dueRead=expiryRead;
        await pool.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10");
        await assert.rejects(publicJoin(),{code:'QUEUE_DAY_OVERDUE'});
        assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,'closed');assert.equal(await count('tickets'),1);assert.equal(await count('lifecycle_notifications'),1);
        assert.equal(await count('counters'),0);assert.equal(await count('allowance_audit'),0);
        assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
        await assert.rejects(publicJoin(),{code:'QUEUE_DAY_UNOPENED'});assert.equal(await count('lifecycle_notifications'),1);
      }
    });
    await t.test('public queue feature admission uses the locked transaction client and denies before issuance',async () => {
      await reset(); const adapter=loadService({'./entitlementAdmissionService':{admit:async input=>{
        assert.equal(input.tenantId,'1');assert.equal(input.featureKey,'queue');assert.ok(input.client);
        await assert.rejects(pool.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE NOWAIT'),{code:'55P03'});
        throw Object.assign(new Error('queue feature denied'),{statusCode:403});
      }}},'customerQueueIssuanceService');
      await assert.rejects(adapter.withCustomerQueueIssuance({pool,tenant,location,userId:'1'},async()=>{throw new Error('unexpected issuance');}),/queue feature denied/);
      assert.equal(await count('tickets'),0);assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('public issuance transaction supplies no resource command capability',async () => {
      await reset(); await ledger.withTicketIssuanceTransaction({pool,tenantId:'1',locationId:'10',authorize:async()=>true},async(...args)=>{
        assert.equal(args.length,1);assert.equal(typeof args[0].query,'function');
      });
      assert.equal(await count('resource_allocations'),0);assert.equal(await count('resource_ledger_commands'),0);
    });
    await t.test('public issuance holds accepted subscription fee and customer state through insertion',async () => {
      await reset(); await pool.query("INSERT INTO queue_fee_settings(plan_slug,enabled,amount_cents,currency) VALUES('free',FALSE,0,'PHP')"); let reached; const inserted=new Promise(resolve=>{reached=resolve;});let release;const unblock=new Promise(resolve=>{release=resolve;});
      paidEventBarrier={reached,release:unblock};const pending=publicJoin({userId:'1',joinChannel:'online'});pending.catch(()=>{});
      try {await Promise.race([inserted,pending.then(()=>{throw new Error('public insert barrier missing');})]);
        for(const query of ['SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE NOWAIT',"SELECT plan_slug FROM queue_fee_settings WHERE plan_slug='free' FOR UPDATE NOWAIT",'SELECT id FROM users WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT']) await assert.rejects(pool.query(query),{code:'55P03'});
        release();await pending;
      } finally {release();await pending.catch(()=>{});paidEventBarrier=null;}
    });
    await t.test('bound paid callbacks create one actual ticket, consume one allowance fixture and emit one event/revision after the location lock',async () => {
      await reset(); await payment();
      const results=await Promise.all([paid(),paid()]);
      assert.equal(results.every(r=>r.handled),true);
      assert.equal(await count('tickets'),1); assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1); assert.equal(pushes,1);
      const issued=(await realPayments.findPaymentById('1',{client:pool}));
      assert.equal(issued.ticketIssuanceStatus,'issued'); assert.equal(issued.status,'paid');
      assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'consumed');
      const ticketRow=(await pool.query('SELECT * FROM tickets')).rows[0];
      assert.equal(ticketRow.current_queue_day_id,'999'); assert.equal(ticketRow.status,'waiting'); assert.equal(ticketRow.service_started_at,null);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');
      assert.equal(await count('resource_allocations'),0); assert.equal(await count('resource_ledger_commands'),0);
      assert.equal((await pool.query('SELECT actor_role FROM events')).rows[0].actor_role,null);
    });
    await t.test('bound paid admission blocks unavailable days, scope and subscription without issuing or releasing occupancy',async () => {
      for(const sql of [
        "UPDATE queue_day_state SET intake_mode='paused'",
        "UPDATE queue_day_state SET state='closed'",
        "UPDATE store_locations SET is_active=FALSE WHERE id=10",
        "UPDATE tenants SET is_active=FALSE WHERE id=1",
        "UPDATE store_locations SET queue_lifecycle_mode='legacy' WHERE id=10",
        "UPDATE tenants SET auto_pause_enabled=TRUE,auto_pause_threshold=1 WHERE id=1"
      ]) {
        await reset(); await payment();
        if(sql.includes('threshold')) {await ticket('1'); await pool.query("UPDATE tickets SET status='waiting'");}
        await pool.query(sql); const before=await count('tickets');
        await paid(); assert.equal(await count('tickets'),before);
        const blocked=await realPayments.findPaymentById('1',{client:pool}); assert.equal(blocked.ticketIssuanceStatus,'refund_pending'); assert.equal(blocked.status,'paid');
        assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'released'); assert.equal(pushes,0);
        const revision=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
        await paid(); assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,revision);
      }
      await reset(); await payment(); subscriptionUnavailable=true; await paid();
      assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'refund_pending'); assert.equal(await count('tickets'),0);
      for(const sql of ["UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1","UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1"]) {
        await reset(); await payment(); await pool.query("UPDATE queue_join_payments SET payload=payload || '{\"userId\":\"1\"}'::jsonb");
        await pool.query(sql); await paid(); assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'refund_pending'); assert.equal(await count('tickets'),0);
      }
      await reset(); await ticket('1',{booking:true}); await record('1','start'); await payment();
      await pool.query("UPDATE queue_day_state SET closes_at=clock_timestamp()-interval '1 second'");
      await paid(); assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,'closed');
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null); assert.equal(await count('tickets'),1);
      assert.equal(await count('lifecycle_notifications'),1); await paid(); assert.equal(await count('lifecycle_notifications'),1);
    });
    await t.test('bound paid ticket, payment link, event and allowance updates roll back on failures',async () => {
      for(const failure of ['event','webhook','allowance','payment']) {
        await reset(); await payment(); failEvent=failure==='event'; failWebhook=failure==='webhook'; failAllowance=failure==='allowance'; failPayment=failure==='payment';
        await assert.rejects(paid(),new RegExp(`${failure} failed`));
        for(const table of ['tickets','events','webhooks','resource_ledger_scopes']) assert.equal(await count(table),0,table);
        assert.equal((await realPayments.findPaymentById('1',{client:pool})).status,'pending'); assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'held'); assert.equal(pushes,0);
      }
      await reset(); await payment(); await pool.query("UPDATE queue_day_state SET closes_at=clock_timestamp()-interval '1 second'"); failReconciliation=true;
      await assert.rejects(paid(),/closure failed/); assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,'open');
      assert.equal((await realPayments.findPaymentById('1',{client:pool})).status,'pending'); assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'held');
    });
    await t.test('paid deadline expiry at the later intake check commits blocked payment and closure without a ticket or released occupancy',async () => {
      await reset(); await ticket('1',{booking:true}); await record('1','start'); await payment();
      await pool.query("UPDATE queue_day_state SET closes_at=clock_timestamp()-interval '1 second'"); paidDeadlineRace=true;
      await paid();
      assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'refund_pending');
      assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'released');
      assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,'closed');
      assert.equal(await count('tickets'),1); assert.equal(await count('lifecycle_notifications'),1);
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM events WHERE event_type='ticket_created'")).rows[0].n,0);
      await paid(); assert.equal(await count('lifecycle_notifications'),1);
      await reset(); await payment(); await pool.query("UPDATE queue_day_state SET closes_at=clock_timestamp()-interval '1 second'"); failAllowance=true;
      await assert.rejects(paid(),/allowance failed/);
      assert.equal((await pool.query('SELECT state FROM queue_day_state')).rows[0].state,'open');
      assert.equal((await realPayments.findPaymentById('1',{client:pool})).status,'pending');
      assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'held');
      assert.equal(await count('events'),0); assert.equal(await count('lifecycle_notifications'),0);
    });
    await t.test('authenticated paid issuance holds the customer lock through event insertion and records the customer role',async () => {
      await reset(); await payment(); verifyPaidUserLock=true;
      await pool.query("UPDATE queue_join_payments SET payload=payload || '{\"userId\":\"1\"}'::jsonb");
      await paid();
      assert.equal((await pool.query('SELECT actor_role FROM events')).rows[0].actor_role,'customer');
      assert.equal((await pool.query('SELECT user_id::text FROM tickets')).rows[0].user_id,'1');
      await pool.query('SELECT id FROM users WHERE id=1 FOR UPDATE NOWAIT');
    });
    await t.test('paid issuance waits for account deletion or suspension and blocks after their committed update',async () => {
      for(const field of ['deletion_requested_at','platform_access_suspended_at']) {
        await reset(); await payment();
        await pool.query("UPDATE queue_join_payments SET payload=payload || '{\"userId\":\"1\"}'::jsonb");
        const blocker=await pool.connect(); let pending;
        try {
          await blocker.query('BEGIN'); await blocker.query(`UPDATE users SET ${field}=clock_timestamp() WHERE id=1`);
          pending=paid(); pending.catch(()=>{});
          const deadline=Date.now()+3000; let waiting=false;
          while(Date.now()<deadline) {
            waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM users%'",[schema])).rows.length>0;
            if(waiting) break;
            await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(waiting,true,'paid admission must wait for the user row');
          await blocker.query('COMMIT'); await pending;
          assert.equal(await count('tickets'),0); assert.equal(await count('events'),0);
          assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'refund_pending');
          assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'released');
        } finally {await blocker.query('ROLLBACK'); blocker.release(); if(pending) await pending.catch(()=>{});}
      }
    });
    await t.test('the same durable billing event retries a rolled-back paid ticket issuance',async () => {
      for(const failure of ['event','webhook']) {
        await reset(); await payment(); failEvent=failure==='event'; failWebhook=failure==='webhook';
        await assert.rejects(paid(),new RegExp(`${failure} failed`)); assert.equal(billingEvents.size,1);
        assert.equal((await realPayments.findPaymentById('1',{client:pool})).status,'pending');
        failEvent=false; failWebhook=false; await paid();
        assert.equal(await count('tickets'),1); assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1);
        assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'issued');
        assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'consumed');
        await paid(); assert.equal(await count('tickets'),1); assert.equal(await count('events'),1);
      }
    });
    await t.test('paid issuance serializes tenant policy updates and rechecks the committed threshold',async () => {
      await reset(); await payment(); verifyPaidTenantLock=true; await paid();
      for(const sql of ["UPDATE tenants SET auto_pause_enabled=TRUE,auto_pause_threshold=1 WHERE id=1", "UPDATE tenants SET auto_pause_threshold=1 WHERE id=1"]) {
        await reset(); await payment(); await ticket('1'); await pool.query("UPDATE tickets SET status='waiting'");
        if(!sql.includes('enabled')) await pool.query('UPDATE tenants SET auto_pause_enabled=TRUE,auto_pause_threshold=10 WHERE id=1');
        const blocker=await pool.connect(); let pending;
        try {
          await blocker.query('BEGIN'); await blocker.query(sql); pending=paid(); pending.catch(()=>{});
          const deadline=Date.now()+3000; let waiting=false;
          while(Date.now()<deadline) {
            waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM tenants%'",[schema])).rows.length>0;
            if(waiting) break; await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(waiting,true,'paid issuance must wait for current tenant policy');
          await blocker.query('COMMIT'); await pending;
          assert.equal(await count('tickets'),1); assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'refund_pending');
        } finally {await blocker.query('ROLLBACK'); blocker.release(); if(pending) await pending.catch(()=>{});}
      }
    });
    await t.test('paid responses and later sync use the bound branch current slug after a rename',async () => {
      await reset(); await payment(); await pool.query("UPDATE store_locations SET slug='renamed' WHERE id=10");
      const result=await paid(); assert.equal(result.payment.locationSlug,'renamed');
      const repeated=await paidService.syncQueueJoinPayment({tenant,paymentId:'1'});
      assert.equal(repeated.payment.locationSlug,'renamed'); assert.equal(repeated.paid,true);
      assert.equal(await count('tickets'),1); assert.equal(await count('events'),1);
    });
    await t.test('location-bound legacy paid callbacks issue once at the renamed branch without allocation or a Queue Day',async () => {
      await reset(); await legacyPayment(); await pool.query("UPDATE store_locations SET slug='renamed' WHERE id=10");
      const result=await Promise.all([paid(),paid()]);
      assert.equal(result.some(r=>r.payment?.locationSlug==='renamed'),true);
      assert.equal(await count('tickets'),1); assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1);
      const row=(await pool.query('SELECT * FROM tickets')).rows[0];
      assert.equal(row.location_id,'10'); assert.equal(row.current_queue_day_id,null); assert.equal(row.service_started_at,null);
      assert.equal(row.date_key,require('../src/services/queueHelpers').getDateKey(new Date(),'Asia/Manila'));
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');
      assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'consumed');
      assert.equal(await count('resource_allocations'),0); assert.equal(pushes,1);
      const sync=await paidService.syncQueueJoinPayment({tenant,paymentId:'1'}); assert.equal(sync.payment.locationSlug,'renamed');
    });
    await t.test('legacy bound paid admission uses current branch, intake, hours, threshold, subscription and customer state',async () => {
      for(const unavailable of ['branch','tenant','enforced','paused','closed','hours','threshold','subscription','customer']) {
        await reset(); await legacyPayment();
        if(unavailable==='branch') await pool.query('UPDATE store_locations SET is_active=FALSE WHERE id=10');
        if(unavailable==='tenant') await pool.query('UPDATE tenants SET is_active=FALSE WHERE id=1');
        if(unavailable==='enforced') await pool.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10");
        if(unavailable==='paused') await pool.query('UPDATE intake_state SET paused=TRUE');
        if(unavailable==='closed') queueClosed=true;
        if(unavailable==='hours') await pool.query('UPDATE store_hours SET is_closed=TRUE');
        if(unavailable==='subscription') subscriptionUnavailable=true;
        if(unavailable==='customer') await pool.query("UPDATE queue_join_payments SET payload=payload || '{\"userId\":\"1\"}'::jsonb; UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1");
        if(unavailable==='threshold') {
          await ticket('1'); const dateKey=require('../src/services/queueHelpers').getDateKey(new Date(),'Asia/Manila');
          await pool.query("UPDATE tickets SET status='waiting',date_key=$1",[dateKey]);
          await pool.query('UPDATE tenants SET auto_pause_enabled=TRUE,auto_pause_threshold=1 WHERE id=1');
        }
        const before=await count('tickets'); await paid(); assert.equal(await count('tickets'),before,unavailable);
        assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'refund_pending',unavailable);
        assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'released');
        const revision=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
        await paid(); assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,revision);
      }
      await reset(); await ticket('1',{booking:true}); await record('1','start'); await legacyPayment(); queueClosed=true;
      await paid(); assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
    });
    await t.test('legacy bound paid failure rolls back issuance and retries the same durable provider event',async () => {
      for(const failure of ['event','webhook','allowance','payment']) {
        await reset(); await legacyPayment(); failEvent=failure==='event'; failWebhook=failure==='webhook'; failAllowance=failure==='allowance'; failPayment=failure==='payment';
        await assert.rejects(paid(),new RegExp(`${failure} failed`));
        for(const table of ['tickets','events','webhooks','resource_ledger_scopes']) assert.equal(await count(table),0,table);
        assert.equal((await realPayments.findPaymentById('1',{client:pool})).status,'pending');
        assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'held');
        failEvent=false; failWebhook=false; failAllowance=false; failPayment=false; await paid();
        assert.equal(await count('tickets'),1); assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1);
        assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'issued');
      }
      await reset(); await legacyPayment(); queueClosed=true; failAllowance=true;
      await assert.rejects(paid(),/allowance failed/);
      assert.equal((await realPayments.findPaymentById('1',{client:pool})).status,'pending'); assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('checkout upsert cannot promote historical payload IDs or replace an existing trusted binding',async () => {
      await reset(); await pool.query("SELECT setval('queue_join_payments_id_seq',10)");
      const create=input=>realPayments.createPayment({tenantId:'1',otpId:'123',planSlug:'free',provider:'paymongo',amountCents:100,...input},{client:pool});
      const old=await create({payload:{locationId:'11',locationSlug:'old'},metadata:{source:'historical'},queueDayId:'999',queueDayVersionAtCheckout:2});
      const reused=await create({payload:{locationId:'10',locationSlug:'main'},metadata:{locationBindingVersion:1,source:'retry'},queueDayId:'998',queueDayVersionAtCheckout:3});
      assert.equal(reused._id,old._id); assert.equal(reused.payload.locationId,'11'); assert.equal(reused.metadata.locationBindingVersion,undefined);
      assert.equal(reused.queueDayId,'999'); assert.equal(reused.queueDayVersionAtCheckout,2); assert.equal(reused.metadata.source,'retry');
      const fresh=await realPayments.createPayment({tenantId:'1',otpId:'124',planSlug:'free',provider:'paymongo',amountCents:100,payload:{locationId:'10',locationSlug:'main'},metadata:{locationBindingVersion:1}},{client:pool});
      const frozen=await realPayments.createPayment({tenantId:'1',otpId:'124',planSlug:'free',provider:'paymongo',amountCents:200,payload:{locationId:'11',locationSlug:'changed'},metadata:{locationBindingVersion:2}},{client:pool});
      assert.equal(frozen._id,fresh._id); assert.equal(frozen.payload.locationId,'10'); assert.equal(frozen.metadata.locationBindingVersion,1); assert.equal(frozen.amountCents,100);
    });
    await t.test('legacy paid hours lock crossing midnight uses one post-lock instant for hours and ticket date',async () => {
      await reset(); await legacyPayment(); const blocker=await pool.connect(); let pending;
      const NativeDate=Date; let admissionClock='2026-10-08T15:59:59Z';
      try {
        await blocker.query('BEGIN'); await blocker.query('UPDATE store_hours SET is_closed=FALSE WHERE location_id=10');
        global.Date=class extends NativeDate {constructor(...args) {super(...(args.length ? args : [admissionClock]));}};
        pending=paid(); pending.catch(()=>{});
        const deadline=NativeDate.now()+3000; let waiting=false;
        while(NativeDate.now()<deadline) {
          waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT location_id FROM store_hours%'",[schema])).rows.length>0;
          if(waiting) break; await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert.equal(waiting,true,'paid admission must wait for the hours lock');
        admissionClock='2026-10-08T16:00:01Z'; await blocker.query('COMMIT'); await pending;
        assert.equal((await pool.query('SELECT date_key FROM tickets')).rows[0].date_key,'20261009');
        assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'issued');
      } finally {await blocker.query('ROLLBACK'); blocker.release(); if(pending) await pending.catch(()=>{}); global.Date=NativeDate;}
    });
    await t.test('atomic hours replacement makes paid admission wait through rebuild and rolls back insertion failure',async () => {
      await reset(); await legacyPayment(); await pool.query('UPDATE store_hours SET is_closed=TRUE');
      let deleted; const afterDelete=new Promise(resolve=>{deleted=resolve;}); let release; const continueWrite=new Promise(resolve=>{release=resolve;});
      const loadHoursWriter=database=>{
        const filename=path.resolve(__dirname,'../src/repositories/storeLocations.js');
        const compiled=new (require('node:module').Module)(filename);
        compiled.require=request=>request==='../config/db' ? database : require(request);
        compiled._compile(fs.readFileSync(filename,'utf8'),filename); return compiled.exports;
      };
      const replacements=loadHoursWriter({pool,withTransaction:callback=>withTransaction(client=>callback({query:async (...args)=>{
        const result=await client.query(...args); if(String(args[0]).includes('DELETE FROM store_hours')) {deleted(); await continueWrite;} return result;
      }}))});
      const schedule=Array.from({length:7},(_,weekday)=>({weekday,opensAt:'00:00',closesAt:'00:00',isClosed:false}));
      const replacing=replacements.replaceHours('10',schedule,{client:pool}); replacing.catch(()=>{}); let pending;
      try {
        await Promise.race([afterDelete,replacing.then(()=>{throw new Error('hours replacement finished without the delete barrier');})]); pending=paid(); pending.catch(()=>{}); await waitForLocationLock();
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM store_hours WHERE is_closed')).rows[0].n,7);
        assert.equal((await realPayments.findPaymentById('1',{client:pool})).status,'pending');
        release(); await replacing; await pending;
        assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'issued'); assert.equal(await count('tickets'),1);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM store_hours WHERE NOT is_closed')).rows[0].n,7);
      } finally {release(); await replacing.catch(()=>{}); if(pending) await pending.catch(()=>{});}
      await reset(); await legacyPayment(); await pool.query('UPDATE store_hours SET is_closed=TRUE');
      const failed=loadHoursWriter({pool,withTransaction:callback=>withTransaction(client=>callback({query:async (...args)=>{
        const result=await client.query(...args); if(String(args[0]).includes('INSERT INTO store_hours')) throw new Error('hours insert failed'); return result;
      }}))});
      await assert.rejects(failed.replaceHours('10',schedule),/hours insert failed/);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM store_hours WHERE is_closed')).rows[0].n,7);
      await paid(); assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'refund_pending'); assert.equal(await count('tickets'),0);
    });
    const hoursWriter=(overrides={})=>loadService({
      '../config/db':{pool},'../repositories/storeLocations':{...realLocations,...overrides}
    },'locationHoursService');
    const hoursSchedule=(opensAt='09:00',closesAt='17:00')=>Array.from({length:7},(_,weekday)=>({weekday,opensAt,closesAt,isClosed:false}));
    const saveHours=(schedule=hoursSchedule(),actor='1',selected=location,writer=hoursWriter())=>
      writer.replaceLocationHours(tenant,selected,schedule,{actorUserId:actor});
    await t.test('operating-hours administration advances one scoped revision and preserves actual occupancy',async () => {
      await reset();await ticket('1');await record('1','start');
      const allocation=(await pool.query('SELECT * FROM resource_allocations')).rows[0];
      const revision=Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision);
      const commands=await count('resource_ledger_commands');
      await pool.query('UPDATE tenants SET is_active=FALSE WHERE id=1; UPDATE store_locations SET is_active=FALSE WHERE id=10');
      const hours=await saveHours();assert.equal(hours.length,7);
      assert.ok(hours.every(hour=>hour.opensAt==='09:00' && hour.closesAt==='17:00'));
      assert.equal(Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision),revision+1);
      assert.deepEqual((await pool.query('SELECT * FROM resource_allocations')).rows[0],allocation);
      assert.equal(await count('resource_ledger_commands'),commands);
      assert.ok((await readTicket('1')).serviceStartedAt);assert.equal((await readTicket('1')).serviceEndedAt,null);
    });
    await t.test('operating-hours denies revoked deleted suspended staff and mismatched branch access before writes',async () => {
      for(const sql of [
        'UPDATE tenant_memberships SET is_active=FALSE WHERE id=1',
        'UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1',
        'UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1',
        "UPDATE tenant_memberships SET role='staff' WHERE id=1; INSERT INTO tenant_membership_locations VALUES(1,10)"
      ]) {
        await reset();const before=await realLocations.listHoursByLocationId('10',{client:pool});await pool.query(sql);
        await assert.rejects(saveHours(),{statusCode:403});
        assert.deepEqual(await realLocations.listHoursByLocationId('10',{client:pool}),before);
        assert.equal(await count('resource_ledger_scopes'),0);
      }
      await reset();await assert.rejects(saveHours(hoursSchedule(),'1',{_id:'20'}),{statusCode:404});
      assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('operating-hours rechecks revocation after branch lock contention',async () => {
      await reset();const before=await realLocations.listHoursByLocationId('10',{client:pool});const blocker=await pool.connect();let pending;
      try {
        await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending=saveHours();const denied=assert.rejects(pending,{statusCode:403});await waitForLocationLock();
        await blocker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');await blocker.query('COMMIT');await denied;
      } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      assert.deepEqual(await realLocations.listHoursByLocationId('10',{client:pool}),before);assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('operating-hours holds accepted grants and rolls rebuilt calendar and scope back on failure',async () => {
      await reset();const before=await realLocations.listHoursByLocationId('10',{client:pool});
      const writer=hoursWriter({replaceHours:async (...args)=>{
        await realLocations.replaceHours(...args);
        for(const sql of ['SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM users WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM tenant_memberships WHERE id=1 FOR UPDATE NOWAIT']) {
          await assert.rejects(pool.query(sql),{code:'55P03'});
        }
        throw new Error('hours post-write failure');
      }});
      await assert.rejects(saveHours(hoursSchedule(),'1',location,writer),/hours post-write failure/);
      assert.deepEqual(await realLocations.listHoursByLocationId('10',{client:pool}),before);assert.equal(await count('resource_ledger_scopes'),0);
      await saveHours();assert.equal(Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision),2);
    });
    await t.test('operating-hours validation failure leaves calendar and existing ledger revision intact',async () => {
      await reset();await saveHours();const before=await realLocations.listHoursByLocationId('10',{client:pool});
      const overlapping=[{weekday:1,opensAt:'09:00',closesAt:'12:00'},{weekday:1,opensAt:'11:00',closesAt:'14:00'}];
      await assert.rejects(saveHours(overlapping),{statusCode:400});
      assert.deepEqual(await realLocations.listHoursByLocationId('10',{client:pool}),before);
      assert.equal(Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision),2);
    });
    await t.test('competing hours saves serialize full calendars and retain monotonic revision',async () => {
      await reset();await Promise.all([saveHours(hoursSchedule('09:00','17:00')),saveHours(hoursSchedule('10:00','18:00'))]);
      const hours=await realLocations.listHoursByLocationId('10',{client:pool});assert.equal(hours.length,7);
      assert.equal(new Set(hours.map(hour=>`${hour.opensAt}-${hour.closesAt}`)).size,1);
      assert.equal(Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision),3);
      assert.equal(await count('resource_ledger_commands'),0);assert.equal(await count('resource_allocations'),0);
    });
    await t.test('hours save waiting for tenant-first grant change permits its branch foreign-key assignment',async () => {
      await reset();const revoker=await pool.connect();let pending;
      try {
        await revoker.query('BEGIN');await revoker.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
        pending=saveHours();const denied=assert.rejects(pending,{statusCode:403});
        const deadline=Date.now()+3000;let waiting=false;
        while(Date.now()<deadline) {
          waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM tenants%'",[schema])).rows.length>0;
          if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert.equal(waiting,true,'hours save must wait for current tenant grant state');
        await revoker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
        await revoker.query("SET LOCAL lock_timeout='2s'");await revoker.query('INSERT INTO tenant_membership_locations VALUES(1,10)');
        await revoker.query('COMMIT');await denied;
      } finally {await revoker.query('ROLLBACK');revoker.release();if(pending)await pending.catch(()=>{});}
      assert.equal(await count('resource_ledger_scopes'),0);
    });
    const realAvailability=loadService({'../config/db':{pool}},'../repositories/vendorAvailability');
    const deletionWriter=(overrides={})=>loadService({
      '../config/db':{pool},'../repositories/vendorAvailability':{...realAvailability,...overrides}
    },'availabilityDeletionService');
    const availabilityKinds={block:{table:'vendor_availability_blocks',remove:'deleteBlock'},exception:{table:'vendor_availability_exceptions',remove:'deleteException'}};
    const addAvailability=type=>realAvailability[type==='block'?'createBlock':'createException']({
      tenantId:'1',locationId:'10',serviceId:null,weekday:1,startsAt:'09:00',endsAt:'17:00',endsNextDay:false,
      capacity:2,isActive:true,notes:'Rule',exceptionDate:'2026-10-10',isAvailable:false,reason:'Closure'
    },{client:pool});
    const deleteAvailability=(entry,type,actor='1',writer=deletionWriter())=>writer.deleteAvailabilityEntry(tenant,entry._id,type,{actorUserId:actor});
    await t.test('availability deletion advances one revision and preserves bookings protection and actual occupancy',async () => {
      for(const type of Object.keys(availabilityKinds)) {
        await reset();await ticket('1',{booking:true});await record('1','start');const entry=await addAvailability(type);
        const allocations=(await pool.query('SELECT * FROM resource_allocations')).rows;
        const reservations=(await pool.query('SELECT * FROM resource_ledger_reservations')).rows;
        const booking=(await pool.query('SELECT * FROM bookings')).rows;
        const revision=Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision);
        await pool.query('UPDATE tenants SET is_active=FALSE WHERE id=1; UPDATE store_locations SET is_active=FALSE WHERE id=10');
        const removed=await deleteAvailability(entry,type);assert.equal(removed._id,entry._id);
        assert.equal(await count(availabilityKinds[type].table),0);
        assert.equal(Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision),revision+1);
        assert.deepEqual((await pool.query('SELECT * FROM resource_allocations')).rows,allocations);
        assert.deepEqual((await pool.query('SELECT * FROM resource_ledger_reservations')).rows,reservations);
        assert.deepEqual((await pool.query('SELECT * FROM bookings')).rows,booking);
        await assert.rejects(deleteAvailability(entry,type),{statusCode:404});
        assert.equal(Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision),revision+1);
      }
    });
    await t.test('availability deletion denies current revoked deleted suspended and assigned staff access',async () => {
      for(const type of Object.keys(availabilityKinds)) for(const sql of [
        'UPDATE tenant_memberships SET is_active=FALSE WHERE id=1',
        'UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1',
        'UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1',
        "UPDATE tenant_memberships SET role='staff' WHERE id=1; INSERT INTO tenant_membership_locations VALUES(1,10)"
      ]) {
        await reset();const entry=await addAvailability(type);await pool.query(sql);
        await assert.rejects(deleteAvailability(entry,type),{statusCode:403});
        assert.equal(await count(availabilityKinds[type].table),1);assert.equal(await count('resource_ledger_scopes'),0);
      }
      await reset();const entry=await addAvailability('block');
      await assert.rejects(deletionWriter().deleteAvailabilityEntry({_id:'2'},entry._id,'block',{actorUserId:'1'}),{statusCode:404});
      await assert.rejects(deletionWriter().deleteAvailabilityEntry(tenant,'9007199254740993','block',{actorUserId:'1'}),{statusCode:400});
      assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('availability deletion rechecks revocation and branch movement after branch contention',async () => {
      for(const type of Object.keys(availabilityKinds)) for(const move of [false,true]) {
        await reset();const entry=await addAvailability(type);const blocker=await pool.connect();let pending;
        try {
          await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending=deleteAvailability(entry,type);const denied=assert.rejects(pending,{statusCode:move?409:403});await waitForLocationLock();
          if(move) {
            await blocker.query('INSERT INTO store_locations(id,tenant_id,is_active) VALUES(30,1,TRUE)');
            await blocker.query(`UPDATE ${availabilityKinds[type].table} SET location_id=30 WHERE id=$1`,[entry._id]);
          } else await blocker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
          await blocker.query('COMMIT');await denied;
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
        assert.equal(await count(availabilityKinds[type].table),1);assert.equal(await count('resource_ledger_scopes'),0);
      }
    });
    await t.test('availability deletion holds entry and grants then rolls deletion and revision back on failure',async () => {
      for(const type of Object.keys(availabilityKinds)) {
        await reset();const entry=await addAvailability(type);const operation=availabilityKinds[type];
        const writer=deletionWriter({[operation.remove]:async (...args)=>{
          for(const sql of ['SELECT id FROM store_locations WHERE id=10 FOR UPDATE NOWAIT','SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM users WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM tenant_memberships WHERE id=1 FOR UPDATE NOWAIT',`SELECT id FROM ${operation.table} WHERE id=${entry._id} FOR UPDATE NOWAIT`]) {
            await assert.rejects(pool.query(sql),{code:'55P03'});
          }
          await realAvailability[operation.remove](...args);throw new Error('availability post-delete failure');
        }});
        await assert.rejects(deleteAvailability(entry,type,'1',writer),/availability post-delete failure/);
        assert.equal(await count(operation.table),1);assert.equal(await count('resource_ledger_scopes'),0);
        await deleteAvailability(entry,type);assert.equal(await count(operation.table),0);
      }
    });
    await t.test('competing availability deletions commit once and retain one scoped revision change',async () => {
      for(const type of Object.keys(availabilityKinds)) {
        await reset();const entry=await addAvailability(type);
        const results=await Promise.allSettled([deleteAvailability(entry,type),deleteAvailability(entry,type)]);
        assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
        assert.equal(results.find(result=>result.status==='rejected').reason.statusCode,404);
        assert.equal(await count(availabilityKinds[type].table),0);
        assert.equal(Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision),2);
        assert.equal(await count('resource_ledger_commands'),0);
      }
    });
    const realServices=loadService({'../config/db':{pool}},'../repositories/vendorServices');
    const creationWriter=(overrides={})=>loadService({
      '../config/db':{pool},'../repositories/vendorAvailability':{...realAvailability,...overrides},
      '../repositories/storeLocations':realLocations,'../repositories/vendorServices':realServices
    },'availabilityCreationService');
    const creationBody=type=>type==='block'
      ? {weekday:1,startsAt:'09:00',endsAt:'17:00',capacity:2,notes:'Rule'}
      : {exceptionDate:'2026-10-10',isAvailable:false,reason:'Closure'};
    const createAvailability=(type,body=creationBody(type),actor='1',selected=location,writer=creationWriter())=>
      writer.createAvailabilityEntry(tenant,selected,body,type,{actorUserId:actor});
    await t.test('availability creation advances one branch revision and preserves bookings protection and occupancy',async () => {
      for(const type of Object.keys(availabilityKinds)) {
        await reset();await ticket('1',{booking:true});await record('1','start');
        const before={};for(const table of ['bookings','resource_ledger_reservations','resource_allocations','resource_ledger_commands']) before[table]=(await pool.query(`SELECT * FROM ${table}`)).rows;
        const revision=Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision);
        await pool.query('UPDATE tenants SET is_active=FALSE WHERE id=1; UPDATE store_locations SET is_active=FALSE WHERE id=10');
        const entry=await createAvailability(type,{...creationBody(type),serviceSlug:'court-play',tenantId:'2',locationId:'20',actorUserId:'2'});
        assert.equal(entry.tenantId,'1');assert.equal(entry.locationId,'10');assert.equal(entry.serviceId,'1000');
        assert.equal(await count(availabilityKinds[type].table),1);
        assert.equal(Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision),revision+1);
        for(const table of Object.keys(before)) assert.deepEqual((await pool.query(`SELECT * FROM ${table}`)).rows,before[table]);
        assert.ok((await readTicket('1')).serviceStartedAt);assert.equal((await readTicket('1')).serviceEndedAt,null);
      }
    });
    await t.test('availability creation denies invalid current grants and foreign branches without writes',async () => {
      for(const type of Object.keys(availabilityKinds)) for(const sql of [
        'UPDATE tenant_memberships SET is_active=FALSE WHERE id=1',
        'UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1',
        'UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1',
        "UPDATE tenant_memberships SET role='staff' WHERE id=1; INSERT INTO tenant_membership_locations VALUES(1,10)"
      ]) {
        await reset();await pool.query(sql);await assert.rejects(createAvailability(type),{statusCode:403});
        assert.equal(await count(availabilityKinds[type].table),0);assert.equal(await count('resource_ledger_scopes'),0);
      }
      await reset();await assert.rejects(createAvailability('block',creationBody('block'),'1',{_id:'20'}),{statusCode:404});
      assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('availability creation validates current hours and service after branch contention',async () => {
      for(const change of ['hours','service','grant']) {
        await reset();const blocker=await pool.connect();let pending;
        try {
          await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending=createAvailability('block',{...creationBody('block'),serviceSlug:'court-play'});
          const denied=assert.rejects(pending,{statusCode:change==='hours'?400:change==='service'?404:403});await waitForLocationLock();
          if(change==='hours') await blocker.query("UPDATE store_hours SET opens_at='10:00' WHERE location_id=10 AND weekday=1");
          if(change==='service') await blocker.query("UPDATE vendor_services SET slug='renamed' WHERE id=1000");
          if(change==='grant') await blocker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
          await blocker.query('COMMIT');await denied;
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
        assert.equal(await count('vendor_availability_blocks'),0);assert.equal(await count('resource_ledger_scopes'),0);
      }
    });
    await t.test('availability creation holds branch service and access grants and rolls a failed insert back',async () => {
      for(const type of Object.keys(availabilityKinds)) {
        await reset();const method=type==='block'?'createBlock':'createException';
        const writer=creationWriter({[method]:async (...args)=>{
          for(const sql of ['SELECT id FROM store_locations WHERE id=10 FOR UPDATE NOWAIT','SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM users WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM tenant_memberships WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM vendor_services WHERE id=1000 FOR UPDATE NOWAIT']) await assert.rejects(pool.query(sql),{code:'55P03'});
          await realAvailability[method](...args);throw new Error('availability post-create failure');
        }});
        await assert.rejects(createAvailability(type,{...creationBody(type),serviceSlug:'court-play'},'1',location,writer),/availability post-create failure/);
        assert.equal(await count(availabilityKinds[type].table),0);assert.equal(await count('resource_ledger_scopes'),0);
        await createAvailability(type);assert.equal(await count(availabilityKinds[type].table),1);
      }
    });
    await t.test('availability creation preserves shared service overnight and date exception validation',async () => {
      await reset();
      const shared=await createAvailability('block',{...creationBody('block'),serviceSlug:''});assert.equal(shared.serviceId,null);
      await pool.query("UPDATE store_hours SET opens_at='06:00',closes_at='03:00' WHERE location_id=10 AND weekday=1");
      const overnight=await createAvailability('block',{...creationBody('block'),startsAt:'07:00',endsAt:'02:00',endsNextDay:true});assert.equal(overnight.endsNextDay,true);
      const revision=Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision);
      for(const [type,body,statusCode] of [
        ['block',{...creationBody('block'),capacity:101},400],['block',{...creationBody('block'),weekday:7},400],
        ['block',{...creationBody('block'),serviceSlug:'missing'},404],['exception',{exceptionDate:'bad'},400],
        ['exception',{...creationBody('exception'),startsAt:'17:00',endsAt:'09:00'},400]
      ]) await assert.rejects(createAvailability(type,body),{statusCode});
      assert.equal(Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision),revision);
      const exception=await createAvailability('exception');assert.equal(exception.capacity,null);assert.equal(exception.startsAt,'');assert.equal(exception.isAvailable,false);
    });
    await t.test('competing availability creations serialize and each committed entry advances the revision',async () => {
      for(const type of Object.keys(availabilityKinds)) {
        await reset();const entries=await Promise.all([createAvailability(type),createAvailability(type)]);
        assert.notEqual(entries[0]._id,entries[1]._id);assert.equal(await count(availabilityKinds[type].table),2);
        assert.equal(Number((await pool.query('SELECT revision FROM resource_ledger_scopes')).rows[0].revision),3);
        assert.equal(await count('resource_ledger_commands'),0);
      }
    });
    const updateWriter=(overrides={},database={pool})=>loadService({
      '../config/db':database,'../repositories/vendorAvailability':{...realAvailability,...overrides},
      '../repositories/storeLocations':realLocations,'../repositories/vendorServices':realServices
    },'availabilityUpdateService');
    const editAvailability=(entry,type,body={},actor='1',writer=updateWriter())=>
      writer.updateAvailabilityEntry(tenant,entry._id,body,type,{actorUserId:actor});
    async function targetBranch() {
      await pool.query("INSERT INTO store_locations(id,tenant_id,is_active,slug) VALUES(30,1,TRUE,'other')");
      await pool.query("INSERT INTO store_hours(location_id,weekday,opens_at,closes_at,is_closed) SELECT 30,n,'00:00','00:00',FALSE FROM generate_series(0,6) n");
    }
    const revisions=async ()=>(await pool.query('SELECT location_id::text,revision::int FROM resource_ledger_scopes ORDER BY resource_ledger_scopes.location_id')).rows;
    await t.test('multi-branch scope entry denies foreign branches before granting a domain transaction',async () => {
      await reset();let entered=false;
      await assert.rejects(ledger.withScopeTransaction({pool,tenantId:'1',locationId:'10',actorUserId:'1',additionalLocationIds:['20'],
        authorize:async ()=>true},async ()=>{entered=true;}),{statusCode:404});
      assert.equal(entered,false);assert.equal(await count('resource_ledger_scopes'),0);
      await assert.rejects(ledger.withScopeTransaction({pool,tenantId:'1',locationId:'10',actorUserId:'1',additionalLocationIds:['10','10'],
        authorize:async ()=>false},async ()=>{entered=true;}),{statusCode:403});
      assert.equal(entered,false);assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('availability editing rereads partial values and preserves booking protection and occupancy',async () => {
      for(const type of Object.keys(availabilityKinds)) {
        await reset();await ticket('1',{booking:true});await record('1','start');const entry=await addAvailability(type);
        const before={};for(const table of ['bookings','resource_ledger_reservations','resource_allocations','resource_ledger_commands']) before[table]=(await pool.query(`SELECT * FROM ${table}`)).rows;
        const revision=(await revisions())[0].revision;
        await pool.query('UPDATE tenants SET is_active=FALSE WHERE id=1; UPDATE store_locations SET is_active=FALSE WHERE id=10');
        const changed=await editAvailability(entry,type,{capacity:3,actorUserId:'2',tenantId:'2',locationId:'20'});
        assert.equal(changed.locationId,'10');assert.equal(changed.capacity,3);assert.equal(changed.startsAt,entry.startsAt);
        assert.equal(changed[type==='block'?'notes':'reason'],entry[type==='block'?'notes':'reason']);
        assert.deepEqual(await revisions(),[{location_id:'10',revision:revision+1}]);
        for(const table of Object.keys(before)) assert.deepEqual((await pool.query(`SELECT * FROM ${table}`)).rows,before[table]);
        assert.ok((await readTicket('1')).serviceStartedAt);assert.equal((await readTicket('1')).serviceEndedAt,null);
      }
    });
    await t.test('availability moves commit source and destination revisions together without moving occupancy',async () => {
      for(const type of Object.keys(availabilityKinds)) {
        await reset();await targetBranch();await ticket('1',{booking:true});await record('1','start');const entry=await addAvailability(type);
        const allocations=(await pool.query('SELECT * FROM resource_allocations')).rows;const reservations=(await pool.query('SELECT * FROM resource_ledger_reservations')).rows;
        const prior=(await revisions())[0].revision;await pool.query('UPDATE store_locations SET is_active=FALSE WHERE id=30');
        const moved=await editAvailability(entry,type,{locationSlug:'other',capacity:4});assert.equal(moved.locationId,'30');
        assert.deepEqual(await revisions(),[{location_id:'10',revision:prior+1},{location_id:'30',revision:2}]);
        assert.deepEqual((await pool.query('SELECT * FROM resource_allocations')).rows,allocations);
        assert.deepEqual((await pool.query('SELECT * FROM resource_ledger_reservations')).rows,reservations);
      }
    });
    await t.test('availability editing rejects invalid current grants foreign scope and unsafe identities',async () => {
      for(const type of Object.keys(availabilityKinds)) for(const sql of [
        'UPDATE tenant_memberships SET is_active=FALSE WHERE id=1','UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1',
        'UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1',
        "UPDATE tenant_memberships SET role='staff' WHERE id=1; INSERT INTO tenant_membership_locations VALUES(1,10)"
      ]) {
        await reset();const entry=await addAvailability(type);await pool.query(sql);
        await assert.rejects(editAvailability(entry,type,{capacity:3}),{statusCode:403});
        assert.equal((await realAvailability[type==='block'?'findBlockByTenantAndId':'findExceptionByTenantAndId']('1',entry._id,{client:pool})).capacity,2);
        assert.equal(await count('resource_ledger_scopes'),0);
      }
      await reset();const entry=await addAvailability('block');await pool.query("UPDATE store_locations SET slug='foreign' WHERE id=20");
      await assert.rejects(editAvailability(entry,'block',{locationSlug:'foreign'}),{statusCode:404});
      await assert.rejects(updateWriter().updateAvailabilityEntry({_id:'2'},entry._id,{},'block',{actorUserId:'1'}),{statusCode:404});
      await assert.rejects(editAvailability({_id:'9007199254740993'},'block'),{statusCode:400});
      await assert.rejects(editAvailability(entry,'unsupported'),{statusCode:400});assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('availability editing rechecks grants entry movement destination hours service and slug after contention',async () => {
      for(const change of ['grant','entry','deleted','hours','service','slug']) {
        await reset();await targetBranch();const entry=await addAvailability('block');const blocker=await pool.connect();let pending;
        try {
          await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending=editAvailability(entry,'block',{locationSlug:'other',serviceSlug:'court-play'});
          const denied=assert.rejects(pending,{statusCode:change==='grant'?403:change==='entry'?409:change==='hours'?400:404});await waitForLocationLock();
          if(change==='grant') await blocker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
          if(change==='entry') await blocker.query('UPDATE vendor_availability_blocks SET location_id=30 WHERE id=$1',[entry._id]);
          if(change==='deleted') await blocker.query('DELETE FROM vendor_availability_blocks WHERE id=$1',[entry._id]);
          if(change==='hours') await blocker.query("UPDATE store_hours SET opens_at='10:00' WHERE location_id=30 AND weekday=1");
          if(change==='service') await blocker.query("UPDATE vendor_services SET slug='renamed' WHERE id=1000");
          if(change==='slug') await blocker.query("UPDATE store_locations SET slug='renamed' WHERE id=30");
          await blocker.query('COMMIT');await denied;
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
        assert.equal(await count('resource_ledger_scopes'),0);
      }
    });
    await t.test('availability editing holds both branches entry retained service and access and rolls all writes back',async () => {
      for(const type of Object.keys(availabilityKinds)) {
        await reset();await targetBranch();const entry=await addAvailability(type);const method=type==='block'?'updateBlock':'updateException';
        await realAvailability[method](entry._id,{serviceId:'1000'},{client:pool});
        const writer=updateWriter({[method]:async (...args)=>{
          for(const sql of ['SELECT id FROM store_locations WHERE id=10 FOR UPDATE NOWAIT','SELECT id FROM store_locations WHERE id=30 FOR UPDATE NOWAIT',
            'SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM users WHERE id=1 FOR UPDATE NOWAIT',
            'SELECT id FROM tenant_memberships WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM vendor_services WHERE id=1000 FOR UPDATE NOWAIT',
            `SELECT id FROM ${availabilityKinds[type].table} WHERE id=${entry._id} FOR UPDATE NOWAIT`]) await assert.rejects(pool.query(sql),{code:'55P03'});
          await realAvailability[method](...args);throw new Error('availability post-edit failure');
        }});
        await assert.rejects(editAvailability(entry,type,{locationSlug:'other',capacity:3},'1',writer),/availability post-edit failure/);
        const current=await realAvailability[type==='block'?'findBlockByTenantAndId':'findExceptionByTenantAndId']('1',entry._id,{client:pool});
        assert.equal(current.locationId,'10');assert.equal(current.capacity,2);assert.equal(await count('resource_ledger_scopes'),0);
      }
    });
    await t.test('availability move rolls entry and both revisions back after the final revision update fails',async () => {
      for(const type of Object.keys(availabilityKinds)) {
        await reset();await targetBranch();const entry=await addAvailability(type);
        const faultPool={query:(...args)=>pool.query(...args),connect:async ()=>{
          const client=await pool.connect();return {release:()=>client.release(),query:async (sql,args)=>{
            const result=await client.query(sql,args);
            if(sql.startsWith('UPDATE resource_ledger_scopes SET revision=revision+1')) throw new Error('final move revision failure');
            return result;
          }};
        }};
        await assert.rejects(editAvailability(entry,type,{locationSlug:'other'},'1',updateWriter({},{pool:faultPool})),/final move revision failure/);
        const current=await realAvailability[type==='block'?'findBlockByTenantAndId':'findExceptionByTenantAndId']('1',entry._id,{client:pool});
        assert.equal(current.locationId,'10');assert.equal(await count('resource_ledger_scopes'),0);
      }
    });
    await t.test('concurrent partial availability edits preserve each committed field and increment once per save',async () => {
      for(const type of Object.keys(availabilityKinds)) {
        await reset();const entry=await addAvailability(type);const field=type==='block'?'notes':'reason';
        await Promise.all([editAvailability(entry,type,{capacity:3}),editAvailability(entry,type,{[field]:'Updated'})]);
        const current=await realAvailability[type==='block'?'findBlockByTenantAndId':'findExceptionByTenantAndId']('1',entry._id,{client:pool});
        assert.equal(current.capacity,3);assert.equal(current[field],'Updated');assert.deepEqual(await revisions(),[{location_id:'10',revision:3}]);
      }
    });
    await t.test('opposing availability branch moves acquire sorted locks and commit both revisions without deadlock',async () => {
      for(const type of Object.keys(availabilityKinds)) {
        await reset();await targetBranch();const first=await addAvailability(type);const second=await addAvailability(type);
        await realAvailability[type==='block'?'updateBlock':'updateException'](second._id,{locationId:'30'},{client:pool});
        const moved=await Promise.all([editAvailability(first,type,{locationSlug:'other'}),editAvailability(second,type,{locationSlug:'main'})]);
        assert.equal(moved[0].locationId,'30');assert.equal(moved[1].locationId,'10');
        assert.deepEqual(await revisions(),[{location_id:'10',revision:3},{location_id:'30',revision:3}]);
        assert.equal(await count('resource_ledger_commands'),0);
      }
    });
    await t.test('availability editing retains or explicitly clears service and preserves overnight and exception validation',async () => {
      await reset();const entry=await addAvailability('block');await realAvailability.updateBlock(entry._id,{serviceId:'1000'},{client:pool});
      assert.equal((await editAvailability(entry,'block',{capacity:3})).serviceId,'1000');
      assert.equal((await editAvailability(entry,'block',{serviceSlug:''})).serviceId,null);
      await pool.query("UPDATE store_hours SET opens_at='06:00',closes_at='03:00' WHERE location_id=10 AND weekday=1");
      assert.equal((await editAvailability(entry,'block',{startsAt:'07:00',endsAt:'02:00',endsNextDay:true})).endsNextDay,true);
      const before=await revisions();await assert.rejects(editAvailability(entry,'block',{capacity:101}),{statusCode:400});assert.deepEqual(await revisions(),before);
      const exception=await addAvailability('exception');await assert.rejects(editAvailability(exception,'exception',{exceptionDate:'bad'}),{statusCode:400});assert.deepEqual(await revisions(),before);
    });
    await pool.query(`ALTER TABLE store_locations ADD CONSTRAINT catalog_tenant_fk FOREIGN KEY(tenant_id) REFERENCES tenants(id);
      ALTER TABLE location_services ADD COLUMN id BIGSERIAL,ADD COLUMN capacity INTEGER DEFAULT 1,ADD COLUMN sort_order INTEGER DEFAULT 0,
        ADD COLUMN price_amount_cents INTEGER,ADD COLUMN price_display TEXT,ADD COLUMN group_funded_enabled BOOLEAN DEFAULT FALSE,
        ADD COLUMN group_funded_min_required_contributors INTEGER,ADD COLUMN group_funded_max_required_contributors INTEGER,
        ADD COLUMN group_funded_default_required_contributors INTEGER,ADD COLUMN group_funded_min_contribution_amount_cents INTEGER,
        ADD COLUMN group_funded_max_contribution_amount_cents INTEGER,ADD COLUMN group_funded_min_deadline_hours INTEGER,
        ADD COLUMN group_funded_max_deadline_days INTEGER,ADD COLUMN group_funded_allow_public_campaigns BOOLEAN DEFAULT FALSE,
        ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW(),ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW(),ADD UNIQUE(location_id,service_id)`);
    const catalogWriter=(overrides={},database={pool},extra={})=>loadService({
      '../config/db':database,'../repositories/vendorServices':{...realServices,...overrides},
      '../services/entitlementAdmissionService':{admit:async ({client,featureKey})=>{assert.ok(client);assert.equal(featureKey,'booking');}},...extra
    },'serviceDeactivationService');
    const deactivate=(slug='court-play',actor='1',writer=catalogWriter(),selected=tenant)=>
      writer.deactivateVendorService(selected,slug,{actorUserId:actor});
    async function waitForCatalogTenant() {
      const deadline=Date.now()+3000;
      while(Date.now()<deadline) {
        if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM tenants%'",[schema])).rows.length) return;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.fail('catalog write must wait for tenant authorization lock');
    }
    await pool.query("CREATE SEQUENCE catalog_service_ids START 10000; ALTER TABLE vendor_services ALTER COLUMN id SET DEFAULT nextval('catalog_service_ids'); ALTER TABLE vendor_services ADD UNIQUE(tenant_id,slug)");
    const createCatalog=(body={name:'New service',durationMinutes:30},writer=catalogWriter(),selected=tenant,actor='1')=>
      writer.createVendorService(selected,body,{actorUserId:actor});
    await t.test('catalog creation commits mappings and all branch revisions preserving admitted work',async () => {
      await reset();await targetBranch();await ticket('1',{booking:true});await record('1','start');
      const tables=['bookings','resource_ledger_reservations','resource_allocations','ticket_service_plans'];
      const before=await Promise.all(tables.map(table=>pool.query(`SELECT * FROM ${table}`)));
      const current=await revisions();
      const result=await createCatalog({name:'New service',durationMinutes:30,tenantId:'2',actorUserId:'2',locationServices:[{locationSlug:'main',capacity:2}]});
      assert.equal(result.service.tenantId,'1');assert.equal(result.locationServices[0].serviceId,result.service._id);
      const mapping=(await pool.query('SELECT * FROM location_services WHERE service_id=$1',[result.service._id])).rows[0];assert.equal(mapping.location_id,'10');assert.equal(mapping.capacity,2);
      assert.deepEqual(await revisions(),[{location_id:'10',revision:current[0].revision+1},{location_id:'30',revision:2}]);
      for(let i=0;i<tables.length;i++)assert.deepEqual((await pool.query(`SELECT * FROM ${tables[i]}`)).rows,before[i].rows);
    });
    await t.test('catalog creation denies current revoked deleted suspended staff and foreign mapping access',async () => {
      for(const sql of ['UPDATE tenant_memberships SET is_active=FALSE WHERE id=1','UPDATE users SET deletion_requested_at=NOW() WHERE id=1','UPDATE users SET platform_access_suspended_at=NOW() WHERE id=1',"UPDATE tenant_memberships SET role='staff' WHERE id=1"]) {
        await reset();await pool.query(sql);await assert.rejects(createCatalog(),{statusCode:403});assert.equal(await count('vendor_services'),1);assert.equal(await count('resource_ledger_scopes'),0);
      }
      await reset();await pool.query("UPDATE store_locations SET slug='foreign' WHERE id=20");
      await assert.rejects(createCatalog({name:'New service',durationMinutes:30,locationServices:[{locationSlug:'foreign'}]}),{statusCode:404});
      await assert.rejects(createCatalog({name:'New service',durationMinutes:1}),{statusCode:400});assert.equal(await count('vendor_services'),1);assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('catalog creation rolls service mappings and revisions back on mapping or final revision failure',async () => {
      for(const failure of ['mapping','revision']) {
        await reset();await targetBranch();
        const faultPool={connect:async ()=>{const client=await pool.connect();return {release:()=>client.release(),query:async (sql,args)=>{
          if((failure==='mapping' && /INSERT INTO location_services/.test(sql)) || (failure==='revision' && /UPDATE resource_ledger_scopes/.test(sql)))throw new Error('injected catalog create failure');return client.query(sql,args);
        }};}};
        await assert.rejects(createCatalog({name:'New service',durationMinutes:30,locationServices:[{locationSlug:'main'}]},catalogWriter({}, {pool:faultPool})),/injected catalog create failure/);
        assert.equal(await count('vendor_services'),1);assert.equal((await pool.query('SELECT 1 FROM location_services WHERE service_id>=10000')).rows.length,0);assert.equal(await count('resource_ledger_scopes'),0);
      }
    });
    await t.test('catalog duplicate creation rolls back the losing writer without duplicate revisions',async () => {
      await reset();await targetBranch();const results=await Promise.allSettled([createCatalog(),createCatalog()]);
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.find(result=>result.status==='rejected').reason.code,'23505');
      assert.equal(await count('vendor_services'),2);assert.deepEqual(await revisions(),[{location_id:'10',revision:2},{location_id:'30',revision:2}]);
    });
    await t.test('catalog creation preserves exact adjacent tenant and generated service identifiers in mappings',async () => {
      await reset();await targetBranch();const selected='9007199254740993';const neighbor='9007199254740992';
      await pool.query('INSERT INTO tenants(id,is_active) VALUES($1,TRUE)',[selected]);
      for(const table of ['tenant_memberships','store_locations','vendor_services'])await pool.query(`UPDATE ${table} SET tenant_id=$1 WHERE tenant_id=1`,[selected]);
      await pool.query("SELECT setval('catalog_service_ids',$1,FALSE)",[selected]);
      await pool.query('INSERT INTO tenants(id,is_active) VALUES($1,TRUE)',[neighbor]);
      const result=await createCatalog({name:'Exact service',durationMinutes:30,locationServices:[{locationSlug:'main'}]},catalogWriter(),{_id:selected});
      assert.equal(result.service._id,selected);assert.equal(result.service.tenantId,selected);assert.equal(result.locationServices[0].tenantId,selected);
      assert.equal((await pool.query('SELECT tenant_id::text FROM vendor_services WHERE id=$1',[result.service._id])).rows[0].tenant_id,selected);
      assert.equal((await pool.query('SELECT 1 FROM vendor_services WHERE tenant_id=$1',[neighbor])).rows.length,0);
      await pool.query("SELECT setval('catalog_service_ids',10000,FALSE)");
    });
    await t.test('catalog creation supports inactive vendors and no-branch administration',async () => {
      await reset();await pool.query('UPDATE tenants SET is_active=FALSE WHERE id=1; UPDATE store_locations SET is_active=FALSE WHERE tenant_id=1');
      const result=await createCatalog();assert.equal(result.service.isActive,true);assert.equal((await revisions()).length,1);
      await reset();await pool.query('DELETE FROM location_services WHERE tenant_id=1; DELETE FROM store_locations WHERE tenant_id=1');
      await createCatalog();assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('catalog creation rechecks grants and detects new branches after lock contention',async () => {
      for(const changed of ['grant','branch']) {
        await reset();const blocker=await pool.connect();let pending;
        try {
          await blocker.query('BEGIN');await blocker.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
          pending=createCatalog();pending.catch(()=>{});await waitForCatalogTenant();
          if(changed==='grant')await blocker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
          else await blocker.query("INSERT INTO store_locations(id,tenant_id,is_active,slug) VALUES(30,1,TRUE,'new')");
          const denied=assert.rejects(pending,{statusCode:changed==='grant'?403:409});await blocker.query('COMMIT');await denied;
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
        assert.equal(await count('vendor_services'),1);assert.equal(await count('resource_ledger_scopes'),0);
      }
    });
    await t.test('catalog deactivation advances all tenant branches and preserves bookings protection occupancy and service timing',async () => {
      await reset();await targetBranch();await ticket('1',{booking:true});await record('1','start');
      await pool.query('UPDATE tenants SET is_active=FALSE WHERE id=1; UPDATE store_locations SET is_active=FALSE WHERE tenant_id=1');
      const tables=['bookings','booking_bundle_items','resource_ledger_reservations','resource_allocations','resource_ledger_commands','tickets','ticket_service_plans','service_resource_requirements','location_services'];
      const before={};for(const table of tables) before[table]=(await pool.query(`SELECT * FROM ${table}`)).rows;
      const prior=(await revisions())[0].revision;const result=await deactivate();assert.equal(result.isActive,false);
      assert.deepEqual(await revisions(),[{location_id:'10',revision:prior+1},{location_id:'30',revision:2}]);
      for(const table of tables) assert.deepEqual((await pool.query(`SELECT * FROM ${table}`)).rows,before[table],table);
      const after=await revisions();await deactivate();assert.deepEqual(await revisions(),after);
      assert.equal((await pool.query('SELECT writer_coverage_complete FROM resource_ledger_scopes')).rows.every(row=>row.writer_coverage_complete===false),true);
    });
    await t.test('catalog deactivation rejects revoked deleted suspended staff and foreign tenant scope without writes',async () => {
      for(const sql of ['UPDATE tenant_memberships SET is_active=FALSE WHERE id=1',
        'UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1',
        'UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1',
        "UPDATE tenant_memberships SET role='staff' WHERE id=1"]) {
        await reset();await pool.query(sql);await assert.rejects(deactivate(),{statusCode:403});
        assert.equal((await realServices.findServiceByTenantAndId('1','1000',{client:pool})).isActive,true);assert.equal(await count('resource_ledger_scopes'),0);
      }
      await reset();await assert.rejects(deactivate('court-play','1',catalogWriter(),{_id:'2'}),{statusCode:403});
      await assert.rejects(deactivate('court-play','1',catalogWriter(),{_id:'90071992547409930'}),{statusCode:404});
      await assert.rejects(deactivate('court-play','1',catalogWriter(),{_id:'invalid'}),{statusCode:400});
      await assert.rejects(deactivate('court-play','invalid'),{statusCode:400});
      await pool.query("INSERT INTO tenant_memberships VALUES(3,1,2,'admin',TRUE)");
      await assert.rejects(deactivate('court-play','1',catalogWriter(),{_id:'2'}),{statusCode:404});
      assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('catalog deactivation rereads grants and service identity after branch contention',async () => {
      for(const change of ['grant','renamed','deleted','inactive']) {
        await reset();const blocker=await pool.connect();let pending;
        try {
          await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending=deactivate();const completion=change==='inactive'?pending:assert.rejects(pending,{statusCode:change==='grant'?403:404});
          pending.catch(()=>{});await waitForLocationLock();
          if(change==='grant') await blocker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
          if(change==='renamed') await blocker.query("UPDATE vendor_services SET slug='renamed' WHERE id=1000");
          if(change==='deleted') await blocker.query('DELETE FROM vendor_services WHERE id=1000');
          if(change==='inactive') await blocker.query('UPDATE vendor_services SET is_active=FALSE WHERE id=1000');
          await blocker.query('COMMIT');await completion;
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
        assert.equal(await count('resource_ledger_scopes'),0);
      }
    });
    await t.test('catalog tenant wait permits tenant-first revocation with a branch foreign-key assignment',async () => {
      await reset();const revoker=await pool.connect();let pending;
      try {
        await revoker.query('BEGIN');await revoker.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
        pending=deactivate();const denied=assert.rejects(pending,{statusCode:403});await waitForCatalogTenant();
        await revoker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
        await revoker.query("SET LOCAL lock_timeout='2s'");await revoker.query('INSERT INTO tenant_membership_locations VALUES(1,10)');
        await revoker.query('COMMIT');await denied;
      } finally {await revoker.query('ROLLBACK');revoker.release();if(pending)await pending.catch(()=>{});}
      assert.equal((await realServices.findServiceByTenantAndId('1','1000',{client:pool})).isActive,true);assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('catalog deactivation rejects a branch added while waiting for tenant lock and rolls back',async () => {
      await reset();const creator=await pool.connect();let pending;
      try {
        await creator.query('BEGIN');await creator.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
        pending=deactivate();const denied=assert.rejects(pending,{statusCode:409});await waitForCatalogTenant();
        await creator.query("INSERT INTO store_locations(id,tenant_id,is_active,slug) VALUES(30,1,TRUE,'new')");
        await creator.query('COMMIT');await denied;
      } finally {await creator.query('ROLLBACK');creator.release();if(pending)await pending.catch(()=>{});}
      assert.equal((await realServices.findServiceByTenantAndId('1','1000',{client:pool})).isActive,true);assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('catalog deactivation holds numeric ordered branches tenant grants service and prevents branch creation until completion',async () => {
      await reset();await targetBranch();await pool.query("INSERT INTO store_locations(id,tenant_id,is_active,slug) VALUES(2,1,TRUE,'first')");
      const observer=await pool.connect();let insertion;let entered;let release;
      const ready=new Promise(resolve=>{entered=resolve;});const barrier=new Promise(resolve=>{release=resolve;});
      const writer=catalogWriter({deactivateService:async (...args)=>{entered();await barrier;return realServices.deactivateService(...args);}});
      const pending=deactivate('court-play','1',writer);pending.catch(()=>{});
      try {
        await Promise.race([ready,pending.then(()=>{throw new Error('writer completed before the lock barrier');})]);
        for(const sql of ['SELECT id FROM store_locations WHERE id=2 FOR UPDATE NOWAIT','SELECT id FROM store_locations WHERE id=10 FOR UPDATE NOWAIT',
          'SELECT id FROM store_locations WHERE id=30 FOR UPDATE NOWAIT','SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT',
          'SELECT id FROM users WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM tenant_memberships WHERE id=1 FOR UPDATE NOWAIT',
          'SELECT id FROM vendor_services WHERE id=1000 FOR UPDATE NOWAIT']) {
          await observer.query('BEGIN');await assert.rejects(observer.query(sql),{code:'55P03'});await observer.query('ROLLBACK');
        }
        await observer.query('BEGIN');await observer.query('SELECT id FROM store_locations WHERE id=20 FOR UPDATE NOWAIT');await observer.query('ROLLBACK');
        insertion=pool.query("INSERT INTO store_locations(id,tenant_id,is_active,slug) VALUES(40,1,TRUE,'later')");insertion.catch(()=>{});
        const deadline=Date.now()+3000;let waiting=false;
        while(Date.now()<deadline) {
          waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'INSERT INTO store_locations%later%'",[schema])).rows.length>0;
          if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert.equal(waiting,true,'branch creation must wait on the held tenant foreign-key target');
      } finally {
        release();const settled=await Promise.allSettled([pending,insertion]);
        try {await observer.query('ROLLBACK');} finally {observer.release();}
        const failed=settled.find(result=>result.status==='rejected');if(failed)throw failed.reason;
      }
      assert.deepEqual(await revisions(),[{location_id:'2',revision:2},{location_id:'10',revision:2},{location_id:'30',revision:2}]);
    });
    await t.test('catalog deactivation rolls service and all scope revisions back after final revision failure',async () => {
      await reset();await targetBranch();
      const faultPool={connect:async ()=>{const client=await pool.connect();return {release:()=>client.release(),query:async (sql,args)=>{
        const result=await client.query(sql,args);
        if(sql.startsWith('UPDATE resource_ledger_scopes SET revision=revision+1')) throw new Error('catalog final revision failure');
        return result;
      }};}};
      await assert.rejects(deactivate('court-play','1',catalogWriter({}, {pool:faultPool})),/catalog final revision failure/);
      assert.equal((await realServices.findServiceByTenantAndId('1','1000',{client:pool})).isActive,true);assert.deepEqual(await revisions(),[]);
      await deactivate();assert.deepEqual(await revisions(),[{location_id:'10',revision:2},{location_id:'30',revision:2}]);
    });
    await t.test('competing catalog deactivations commit one activity revision per existing branch',async () => {
      await reset();await targetBranch();const results=await Promise.all([deactivate(),deactivate(),deactivate()]);
      assert.equal(results.every(service=>service.isActive===false),true);
      assert.deepEqual(await revisions(),[{location_id:'10',revision:2},{location_id:'30',revision:2}]);assert.equal(await count('resource_ledger_commands'),0);
    });
    await t.test('catalog and availability branch moves use compatible numeric lock order',async () => {
      await reset();await targetBranch();await pool.query("INSERT INTO store_locations(id,tenant_id,is_active,slug) VALUES(2,1,TRUE,'first')");
      await pool.query("INSERT INTO store_hours(location_id,weekday,opens_at,closes_at,is_closed) SELECT 2,n,'00:00','00:00',FALSE FROM generate_series(0,6) n");
      const entry=await addAvailability('block');
      const result=await Promise.all([deactivate(),editAvailability(entry,'block',{locationSlug:'first'})]);
      assert.equal(result[0].isActive,false);assert.equal(result[1].locationId,'2');
      assert.deepEqual(await revisions(),[{location_id:'2',revision:3},{location_id:'10',revision:3},{location_id:'30',revision:2}]);
    });
    await t.test('catalog tenant and service identities above JavaScript safe integer range remain exact',async () => {
      await reset();const selected='9007199254740993';const neighboring='9007199254740992';
      for(const tenantId of [selected,neighboring]) {
        await pool.query('INSERT INTO tenants(id,is_active) VALUES($1,TRUE)',[tenantId]);
        await pool.query("INSERT INTO store_locations(id,tenant_id,is_active,slug) VALUES($1,$1,TRUE,'large')",[tenantId]);
        await pool.query("INSERT INTO vendor_services(id,tenant_id,name,duration_minutes,is_active,slug) VALUES($1,$1,'Large',60,TRUE,'large')",[tenantId]);
      }
      await pool.query("INSERT INTO tenant_memberships VALUES(3,1,$1,'owner',TRUE)",[selected]);
      const result=await deactivate('large','1',catalogWriter(),{_id:selected});assert.equal(result._id,selected);assert.equal(result.tenantId,selected);assert.equal(result.isActive,false);
      assert.equal((await realServices.findServiceByTenantAndId(neighboring,neighboring,{client:pool})).isActive,true);
      assert.deepEqual(await revisions(),[{location_id:selected,revision:2}]);
    });
    const saveInactive=(body={},writer=catalogWriter(),selected=tenant,slug='court-play',actor='1')=>
      writer.updateVendorService(selected,slug,{...body,isActive:false},{actorUserId:actor});
    await t.test('dashboard inactive PATCH saves service metadata mappings and all revisions atomically while preserving admitted work',async () => {
      await reset();await targetBranch();await ticket('1',{booking:true});await record('1','start');
      const tables=['bookings','booking_bundle_items','resource_ledger_reservations','resource_allocations','resource_ledger_commands','tickets','ticket_service_plans'];
      const before={};for(const table of tables) before[table]=(await pool.query(`SELECT * FROM ${table}`)).rows;
      const prior=(await revisions())[0].revision;
      const result=await saveInactive({name:'Court play updated',description:'Updated service',durationMinutes:45,priceAmountCents:5000,
        locationServices:[{locationSlug:'main',capacity:3},{locationSlug:'other',capacity:2,isActive:false}]});
      assert.equal(result.service.isActive,false);assert.equal(result.service.name,'Court play updated');assert.equal(result.service.durationMinutes,45);
      assert.deepEqual(result.locationServices.map(item=>[item.locationId,item.capacity]),[['10',3],['30',2]]);
      assert.deepEqual((await pool.query('SELECT location_id::text,capacity FROM location_services ORDER BY location_id')).rows,[{location_id:'10',capacity:3},{location_id:'30',capacity:2}]);
      assert.deepEqual(await revisions(),[{location_id:'10',revision:prior+1},{location_id:'30',revision:2}]);
      for(const table of tables) assert.deepEqual((await pool.query(`SELECT * FROM ${table}`)).rows,before[table],table);
      const after=await revisions();await deactivate();assert.deepEqual(await revisions(),after);
      const partial=await saveInactive({description:'Another update'});assert.equal(partial.service.name,'Court play updated');assert.equal(partial.service.durationMinutes,45);
      assert.deepEqual(await revisions(),[{location_id:'10',revision:prior+2},{location_id:'30',revision:3}]);
    });
    await t.test('inactive PATCH rejects current grants foreign mappings validation and entitlement denial without partial edits',async () => {
      for(const scenario of ['grant','foreign','invalid','entitlement']) {
        await reset();let writer=catalogWriter();let body={};
        if(scenario==='grant') await pool.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
        if(scenario==='foreign') {await pool.query("UPDATE store_locations SET slug='foreign' WHERE id=20");body={locationServices:[{locationSlug:'main'},{locationSlug:'foreign'}]};}
        if(scenario==='invalid') body={durationMinutes:4};
        if(scenario==='entitlement') writer=catalogWriter({}, {pool},{'../services/entitlementAdmissionService':{admit:async ({client})=>{assert.ok(client);throw Object.assign(new Error('Booking not allowed'),{statusCode:403});}}});
        await assert.rejects(saveInactive(body,writer),{statusCode:scenario==='foreign'?404:scenario==='invalid'?400:403});
        assert.equal((await realServices.findServiceByTenantAndId('1','1000',{client:pool})).isActive,true);assert.equal(await count('resource_ledger_scopes'),0);
      }
    });
    await t.test('inactive PATCH rolls service mappings and all revisions back after final revision failure',async () => {
      await reset();await targetBranch();const before=(await pool.query('SELECT * FROM location_services')).rows;
      const faultPool={connect:async ()=>{const client=await pool.connect();return {release:()=>client.release(),query:async (sql,args)=>{
        const result=await client.query(sql,args);if(sql.startsWith('UPDATE resource_ledger_scopes SET revision=revision+1')) throw new Error('inactive PATCH revision failure');return result;
      }};}};
      await assert.rejects(saveInactive({name:'Changed',locationServices:[{locationSlug:'main',capacity:4},{locationSlug:'other',capacity:5}]},catalogWriter({}, {pool:faultPool})),/inactive PATCH revision failure/);
      assert.equal((await realServices.findServiceByTenantAndId('1','1000',{client:pool})).isActive,true);
      assert.deepEqual((await pool.query('SELECT * FROM location_services')).rows,before);assert.deepEqual(await revisions(),[]);
    });
    await t.test('inactive PATCH keeps large tenant branch service and mapping identities exact',async () => {
      await reset();const large='9007199254740993';const neighbor='9007199254740992';
      for(const id of [large,neighbor]) {
        await pool.query('INSERT INTO tenants(id,is_active) VALUES($1,TRUE)',[id]);
        await pool.query("INSERT INTO store_locations(id,tenant_id,is_active,slug) VALUES($1,$1,TRUE,'large')",[id]);
        await pool.query("INSERT INTO vendor_services(id,tenant_id,name,duration_minutes,is_active,slug) VALUES($1,$1,'Large',60,TRUE,'large')",[id]);
      }
      await pool.query("INSERT INTO tenant_memberships VALUES(3,1,$1,'admin',TRUE)",[large]);
      const result=await saveInactive({locationServices:[{locationSlug:'large',capacity:3}]},catalogWriter(),{_id:large},'large');
      assert.equal(result.service._id,large);assert.equal(result.service.isActive,false);assert.equal(result.locationServices[0].locationId,large);
      assert.equal((await realServices.findServiceByTenantAndId(neighbor,neighbor,{client:pool})).isActive,true);
      assert.deepEqual((await pool.query('SELECT tenant_id::text,location_id::text,service_id::text FROM location_services WHERE tenant_id=$1',[large])).rows,[{tenant_id:large,location_id:large,service_id:large}]);
    });
    await t.test('service PATCH activation and concurrent partial edits use current locked metadata and advance all branches',async () => {
      await reset();await targetBranch();await deactivate();
      const writer=catalogWriter();const revived=await writer.updateVendorService(tenant,'court-play',{isActive:true},{actorUserId:'1'});
      assert.equal(revived.service.isActive,true);
      const updates=await Promise.all([
        writer.updateVendorService(tenant,'court-play',{name:'Changed name'},{actorUserId:'1'}),
        writer.updateVendorService(tenant,'court-play',{description:'Changed description'},{actorUserId:'1'})
      ]);assert.equal(updates.every(result=>result.service.isActive),true);
      const current=await realServices.findServiceByTenantAndId('1','1000',{client:pool});assert.equal(current.name,'Changed name');assert.equal(current.description,'Changed description');
      assert.deepEqual(await revisions(),[{location_id:'10',revision:5},{location_id:'30',revision:5}]);
      await deactivate();await writer.updateVendorService(tenant,'court-play',{description:'Inactive edit'},{actorUserId:'1'});
      assert.equal((await realServices.findServiceByTenantAndId('1','1000',{client:pool})).isActive,false);
    });
    await pool.query(`ALTER TABLE tenant_subscriptions ADD COLUMN current_period_start TIMESTAMPTZ,ADD COLUMN current_period_end TIMESTAMPTZ,
      ADD COLUMN entitlements JSONB DEFAULT '{}',ADD COLUMN entitlement_model_version INTEGER DEFAULT 2,
      ADD COLUMN entitlement_comparison_hash TEXT,ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
      CREATE TABLE subscription_plans(slug TEXT PRIMARY KEY,policy_revision INTEGER DEFAULT 1,entitlements JSONB DEFAULT '{}');
      CREATE TABLE plan_feature_entitlements(plan_slug TEXT REFERENCES subscription_plans(slug),feature_key TEXT,enabled BOOLEAN,PRIMARY KEY(plan_slug,feature_key));
      CREATE TABLE plan_allowances(plan_slug TEXT REFERENCES subscription_plans(slug),allowance_key TEXT,monthly_limit INTEGER,PRIMARY KEY(plan_slug,allowance_key));
      CREATE TABLE tenant_entitlement_overrides(id BIGSERIAL PRIMARY KEY,subscription_id BIGINT REFERENCES tenant_subscriptions(id),policy_key TEXT,value JSONB,reason TEXT,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ,revoked_by_user_id BIGINT REFERENCES users(id));
      CREATE TABLE entitlement_rollout_anomalies(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),blocking BOOLEAN,resolved_at TIMESTAMPTZ);
      CREATE TABLE subscription_transitions(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),from_subscription_id BIGINT REFERENCES tenant_subscriptions(id),
        from_plan_slug TEXT REFERENCES subscription_plans(slug),to_plan_slug TEXT REFERENCES subscription_plans(slug),transition_type TEXT,status TEXT,reason TEXT,
        effective_at TIMESTAMPTZ,created_by_user_id BIGINT REFERENCES users(id),metadata JSONB);
      INSERT INTO subscription_plans VALUES('free',1,'{}');
      INSERT INTO plan_feature_entitlements VALUES('free','booking',FALSE);
      INSERT INTO plan_allowances VALUES('free','serviceBookings',100)`);
    const enforcedControls={entitlementResolverAuthority:true,entitlementBookingEnforcement:true};
    const policyRepository=loadService({'../config/db':{pool}},'../repositories/entitlementResolver');
    const actualResolver=loadService({'../repositories/entitlementResolver':policyRepository,'../config/releaseControls':enforcedControls},'entitlementResolver');
    const actualAdmission=loadService({'./entitlementResolver':actualResolver,'../config/releaseControls':enforcedControls},'entitlementAdmissionService');
    const enforcedWriter=(overrides={},database={pool})=>catalogWriter(overrides,database,{'../services/entitlementAdmissionService':actualAdmission});
    const actualOverrides=loadService({'../config/db':{pool}},'../repositories/entitlementOverrides');
    const actualLifecycle=loadService({'../config/db':{pool}},'subscriptionLifecycleService');
    async function enableBookingOverride() {
      await pool.query("INSERT INTO tenant_entitlement_overrides(subscription_id,policy_key,value,reason) VALUES(1,'feature.booking','true','Test override')");
      await pool.query('INSERT INTO entitlement_rollout_anomalies(tenant_id,blocking) VALUES(1,FALSE)');
    }
    await t.test('catalog creation uses real enforced admission and fails closed on policy contention',async () => {
      await reset();await assert.rejects(createCatalog(undefined,enforcedWriter()),{statusCode:403});assert.equal(await count('vendor_services'),1);
      await enableBookingOverride();const blocker=await pool.connect();
      try {
        await blocker.query('BEGIN');await blocker.query('SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE');
        await assert.rejects(createCatalog(undefined,enforcedWriter()),{statusCode:409,code:'ENTITLEMENT_POLICY_BUSY'});assert.equal(await count('vendor_services'),1);assert.equal(await count('resource_ledger_scopes'),0);
      } finally {await blocker.query('ROLLBACK');blocker.release();}
      const result=await createCatalog(undefined,enforcedWriter());assert.equal(result.service.tenantId,'1');assert.deepEqual(await revisions(),[{location_id:'10',revision:2}]);
    });
    await t.test('catalog creation holds actual override policy through service and revision commit',async () => {
      await reset();await enableBookingOverride();let entered;let release;let revocation;
      const ready=new Promise(resolve=>{entered=resolve;});const barrier=new Promise(resolve=>{release=resolve;});
      const writer=enforcedWriter({createService:async (...args)=>{entered();await barrier;return realServices.createService(...args);}});
      const pending=createCatalog(undefined,writer);pending.catch(()=>{});
      try {
        await Promise.race([ready,pending.then(()=>{throw new Error('catalog creation barrier missing');})]);
        revocation=actualOverrides.revoke({overrideId:'1',tenantId:'1',actorId:'2'},{client:pool});revocation.catch(()=>{});
        const deadline=Date.now()+3000;let waiting=false;
        while(Date.now()<deadline) {
          waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'UPDATE tenant_entitlement_overrides%'",[schema])).rows.length>0;
          if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert.equal(waiting,true,'actual override revocation must wait for catalog creation commit');
      } finally {release();const settled=await Promise.allSettled([pending,revocation]);const failed=settled.find(result=>result.status==='rejected');if(failed)throw failed.reason;}
      assert.equal(await count('vendor_services'),2);assert.deepEqual(await revisions(),[{location_id:'10',revision:2}]);
      await assert.rejects(createCatalog({name:'Denied later',durationMinutes:30},enforcedWriter()),{statusCode:403});assert.equal(await count('vendor_services'),2);
    });
    await t.test('real enforced admission preserves adjacent large tenant identities for deny and allow decisions',async () => {
      await reset();const selected='9007199254740993';const neighbor='9007199254740992';
      for(const id of [selected,neighbor]) {
        await pool.query('INSERT INTO tenants(id,is_active) VALUES($1,TRUE)',[id]);
        await pool.query("INSERT INTO store_locations(id,tenant_id,is_active,slug) VALUES($1,$1,TRUE,'large')",[id]);
        await pool.query("INSERT INTO vendor_services(id,tenant_id,name,duration_minutes,is_active,slug) VALUES($1,$1,'Large',60,TRUE,'large')",[id]);
        await pool.query("INSERT INTO tenant_subscriptions(id,tenant_id,status,plan_slug,entitlement_model_version,updated_at) VALUES($1,$1,'active','free',2,clock_timestamp())",[id]);
      }
      await pool.query("INSERT INTO tenant_memberships VALUES(3,1,$1,'owner',TRUE)",[selected]);
      await pool.query("INSERT INTO tenant_entitlement_overrides(subscription_id,policy_key,value,reason) VALUES($1,'feature.booking','true','Neighbor policy')",[neighbor]);
      await assert.rejects(saveInactive({},enforcedWriter(),{_id:selected},'large'),{statusCode:403});
      assert.equal(await count('resource_ledger_scopes'),0);
      await pool.query("INSERT INTO tenant_entitlement_overrides(subscription_id,policy_key,value,reason) VALUES($1,'feature.booking','true','Selected policy')",[selected]);
      await pool.query("UPDATE tenant_subscriptions SET status='suspended' WHERE tenant_id=$1",[neighbor]);
      const result=await saveInactive({},enforcedWriter(),{_id:selected},'large');assert.equal(result.service._id,selected);assert.equal(result.service.isActive,false);
      assert.equal((await realServices.findServiceByTenantAndId(neighbor,neighbor,{client:pool})).isActive,true);
    });
    await t.test('real enforced policy admission holds subscription override plan feature allowance and anomaly state through catalog commit',async () => {
      await reset();await enableBookingOverride();let entered;let release;
      const ready=new Promise(resolve=>{entered=resolve;});const barrier=new Promise(resolve=>{release=resolve;});
      const writer=enforcedWriter({updateService:async (...args)=>{entered();await barrier;return realServices.updateService(...args);}});
      const pending=saveInactive({},writer);pending.catch(()=>{});await Promise.race([ready,pending.then(()=>{throw new Error('writer completed before the lock barrier');})]);const observer=await pool.connect();let revocation;let suspension;
      try {
        for(const sql of ['SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM tenant_entitlement_overrides WHERE id=1 FOR UPDATE NOWAIT',
          "SELECT slug FROM subscription_plans WHERE slug='free' FOR UPDATE NOWAIT","SELECT feature_key FROM plan_feature_entitlements WHERE plan_slug='free' FOR UPDATE NOWAIT",
          "SELECT allowance_key FROM plan_allowances WHERE plan_slug='free' FOR UPDATE NOWAIT",'SELECT id FROM entitlement_rollout_anomalies WHERE tenant_id=1 FOR UPDATE NOWAIT']) {
          await observer.query('BEGIN');await assert.rejects(observer.query(sql),{code:'55P03'});await observer.query('ROLLBACK');
        }
        revocation=actualOverrides.revoke({overrideId:'1',tenantId:'1',actorId:'2'},{client:pool});revocation.catch(()=>{});
        suspension=(async ()=>{const client=await pool.connect();try {await client.query('BEGIN');const result=await actualLifecycle.suspendSubscription('1',{reason:'Suspend policy',actorId:'2'},{client});await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}})();suspension.catch(()=>{});
        const deadline=Date.now()+3000;let waiting=0;
        while(Date.now()<deadline) {
          waiting=Number((await pool.query("SELECT count(*) AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND (query LIKE 'UPDATE tenant_entitlement_overrides%' OR query LIKE 'SELECT * FROM tenant_subscriptions%')",[schema])).rows[0].n);
          if(waiting===2)break;await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert.equal(waiting,2,'policy revocation and actual subscription suspension must wait for catalog commit');
      } finally {
        release();const settled=await Promise.allSettled([pending,revocation,suspension]);
        try {await observer.query('ROLLBACK');} finally {observer.release();}
        const failed=settled.find(result=>result.status==='rejected');if(failed)throw failed.reason;
      }
      assert.deepEqual(await revisions(),[{location_id:'10',revision:2}]);
      const before=await revisions();await assert.rejects(saveInactive({},enforcedWriter()),{statusCode:403});assert.deepEqual(await revisions(),before);
    });
    await t.test('subscription-first suspension contention fails catalog admission closed without a tenant FK lock cycle',async () => {
      await reset();await enableBookingOverride();const suspender=await pool.connect();
      try {
        await suspender.query('BEGIN');await suspender.query('SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE');
        await assert.rejects(saveInactive({},enforcedWriter()),{statusCode:409,code:'ENTITLEMENT_POLICY_BUSY'});
        await suspender.query("SET LOCAL lock_timeout='2s'");
        const result=await actualLifecycle.suspendSubscription('1',{reason:'Suspend policy',actorId:'2'},{client:suspender});assert.equal(result.status,'suspended');
        await suspender.query('COMMIT');
      } finally {await suspender.query('ROLLBACK');suspender.release();}
      assert.equal((await realServices.findServiceByTenantAndId('1','1000',{client:pool})).isActive,true);assert.equal(await count('resource_ledger_scopes'),0);
      await assert.rejects(saveInactive({},enforcedWriter()),{statusCode:403});
    });
    await t.test('real enforced policy lock failure and final catalog rollback release accepted policy rows',async () => {
      await reset();await enableBookingOverride();const revoker=await pool.connect();
      try {
        await revoker.query('BEGIN');await actualOverrides.revoke({overrideId:'1',tenantId:'1',actorId:'2'},{client:revoker});
        await assert.rejects(saveInactive({},enforcedWriter()),{statusCode:409,code:'ENTITLEMENT_POLICY_BUSY'});
        await revoker.query('COMMIT');
      } finally {await revoker.query('ROLLBACK');revoker.release();}
      await assert.rejects(saveInactive({},enforcedWriter()),{statusCode:403});
      await reset();await enableBookingOverride();
      const faultPool={connect:async ()=>{const client=await pool.connect();return {release:()=>client.release(),query:async (sql,args)=>{
        const result=await client.query(sql,args);if(sql.startsWith('UPDATE resource_ledger_scopes SET revision=revision+1')) throw new Error('policy catalog rollback');return result;
      }};}};
      await assert.rejects(saveInactive({},enforcedWriter({}, {pool:faultPool})),/policy catalog rollback/);
      assert.equal((await realServices.findServiceByTenantAndId('1','1000',{client:pool})).isActive,true);assert.equal(await count('resource_ledger_scopes'),0);
      const observer=await pool.connect();try {await observer.query('BEGIN');await observer.query('SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE NOWAIT');await observer.query('SELECT id FROM tenant_entitlement_overrides WHERE id=1 FOR UPDATE NOWAIT');}finally{await observer.query('ROLLBACK');observer.release();}
    });
    await t.test('catalog deactivation supports vendors with no branches without creating ledger state',async () => {
      await reset();await pool.query('DELETE FROM store_locations WHERE id=10');
      assert.equal((await deactivate()).isActive,false);assert.equal(await count('resource_ledger_scopes'),0);
    });

    await pool.query("CREATE SEQUENCE location_creation_ids START 50; ALTER TABLE store_locations ALTER COLUMN id SET DEFAULT nextval('location_creation_ids'); ALTER TABLE store_locations ADD CONSTRAINT creation_slug_unique UNIQUE(tenant_id,slug); CREATE TABLE platform_settings(key TEXT PRIMARY KEY,value TEXT); INSERT INTO platform_settings VALUES('default_timezone','Pacific/Auckland')");
    const locationWriter=(database={pool},overrides={})=>loadService({'../config/db':database,'../repositories/storeLocations':{...realLocations,...overrides}},'locationCatalogService');
    const createBranch=(body={name:'New branch',slug:'new'},writer=locationWriter(),selected=tenant,actor='1')=>writer.createVendorLocation(selected,body,{actorUserId:actor});
    async function locationQuota(limit=3) {await pool.query("UPDATE subscription_plans SET entitlements=$1 WHERE slug='free'",[{locations:limit}]);}
    await t.test('branch creation atomically commits closed default hours primary replacement and revisions without changing admitted work',async () => {
      await reset();await locationQuota();await pool.query('UPDATE store_locations SET is_primary=TRUE WHERE id=10');await ticket('1',{booking:true});await record('1','start');
      const tables=['bookings','resource_ledger_reservations','resource_allocations','ticket_service_plans'];const before=await Promise.all(tables.map(table=>pool.query(`SELECT * FROM ${table}`)));const revision=(await revisions())[0].revision;
      const branch=await createBranch({name:'New branch',slug:'new',isPrimary:true,tenantId:'2',actorUserId:'2'});
      assert.equal(branch.tenantId,'1');assert.equal(branch.timezone,'Pacific/Auckland');assert.equal(branch.isPrimary,true);assert.equal((await realLocations.findLocationById('10',{client:pool})).isPrimary,false);
      const hours=await realLocations.listHoursByLocationId(branch._id,{client:pool});assert.equal(hours.length,7);assert.ok(hours.every(hour=>hour.isClosed && !hour.opensAt && !hour.closesAt));
      assert.deepEqual(await revisions(),[{location_id:'10',revision:revision+1},{location_id:branch._id,revision:2}]);
      for(let i=0;i<tables.length;i++)assert.deepEqual((await pool.query(`SELECT * FROM ${tables[i]}`)).rows,before[i].rows);
    });
    await t.test('branch creation rejects current grants invalid payload and quota without partial writes',async () => {
      for(const sql of ['UPDATE tenant_memberships SET is_active=FALSE WHERE id=1','UPDATE users SET deletion_requested_at=NOW() WHERE id=1','UPDATE users SET platform_access_suspended_at=NOW() WHERE id=1',"UPDATE tenant_memberships SET role='staff' WHERE id=1"]) {
        await reset();await locationQuota();await pool.query(sql);await assert.rejects(createBranch(),{statusCode:403});assert.equal(await count('store_locations'),2);assert.equal(await count('resource_ledger_scopes'),0);
      }
      await reset();await locationQuota(1);await assert.rejects(createBranch(),{statusCode:403});
      await assert.rejects(createBranch({name:'New',slug:'new',timezone:'Invalid/Zone'}),{statusCode:400});assert.equal(await count('store_locations'),2);assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('branch creation rolls primary changes branch hours and all revisions back on hours or final revision failure',async () => {
      for(const failure of ['hours','revision']) {
        await reset();await locationQuota();await pool.query('UPDATE store_locations SET is_primary=TRUE WHERE id=10');
        const oldHours=(await pool.query('SELECT * FROM store_hours WHERE location_id=10')).rows;
        const faultPool={connect:async()=>{const client=await pool.connect();return {release:()=>client.release(),query:async(sql,args)=>{
          if((failure==='hours' && /INSERT INTO store_hours/.test(sql)) || (failure==='revision' && /UPDATE resource_ledger_scopes/.test(sql)))throw new Error('branch creation fault');return client.query(sql,args);
        }};}};
        await assert.rejects(createBranch({name:'New',slug:'new',isPrimary:true},locationWriter({pool:faultPool})),/branch creation fault/);
        assert.equal(await count('store_locations'),2);assert.equal((await realLocations.findLocationById('10',{client:pool})).isPrimary,true);assert.deepEqual((await pool.query('SELECT * FROM store_hours WHERE location_id=10')).rows,oldHours);assert.equal(await count('resource_ledger_scopes'),0);
      }
    });
    await t.test('two branch creations serialize the final active seat and duplicate slugs roll back safely',async () => {
      await reset();await locationQuota(2);const result=await Promise.allSettled([createBranch({name:'A',slug:'a'}),createBranch({name:'B',slug:'b'})]);assert.equal(result.filter(item=>item.status==='fulfilled').length,1);
      assert.ok([403,409].includes(result.find(item=>item.status==='rejected').reason.statusCode));assert.equal((await pool.query('SELECT 1 FROM store_locations WHERE tenant_id=1 AND is_active')).rows.length,2);
      await assert.rejects(createBranch({name:'C',slug:'c'}),{statusCode:403});assert.equal((await revisions()).length,2);
      await reset();await locationQuota();await createBranch();const before=await revisions();await assert.rejects(createBranch(),{code:'23505'});assert.deepEqual(await revisions(),before);assert.equal(await count('store_locations'),3);
    });
    await t.test('branch creation waits for branch locks and rechecks revoked grants',async () => {
      await reset();await locationQuota();const blocker=await pool.connect();let pending;
      try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');pending=createBranch();pending.catch(()=>{});await waitForLocationLock();await blocker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');const denied=assert.rejects(pending,{statusCode:403});await blocker.query('COMMIT');await denied;}
      finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      assert.equal(await count('store_locations'),2);assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('branch creation preserves exact adjacent tenant quota and generated branch hours identifiers',async () => {
      await reset();await locationQuota(5);const selected='9007199254740993';const neighbor='9007199254740992';
      await pool.query('INSERT INTO tenants(id,is_active) VALUES($1,TRUE),($2,TRUE)',[selected,neighbor]);await pool.query("INSERT INTO tenant_memberships(id,user_id,tenant_id,role,is_active) VALUES(3,1,$1,'owner',TRUE)",[selected]);
      await pool.query("INSERT INTO tenant_subscriptions(id,tenant_id,status,plan_slug,entitlements,updated_at) VALUES(2,$1,'active','free',$3,NOW()),(3,$2,'active','free',$4,NOW())",[selected,neighbor,{locations:1},{locations:5}]);
      await pool.query("INSERT INTO store_locations(id,tenant_id,is_active,slug) VALUES($1,$2,TRUE,'existing')",[neighbor,selected]);await assert.rejects(createBranch(undefined,locationWriter(),{_id:selected}),{statusCode:403});
      await pool.query('UPDATE tenant_subscriptions SET entitlements=$1 WHERE id=2',[{locations:2}]);await pool.query("SELECT setval('location_creation_ids',$1,FALSE)",[selected]);
      const branch=await createBranch({name:'Exact',slug:'exact',tenantId:neighbor},locationWriter(),{_id:selected});assert.equal(branch._id,selected);assert.equal(branch.tenantId,selected);
      const hours=await realLocations.listHoursByLocationId(selected,{client:pool});assert.equal(hours.length,7);assert.ok(hours.every(hour=>hour.locationId===selected));assert.equal((await pool.query('SELECT 1 FROM store_locations WHERE tenant_id=$1',[neighbor])).rows.length,0);
      assert.deepEqual((await pool.query('SELECT location_id::text FROM resource_ledger_scopes WHERE tenant_id=$1 ORDER BY location_id',[selected])).rows,[{location_id:neighbor},{location_id:selected}]);await pool.query("SELECT setval('location_creation_ids',50,FALSE)");
    });
    await t.test('active branch creation fails closed on held quota policy and inactive administration supports no existing branches',async () => {
      await reset();await locationQuota();const blocker=await pool.connect();
      try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE');await assert.rejects(createBranch(),{statusCode:409,code:'LOCATION_POLICY_BUSY'});assert.equal(await count('store_locations'),2);await createBranch({name:'Inactive',slug:'inactive',isActive:false});}
      finally {await blocker.query('ROLLBACK');blocker.release();}
      await reset();await pool.query('DELETE FROM location_services WHERE tenant_id=1; DELETE FROM store_locations WHERE tenant_id=1; UPDATE tenants SET is_active=FALSE WHERE id=1');
      const branch=await createBranch({name:'Only',slug:'only',isActive:false});assert.equal(branch.isActive,false);assert.equal((await realLocations.listHoursByLocationId(branch._id,{client:pool})).length,7);assert.deepEqual(await revisions(),[{location_id:branch._id,revision:2}]);
    });
    await t.test('branch creation retains quota defaults for missing plan and missing subscription',async () => {
      await reset();await pool.query("UPDATE tenant_subscriptions SET plan_slug='missing',entitlements=$1 WHERE id=1",[{locations:2}]);
      await createBranch();assert.equal(await count('store_locations'),3);
      await reset();await pool.query('DELETE FROM tenant_subscriptions');await assert.rejects(createBranch(),{statusCode:403});assert.equal(await count('store_locations'),2);
      await pool.query('DELETE FROM location_services WHERE tenant_id=1; DELETE FROM store_locations WHERE tenant_id=1');await createBranch();assert.equal(await count('store_locations'),2);
    });
    await t.test('branch creation holds actual subscription and plan quota rows through commit',async () => {
      await reset();await locationQuota();let entered;let release;let policyChange;const ready=new Promise(resolve=>{entered=resolve;});const barrier=new Promise(resolve=>{release=resolve;});
      const writer=locationWriter({pool},{createLocation:async(...args)=>{entered();await barrier;return realLocations.createLocation(...args);}});const pending=createBranch(undefined,writer);pending.catch(()=>{});const observer=await pool.connect();
      try {await Promise.race([ready,pending.then(()=>{throw new Error('branch creation barrier missing');})]);
        for(const sql of ['SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE NOWAIT',"SELECT slug FROM subscription_plans WHERE slug='free' FOR UPDATE NOWAIT"]) {await observer.query('BEGIN');await assert.rejects(observer.query(sql),{code:'55P03'});await observer.query('ROLLBACK');}
        policyChange=pool.query("UPDATE tenant_subscriptions SET entitlements='{\"locations\":1}' WHERE id=1");policyChange.catch(()=>{});
        const deadline=Date.now()+3000;let waiting=false;while(Date.now()<deadline) {waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'UPDATE tenant_subscriptions SET entitlements%'",[schema])).rows.length>0;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(waiting,true);
      } finally {release();const settled=await Promise.allSettled([pending,policyChange]);try {await observer.query('ROLLBACK');}finally{observer.release();}const failed=settled.find(item=>item.status==='rejected');if(failed)throw failed.reason;}
      await assert.rejects(createBranch({name:'Later',slug:'later'}),{statusCode:403});assert.equal(await count('store_locations'),3);
    });
    const updateBranch=(body={},writer=locationWriter(),slug='main',selected=tenant,actor='1')=>writer.updateVendorLocation(selected,slug,body,{actorUserId:actor});
    await t.test('branch settings commit exact partial updates primary replacement and revisions while preserving admitted work',async () => {
      await reset();await targetBranch();await pool.query('UPDATE store_locations SET is_primary=TRUE WHERE id=30');await ticket('1',{booking:true});await record('1','start');
      const tables=['bookings','resource_ledger_reservations','resource_allocations','ticket_service_plans','store_hours'];const before=await Promise.all(tables.map(table=>pool.query(`SELECT * FROM ${table} ORDER BY 1`)));const old=await revisions();
      const branch=await updateBranch({name:' Main edited ',isPrimary:true,isActive:false,timezone:'Pacific/Auckland',customerSelfCheckInEnabled:false,serviceTimingEnabled:false,tenantId:'2',_id:'20',actorUserId:'2'});
      assert.equal(branch._id,'10');assert.equal(branch.tenantId,'1');assert.equal(branch.name,'Main edited');assert.equal(branch.slug,'main');assert.equal(branch.timezone,'Pacific/Auckland');assert.equal(branch.isPrimary,true);assert.equal(branch.isActive,false);assert.equal(branch.customerSelfCheckInEnabled,false);assert.equal(branch.serviceTimingEnabled,false);
      assert.equal((await realLocations.findLocationById('30',{client:pool})).isPrimary,false);assert.equal((await realLocations.findLocationById('20',{client:pool})).isActive,true);
      assert.deepEqual(await revisions(),[{location_id:'10',revision:old[0].revision+1},{location_id:'30',revision:2}]);
      for(let i=0;i<tables.length;i++)assert.deepEqual((await pool.query(`SELECT * FROM ${tables[i]} ORDER BY 1`)).rows,before[i].rows);
    });
    await t.test('branch PATCH rejects current grants scope tampering immutable slug and invalid settings atomically',async () => {
      for(const sql of ['UPDATE tenant_memberships SET is_active=FALSE WHERE id=1','UPDATE users SET deletion_requested_at=NOW() WHERE id=1','UPDATE users SET platform_access_suspended_at=NOW() WHERE id=1',"UPDATE tenant_memberships SET role='staff' WHERE id=1"]) {
        await reset();await pool.query(sql);await assert.rejects(updateBranch({name:'Denied'}),{statusCode:403});assert.equal(await count('resource_ledger_scopes'),0);
      }
      await reset();
      for(const body of [{slug:'renamed'},{timezone:'Invalid/Zone'},{isActive:'true'},{isPrimary:1},{customerSelfCheckInEnabled:'false'},{serviceTimingEnabled:0},{paymentQrActive:true}])await assert.rejects(updateBranch(body),{statusCode:400});
      await assert.rejects(updateBranch({name:'Foreign'},locationWriter(),'other'),{statusCode:404});assert.equal(await count('resource_ledger_scopes'),0);
      assert.equal((await updateBranch({slug:'main',name:'Same slug'})).slug,'main');
    });
    await t.test('branch reactivation and creation serialize the last active seat',async () => {
      await reset();await targetBranch();await pool.query('UPDATE store_locations SET is_active=FALSE WHERE id=30');await locationQuota(2);
      const results=await Promise.allSettled([createBranch(),updateBranch({isActive:true},locationWriter(),'other')]);assert.equal(results.filter(item=>item.status==='fulfilled').length,1);assert.ok([403,409].includes(results.find(item=>item.status==='rejected').reason.statusCode));
      assert.equal((await pool.query('SELECT id FROM store_locations WHERE tenant_id=1 AND is_active')).rows.length,2);
      await reset();await locationQuota(1);await pool.query('UPDATE store_locations SET is_active=FALSE WHERE id=10');assert.equal((await updateBranch({isActive:true})).isActive,true);
      assert.equal((await updateBranch({isActive:true,name:'Already active'})).name,'Already active');
      await targetBranch();await pool.query('UPDATE store_locations SET is_active=FALSE WHERE id=30');await assert.rejects(updateBranch({isActive:true},locationWriter(),'other'),{statusCode:403});
    });
    await t.test('branch reactivation denies held quota policy while inactive and already active edits remain available',async () => {
      await reset();await locationQuota();await pool.query('UPDATE store_locations SET is_active=FALSE WHERE id=10');const blocker=await pool.connect();
      try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE');await assert.rejects(updateBranch({isActive:true}),{statusCode:409,code:'LOCATION_POLICY_BUSY'});assert.equal(await count('resource_ledger_scopes'),0);assert.equal((await updateBranch({name:'Inactive edit',isActive:false})).isActive,false);}
      finally {await blocker.query('ROLLBACK');blocker.release();}
      await updateBranch({isActive:true});await locationQuota(1);await targetBranch();assert.equal((await updateBranch({name:'Over limit edit'})).name,'Over limit edit');
    });
    await t.test('branch PATCH rolls primary metadata and all revisions back on final revision failure',async () => {
      await reset();await targetBranch();await pool.query('UPDATE store_locations SET is_primary=TRUE WHERE id=30');const before=(await pool.query('SELECT * FROM store_locations ORDER BY id')).rows;
      const faultPool={connect:async()=>{const client=await pool.connect();return {release:()=>client.release(),query:async(sql,args)=>{if(/UPDATE resource_ledger_scopes/.test(sql))throw new Error('branch update fault');return client.query(sql,args);}};}};
      await assert.rejects(updateBranch({name:'Rollback',isPrimary:true,isActive:false},locationWriter({pool:faultPool})),/branch update fault/);assert.deepEqual((await pool.query('SELECT * FROM store_locations ORDER BY id')).rows,before);assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('branch PATCH rechecks grant slug deletion and active state after branch lock contention',async () => {
      for(const change of ['grant','slug','delete','quota']) {
        await reset();await targetBranch();await locationQuota(1);const blocker=await pool.connect();let pending;
        try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=30 FOR UPDATE');pending=updateBranch({isActive:true,name:'Waiting'},locationWriter(),'other');pending.catch(()=>{});await waitForLocationLock();
          if(change==='grant')await blocker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
          if(change==='slug')await blocker.query("UPDATE store_locations SET slug='changed' WHERE id=30");
          if(change==='delete')await blocker.query('DELETE FROM store_locations WHERE id=30');
          if(change==='quota')await blocker.query('UPDATE store_locations SET is_active=FALSE WHERE id=30');
          const denied=assert.rejects(pending,{statusCode:change==='grant'||change==='quota'?403:404});await blocker.query('COMMIT');await denied;
        }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
        assert.equal(await count('resource_ledger_scopes'),0);
      }
    });
    await t.test('branch payment validation uses locked current fields and concurrent partial edits survive',async () => {
      await reset();const blocker=await pool.connect();let pending;
      try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');pending=updateBranch({paymentQrActive:true});pending.catch(()=>{});await waitForLocationLock();
        await blocker.query("UPDATE store_locations SET payment_method_label='GCash',payment_account_display_name='Current owner',payment_qr_image_url='https://example.test/qr.png',city='Current city' WHERE id=10");await blocker.query('COMMIT');
        const branch=await pending;assert.equal(branch.paymentAccountDisplayName,'Current owner');assert.equal(branch.city,'Current city');assert.equal(branch.paymentQrActive,true);
      }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      await Promise.all([updateBranch({name:'Concurrent name'}),updateBranch({contactPhone:'09170000000'})]);const current=await realLocations.findLocationById('10',{client:pool});assert.equal(current.name,'Concurrent name');assert.equal(current.contactPhone,'09170000000');
    });
    await t.test('branch PATCH keeps adjacent large branch identifiers exact for primary and no-op updates',async () => {
      await reset();const selected='9007199254740993';const neighbor='9007199254740992';await pool.query("INSERT INTO store_locations(id,tenant_id,is_active,slug,is_primary) VALUES($1,1,FALSE,'exact',FALSE),($2,2,TRUE,'exact',TRUE)",[selected,neighbor]);
      const branch=await updateBranch({name:'Exact',isPrimary:true},locationWriter(),'exact');assert.equal(branch._id,selected);assert.equal(branch.tenantId,'1');assert.equal((await updateBranch({},locationWriter(),'exact'))._id,selected);
      const untouched=await realLocations.findLocationById(neighbor,{client:pool});assert.equal(untouched.isPrimary,true);assert.notEqual(untouched.name,'Exact');assert.deepEqual(await revisions(),[{location_id:'10',revision:3},{location_id:selected,revision:3}]);
    });
    await t.test('branch reactivation holds subscription plan and current grants until its mutation commits',async () => {
      await reset();await locationQuota();await pool.query('UPDATE store_locations SET is_active=FALSE WHERE id=10');let entered;let release;const ready=new Promise(resolve=>{entered=resolve;});const barrier=new Promise(resolve=>{release=resolve;});
      const writer=locationWriter({pool},{updateLocation:async(...args)=>{entered();await barrier;return realLocations.updateLocation(...args);}});const pending=updateBranch({isActive:true},writer);pending.catch(()=>{});const observer=await pool.connect();
      try {await Promise.race([ready,pending.then(()=>{throw new Error('branch update barrier missing');})]);
        for(const sql of ['SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE NOWAIT',"SELECT slug FROM subscription_plans WHERE slug='free' FOR UPDATE NOWAIT",'SELECT id FROM tenant_memberships WHERE id=1 FOR UPDATE NOWAIT']) {await observer.query('BEGIN');await assert.rejects(observer.query(sql),{code:'55P03'});await observer.query('ROLLBACK');}
      }finally {release();const settled=await Promise.allSettled([pending]);try{await observer.query('ROLLBACK');}finally{observer.release();}if(settled[0].status==='rejected')throw settled[0].reason;}
      assert.equal((await realLocations.findLocationById('10',{client:pool})).isActive,true);
    });
    await t.test('branch PATCH rejects payment details removed while waiting and permits inactive tenant administration',async () => {
      await reset();await pool.query("UPDATE store_locations SET payment_method_label='GCash',payment_account_display_name='Owner',payment_qr_image_url='https://example.test/qr.png' WHERE id=10");const blocker=await pool.connect();let pending;
      try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');pending=updateBranch({paymentQrActive:true});pending.catch(()=>{});await waitForLocationLock();await blocker.query("UPDATE store_locations SET payment_account_display_name='' WHERE id=10");const denied=assert.rejects(pending,{statusCode:400});await blocker.query('COMMIT');await denied;}
      finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      assert.equal(await count('resource_ledger_scopes'),0);await pool.query('UPDATE tenants SET is_active=FALSE WHERE id=1; UPDATE store_locations SET is_active=FALSE WHERE id=10');assert.equal((await updateBranch({name:'Inactive admin'})).name,'Inactive admin');
    });
    await pool.query('ALTER TABLE store_locations DROP CONSTRAINT creation_slug_unique');

    function legacyLifecycle(database, target='queueService', actualPauses=false) {
      const injected={...queueMocks,'../config/db':database,'./queueHelpers':require('../src/services/queueHelpers'),
        '../repositories/tickets':{...queueMocks['../repositories/tickets'],listWaitingTickets:realTickets.listWaitingTickets,reopenTicketsFromClosure:realTickets.reopenTicketsFromClosure,restoreCarriedOverTicketsFromClosure:realTickets.restoreCarriedOverTicketsFromClosure,
          listTicketsForQueueClosure:realTickets.listTicketsForQueueClosure,markTicketsUnservedForClosure:realTickets.markTicketsUnservedForClosure,carryOverWaitingTickets:realTickets.carryOverWaitingTickets},
        '../repositories/queueDayClosures':{...queueMocks['../repositories/queueDayClosures'],findActiveClosure:async (_tenant,_location,_date,{client})=>{const row=(await client.query('SELECT closed,closure FROM intake_state')).rows[0];return row.closed?{_id:'1',...row.closure}:null;},createClosure:async (data,{client})=>{await client.query('UPDATE intake_state SET closed=TRUE,closure=$1',[JSON.stringify(data)]); return {_id:'1',...data};},reopenClosure:async (_id,_actor,{client})=>{await client.query('UPDATE intake_state SET closed=FALSE');}},
        '../repositories/queueDayPauses':{...queueMocks['../repositories/queueDayPauses'],createPause:async (data,{client})=>{await client.query('UPDATE intake_state SET paused=TRUE'); return {_id:'1',...data};},resumePause:async (_id,_actor,{client})=>{await client.query('UPDATE intake_state SET paused=FALSE');return {_id:'1'};}},
        './pushNotificationService':{...mocks['./pushNotificationService'],notifyVendorQueueLifecycle:async()=>{automaticPushes++;}}};
      if(actualPauses) injected['../repositories/queueDayPauses']=require('../src/repositories/queueDayPauses');
      const filename=path.resolve(__dirname,`../src/services/${target}.js`); const compiled=new (require('node:module').Module)(filename);
      compiled.require=request=>Object.hasOwn(injected,request) ? injected[request] : require(path.resolve(path.dirname(filename),request));
      compiled._compile(fs.readFileSync(filename,'utf8'),filename); return compiled.exports;
    }
    await t.test('legacy close and pause winning the location lock block paid admission after committing intake',async () => {
      for(const action of ['closeQueueDay','pauseQueueDay']) {
        await reset(); await legacyPayment(); let signal; const locked=new Promise(resolve=>{signal=resolve;}); let release; const unblock=new Promise(resolve=>{release=resolve;});
        const lifecycle=legacyLifecycle({pool,withTransaction:callback=>withTransaction(client=>callback({query:async (...args)=>{
          const result=await client.query(...args); if(String(args[0]).includes('FROM store_locations') && String(args[0]).includes('FOR NO KEY UPDATE')) {signal(); await unblock;} return result;
        }}))});
        const operation=lifecycle[action](tenant,{location:{...location,queueLifecycleMode:'legacy'},actorUserId:'1'}); operation.catch(()=>{}); let pending;
        try {
          await Promise.race([locked,operation.then(()=>{throw new Error('lifecycle finished without location lock');})]);
          pending=paid(); pending.catch(()=>{}); await waitForLocationLock(); release(); await operation; await pending;
          assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'refund_pending');
          assert.equal(await count('tickets'),0); assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'released');
        } finally {release(); await operation.catch(()=>{}); if(pending) await pending.catch(()=>{});}
      }
    });
    await t.test('legacy close and pause wait for paid issuance and then observe its committed ticket',async () => {
      for(const action of ['closeQueueDay','pauseQueueDay']) {
        await reset(); await legacyPayment(); let reached; const inserted=new Promise(resolve=>{reached=resolve;}); let release; const unblock=new Promise(resolve=>{release=resolve;});
        paidEventBarrier={reached,release:unblock}; const pending=paid(); pending.catch(()=>{}); let operation;
        try {
          await Promise.race([inserted,pending.then(()=>{throw new Error('paid event barrier missing');})]);
          const lifecycle=legacyLifecycle({pool,withTransaction});
          operation=lifecycle[action](tenant,{location:{...location,queueLifecycleMode:'legacy'},actorUserId:'1'}); operation.catch(()=>{});
          await waitForLocationLock(); release(); await pending; await operation;
          assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,'issued');
          const row=(await pool.query('SELECT * FROM tickets')).rows[0]; assert.equal(row.status,'waiting');
          if(action==='closeQueueDay') assert.equal(row.carry_over_count,1);
          else assert.equal((await pool.query("SELECT metadata FROM events WHERE event_type='queue_paused'")).rows[0].metadata.waitingCount,1);
        } finally {release(); await pending.catch(()=>{}); if(operation) await operation.catch(()=>{}); paidEventBarrier=null;}
      }
    });
    await t.test('manual legacy pause resume close and reopen commit events and revisions together',async () => {
      await reset();await ticket('1');await ticket('2');await pool.query("UPDATE tickets SET date_key=to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','YYYYMMDD'),status=CASE WHEN id=2 THEN 'waiting' ELSE 'called' END"); const lifecycle=legacyLifecycle({pool,withTransaction});
      for(const [index,action] of ['pauseQueueDay','resumeQueueDay','closeQueueDay','reopenQueueDay'].entries()) {
        await lifecycle[action](tenant,{location:{...location,queueLifecycleMode:'legacy'},actorUserId:'1'});
        assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,String(index+2));
      }
      assert.deepEqual((await pool.query('SELECT status,carry_over_count FROM tickets ORDER BY id')).rows,[{status:'waiting',carry_over_count:0},{status:'waiting',carry_over_count:0}]);assert.equal(await count('events'),8);assert.deepEqual((await pool.query('SELECT paused,closed FROM intake_state')).rows[0],{paused:false,closed:false});
      await assert.rejects(lifecycle.resumeQueueDay(tenant,{location,actorUserId:'1'}),{statusCode:404});
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'5');assert.equal(await count('events'),8);
    });
    await t.test('legacy intake denies revoked actors inactive scope wrong branch and missing assignment under the lock',async () => {
      for(const sql of ["UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=1", "UPDATE users SET deletion_requested_at=clock_timestamp() WHERE id=1",
        "UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1", "UPDATE store_locations SET is_active=FALSE WHERE id=10", "UPDATE tenants SET is_active=FALSE WHERE id=1"]) {
        await reset();await pool.query(sql);const lifecycle=legacyLifecycle({pool,withTransaction});
        for(const action of ['closeQueueDay','pauseQueueDay','resumeQueueDay','reopenQueueDay']) await assert.rejects(lifecycle[action](tenant,{location,actorUserId:'1'}));
        assert.equal(await count('events'),0);assert.equal(await count('resource_ledger_scopes'),0);
      }
      await reset();const lifecycle=legacyLifecycle({pool,withTransaction});
      await assert.rejects(lifecycle.pauseQueueDay(tenant,{location,actorUserId:'2'}),{statusCode:403});
      await assert.rejects(lifecycle.pauseQueueDay(tenant,{location:{_id:'20'},actorUserId:'1'}),{statusCode:404});
      await assert.rejects(lifecycle.pauseQueueDay(tenant,{location}),{statusCode:403});
      await assert.rejects(lifecycle.pauseQueueDay(tenant,{location,actorUserId:'9007199254740993'}),{statusCode:400});
      assert.equal(await count('resource_ledger_scopes'),0);
    });
    await t.test('legacy intake accepts assigned staff and holds explicit or active counter access through commit',async () => {
      for(const kind of ['explicit','counter']) {
        await reset();await pool.query(kind==='explicit'?'INSERT INTO tenant_membership_locations VALUES(2,10)':"INSERT INTO service_counters VALUES(200,1,10,TRUE);INSERT INTO service_counter_assignments VALUES(2,200)");
        let reached;const locked=new Promise(resolve=>{reached=resolve;});let release;const unblock=new Promise(resolve=>{release=resolve;});
        const lifecycle=legacyLifecycle({pool,withTransaction:callback=>withTransaction(client=>callback({query:async(...args)=>{
          const result=await client.query(...args);if(String(args[0]).includes('INSERT INTO resource_ledger_scopes')){reached();await unblock;}return result;
        }}))});
        const pending=lifecycle.pauseQueueDay(tenant,{location,actorUserId:'2'});pending.catch(()=>{});
        try {await Promise.race([locked,pending.then(()=>{throw new Error('legacy access barrier missing');})]);
          for(const query of ['SELECT id FROM users WHERE id=2 FOR UPDATE NOWAIT','SELECT id FROM tenant_memberships WHERE id=2 FOR UPDATE NOWAIT','SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT',kind==='explicit'?'SELECT tenant_membership_id FROM tenant_membership_locations WHERE tenant_membership_id=2 FOR UPDATE NOWAIT':'SELECT user_id FROM service_counter_assignments WHERE user_id=2 FOR UPDATE NOWAIT']) await assert.rejects(pool.query(query),{code:'55P03'});
          if(kind==='counter')await assert.rejects(pool.query('SELECT id FROM service_counters WHERE id=200 FOR UPDATE NOWAIT'),{code:'55P03'});
          release();await pending;assert.equal((await pool.query('SELECT paused FROM intake_state')).rows[0].paused,true);
        } finally {release();await pending.catch(()=>{});}
      }
    });
    await t.test('legacy intake permits tenant-first grant changes to insert branch-FK assignments without a lock cycle',async () => {
      for(const action of ['pauseQueueDay','resumeQueueDay','closeQueueDay','reopenQueueDay']) {
        await reset();const lifecycle=legacyLifecycle({pool,withTransaction});
        if(action==='resumeQueueDay')await lifecycle.pauseQueueDay(tenant,{location,actorUserId:'1'});
        if(action==='reopenQueueDay')await lifecycle.closeQueueDay(tenant,{location,actorUserId:'1'});
        const before=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0]?.revision;
        const revoker=await pool.connect();let pending;
        try {
          await revoker.query('BEGIN');await revoker.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
          pending=lifecycle[action](tenant,{location,actorUserId:'1'});const denied=assert.rejects(pending,{statusCode:403});
          const deadline=Date.now()+3000;let waiting=false;
          while(Date.now()<deadline) {
            waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT is_active FROM tenants%'",[schema])).rows.length>0;
            if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(waiting,true,'legacy intake must wait for current tenant grant state');
          await revoker.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
          await revoker.query("SET LOCAL lock_timeout='2s'");
          await revoker.query('INSERT INTO tenant_membership_locations VALUES(1,10)');
          await revoker.query('COMMIT');await denied;
        } finally {await revoker.query('ROLLBACK');revoker.release();if(pending)await pending.catch(()=>{});}
        assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0]?.revision,before);
      }
    });
    await t.test('legacy intake rechecks committed access and mode changes after waiting for the location lock',async () => {
      for(const sql of ["DELETE FROM tenant_membership_locations WHERE tenant_membership_id=2", "UPDATE tenant_memberships SET is_active=FALSE WHERE id=2", "UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10"]) {
        await reset();await pool.query('INSERT INTO tenant_membership_locations VALUES(2,10)');const blocker=await pool.connect();let pending;
        try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          const lifecycle=legacyLifecycle({pool,withTransaction});pending=lifecycle.pauseQueueDay(tenant,{location,actorUserId:'2'});pending.catch(()=>{});await waitForLocationLock();
          await blocker.query(sql);await blocker.query('COMMIT');await assert.rejects(pending);assert.equal(await count('events'),0);assert.equal(await count('resource_ledger_scopes'),0);
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      }
    });
    await t.test('legacy reopen rejects owner demotion to assigned staff while waiting for the location lock',async () => {
      await reset();const lifecycle=legacyLifecycle({pool,withTransaction});await lifecycle.closeQueueDay(tenant,{location,actorUserId:'1'});
      await pool.query('INSERT INTO tenant_membership_locations VALUES(1,10)');const blocker=await pool.connect();let pending;
      try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
        pending=lifecycle.reopenQueueDay(tenant,{location,actorUserId:'1'});pending.catch(()=>{});await waitForLocationLock();
        await blocker.query("UPDATE tenant_memberships SET role='staff' WHERE id=1");await blocker.query('COMMIT');
        await assert.rejects(pending,{statusCode:403});assert.equal((await pool.query('SELECT closed FROM intake_state')).rows[0].closed,true);
        assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');assert.equal(await count('events'),1);
      } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
    });
    await t.test('legacy lifecycle event failure rolls intake ticket outcomes and revision back',async () => {
      for(const action of ['pauseQueueDay','resumeQueueDay','closeQueueDay','reopenQueueDay']) {
        await reset();const lifecycle=legacyLifecycle({pool,withTransaction});
        if(action==='resumeQueueDay')await lifecycle.pauseQueueDay(tenant,{location,actorUserId:'1'});
        if(action==='reopenQueueDay')await lifecycle.closeQueueDay(tenant,{location,actorUserId:'1'});
        if(action==='closeQueueDay'){await ticket('1');await pool.query("UPDATE tickets SET status='waiting',date_key=to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','YYYYMMDD')");}
        const before=(await pool.query('SELECT * FROM intake_state')).rows[0];const revision=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0]?.revision;const events=await count('events');
        failEvent=true;await assert.rejects(lifecycle[action](tenant,{location,actorUserId:'1'}),/event failed/);
        assert.deepEqual((await pool.query('SELECT * FROM intake_state')).rows[0],before);assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0]?.revision,revision);assert.equal(await count('events'),events);
        if(action==='closeQueueDay')assert.equal((await pool.query('SELECT carry_over_count FROM tickets WHERE id=1')).rows[0].carry_over_count,0);
      }
    });
    await t.test('automatic resume shares the paid location lock in both commit orderings',async () => {
      const autoTenant={...tenant,autoPauseEnabled:true,autoPauseThreshold:3,autoResumeEnabled:true,autoResumeVacancyPercent:25};
      for(const first of ['resume','paid']) {
        await reset(); await legacyPayment(); await pool.query('UPDATE intake_state SET paused=TRUE; UPDATE tenants SET auto_pause_enabled=TRUE,auto_pause_threshold=3,auto_resume_enabled=TRUE,auto_resume_vacancy_percent=25 WHERE id=1');
        let reached; const locked=new Promise(resolve=>{reached=resolve;}); let release; const unblock=new Promise(resolve=>{release=resolve;});
        const automation=legacyLifecycle({pool,withTransaction:callback=>withTransaction(client=>callback({query:async (...args)=>{
          const result=await client.query(...args); if(first==='resume' && String(args[0]).includes('FROM store_locations') && String(args[0]).includes('FOR UPDATE')) {reached(); await unblock;} return result;
        }}))},'queueAutomationHelpers');
        if(first==='paid') intakeBarrier={reached,release:unblock};
        const firstOperation=first==='resume' ? automation.maybeAutoResumeQueueDay(autoTenant,{location}) : paid(); firstOperation.catch(()=>{}); let second;
        try {
          await Promise.race([locked,firstOperation.then(()=>{throw new Error('automatic intake barrier missing');})]);
          second=first==='resume' ? paid() : automation.maybeAutoResumeQueueDay(autoTenant,{location}); second.catch(()=>{});
          await waitForLocationLock(); release(); await firstOperation; await second;
          assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,first==='resume'?'issued':'refund_pending');
          assert.equal((await pool.query('SELECT paused FROM intake_state')).rows[0].paused,false);
        } finally {release(); await firstOperation.catch(()=>{}); if(second) await second.catch(()=>{}); intakeBarrier=null;}
      }
    });
    await t.test('automatic pause reevaluates waiting count after the location lock wait',async () => {
      await reset(); await legacyPayment(); await ticket('1'); await pool.query("UPDATE tickets SET status='waiting'; UPDATE tenants SET auto_pause_enabled=TRUE,auto_pause_threshold=1 WHERE id=1");
      const blocker=await pool.connect(); await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
      const automation=legacyLifecycle({pool,withTransaction},'queueAutomationHelpers');
      const pending=automation.maybeAutoPauseQueueDay({...tenant,autoPauseEnabled:true,autoPauseThreshold:1},{location,queueDateKey:'20261008'}); pending.catch(()=>{});
      try {
        await waitForLocationLock(); await blocker.query("UPDATE tickets SET status='cancelled' WHERE id=1"); await blocker.query('COMMIT');
        assert.equal(await pending,null); assert.equal((await pool.query('SELECT paused FROM intake_state')).rows[0].paused,false);
      } finally {await blocker.query('ROLLBACK');blocker.release();await pending.catch(()=>{});}
    });
    async function automaticPolicy(threshold=1,vacancy=25) {
      await pool.query('UPDATE tenants SET auto_pause_enabled=TRUE,auto_pause_threshold=$1,auto_resume_enabled=TRUE,auto_resume_vacancy_percent=$2 WHERE id=1',[threshold,vacancy]);
    }
    async function automaticWaiting(id='1') {
      await ticket(id);await pool.query("UPDATE tickets SET status='waiting',date_key=to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','YYYYMMDD') WHERE id=$1",[id]);
    }
    function automatic(database={pool,withTransaction}) {return legacyLifecycle(database,'queueAutomationHelpers',true);}
    await t.test('automatic legacy pause and resume commit one actual pause event and revision on concurrent repeats without releasing occupancy',async () => {
      await reset();await automaticPolicy();await automaticWaiting();await ticket('2');await record('2','start');
      const before=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
      const automation=automatic();const pauses=await Promise.all([automation.maybeAutoPauseQueueDay(tenant,{location}),automation.maybeAutoPauseQueueDay(tenant,{location})]);
      assert.equal(pauses[0]._id,pauses[1]._id);assert.equal(await count('queue_day_pauses'),1);assert.equal(automaticPushes,1);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,String(Number(before)+1));
      await pool.query("UPDATE tickets SET status='cancelled' WHERE id=1");
      assert.deepEqual((await Promise.all([automation.maybeAutoResumeQueueDay(tenant,{location}),automation.maybeAutoResumeQueueDay(tenant,{location})])).sort(),[null,true]);
      assert.equal(automaticPushes,2);assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,String(Number(before)+2));
      const transitions=(await pool.query("SELECT event_type,source,metadata FROM events WHERE event_type IN ('queue_paused','queue_resumed') ORDER BY id")).rows;
      assert.deepEqual(transitions.map(r=>[r.event_type,r.source,r.metadata.pauseMode,r.metadata.waitingCount]),[['queue_paused','system','auto_threshold',1],['queue_resumed','system','auto_threshold',0]]);
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
      assert.equal(await automation.maybeAutoResumeQueueDay(tenant,{location}),null);assert.equal(automaticPushes,2);
    });
    await t.test('automatic legacy intake noops on inactive disabled invalid closed enforced or below-threshold scopes without a revision',async () => {
      for(const sql of ["UPDATE tenants SET auto_pause_enabled=FALSE", "UPDATE tenants SET is_active=FALSE", "UPDATE store_locations SET is_active=FALSE WHERE id=10", "UPDATE tenants SET auto_pause_threshold=501", "UPDATE intake_state SET closed=TRUE", "UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10", "UPDATE tenants SET auto_pause_threshold=2"]) {
        await reset();await automaticPolicy();await automaticWaiting();await pool.query(sql);const automation=automatic();
        assert.equal(await automation.maybeAutoPauseQueueDay({...tenant,autoPauseEnabled:true,autoPauseThreshold:1},{location}),null);
        assert.equal(await count('queue_day_pauses'),0);assert.equal(await count('events'),0);assert.equal(await count('resource_ledger_scopes'),0);assert.equal(automaticPushes,0);
      }
      await reset();await automaticPolicy();const automation=automatic();
      const date=require('../src/services/queueHelpers').getDateKey();const pauses=require('../src/repositories/queueDayPauses');
      await withTransaction(client=>pauses.createPause({tenantId:'1',locationId:'10',queueDateKey:date,pauseMode:'manual'},{client}));
      assert.equal(await automation.maybeAutoResumeQueueDay(tenant,{location}),null);assert.equal(await count('resource_ledger_scopes'),0);
      await assert.rejects(automation.maybeAutoPauseQueueDay(tenant,{location:{_id:'9007199254740993'}}),{statusCode:400});
    });
    await t.test('automatic intake rereads disabled threshold and activity changes after the location lock wait',async () => {
      for(const sql of ["UPDATE tenants SET auto_pause_enabled=FALSE WHERE id=1", "UPDATE tenants SET auto_pause_threshold=2 WHERE id=1", "UPDATE tenants SET is_active=FALSE WHERE id=1", "UPDATE store_locations SET is_active=FALSE WHERE id=10", "UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10"]) {
        await reset();await automaticPolicy();await automaticWaiting();const blocker=await pool.connect();let pending;
        try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending=automatic().maybeAutoPauseQueueDay({...tenant,autoPauseEnabled:true,autoPauseThreshold:1},{location});pending.catch(()=>{});await waitForLocationLock();
          await blocker.query(sql);await blocker.query('COMMIT');assert.equal(await pending,null);assert.equal(await count('queue_day_pauses'),0);assert.equal(await count('resource_ledger_scopes'),0);
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      }
      await reset();await automaticPolicy();await automaticWaiting();assert.ok(await automatic().maybeAutoPauseQueueDay({...tenant,autoPauseEnabled:false},{location}));
    });
    await t.test('automatic resume uses current vacancy and enabled policy after waiting rather than stale tenant values',async () => {
      for(const sql of ["UPDATE tenants SET auto_resume_enabled=FALSE WHERE id=1", "UPDATE tenants SET auto_resume_vacancy_percent=50 WHERE id=1"]) {
        await reset();await automaticPolicy(4,25);for(const id of ['1','2','3','4'])await automaticWaiting(id);const automation=automatic();await automation.maybeAutoPauseQueueDay(tenant,{location});
        await pool.query("UPDATE tickets SET status='cancelled' WHERE id=4");const blocker=await pool.connect();let pending;
        try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending=automation.maybeAutoResumeQueueDay({...tenant,autoPauseEnabled:true,autoPauseThreshold:4,autoResumeEnabled:true,autoResumeVacancyPercent:25},{location});pending.catch(()=>{});await waitForLocationLock();
          await blocker.query(sql);await blocker.query('COMMIT');assert.equal(await pending,null);
          assert.equal((await pool.query('SELECT resumed_at FROM queue_day_pauses')).rows[0].resumed_at,null);assert.equal(await count('events'),1);assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      }
    });
    await t.test('automatic intake holds current policy through commit and rolls pause events and revisions back on failure or caller rollback',async () => {
      for(const action of ['maybeAutoPauseQueueDay','maybeAutoResumeQueueDay']) {
        await reset();await automaticPolicy();await automaticWaiting();let reached;const locked=new Promise(resolve=>{reached=resolve;});let release;const unblock=new Promise(resolve=>{release=resolve;});
        const automation=automatic({pool,withTransaction:callback=>withTransaction(client=>callback({query:async(...args)=>{const result=await client.query(...args);if(String(args[0]).includes('INSERT INTO resource_ledger_scopes')){reached();await unblock;}return result;}}))});
        if(action==='maybeAutoResumeQueueDay'){await automatic().maybeAutoPauseQueueDay(tenant,{location});await pool.query("UPDATE tickets SET status='cancelled' WHERE id=1");}
        const pending=automation[action](tenant,{location});pending.catch(()=>{});
        try {await Promise.race([locked,pending.then(()=>{throw new Error('automatic revision barrier missing');})]);
          await assert.rejects(pool.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT'),{code:'55P03'});release();await pending;
        } finally {release();await pending.catch(()=>{});}
        await reset();await automaticPolicy();await automaticWaiting();
        if(action==='maybeAutoResumeQueueDay'){await automatic().maybeAutoPauseQueueDay(tenant,{location});await pool.query("UPDATE tickets SET status='cancelled' WHERE id=1");}
        const pauses=(await pool.query('SELECT * FROM queue_day_pauses')).rows;const revision=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0]?.revision;const events=await count('events');const pushesBefore=automaticPushes;
        failEvent=true;await assert.rejects(automatic()[action](tenant,{location}),/event failed/);assert.deepEqual((await pool.query('SELECT * FROM queue_day_pauses')).rows,pauses);assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0]?.revision,revision);assert.equal(await count('events'),events);assert.equal(automaticPushes,pushesBefore);
        failEvent=false;await assert.rejects(withTransaction(async client=>{await automatic()[action](tenant,{location,client});throw new Error('caller abort');}),/caller abort/);
        assert.deepEqual((await pool.query('SELECT * FROM queue_day_pauses')).rows,pauses);assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0]?.revision,revision);assert.equal(await count('events'),events);assert.equal(automaticPushes,pushesBefore);
      }
    });
    function carryExpiry(database={pool}) {
      const filename=path.resolve(__dirname,'../src/services/queueCarryOverExpiryService.js');const compiled=new (require('node:module').Module)(filename);
      const injected={'../config/db':database,'../repositories/queueEvents':{createLifecycleEvent:async(data,{client})=>{
        const event=(await client.query("INSERT INTO events(ticket_id,event_type,metadata,source,tenant_id,location_id,event_key) VALUES($1,$2,'{}',$3,$4,$5,$6) ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO NOTHING RETURNING id::text,event_key",[data.ticketId,data.eventType,data.source,data.tenantId,data.locationId,data.eventKey])).rows[0];
        if(failEvent)throw new Error('event failed');return event?{_id:event.id,eventKey:event.event_key}:null;
      }},'../repositories/queueNotificationOutbox':{enqueue:async(data,{client})=>{
        await client.query('INSERT INTO carry_over_outbox VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[data.idempotencyKey,data.queueEventId,data.ticketId,data.channel,JSON.stringify(data.payload)]);
        if(failCarryOverOutbox)throw new Error('outbox failed');
      }}};
      compiled.require=request=>Object.hasOwn(injected,request)?injected[request]:require(path.resolve(path.dirname(filename),request));compiled._compile(fs.readFileSync(filename,'utf8'),filename);return compiled.exports;
    }
    async function pendingCarryOver(id='1',{booking=true}={}) {
      await ticket(id,{booking});await pool.query("UPDATE tickets SET status='pending_carry_over',carry_over_expires_at=clock_timestamp()-interval '1 minute',user_id=1,notify_by_email=TRUE WHERE id=$1",[id]);
    }
    await t.test('carry-over expiry cancels frozen linked protection and commits ticket booking intents receipts and revisions once',async()=>{
      await reset();await pendingCarryOver();await pool.query('UPDATE location_resource_pools SET tracking_enabled=FALSE;DELETE FROM service_resource_requirements');
      const before=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
      assert.deepEqual((await Promise.all([carryExpiry().expirePendingCarryOvers(),carryExpiry().expirePendingCarryOvers()])).sort(),[0,1]);
      assert.equal((await readTicket('1')).status,'expired');assert.deepEqual((await pool.query('SELECT status,fulfillment_outcome_reason,refund_eligible FROM bookings')).rows[0],{status:'unfulfilled',fulfillment_outcome_reason:'carry_over_window_expired',refund_eligible:true});
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'cancelled');
      const receipt=(await pool.query("SELECT operation_key,actor_user_id,result FROM resource_ledger_commands WHERE command='cancelReservation'")).rows[0];assert.match(receipt.operation_key,/^ticket:1:reservation:[1-9]\d*:carry-over-expiry$/);assert.equal(receipt.actor_user_id,null);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,String(Number(before)+2));
      assert.deepEqual((await pool.query("SELECT tenant_id::text,location_id::text,source,event_type FROM events WHERE event_type='ticket_expired'")).rows,[{tenant_id:'1',location_id:'10',source:'system',event_type:'ticket_expired'}]);
      assert.deepEqual((await pool.query('SELECT channel FROM carry_over_outbox ORDER BY channel')).rows.map(r=>r.channel),['email','fcm','web_push']);assert.equal(await count('resource_allocations'),0);
      assert.equal(await carryExpiry().expirePendingCarryOvers(),0);assert.equal(await count('events'),1);assert.equal(await count('carry_over_outbox'),3);
      const reservationId=(await pool.query('SELECT id::text FROM resource_ledger_reservations')).rows[0].id;
      const replay=await ledger.withCarryOverExpiryTransaction({pool,tenantId:'1',locationId:'10',ticketId:'1'},async(_client,capability)=>capability.executeCommand({command:'cancelReservation',payload:{reservationId},operationKey:receipt.operation_key}));
      assert.deepEqual(replay,receipt.result);assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,String(Number(before)+2));
    });
    await t.test('carry-over expiry preserves terminal bookings and leaves service history allocation or converted protection for reconciliation',async()=>{
      for(const status of ['completed','canceled','reviewed','disputed']) {
        await reset();await pendingCarryOver();await pool.query('UPDATE bookings SET status=$1',[status]);await pool.query('UPDATE store_locations SET is_active=FALSE WHERE id=10');
        assert.equal(await carryExpiry().expirePendingCarryOvers(),1);assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,status);assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'cancelled');
      }
      for(const kind of ['service','allocation','converted']) {
        await reset();await pendingCarryOver();
        if(kind==='service')await pool.query('UPDATE tickets SET service_started_at=clock_timestamp()');
        else if(kind==='converted')await pool.query("UPDATE resource_ledger_reservations SET state='converted'");
        else {await pool.query("UPDATE tickets SET status='called'");await record('1','start');await pool.query("UPDATE tickets SET status='pending_carry_over',service_started_at=NULL");}
        const before=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;const events=await count('events');
        assert.equal(await carryExpiry().expirePendingCarryOvers(),0);assert.equal((await readTicket('1')).status,'pending_carry_over');assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,before);assert.equal(await count('events'),events);assert.equal(await count('carry_over_outbox'),0);
        if(kind==='allocation')assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
        if(kind==='converted')assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'converted');
      }
    });
    await t.test('carry-over expiry leaves captured protection with an inconsistent booking link for reconciliation',async()=>{
      await reset();await pendingCarryOver();await pool.query('UPDATE bookings SET queue_ticket_id=NULL');
      const before=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
      assert.equal(await carryExpiry().expirePendingCarryOvers(),0);assert.equal((await readTicket('1')).status,'pending_carry_over');assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');assert.equal(await count('events'),0);assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,before);
      await pool.query('UPDATE bookings SET queue_ticket_id=1');assert.equal(await carryExpiry().expirePendingCarryOvers(),1);
    });
    await t.test('carry-over expiry rereads status deadline and scope after waiting for the location lock',async()=>{
      for(const sql of ["UPDATE tickets SET status='waiting' WHERE id=1", "UPDATE tickets SET carry_over_expires_at=clock_timestamp()+interval '1 day' WHERE id=1", "INSERT INTO store_locations(id,tenant_id,is_active) VALUES(30,1,TRUE);UPDATE tickets SET location_id=30 WHERE id=1"]) {
        await reset();await pendingCarryOver('1',{booking:false});const blocker=await pool.connect();let pending;
        try {await blocker.query('BEGIN');await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');pending=carryExpiry().expirePendingCarryOvers();pending.catch(()=>{});await waitForLocationLock();
          await blocker.query(sql);await blocker.query('COMMIT');assert.equal(await pending,0);assert.equal(await count('events'),0);assert.equal(await count('carry_over_outbox'),0);assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'1');
        } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
      }
    });
    await t.test('carry-over expiry event outbox and final revision failures roll every ticket outcome and protection receipt back',async()=>{
      for(const kind of ['event','outbox','revision']) {
        await reset();await pendingCarryOver();const before=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
        const failingPool={query:(...args)=>pool.query(...args),connect:async()=>{const client=await pool.connect();return {release:()=>client.release(),query:async(...args)=>{
          if(kind==='revision'&&String(args[0]).startsWith('UPDATE resource_ledger_scopes')&&!String(args[0]).includes('RETURNING'))throw new Error('revision failed');return client.query(...args);
        }};}};
        failEvent=kind==='event';failCarryOverOutbox=kind==='outbox';await assert.rejects(carryExpiry({pool:failingPool}).expirePendingCarryOvers(),new RegExp(`${kind} failed`));
        assert.equal((await readTicket('1')).status,'pending_carry_over');assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'confirmed');assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,before);assert.equal(await count('events'),0);assert.equal(await count('carry_over_outbox'),0);assert.equal((await pool.query("SELECT count(*)::int n FROM resource_ledger_commands WHERE command='cancelReservation'")).rows[0].n,0);
        failEvent=false;failCarryOverOutbox=false;assert.equal(await carryExpiry().expirePendingCarryOvers(),1);
      }
    });
    await t.test('carry-over expiry bounds advisory batches and expires each tenant location with its own revision',async()=>{
      await reset();await pendingCarryOver('1',{booking:false});await pendingCarryOver('2',{booking:false});await pendingCarryOver('3',{booking:false});await pool.query('UPDATE tickets SET tenant_id=2,location_id=20 WHERE id=3;UPDATE ticket_service_plans SET tenant_id=2,location_id=20 WHERE ticket_id=3');
      assert.equal(await carryExpiry().expirePendingCarryOvers(2),2);assert.equal((await readTicket('3')).status,'pending_carry_over');assert.equal(await carryExpiry().expirePendingCarryOvers(),1);
      assert.deepEqual((await pool.query('SELECT tenant_id::text,location_id::text,revision::text FROM resource_ledger_scopes ORDER BY tenant_id')).rows,[{tenant_id:'1',location_id:'10',revision:'3'},{tenant_id:'2',location_id:'20',revision:'2'}]);assert.equal(await count('events'),3);assert.equal(await count('carry_over_outbox'),9);
      await reset();await pendingCarryOver('9007199254740993',{booking:false});await assert.rejects(carryExpiry().expirePendingCarryOvers(),{statusCode:400});assert.equal(await count('resource_ledger_scopes'),0);assert.equal(await count('events'),0);
    });
    await t.test('ticket-expiry capability rejects premature unrelated keys payloads commands and occupancy',async()=>{
      for(const options of [
        {command:'reserve',payload:{bookingItemId:'1'},operationKey:'ticket:1:reservation:1:carry-over-expiry'},
        {command:'allocate',payload:{ticketId:'1'},operationKey:'ticket:1:reservation:1:carry-over-expiry'},
        {command:'release',payload:{allocationId:'1',outcome:'completed'},operationKey:'ticket:1:reservation:1:carry-over-expiry'},
        {command:'cancelReservation',payload:{reservationId:'1'},operationKey:'booking:1:reservation:1:expiry:cancel'},
        {command:'cancelReservation',payload:{reservationId:'1'},operationKey:'ticket:1:reservation:1:customer-cancel'},
        {command:'cancelReservation',payload:{reservationId:'1'},operationKey:'ticket:2:reservation:1:carry-over-expiry'},
        {command:'cancelReservation',payload:{reservationId:'1'},operationKey:'ticket:1:reservation:2:carry-over-expiry'}]) {
        await reset();await pendingCarryOver();await assert.rejects(ledger.withCarryOverExpiryTransaction({pool,tenantId:'1',locationId:'10',ticketId:'1'},async(_client,capability)=>capability.executeCommand(options)),{statusCode:403});
        assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
      }
      for(const sql of [null,"UPDATE tickets SET status='expired',status_reason='carry_over_window_expired',terminal_at=clock_timestamp(),carry_over_expires_at=clock_timestamp()+interval '1 day'", "UPDATE tickets SET status='expired',status_reason='carry_over_window_expired',terminal_at=clock_timestamp(),service_started_at=clock_timestamp()", "UPDATE tickets SET status='expired',status_reason='carry_over_window_expired',terminal_at=clock_timestamp();UPDATE bookings SET queue_ticket_id=NULL"]) {
        await reset();await pendingCarryOver();if(sql)await pool.query(sql);const binding=(await pool.query('SELECT id::text FROM resource_ledger_reservations')).rows[0].id;
        await assert.rejects(ledger.withCarryOverExpiryTransaction({pool,tenantId:'1',locationId:'10',ticketId:'1'},async(_client,capability)=>capability.executeCommand({command:'cancelReservation',payload:{reservationId:binding},operationKey:`ticket:1:reservation:${binding}:carry-over-expiry`})),{statusCode:403});assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
      }
    });
    await t.test('subscription suspension and paid issuance serialize on the accepted subscription row',async () => {
      for(const first of ['suspend','paid']) {
        await reset(); await legacyPayment(); let reached; const locked=new Promise(resolve=>{reached=resolve;}); let release; const unblock=new Promise(resolve=>{release=resolve;});
        if(first==='paid') paidEventBarrier={reached,release:unblock};
        const suspend=()=>withTransaction(async client=>{await client.query('SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE'); if(first==='suspend'){reached();await unblock;} await client.query("UPDATE tenant_subscriptions SET status='suspended' WHERE id=1");});
        const operation=first==='suspend'?suspend():paid(); operation.catch(()=>{}); let second;
        try {
          await Promise.race([locked,operation.then(()=>{throw new Error('subscription barrier missing');})]);
          second=first==='suspend'?paid():suspend(); second.catch(()=>{});
          let waiting=false;
          for(let attempt=0;attempt<100;attempt++) {
            const row=await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%tenant_subscriptions%'",[schema]);
            if(row.rows.length){waiting=true;break;} await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(waiting,true); release(); await operation; await second;
          assert.equal((await realPayments.findPaymentById('1',{client:pool})).ticketIssuanceStatus,first==='paid'?'issued':'refund_pending');
          assert.equal(await count('tickets'),first==='paid'?1:0);
        } finally {release(); await operation.catch(()=>{}); if(second) await second.catch(()=>{}); paidEventBarrier=null;}
      }
    });
    await t.test('versioned legacy payments with missing IDs or unsupported versions require reconciliation',async () => {
      for(const sql of ["UPDATE queue_join_payments SET payload=payload-'locationId'", "UPDATE queue_join_payments SET metadata='{\"locationBindingVersion\":2}'"]) {
        await reset(); await legacyPayment(); await pool.query(sql); await assert.rejects(paid(),{statusCode:409});
        assert.equal(await count('tickets'),0); assert.equal(await count('resource_ledger_scopes'),0);
        assert.equal((await realPayments.findPaymentById('1',{client:pool})).status,'pending');
        assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'held');
      }
    });
    await t.test('unversioned historical payload location IDs do not become stored checkout authority',async () => {
      await reset(); await legacyPayment();
      await pool.query("UPDATE queue_join_payments SET metadata='{}',payload=payload || '{\"locationId\":\"11\"}'::jsonb");
      await paid();
      assert.equal((await pool.query('SELECT location_id FROM tickets')).rows[0].location_id,'10');
      assert.equal(await count('resource_ledger_scopes'),0);
      assert.equal(await count('events'),0); // This historical adapter remains a documented writer gap.
    });
    await t.test('legacy paid admission takes location before payment and rejects changed branch/version bindings',async () => {
      for(const sql of ["UPDATE queue_join_payments SET payload=payload || '{\"locationId\":\"11\"}'::jsonb WHERE id=1", "UPDATE queue_join_payments SET metadata='{}' WHERE id=1"]) {
        await reset(); await legacyPayment(); const blocker=await pool.connect(); let pending;
        try {
          await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending=paid(); pending.catch(()=>{}); await waitForLocationLock();
          await blocker.query('SELECT id FROM queue_join_payments WHERE id=1 FOR UPDATE NOWAIT');
          await blocker.query(sql);
          await blocker.query('COMMIT'); await assert.rejects(pending,{statusCode:409}); assert.equal(await count('tickets'),0);
          assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'held');
        } finally {await blocker.query('ROLLBACK'); blocker.release(); if(pending) await pending.catch(()=>{});}
      }
    });
    await t.test('paid admission waits for the location before payment and revalidates provider/day binding',async () => {
      for(const sql of ["UPDATE queue_join_payments SET provider_checkout_session_id='CHANGED' WHERE id=1","UPDATE queue_join_payments SET queue_day_id=998 WHERE id=1"]) {
        await reset(); await payment(); const blocker=await pool.connect(); let pending;
        try {
          await blocker.query('BEGIN'); await blocker.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          pending=paid(); pending.catch(()=>{}); await waitForLocationLock();
          // This lock must remain available while the callback waits on location.
          await blocker.query('SELECT id FROM queue_join_payments WHERE id=1 FOR UPDATE NOWAIT');
          await blocker.query(sql); await blocker.query('COMMIT'); await assert.rejects(pending,{statusCode:409});
          assert.equal(await count('tickets'),0); assert.equal((await pool.query('SELECT state FROM payment_allowance')).rows[0].state,'held');
        } finally {await blocker.query('ROLLBACK'); blocker.release(); if(pending) await pending.catch(()=>{});}
      }
    });
    assert.ok(servicePushCommitChecks.length>0);
    assert.ok(servicePushCommitChecks.every(Boolean),'push must observe committed service facts through a separate connection');
  } finally {await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end();}
});
