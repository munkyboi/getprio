require('tsx/cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Pool}=require('pg');
const {createLocalResourceOperationsReader}=require('../src/services/localResourceOperationsService');
const {readLocalPoolDemoScope}=require('../src/services/localPoolDemoScope');
const adminUrl=process.env.LOCAL_POOL_READ_TEST_ADMIN_URL;

test('actual PostgreSQL local operational inventory and authorization', {skip:!adminUrl}, async t=>{
 const adminTarget=new URL(adminUrl);
 assert.equal(adminTarget.hostname,'127.0.0.1');
 assert.ok(['/postgres','/getprio_test'].includes(adminTarget.pathname));
 const name=`getprio_local_pool_demo_${randomUUID().replaceAll('-','')}`;
 const target=new URL(adminUrl);target.pathname=`/${name}`;
 const admin=new Pool({connectionString:adminUrl});let pool;
 const previous={};for(const key of ['DATABASE_URL','NODE_ENV','LOCAL_POOL_DEMO_ENABLED'])previous[key]=process.env[key];
 try{
  await admin.query(`CREATE DATABASE ${name}`);
  pool=new Pool({connectionString:target.href});
  process.env.DATABASE_URL=target.href;process.env.NODE_ENV='test';process.env.LOCAL_POOL_DEMO_ENABLED='1';
  await pool.query(`CREATE TABLE tenants(id bigint PRIMARY KEY,slug text);
   CREATE TABLE store_locations(id bigint PRIMARY KEY,tenant_id bigint,slug text,queue_lifecycle_mode text,timezone text);
   CREATE TABLE users(id bigint PRIMARY KEY,roles text[],deletion_requested_at timestamptz,platform_access_suspended_at timestamptz);
   CREATE TABLE tenant_memberships(id bigint,user_id bigint,tenant_id bigint,role text,is_active boolean);
   CREATE TABLE tenant_membership_locations(tenant_membership_id bigint,location_id bigint,user_id bigint);
   CREATE TABLE service_counters(id bigint,tenant_id bigint,location_id bigint,is_active boolean,slug text,name text);
   CREATE TABLE service_counter_assignments(user_id bigint,counter_id bigint);
   CREATE TABLE local_pool_demo_scopes(tenant_id bigint,location_id bigint,fixture_key text);
   CREATE TABLE resource_ledger_scopes(tenant_id bigint,location_id bigint,revision bigint);
   CREATE TABLE location_resource_pools(id bigint,tenant_id bigint,location_id bigint,name text,capacity int,tracking_enabled boolean,revision int);
   CREATE TABLE resource_allocations(id bigint,ticket_id bigint,tenant_id bigint,location_id bigint,pool_id bigint,units int,started_at timestamptz,expected_end_at timestamptz,released_at timestamptz);
   CREATE TABLE resource_ledger_reservations(id bigint,tenant_id bigint,location_id bigint,pool_id bigint,units int,starts_at timestamptz,ends_at timestamptz,state text);
   CREATE TABLE tickets(id bigint,tenant_id bigint,location_id bigint,ticket_number text,status text,current_queue_day_id bigint,queue_date_key text,date_key text,service_counter_id bigint,pending_carry_over_since timestamptz,service_started_at timestamptz,service_ended_at timestamptz,service_priority_band text,carry_over_count int,created_at timestamptz);
   CREATE TABLE bookings(queue_ticket_id bigint,tenant_id bigint,location_id bigint,scheduled_start_at timestamptz);
   CREATE TABLE queue_days(id bigint,tenant_id bigint,location_id bigint,business_date date,version bigint,current_closes_at timestamptz,state text);
   CREATE TABLE queue_day_closures(tenant_id bigint,location_id bigint,queue_date_key text,reopened_at timestamptz);
   CREATE TABLE ticket_service_plans(ticket_id bigint,tenant_id bigint,location_id bigint,source text,items jsonb);
   INSERT INTO tenants VALUES(1,'courts'),(2,'other');
   INSERT INTO store_locations VALUES(10,1,'main','enforced','Asia/Manila'),(20,2,'main','enforced','Asia/Manila');
   INSERT INTO users VALUES(1,ARRAY['vendor_admin'],NULL,NULL),(2,ARRAY['vendor_staff'],NULL,NULL),(3,ARRAY['vendor_admin'],NULL,NULL);
   INSERT INTO tenant_memberships VALUES(1,1,1,'owner',TRUE),(2,2,1,'staff',TRUE),(3,3,2,'owner',TRUE);
   INSERT INTO tenant_membership_locations VALUES(2,10,2);
   INSERT INTO local_pool_demo_scopes VALUES(1,10,'four-court-v1');
   INSERT INTO resource_ledger_scopes VALUES(1,10,7);
   INSERT INTO location_resource_pools VALUES(100,1,10,'Courts',4,TRUE,1);
   INSERT INTO queue_days VALUES(30,1,10,(now() AT TIME ZONE 'Asia/Manila')::date,1,now()+interval '12 hours','open');
   INSERT INTO service_counters VALUES(1,1,10,TRUE,'desk','Check-in desk');
   INSERT INTO tickets SELECT i,1,10,'T-'||i,CASE WHEN i<=4 THEN 'called' ELSE 'waiting' END,30,to_char(now() AT TIME ZONE 'Asia/Manila','YYYYMMDD'),to_char(now() AT TIME ZONE 'Asia/Manila','YYYYMMDD'),1,NULL,
    CASE WHEN i<=4 THEN now()-interval '2 hours' END,NULL,'regular',0,now()+i*interval '1 second' FROM generate_series(1,6)i;
   INSERT INTO resource_allocations SELECT i,i,1,10,100,1,now()-interval '2 hours',
    CASE WHEN i=1 THEN now()-interval '1 hour' ELSE now()+interval '1 hour' END,NULL FROM generate_series(1,4)i;
   INSERT INTO ticket_service_plans SELECT i,1,10,'staff_selection',
    '[{"serviceId":"50","serviceName":"Court rental","durationMinutes":60,"resource":{"known":true,"poolId":"100","unitsRequired":1}}]' FROM generate_series(1,6)i;`);
  const read=createLocalResourceOperationsReader({pool});const input={tenantSlug:'courts',locationSlug:'main',actorUserId:'1'};
  await t.test('four active sessions consume all capacity; overdue remains held and pending calls exclude active sessions',async()=>{
   const j=await read(input);assert.equal(j.pools[0].allocatedUnits,4);assert.equal(j.pools[0].availableUnits,0);assert.equal(j.pools[0].overdueUnits,1);
   assert.equal(j.activeSessions.length,4);assert.equal(j.called.length,0);assert.equal(j.waiting.length,2);assert.equal(j.ledgerRevision,'7');assert.equal(j.reconciliation.required,false);
   assert.equal(j.counterDispatch[0].canCallNext,true);assert.equal(j.counterDispatch[0].currentTicketId,null);
   assert.equal(j.forecastReadiness,'not_evaluated');assert.equal(j.waiting[0].plan.serviceName,'Court rental');
  });
  await t.test('dispatch advice respects unstarted call, active counter, queue deadline and future booking gate',async()=>{
   await pool.query("UPDATE tickets SET status='called' WHERE id=5");let j=await read(input);assert.equal(j.called.length,1);assert.equal(j.counterDispatch[0].blockReason,'COUNTER_OCCUPIED');
   await pool.query("UPDATE tickets SET status='waiting' WHERE id=5; UPDATE service_counters SET is_active=FALSE");j=await read(input);assert.equal(j.counterDispatch[0].blockReason,'COUNTER_INACTIVE');
   await pool.query("UPDATE service_counters SET is_active=TRUE; UPDATE queue_days SET current_closes_at=now()-interval '1 second'");j=await read(input);assert.equal(j.counterDispatch[0].blockReason,'QUEUE_DAY_CLOSED');
   await pool.query("UPDATE queue_days SET current_closes_at=now()+interval '12 hours'; INSERT INTO bookings SELECT i,1,10,now()+interval '1 hour' FROM generate_series(5,6)i");j=await read(input);assert.equal(j.counterDispatch[0].blockReason,'NO_READY_WAITING_TICKET');
   await pool.query('DELETE FROM bookings');
  });
  await t.test('released units become available while protected-now reservations are counted without converted double count',async()=>{
   await pool.query("UPDATE resource_allocations SET released_at=now() WHERE id=1; UPDATE tickets SET service_ended_at=now(),status='served' WHERE id=1; UPDATE resource_ledger_scopes SET revision=8;");
   let j=await read(input);assert.equal(j.pools[0].availableUnits,1);assert.equal(j.activeSessions.length,3);assert.equal(j.ledgerRevision,'8');
   await pool.query("INSERT INTO resource_ledger_reservations VALUES(1,1,10,100,1,now()-interval '1 minute',now()+interval '1 hour','protected'),(2,1,10,100,1,now()-interval '1 minute',now()+interval '1 hour','converted')");
   j=await read(input);assert.equal(j.pools[0].availableUnits,0);assert.equal(j.pools[0].protectedUnitsNow,1);
  });
  await t.test('missing plan remains unknown and inconsistent timing is reported for reconciliation',async()=>{
   await pool.query('DELETE FROM ticket_service_plans WHERE ticket_id=5; UPDATE tickets SET service_started_at=now() WHERE id=6');
   const j=await read(input);assert.equal(j.waiting[0].plan,null);assert.ok(j.reconciliation.issues.some(i=>i.code==='active_timing_without_allocation'));
  });
  await t.test('staff assignment, revoked membership, actor suspension and tenant boundaries are enforced',async()=>{
   await read({...input,actorUserId:'2'});
   await pool.query('DELETE FROM tenant_membership_locations');await assert.rejects(read({...input,actorUserId:'2'}),{statusCode:403});
   await assert.rejects(read({...input,actorUserId:'3'}),{statusCode:403});
   await assert.rejects(read({...input,tenantSlug:'other'}),{statusCode:404});
   await pool.query('UPDATE users SET platform_access_suspended_at=now() WHERE id=1');await assert.rejects(read(input),{statusCode:403});
   await pool.query('UPDATE users SET platform_access_suspended_at=NULL WHERE id=1; UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');await assert.rejects(read(input),{statusCode:403});
   await pool.query('UPDATE tenant_memberships SET is_active=TRUE WHERE id=1');
  });
  await t.test('fresh authorization detects revocation after initial inventory snapshot and all work is read-only',async()=>{
   let commits=0;
   const wrapper={connect:async()=>{
    const c=await pool.connect();return{release:()=>c.release(),query:async(sql,args)=>{
     if(sql==='COMMIT'&&++commits===1)await pool.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');
     if(sql.includes('FROM resource_allocations'))assert.equal((await c.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
     return c.query(sql,args);
    }};
   }};
   await assert.rejects(createLocalResourceOperationsReader({pool:wrapper})(input),{statusCode:403});
   await pool.query('UPDATE tenant_memberships SET is_active=TRUE WHERE id=1');
  });
  await t.test('bounds fail closed rather than returning partial inventory; missing or wrong fixture marker does not enable scope',async()=>{
   await pool.query("INSERT INTO location_resource_pools SELECT i,1,10,'extra',4,TRUE,1 FROM generate_series(101,150)i");
   await assert.rejects(read(input),{statusCode:409});
   await pool.query("DELETE FROM location_resource_pools WHERE id>100; UPDATE local_pool_demo_scopes SET fixture_key='wrong'");
   await assert.rejects(read(input),{statusCode:404});
   await pool.query('DROP TABLE local_pool_demo_scopes');await assert.rejects(read(input),{statusCode:404});
   const c=await pool.connect();try{assert.equal(await readLocalPoolDemoScope(c,{tenantId:'1',locationId:'10'}),null);await c.query('SELECT 1');}finally{c.release();}
  });
 }finally{
  if(pool)await pool.end();await admin.query(`DROP DATABASE ${name}`);await admin.end();
  for(const[key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
