const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const ledger = require('../src/repositories/resourceLedger');
const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
function loadService(mocks, filename = 'ticketServiceTimingService') {
  const target = require.resolve(`../src/services/${filename}`);
  const saved = new Map();
  try {
    for (const [name,exports] of Object.entries(mocks)) {
      const id=require.resolve(path.resolve(path.dirname(target),name));
      saved.set(id,require.cache[id]); require.cache[id]={id,filename:id,loaded:true,exports};
    }
    delete require.cache[target]; return require(target);
  } finally {
    delete require.cache[target];
    for (const [id,original] of saved) { if (original) require.cache[id]=original; else delete require.cache[id]; }
  }
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
  let failEvent=false; let failBooking=false; let failReconciliation=false; let snapshots=0; let pushes=0;
  const noop=async () => {};
  async function readTicket(id,{client=pool}={}) {
    const r=(await client.query('SELECT * FROM tickets WHERE id=$1',[id])).rows[0];
    return r && {_id:String(r.id),tenantId:String(r.tenant_id),locationId:String(r.location_id),
      status:r.status,joinChannel:r.join_channel,customerConfirmedAt:r.customer_confirmed_at,
      serviceStartedAt:r.service_started_at,serviceEndedAt:r.service_ended_at,serviceOutcome:r.service_outcome,
      ticketNumber:String(r.id),dateKey:'2026-10-08',lookupCode:`LOOKUP-${r.id}`,updatedAt:r.updated_at};
  }
  try {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE TABLE users(id BIGINT PRIMARY KEY,roles TEXT[],deletion_requested_at TIMESTAMPTZ,platform_access_suspended_at TIMESTAMPTZ);
      CREATE TABLE tenants(id BIGINT PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE tenant_memberships(id BIGINT PRIMARY KEY,user_id BIGINT,tenant_id BIGINT,role TEXT,is_active BOOLEAN);
      CREATE TABLE tenant_membership_locations(tenant_membership_id BIGINT,location_id BIGINT);
      CREATE TABLE service_counters(id BIGINT,tenant_id BIGINT,location_id BIGINT,is_active BOOLEAN);
      CREATE TABLE service_counter_assignments(user_id BIGINT,counter_id BIGINT);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT,is_active BOOLEAN,service_timing_enabled BOOLEAN,UNIQUE(id,tenant_id));
      CREATE TABLE location_resource_pools(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,capacity INTEGER,revision INTEGER,tracking_enabled BOOLEAN,UNIQUE(id,tenant_id,location_id));
      CREATE TABLE service_resource_requirements(tenant_id BIGINT,location_id BIGINT,service_id BIGINT,pool_id BIGINT,units_required INTEGER,revision INTEGER);
      CREATE TABLE bookings(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,status TEXT,pending_expires_at TIMESTAMPTZ,payment_proof_object_key TEXT,queue_ticket_id BIGINT,fulfillment_outcome_reason TEXT,refund_eligible BOOLEAN,fulfillment_resolved_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
      CREATE TABLE booking_bundle_items(id BIGINT PRIMARY KEY,booking_id BIGINT,tenant_id BIGINT,location_id BIGINT,service_id BIGINT,scheduled_start_at TIMESTAMPTZ,scheduled_end_at TIMESTAMPTZ);
      CREATE TABLE tickets(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,status TEXT,join_channel TEXT,customer_confirmed_at TIMESTAMPTZ,
        service_started_at TIMESTAMPTZ,service_started_by_user_id BIGINT,service_ended_at TIMESTAMPTZ,service_ended_by_user_id BIGINT,
        service_outcome TEXT,status_reason TEXT,updated_at TIMESTAMPTZ,served_at TIMESTAMPTZ,unserved_at TIMESTAMPTZ,service_priority_band TEXT,rejoin_deadline_at TIMESTAMPTZ,UNIQUE(id,tenant_id,location_id));
      CREATE TABLE ticket_service_plans(ticket_id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,source TEXT,booking_id BIGINT,items JSONB);
      CREATE TABLE events(id BIGSERIAL PRIMARY KEY,ticket_id BIGINT,event_type TEXT,metadata JSONB);
      CREATE TABLE webhooks(event_id BIGINT);
      CREATE TABLE queue_ticket_segments(ticket_id BIGINT,ended_at TIMESTAMPTZ,segment_outcome TEXT,outcome_reason TEXT);
      CREATE TABLE queue_day_state(state TEXT);
      CREATE TABLE lifecycle_notifications(ticket_id BIGINT,status TEXT);
      CREATE TABLE booking_audit(ticket_id BIGINT,metadata JSONB)`);
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
        const r=await client.query('INSERT INTO events(ticket_id,event_type,metadata) VALUES($1,$2,$3) RETURNING id',[data.ticketId,data.eventType,JSON.stringify(data.metadata)]);
        if (failEvent) throw new Error('event failed'); return {_id:String(r.rows[0].id)};
      }},
      './developerWebhookService':{enqueueQueueEvent:async ({event},{client}) => client.query('INSERT INTO webhooks VALUES($1)',[event._id])},
      './queueService':{publishSnapshot:async () => {snapshots++; return {}; }},
      './queueAutomationHelpers':{maybeAutoResumeQueueDay:noop,maybeNotifyUpcomingTickets:noop},
      './notificationService':{notifyJourneyLifecycle:noop},
      './pushNotificationService':{notifyCustomerQueueUpdate:async () => {pushes++; }}
    };
    const service=loadService(mocks);
    const record=(id,action,actor='1',selected=location) => service.recordTicketService(tenant,id,action,{location:selected,actorUserId:actor});
    async function reset(capacity=4,enabled=true) {
      await pool.query(`TRUNCATE resource_ledger_commands,resource_allocations,resource_ledger_reservations,resource_ledger_scopes,
        ticket_service_plans,tickets,booking_bundle_items,bookings,service_resource_requirements,location_resource_pools,
        store_locations,tenant_membership_locations,service_counter_assignments,service_counters,tenant_memberships,tenants,users,events,webhooks,booking_audit,queue_ticket_segments,queue_day_state,lifecycle_notifications RESTART IDENTITY CASCADE`);
      await pool.query(`INSERT INTO users VALUES(1,'{}',NULL,NULL),(2,'{}',NULL,NULL);
        INSERT INTO tenants VALUES(1,TRUE),(2,TRUE);
        INSERT INTO tenant_memberships VALUES(1,1,1,'owner',TRUE),(2,2,1,'staff',TRUE);
        INSERT INTO store_locations VALUES(10,1,TRUE,TRUE),(20,2,TRUE,TRUE);
        INSERT INTO service_resource_requirements VALUES(1,10,1000,100,1,1);
        INSERT INTO queue_day_state VALUES('open')`);
      await pool.query('INSERT INTO location_resource_pools VALUES(100,1,10,$1,1,$2)',[capacity,enabled]);
      failEvent=false; failBooking=false; failReconciliation=false; snapshots=0; pushes=0; queueClosed=false;
      delete location.queueLifecycleMode;
    }
    async function ticket(id,{plan=true,booking=false,channel='vendor'}={}) {
      await pool.query("INSERT INTO tickets(id,tenant_id,location_id,status,join_channel) VALUES($1,1,10,'called',$2)",[id,channel]);
      const item={serviceId:'1000',durationMinutes:60,resource:{known:true,poolId:'100',poolRevision:1,requirementRevision:1,unitsRequired:1}};
      if (booking) {
        const epoch=Date.now()-60000; const start=new Date(epoch).toISOString(); const end=new Date(epoch+3600000).toISOString();
        await pool.query("INSERT INTO bookings(id,tenant_id,location_id,status,pending_expires_at,payment_proof_object_key,queue_ticket_id) VALUES(1,1,10,'confirmed',NULL,NULL,$1)",[id]);
        await pool.query('INSERT INTO booking_bundle_items VALUES(1,1,1,10,1000,$1,$2)',[start,end]);
        Object.assign(item,{bookingItemId:'1',scheduledStartAt:start,scheduledEndAt:end});
        await ledger.executeCommand({pool,tenantId:'1',locationId:'10',actorUserId:'1',operationKey:'booking:1:reserve',command:'reserve',payload:{bookingItemId:'1'}});
      }
      if (plan) await pool.query('INSERT INTO ticket_service_plans VALUES($1,1,10,$2,$3,$4)',[id,booking?'booking':'staff_selection',booking?'1':null,JSON.stringify([item])]);
    }
    require('tsx/cjs');
    let queueClosed=false;
    const queueService=loadService({...mocks,
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
        cancelWaitingTicket:async (tenantId,code,{client}) => {
          const id=code.split('-').at(-1);
          const r=await client.query("UPDATE tickets SET status='cancelled',updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND status='waiting' RETURNING id::text",[tenantId,id]);
          return r.rows[0] ? readTicket(r.rows[0].id,{client}) : null;
        }
      },
      '../repositories/queueDayClosures':{findActiveClosure:async (_tenant,_location,_date,{client}) => {
        assert.ok(client); return queueClosed ? {_id:'1'} : null;
      }},
      './queueDayLifecycleService':{
        getAuthoritativeQueueDay:async (_tenant,_location,{client}) => {
          assert.ok(client);
          const state=(await client.query('SELECT state FROM queue_day_state')).rows[0].state;
          return state==='open' ? {_id:'999',businessDate:'2026-10-08',currentClosesAt:new Date(Date.now()-1000),state} : null;
        },
        closeLockedQueueDay:async client => {
          await client.query("UPDATE queue_day_state SET state='closed'; UPDATE tickets SET status='unserved'; UPDATE bookings SET status='unfulfilled'");
          await client.query("INSERT INTO events(ticket_id,event_type,metadata) VALUES(1,'queue_day_closed','{}'); INSERT INTO lifecycle_notifications VALUES(1,'pending')");
          if(failReconciliation) throw new Error('closure failed');
        }
      },
      './queueSnapshotHelpers':{resolveLocation:async (_tenant,options) => options.location || location,buildQueueSnapshot:async () => ({current:null})},
      './queueEvents':{publish:()=>{}}
    },'queueService');
    const legacy=(status,actor='1') => queueService.updateCurrentTicketStatus(tenant,status,{location,actorUserId:actor});
    const cancelVendor=(id,actor='1',selected=location) => queueService.cancelTicket(tenant,'',{location:selected,actorUserId:actor,vendorTicketId:id});
    const count=async table => (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
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
      assert.equal((await pool.query('SELECT outcome FROM resource_allocations')).rows[0].outcome,'completed'); assert.equal(pushes,1);
      await record('1','complete'); assert.equal(await count('booking_audit'),1); assert.equal(pushes,1);
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
    });
    await t.test('overdue occupancy survives queue closure until explicit interruption',async () => {
      await reset(1); await ticket('1'); await ticket('2'); await record('1','start');
      await pool.query("UPDATE resource_allocations SET started_at=clock_timestamp()-interval '2 hours',expected_end_at=clock_timestamp()-interval '1 hour'");
      await pool.query("UPDATE tickets SET status='unserved' WHERE id=1");
      await assert.rejects(record('2','start'),{statusCode:409});
      await record('1','interrupt'); const allocation=(await pool.query('SELECT * FROM resource_allocations')).rows[0];
      assert.equal(allocation.outcome,'terminated'); assert.equal(allocation.reason,'Staff explicitly interrupted service.');
      assert.equal((await readTicket('1')).status,'unserved');
      await record('2','start'); assert.equal(await count('resource_allocations'),2);
    });
    await t.test('event and booking failures roll timing, conversion, release, receipts and revision back',async () => {
      await reset(); await ticket('1',{booking:true}); failEvent=true;
      await assert.rejects(record('1','start'),/event failed/);
      assert.equal((await readTicket('1')).serviceStartedAt,null); assert.equal(await count('resource_allocations'),0);
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'protected');
      assert.equal(await count('resource_ledger_commands'),1); assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,'2');
      failEvent=false; await record('1','start'); failBooking=true;
      const revision=(await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision;
      await assert.rejects(record('1','complete'),/booking failed/);
      assert.equal((await readTicket('1')).serviceEndedAt,null); assert.equal((await readTicket('1')).status,'called');
      assert.equal((await pool.query('SELECT released_at FROM resource_allocations')).rows[0].released_at,null);
      assert.equal((await pool.query('SELECT status FROM bookings')).rows[0].status,'confirmed');
      assert.equal(await count('resource_ledger_commands'),2); assert.equal(await count('events'),1); assert.equal(await count('webhooks'),1); assert.equal(await count('booking_audit'),0);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes')).rows[0].revision,revision); assert.equal(pushes,0);
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
  } finally {await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end();}
});
