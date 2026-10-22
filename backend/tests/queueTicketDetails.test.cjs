require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Pool}=require('pg');
const {createQueueTicketDetailsService,validateBody}=require('../src/services/queueTicketDetailsService');
const databaseUrl=process.env.QUEUE_DETAILS_TEST_DATABASE_URL;

test('ticket details whitelist rejects destination, plan, state and malformed fields',()=>{
 const good={version:'a'.repeat(64),expectedStatus:'waiting',customerName:' Player ',notes:'   '};
 assert.deepEqual(validateBody(good),{customerName:'Player',notes:null});
 for(const body of [null,[],{...good,customerEmail:'other@example.invalid'},{...good,serviceId:'1'},
  {...good,status:'served'},{...good,quantity:2},{...good,customerName:' '},{...good,customerName:'x'.repeat(121)},
  {...good,notes:'x'.repeat(1001)},{...good,notes:{}},{...good,version:'bad'},{...good,expectedStatus:'served'}]){
  assert.throws(()=>validateBody(body),{statusCode:400});
 }
});

test('details reject unsafe audit identifiers before any database access',async()=>{
 const service=createQueueTicketDetailsService({pool:{connect(){assert.fail('unsafe IDs must not connect');}}});
 await assert.rejects(service.get({_id:'1'},{_id:'10'},'1','9007199254740993'),{statusCode:400});
 await assert.rejects(service.get({_id:'9007199254740993'},{_id:'10'},'1','1'),{statusCode:400});
});

test('actual PostgreSQL atomic ticket-detail editing', {skip:!databaseUrl},async t=>{
 const url=new URL(databaseUrl);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/getprio_test');
 const schema=`details_${randomUUID().replaceAll('-','')}`;
 const admin=new Pool({connectionString:databaseUrl});
 const pool=new Pool({connectionString:databaseUrl,options:`-c search_path=${schema},public -c timezone=UTC`,max:8});
 const service=createQueueTicketDetailsService({pool}),tenant={_id:'1'},location={_id:'10'};
 const get=(id='1',actor='1',loc=location)=>service.get(tenant,loc,actor,id);
 const patch=(body,id='1',actor='1',loc=location)=>service.patch(tenant,loc,actor,id,body);
 const body=j=>({version:j.ticket.version,expectedStatus:j.ticket.status,customerName:'Updated player',notes:'Updated notes'});
 const reset=async()=>pool.query(`UPDATE tickets SET status='waiting',customer_name='Player',notes=NULL,
  service_started_at=NULL,service_ended_at=NULL,service_outcome=NULL,updated_at='2026-10-15T00:00:00.123001Z' WHERE id=1;
  DELETE FROM resource_allocations;DELETE FROM queue_events;
  UPDATE users SET platform_access_suspended_at=NULL; UPDATE tenant_memberships SET is_active=TRUE;
  UPDATE queue_days SET state='open',current_closes_at=now()+interval '12 hours';DELETE FROM queue_day_closures;`);
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(`CREATE TABLE tenants(id bigint PRIMARY KEY,is_active boolean);
   CREATE TABLE store_locations(id bigint PRIMARY KEY,tenant_id bigint,queue_lifecycle_mode text,timezone text,is_active boolean);
   CREATE TABLE users(id bigint PRIMARY KEY,roles text[],deletion_requested_at timestamptz,platform_access_suspended_at timestamptz);
   CREATE TABLE tenant_memberships(id bigint,user_id bigint,tenant_id bigint,role text,is_active boolean);
   CREATE TABLE tenant_membership_locations(tenant_membership_id bigint,location_id bigint,user_id bigint);
   CREATE TABLE service_counters(id bigint,tenant_id bigint,location_id bigint,is_active boolean);
   CREATE TABLE service_counter_assignments(user_id bigint,counter_id bigint);
   CREATE TABLE resource_ledger_scopes(tenant_id bigint,location_id bigint,revision bigint DEFAULT 1,PRIMARY KEY(tenant_id,location_id));
   CREATE TABLE resource_allocations(id bigint,ticket_id bigint,tenant_id bigint,location_id bigint,released_at timestamptz);
   CREATE TABLE queue_days(id bigint,tenant_id bigint,location_id bigint,business_date date,state text,current_closes_at timestamptz);
   CREATE TABLE queue_day_closures(tenant_id bigint,location_id bigint,queue_date_key text,reopened_at timestamptz);
   CREATE TABLE tickets(id bigint PRIMARY KEY,tenant_id bigint,location_id bigint,ticket_number text,status text,
    customer_name text,notes text,customer_email text,customer_phone text,date_key text,current_queue_day_id bigint,
    service_started_at timestamptz,service_ended_at timestamptz,service_outcome text,updated_at timestamptz,
    sequence int,lookup_code text,service_counter_id bigint,notify_by_email boolean,notify_by_sms boolean);
   CREATE TABLE ticket_service_plans(ticket_id bigint,tenant_id bigint,location_id bigint,items jsonb);
   CREATE TABLE queue_events(id bigserial,ticket_id bigint,tenant_id bigint,location_id bigint,queue_date_key text,
    event_type text,from_status text,to_status text,actor_user_id bigint,actor_role text,source text,metadata jsonb,
    queue_day_id bigint,event_key text,correlation_key text,reason_code text,deadline_version int,
    previous_state jsonb,next_state jsonb,staff_note text,created_at timestamptz DEFAULT now());
   INSERT INTO tenants VALUES(1,TRUE),(2,TRUE);
   INSERT INTO store_locations VALUES(10,1,'enforced','Asia/Manila',TRUE),(11,1,'enforced','Asia/Manila',TRUE),(20,2,'enforced','Asia/Manila',TRUE);
   INSERT INTO users VALUES(1,ARRAY['vendor_admin'],NULL,NULL),(2,ARRAY['vendor_staff'],NULL,NULL),(3,ARRAY['vendor_admin'],NULL,NULL);
   INSERT INTO tenant_memberships VALUES(1,1,1,'owner',TRUE),(2,2,1,'staff',TRUE),(3,3,2,'owner',TRUE);
   INSERT INTO tenant_membership_locations VALUES(2,10,2);
   INSERT INTO queue_days VALUES(30,1,10,(now() AT TIME ZONE 'Asia/Manila')::date,'open',now()+interval '12 hours');
   INSERT INTO tickets VALUES(1,1,10,'VD001','waiting','Player',NULL,'contact@example.invalid','+639000000001',
    to_char(now() AT TIME ZONE 'Asia/Manila','YYYYMMDD'),30,NULL,NULL,NULL,'2026-10-15T00:00:00.123001Z',1,'ABC12345',1,TRUE,FALSE);
   INSERT INTO ticket_service_plans VALUES(1,1,10,'[{"serviceName":"Court rental","resource":{"poolId":"1","unitsRequired":1}}]');`);
  await t.test('GET is read-only and returns opaque exact-precision version plus read-only destination/service',async()=>{
   const j=await get();assert.match(j.ticket.version,/^[a-f0-9]{64}$/);assert.equal(j.ticket.customerEmail,'contact@example.invalid');
   assert.equal(j.ticket.serviceName,'Court rental');assert.deepEqual(j.editableFields,['customerName','notes']);
   assert.equal((await pool.query('SELECT count(*)::int n FROM resource_ledger_scopes')).rows[0].n,0);
  });
  await t.test('waiting and called edits persist only allowed fields and PII-free audit/revision atomically',async()=>{
   for(const status of ['waiting','called']){
    await reset();await pool.query('UPDATE tickets SET status=$1 WHERE id=1',[status]);const before=(await pool.query('SELECT * FROM tickets WHERE id=1')).rows[0];
    const planBefore=(await pool.query('SELECT * FROM ticket_service_plans')).rows;
    const j=await get();const saved=await patch({...body(j),customerName:'  Updated player ',notes:' Updated notes '});assert.equal(saved.ticket.customerName,'Updated player');
    assert.notEqual(saved.ticket.version,j.ticket.version);const after=(await pool.query('SELECT * FROM tickets WHERE id=1')).rows[0];
    for(const key of ['customer_name','notes','updated_at']){delete before[key];delete after[key];}assert.deepEqual(after,before);
    assert.deepEqual((await pool.query('SELECT * FROM ticket_service_plans')).rows,planBefore);
    const event=(await pool.query('SELECT metadata,event_type,from_status,to_status FROM queue_events')).rows[0];
    assert.deepEqual(event.metadata,{changedFields:['customerName','notes']});assert.equal(event.event_type,'ticket_details_updated');assert.equal(event.from_status,event.to_status);
   }
  });
  await t.test('microsecond stale version, changed status and competing saves cannot overwrite newer work',async()=>{
   await reset();let j=await get();await pool.query("UPDATE tickets SET updated_at='2026-10-15T00:00:00.123002Z' WHERE id=1");
   await assert.rejects(patch(body(j)),{statusCode:409,code:'TICKET_DETAILS_CHANGED'});
   j=await get();await pool.query("UPDATE tickets SET status='called' WHERE id=1");await assert.rejects(patch(body(j)),{code:'TICKET_DETAILS_CHANGED'});
   j=await get();const results=await Promise.allSettled([patch(body(j)),patch({...body(j),customerName:'Other edit'})]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='TICKET_DETAILS_CHANGED').length,1);
   assert.equal((await pool.query('SELECT count(*)::int n FROM queue_events')).rows[0].n,1);
  });
  await t.test('started, allocated and terminal tickets cannot expose an editable form or accept saves',async()=>{
   for(const sql of ["UPDATE tickets SET service_started_at=now() WHERE id=1", "UPDATE tickets SET service_ended_at=now(),service_outcome='completed' WHERE id=1", "INSERT INTO resource_allocations VALUES(1,1,1,10,NULL)", "UPDATE tickets SET status='served' WHERE id=1"]){
    await reset();const j=await get();await pool.query(sql);await assert.rejects(get(),{code:'TICKET_NOT_EDITABLE'});await assert.rejects(patch(body(j)),{code:'TICKET_NOT_EDITABLE'});
    assert.equal((await pool.query('SELECT customer_name FROM tickets WHERE id=1')).rows[0].customer_name,'Player');
   }
  });
  await t.test('scope, staff assignment, suspended/revoked actor and closed Queue Day reject without edits',async()=>{
   await reset();await get('1','2');const j=await get();await assert.rejects(get('1','3'),{statusCode:403});
   await assert.rejects(get('1','1',{_id:'11'}),{statusCode:404});
   await pool.query('DELETE FROM tenant_membership_locations');await assert.rejects(patch(body(j),'1','2'),{statusCode:403});
   await pool.query('UPDATE users SET platform_access_suspended_at=now() WHERE id=1');await assert.rejects(patch(body(j)),{statusCode:403});
   await reset();await pool.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');await assert.rejects(patch(body(j)),{statusCode:403});
   await reset();await pool.query("UPDATE queue_days SET current_closes_at=now()-interval '1 second'");await assert.rejects(patch(body(j)),{code:'TICKET_NOT_EDITABLE'});
  });
  await t.test('an edit waiting behind a start sees the committed allocation and aborts; actor is rechecked after lock wait',async()=>{
   await reset();let j=await get();const holder=await pool.connect();await holder.query('BEGIN');await holder.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
   const result=patch(body(j));const observed=result.catch(e=>e);await holder.query("UPDATE tickets SET service_started_at=now(),status='called' WHERE id=1; INSERT INTO resource_allocations VALUES(1,1,1,10,NULL)");await holder.query('COMMIT');holder.release();
   assert.equal((await observed).code,'TICKET_NOT_EDITABLE');
   await reset();j=await get();const gate=await pool.connect();await gate.query('BEGIN');await gate.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
   const denied=patch(body(j)).catch(e=>e);await gate.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');await gate.query('COMMIT');gate.release();assert.equal((await denied).statusCode,403);
  });
  await t.test('audit failure rolls back details and revision; no-op does not manufacture event/version',async()=>{
   await reset();const j=await get();const revision=(await pool.query('SELECT revision::text FROM resource_ledger_scopes WHERE tenant_id=1 AND location_id=10')).rows[0].revision;
   await pool.query("CREATE FUNCTION fail_event() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'audit unavailable'; END$$; CREATE TRIGGER reject_event BEFORE INSERT ON queue_events FOR EACH ROW EXECUTE FUNCTION fail_event()");
   await assert.rejects(patch(body(j)),/audit unavailable/);assert.equal((await get()).ticket.version,j.ticket.version);assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes WHERE tenant_id=1 AND location_id=10')).rows[0].revision,revision);
   await pool.query('DROP TRIGGER reject_event ON queue_events');const unchanged=await patch({...body(j),customerName:'Player',notes:null});assert.equal(unchanged.ticket.version,j.ticket.version);assert.equal((await pool.query('SELECT count(*)::int n FROM queue_events')).rows[0].n,0);
  });
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
