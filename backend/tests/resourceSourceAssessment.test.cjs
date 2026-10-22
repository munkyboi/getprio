const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createResourceSourceAssessment } = require('../src/services/resourceSourceAssessment');
const { buildSourceAssessmentResponse } = require('../src/services/resourceSourceAssessmentAnalysis');
const { buildResourceInventoryReport } = require('../src/services/resourceInventoryReportAnalysis');
const { COLLECTIONS } = require('../src/services/resourceInventoryReportQueries');
const { createResourceInventoryReconciliationReport } = require('../src/services/resourceInventoryReconciliationReport');
const tickets = require('../src/repositories/tickets');
const dispatch = require('../src/services/counterDispatchService');
const { withScopeTransaction } = require('../src/repositories/resourceLedger');
function pureFixture() {
  const data = Object.fromEntries(Object.keys(COLLECTIONS).map(key => [key,[]]));
  data.dispatchScope=[{date_key:'20261012',queue_lifecycle_mode:'legacy',tenant_active:true,location_active:true,queue_open:true}];
  data.counters=[{id:'1',is_active:true}];
  const counts=Object.fromEntries([...Object.keys(COLLECTIONS),'historicalTickets','servedWithoutExplicitStart','startedWithoutCapturedPlan','convertedWithoutAllocation','bookingParentsWithoutItems'].map(key => [key,'0']));
  const input={ reportVersion:'resource-inventory-reconciliation-report-v1',scope:{tenantId:'1',locationId:'10',queueKind:'location',sourceBinding:'test'},
    window:{from:'2026-10-12T00:00:00Z',to:'2026-10-12T02:00:00Z'}, observedAt:'2026-10-12T01:00:00Z',ledger:{revision:'1',writer_coverage_complete:false},counts,data,exceeded:[],bounds:{} };
  return {data,input,read:()=>buildSourceAssessmentResponse(buildResourceInventoryReport(input),data)};
}
test('unknown and unsupported captured plans remain counted with null watermarks and sanitized evidence',()=>{
  const f=pureFixture();
  f.data.pools=[{id:'100',revision:'1',capacity:4,tracking_enabled:false}];
  f.data.requirements=[{service_id:'1000',pool_id:'100',units_required:1,revision:'1'}];
  const item={serviceId:'1000',durationMinutes:60,resource:{known:true,poolId:'100',poolRevision:1,requirementRevision:1,unitsRequired:1}};
  f.data.work=[{id:'1',status:'waiting',join_channel:'vendor',sql_candidate:true,date_key:'20261012',created_at_us:'1791766800000001',order_group:'1',tie_count:'2'},
    {id:'2',status:'waiting',join_channel:'vendor',plan_source:'staff_selection',execution_mode:'parallel',items:[item,{...item,resource:{...item.resource,poolId:'200'}}],customer_name:'PRIVATE'},
    {id:'3',status:'called',join_channel:'vendor',service_counter_id:'99',plan_source:'staff_selection',execution_mode:'unknown',items:[item]},
    {id:'4',status:'skipped',join_channel:'vendor',recovery_available:null,plan_source:'staff_selection',execution_mode:'parallel',items:[{...item,durationMinutes:481,resource:{...item.resource,unitsRequired:101}}]},
    {id:'5',status:'pending_carry_over',join_channel:'vendor',plan_source:'booking',booking_id:'7',execution_mode:'parallel',items:[{...item,resource:{...item.resource,poolRevision:2}}]}];
  const result=f.read(),assessment=result.sourceAssessment;
  assert.equal(result.readiness,'not_ready');assert.equal(result.snapshot,null);assert.equal(assessment.work.length,5);
  assert.equal(assessment.work[0].orderEvidence.authoritativeOrderKey,null);
  assert.ok(assessment.work[0].orderEvidence.gaps.includes('equal_dispatch_sort_values'));
  assert.ok(assessment.work[0].planEvidence.supportReasons.includes('missing_captured_plan'));
  assert.ok(assessment.work[1].planEvidence.supportReasons.includes('unsupported_composition'));
  assert.ok(assessment.work[2].planEvidence.supportReasons.includes('unsupported_execution_mode'));
  assert.ok(assessment.work[3].planEvidence.supportReasons.includes('unknown_executable_demand'));
  assert.ok(assessment.work[4].planEvidence.supportReasons.includes('stale_plan_mapping'));
  assert.equal(assessment.work[3].recoveryDeadlineOpenAtObservation,null);assert.equal(assessment.work[4].pendingCarryOver,true);
  assert.equal(assessment.provenance.configurationWatermark,null);assert.equal(assessment.provenance.planWatermarks,null);
  assert.equal(assessment.dispatch.lanes.find(l=>l.counterRef==='counter:1:10:99').active,null);
  assert.equal(assessment.dispatch.enforcedQueueDayRef,null);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('ambiguous or inferred active segments cannot create authoritative order and observed failures stay null',()=>{
  const f=pureFixture();f.data.work=[{id:'1',status:'waiting',join_channel:'vendor',current_queue_day_id:'1'}];
  f.data.segments=[{id:'1',ticket_id:'1',queue_day_id:'1',legacy_inferred:false},{id:'2',ticket_id:'1',queue_day_id:'2',legacy_inferred:false}];
  assert.ok(f.read().sourceAssessment.work[0].orderEvidence.gaps.includes('ambiguous_active_segment'));
  f.data.segments.pop();f.data.segments[0].legacy_inferred=true;
  assert.ok(f.read().sourceAssessment.work[0].orderEvidence.gaps.includes('legacy_segment_inferred_or_unknown'));
  f.input.exceeded=['work'];f.input.counts.work='10001';
  const limited=f.read();assert.equal(limited.sourceAssessment,null);assert.equal(limited.reportEvidence.counts.work,'10001');
});
test('an observed coverage flag never substitutes for proven writer guarantees or activates readiness',()=>{
  const f=pureFixture();f.input.ledger.writer_coverage_complete=true;
  const result=f.read();assert.equal(result.reportEvidence.revisionEvidence.writerCoverageComplete,true);
  assert.ok(result.sourceAssessment.provenance.gaps.includes('writer_guarantees_unproven'));
  assert.ok(!result.sourceAssessment.provenance.gaps.includes('writer_coverage_incomplete'));
  assert.equal(result.readiness,'not_ready');assert.equal(result.snapshot,null);
});
test('shared dispatch SQL rejects unrecognized interpolation aliases',()=>{
  const rules=require('../src/services/queueDispatchRules');
  assert.throws(()=>rules.bookingCallNotReady('tickets; SELECT 1'),/alias/);
  assert.throws(()=>rules.waitingPriorityOrder('unknown.'),/alias/);
  assert.throws(()=>rules.priorityBandRank('unknown.'),/alias/);
});
test('request selectors cannot assert assessment mode, provenance or completeness',async()=>{
  const read=createResourceSourceAssessment({pool:{connect:()=>assert.fail('connect')},sourceBinding:'server',authorize:async()=>true,includeSourceAssessment:false});
  const input={tenantId:'1',locationId:'10',windowFrom:'2026-10-12T00:00:00Z',windowTo:'2026-10-12T02:00:00Z'};
  for (const extra of [{sourceBinding:'client'},{includeSourceAssessment:true},{complete:true}]) await assert.rejects(read({...input,...extra}),/scope/);
});
const databaseUrl=process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
test('PostgreSQL source assessment agrees with dispatch and stays coherent bounded and authorized',{skip:!databaseUrl},async t=>{
  const url=new URL(databaseUrl);assert.equal(url.hostname,'127.0.0.1');assert.ok(['/getprio_test','/getprio_ledger_test'].includes(url.pathname));
  const {Pool}=require('pg'),schema=`source_${randomUUID().replaceAll('-','')}`;
  const pool=new Pool({connectionString:databaseUrl,options:`-c search_path=${schema}`,max:6});
  try {
    const init=fs.readFileSync(path.resolve(__dirname,'../../database/init.sql'),'utf8');
    const ticketTable=init.match(/CREATE TABLE tickets \([\s\S]*?\n\);/)[0]
      .replace(/ REFERENCES \w+\(id\) ON DELETE (?:CASCADE|SET NULL)/g,'')
      .replace(/status TEXT NOT NULL DEFAULT 'waiting' CHECK \([\s\S]*?\),/,"status TEXT NOT NULL DEFAULT 'waiting',")
      .replace(/  CHECK \(\n    status IN \([\s\S]*?\n  \),/,'');
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN NEW.updated_at=now(); RETURN NEW; END';
      CREATE TABLE users(id BIGINT PRIMARY KEY,display_name TEXT);
      CREATE TABLE tenants(id BIGINT PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT,queue_lifecycle_mode TEXT DEFAULT 'legacy',timezone TEXT DEFAULT 'Asia/Manila',is_active BOOLEAN DEFAULT TRUE,UNIQUE(id,tenant_id));
      CREATE TABLE vendor_services(id BIGINT PRIMARY KEY,tenant_id BIGINT,UNIQUE(id,tenant_id));
      CREATE TABLE location_services(location_id BIGINT,service_id BIGINT,UNIQUE(location_id,service_id));
      CREATE TABLE bookings(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,status TEXT,pending_expires_at TIMESTAMPTZ,payment_proof_object_key TEXT,
        scheduled_start_at TIMESTAMPTZ,scheduled_end_at TIMESTAMPTZ,queue_ticket_id BIGINT,reference TEXT,execution_mode TEXT);
      CREATE TABLE booking_bundle_items(id BIGINT PRIMARY KEY,booking_id BIGINT,tenant_id BIGINT,location_id BIGINT,service_id BIGINT,
        booking_quantity INTEGER DEFAULT 1,scheduled_start_at TIMESTAMPTZ,scheduled_end_at TIMESTAMPTZ,sort_order INT);
      ${ticketTable}
      ALTER TABLE tickets ADD UNIQUE(id,tenant_id,location_id);
      ALTER TABLE tickets ADD queue_date_key TEXT,ADD original_queue_day_id BIGINT,ADD current_queue_day_id BIGINT,ADD status_reason TEXT,
        ADD pending_carry_over_since TIMESTAMPTZ,ADD carry_over_expires_at TIMESTAMPTZ,ADD carry_over_consumed BOOLEAN,ADD terminal_at TIMESTAMPTZ,ADD replacement_for_ticket_id BIGINT,ADD email_journey_mode TEXT;
      CREATE TABLE ticket_service_plans(ticket_id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,booking_id BIGINT,source TEXT,execution_mode TEXT,contract_version INTEGER,items JSONB,created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE queue_days(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,business_date DATE,state TEXT,intake_mode TEXT,version BIGINT,deadline_version BIGINT,
        last_reconciled_at TIMESTAMPTZ,last_reconciliation_error TEXT,current_closes_at TIMESTAMPTZ);
      CREATE TABLE queue_ticket_segments(id BIGINT PRIMARY KEY,ticket_id BIGINT,queue_day_id BIGINT,sequence INTEGER,priority_band TEXT,activated_at TIMESTAMPTZ,ended_at TIMESTAMPTZ,legacy_inferred BOOLEAN);
      CREATE TABLE queue_day_closures(tenant_id BIGINT,location_id BIGINT,queue_date_key TEXT,reopened_at TIMESTAMPTZ);
      CREATE TABLE service_counters(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,is_active BOOLEAN);
      CREATE TABLE grants(tenant_id BIGINT,location_id BIGINT,allowed BOOLEAN);
      INSERT INTO users VALUES(1,NULL);INSERT INTO tenants VALUES(1,TRUE),(2,TRUE);
      INSERT INTO store_locations(id,tenant_id) VALUES(10,1),(20,2);
      INSERT INTO vendor_services VALUES(1000,1),(2000,2);INSERT INTO location_services VALUES(10,1000),(20,2000);
      INSERT INTO grants VALUES(1,10,TRUE);INSERT INTO service_counters VALUES(1,1,10,TRUE),(2,1,10,TRUE),(3,1,10,FALSE),(4,2,20,TRUE);`);
    for(const migration of ['20261003_add_resource_capacity_foundation.sql','20261007_add_resource_ledger_foundation.sql']) await pool.query(fs.readFileSync(path.resolve(__dirname,'../../database/migrations',migration),'utf8'));
    await pool.query("INSERT INTO location_resource_pools(id,tenant_id,location_id,name,capacity) VALUES(100,1,10,'PRIVATE',4); INSERT INTO service_resource_requirements(tenant_id,location_id,service_id,pool_id,units_required) VALUES(1,10,1000,100,1); INSERT INTO resource_ledger_scopes(tenant_id,location_id) VALUES(1,10)");
    const authorize=async(client,scope)=> (await client.query('SELECT allowed FROM grants WHERE tenant_id=$1 AND location_id=$2',[scope.tenantId,scope.locationId])).rows[0]?.allowed===true;
    const input=()=>({tenantId:'1',locationId:'10',windowFrom:new Date(Date.now()-60000).toISOString(),windowTo:new Date(Date.now()+3600000).toISOString()});
    const read=(config={})=>createResourceSourceAssessment({pool,sourceBinding:'test',authorize,...config});
    const date=async()=> (await pool.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','YYYYMMDD') AS date")).rows[0].date;
    const reset=async()=>{await pool.query('TRUNCATE tickets,bookings,ticket_service_plans,resource_allocations,resource_ledger_reservations,queue_days,queue_ticket_segments,queue_day_closures');await pool.query("UPDATE grants SET allowed=TRUE;UPDATE tenants SET is_active=TRUE;UPDATE store_locations SET is_active=TRUE,queue_lifecycle_mode='legacy'");};
    const ticket=async(id,band='normal',count=0)=>pool.query(`INSERT INTO tickets(id,tenant_id,location_id,ticket_number,sequence,date_key,lookup_code,customer_name,join_channel,service_priority_band,carry_over_count,created_at)
      VALUES($1::bigint,1,10,$2,$1::int,$3,$2,'PRIVATE','vendor',$4,$5,clock_timestamp()+$1::bigint*interval '1 millisecond')`,[id,String(id).padStart(8,'0'),await date(),band,count]);
    const actualClaim=async counter=>{
      const dateKey=await date();return withScopeTransaction({pool,tenantId:'1',locationId:'10',actorUserId:'1',authorize},client=>dispatch.claimNext(client,{tenantId:'1',locationId:'10',dateKey},{serviceCounter:{_id:String(counter)}}));
    };
    await t.test('observed scheduling and priority agree with actual claim, not the waiting display',async()=>{
      await reset();await ticket('1','checked_in_booking');await ticket('2','normal');await ticket('3','carry_over',1);await ticket('4','carry_over',2);
      await pool.query("INSERT INTO bookings VALUES(1,1,10,'confirmed',NULL,NULL,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',1,'PRIVATE','parallel')");
      const result=await read()(input());const work=result.sourceAssessment.work;
      assert.equal(work.find(w=>w.workRef==='ticket:1:10:1').sqlCandidateAtObservation,false);
      assert.equal(result.sourceAssessment.dispatch.candidateCount,3);
      assert.equal(work.find(w=>w.workRef==='ticket:1:10:4').orderEvidence.relativeGroup,'1');
      assert.equal((await actualClaim(1))._id,'4');assert.equal((await actualClaim(2))._id,'3');
      assert.ok(!JSON.stringify(result).includes('PRIVATE'));
      assert.equal(result.reportEvidence.reportVersion,'resource-inventory-reconciliation-report-v1');
      const plain=await createResourceInventoryReconciliationReport({pool,sourceBinding:'test',authorize})(input());
      assert.equal(Object.hasOwn(plain,'sourceAssessment'),false);assert.equal(Object.hasOwn(plain,'assessmentVersion'),false);
    });
    await t.test('shared predicate accepts the exact observation boundary and rejects one future microsecond',async()=>{
      await reset();await ticket('1');await pool.query("INSERT INTO bookings VALUES(1,1,10,'confirmed',NULL,NULL,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',1,'PRIVATE','parallel')");
      const {bookingCallNotReady}=require('../src/services/queueDispatchRules');
      const client=await pool.connect();try{
        await client.query('BEGIN');await client.query('UPDATE bookings SET scheduled_start_at=transaction_timestamp()');
        assert.equal((await client.query(`SELECT NOT ${bookingCallNotReady('tickets',true)} AS ready FROM tickets`)).rows[0].ready,true);
        await client.query("UPDATE bookings SET scheduled_start_at=transaction_timestamp()+interval '1 microsecond'");
        assert.equal((await client.query(`SELECT NOT ${bookingCallNotReady('tickets',true)} AS ready FROM tickets`)).rows[0].ready,false);
        await client.query('COMMIT');
      }finally{await client.query('ROLLBACK');client.release();}
      assert.equal((await actualClaim(1))._id,'1');
    });
    await t.test('microsecond order is preserved and equal sort tuples stay ambiguous without ID tie-breaking',async()=>{
      await reset();for(const id of ['1','2','3'])await ticket(id);
      await pool.query("UPDATE tickets SET created_at=date_trunc('milliseconds',statement_timestamp())+interval '1 microsecond'; UPDATE tickets SET created_at=created_at+interval '1 microsecond' WHERE id=3");
      const work=(await read()(input())).sourceAssessment.work;
      assert.equal(work[0].orderEvidence.tieCount,'2');assert.equal(work[1].orderEvidence.relativeGroup,'1');
      assert.equal(work[2].orderEvidence.relativeGroup,'2');
      assert.notEqual(work[0].orderEvidence.createdAtMicroseconds,work[2].orderEvidence.createdAtMicroseconds);
      assert.ok(work.every(w=>w.orderEvidence.authoritativeOrderKey===null));
      const selected=await actualClaim(1);assert.ok(['1','2'].includes(selected._id));
    });
    await t.test('counter, legacy closure, enforced deadline and active business are separate from SQL candidacy',async()=>{
      await reset();await ticket('1');await ticket('2');await pool.query("UPDATE tickets SET status='called',service_counter_id=1,date_key='20200101' WHERE id=1");
      let evidence=(await read()(input())).sourceAssessment;
      assert.equal(evidence.dispatch.lanes[0].vacancyObserved,false);assert.equal(evidence.dispatch.lanes[1].vacancyObserved,true);
      await assert.rejects(actualClaim(1),{code:'COUNTER_OCCUPIED'});await assert.rejects(actualClaim(3),{code:'COUNTER_NOT_FOUND'});
      await pool.query("INSERT INTO queue_day_closures VALUES(1,10,$1,NULL)",[await date()]);
      evidence=(await read()(input())).sourceAssessment;assert.equal(evidence.dispatch.queueOpenAtObservation,false);assert.equal(evidence.dispatch.candidateCount,1);
      assert.ok(evidence.dispatch.lanes.every(l=>l.actorAuthorization==='not_assessed'&&l.lockTimeSelection==='not_attested'));
      await pool.query("UPDATE store_locations SET queue_lifecycle_mode='enforced'; INSERT INTO queue_days VALUES(1,1,10,current_date,'open','accepting',3,4,NULL,NULL,clock_timestamp()-interval '1 second')");
      evidence=(await read()(input())).sourceAssessment;assert.equal(evidence.dispatch.queueOpenAtObservation,false);
      await pool.query("UPDATE queue_days SET current_closes_at=clock_timestamp()+interval '1 hour';UPDATE tenants SET is_active=FALSE WHERE id=1");
      evidence=(await read()(input())).sourceAssessment;assert.equal(evidence.dispatch.queueOpenAtObservation,true);assert.equal(evidence.dispatch.tenantActive,false);
    });
    await t.test('cross-date held work and pending carry-over are retained without being reordered as current queue',async()=>{
      await reset();await ticket('1');await ticket('2');await ticket('3');
      await pool.query("UPDATE tickets SET status='called',date_key='20200101',service_started_at=clock_timestamp()-interval '1 day' WHERE id=1; UPDATE tickets SET status='pending_carry_over',date_key='20990101' WHERE id=2; UPDATE tickets SET status='skipped',date_key='20200101',rejoin_deadline_at=clock_timestamp()+interval '1 hour' WHERE id=3; INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,started_at,expected_end_at) VALUES(1,10,1,100,1,1,clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 hour')");
      const evidence=(await read()(input())).sourceAssessment;
      assert.equal(evidence.work.length,3);assert.equal(evidence.work[0].allocationHeld,true);assert.equal(evidence.work[0].timingOpen,true);
      assert.equal(evidence.work[1].pendingCarryOver,true);assert.equal(evidence.work[2].recoveryDeadlineOpenAtObservation,true);
      assert.ok(evidence.work.every(w=>!w.sqlCandidateAtObservation));assert.equal(evidence.dispatch.globalOrder,'not_attested');
    });
    await t.test('row locks can change the actual selection; observed rank never promises the next customer',async()=>{
      await reset();await ticket('1');await ticket('2');const evidence=(await read()(input())).sourceAssessment;
      assert.equal(evidence.work[0].orderEvidence.relativeGroup,'1');
      const blocker=await pool.connect();try{await blocker.query('BEGIN');await blocker.query('SELECT id FROM tickets WHERE id=1 FOR UPDATE');
        assert.equal((await actualClaim(1))._id,'2');
      }finally{await blocker.query('ROLLBACK');blocker.release();}
      assert.equal(evidence.dispatch.lockTimeSelection,'not_attested');
    });
    await t.test('repeatable read pins facts and observation despite later booking and revision changes',async()=>{
      await reset();await ticket('1');await pool.query("INSERT INTO bookings VALUES(1,1,10,'confirmed',NULL,NULL,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',1,'PRIVATE','parallel')");
      let calls=0,observation;
      const coherent=read({authorize:async(client,scope)=>{calls++;if(calls===1){observation=(await client.query('SELECT transaction_timestamp() AS now')).rows[0].now.toISOString();await pool.query("UPDATE bookings SET scheduled_start_at=clock_timestamp()-interval '1 second';UPDATE resource_ledger_scopes SET revision=revision+1");}return authorize(client,scope);}});
      const result=await coherent(input());assert.equal(result.observedAt,observation);assert.match(result.observedAtMicroseconds,/^[0-9]+$/);assert.equal(result.sourceAssessment.work[0].sqlCandidateAtObservation,false);
      const refreshed=await read()(input());assert.equal(refreshed.sourceAssessment.work[0].sqlCandidateAtObservation,true);
      assert.notEqual(refreshed.reportEvidence.revisionEvidence.ledgerRevision,result.reportEvidence.revisionEvidence.ledgerRevision);
    });
    await t.test('limits are explicit incomplete results and cannot refresh provenance or become empty ready inventory',async()=>{
      await reset();await ticket('1');await ticket('2');
      const limited=await read({limits:{work:1}})(input());assert.equal(limited.scanStatus,'row_limit_exceeded');assert.equal(limited.sourceAssessment,null);assert.equal(limited.reportEvidence.counts.work,'2');
      for(let i=3;i<40;i++)await ticket(String(i));
      const bytes=await read({maximumBytes:4096})(input());assert.equal(bytes.scanStatus,'byte_limit_exceeded');assert.equal(bytes.sourceAssessment,null);assert.equal(bytes.reportEvidence.inventory,null);
      assert.equal(bytes.readiness,'not_ready');assert.equal(bytes.snapshot,null);
    });
    await t.test('revocation rejects successful and incomplete results at a fresh authorization checkpoint',async()=>{
      await reset();await ticket('1');await ticket('2');
      for(const limits of [{},{work:1}]){let calls=0;await pool.query('UPDATE grants SET allowed=TRUE');
        const revoked=read({limits,authorize:async(client,scope)=>{calls++;const allowed=await authorize(client,scope);if(calls===1)await pool.query('UPDATE grants SET allowed=FALSE');return allowed;}});
        await assert.rejects(revoked(input()),{statusCode:403});assert.equal(calls,2);
      }
    });
    await t.test('storage and timeout failures also freshly authorize and sanitize failed checkpoints',async()=>{
      for(const code of ['42P01','42703','57014','55P03'])for(const revoked of [false,true]){
        await reset();let calls=0;const broken={connect:async()=>{const client=await pool.connect();return {release:()=>client.release(),query:async(sql,params)=>{if(sql.startsWith('SELECT revision::text')){if(revoked)await pool.query('UPDATE grants SET allowed=FALSE');throw Object.assign(new Error('PRIVATE'),{code});}return client.query(sql,params);}};}};
        const reader=createResourceSourceAssessment({pool:broken,sourceBinding:'test',authorize:async(client,scope)=>{calls++;return authorize(client,scope);}});
        if(revoked)await assert.rejects(reader(input()),{statusCode:403});else{const result=await reader(input());assert.equal(result.scanStatus,'unavailable');assert.equal(result.sourceAssessment,null);assert.equal(result.reportEvidence.counts,null);assert.ok(!JSON.stringify(result).includes('PRIVATE'));}
        assert.equal(calls,2);
      }
      await reset();let calls=0;
      const failedCheckpointPool={connect:async()=>{
        const client=await pool.connect();return {release:()=>client.release(),query:async(sql,params)=>{
          if(sql.startsWith('SELECT revision::text'))return client.query('SELECT * FROM absent_private_table');
          return client.query(sql,params);
        }};
      }};
      const reader=createResourceSourceAssessment({pool:failedCheckpointPool,sourceBinding:'test',authorize:async(client,scope)=>{
        calls++;if(calls===2)throw new Error('PRIVATE');return authorize(client,scope);
      }});
      await assert.rejects(reader(input()),error=>error.message==='resource_report_authorization_unavailable');assert.equal(calls,2);
    });
    await t.test('fresh checkpoint outages after a successful inventory read remain authorization errors',async()=>{
      for(const code of [undefined,'42P01','42703','57014']){
        await reset();await ticket('1');let calls=0;
        const reader=read({authorize:async(client,scope)=>{calls++;if(calls===2)throw Object.assign(new Error('PRIVATE'),{code});return authorize(client,scope);}});
        await assert.rejects(reader(input()),{code:'resource_report_authorization_unavailable',statusCode:503});assert.equal(calls,2);
      }
    });
    await t.test('a failed collection read stops subsequent reads before rollback and fresh authorization',async()=>{
      await reset();await ticket('1');let laterReads=0;
      const guarded={connect:async()=>{const client=await pool.connect();return {release:()=>client.release(),query:async(sql,params)=>{
        if(sql.includes('LEFT JOIN candidate_order o'))return client.query('SELECT * FROM absent_private_table');
        if(sql.includes('FROM held_allocations a ORDER BY id'))laterReads++;
        return client.query(sql,params);
      }};}};
      const result=await createResourceSourceAssessment({pool:guarded,sourceBinding:'test',authorize})(input());
      assert.equal(laterReads,0);assert.equal(result.sourceAssessment,null);assert.equal(result.scanStatus,'unavailable');
    });
    await t.test('actual PostgreSQL statement timeout returns only authorized unavailable evidence',async()=>{
      await reset();let calls=0,failed=false;
      const slow={connect:async()=>{const client=await pool.connect();return {release:()=>client.release(),query:async(sql,params)=>{
        if(!failed&&sql.startsWith('SELECT revision::text')){failed=true;return client.query('SELECT pg_sleep(0.2)');}
        return client.query(sql,params);
      }};}};
      const reader=createResourceSourceAssessment({pool:slow,sourceBinding:'test',statementTimeoutMs:20,authorize:async(client,scope)=>{calls++;return authorize(client,scope);}});
      const result=await reader(input());assert.equal(calls,2);assert.equal(result.sourceAssessment,null);assert.equal(result.scanStatus,'unavailable');assert.deepEqual(result.reportEvidence.blockers,['resource_report_read_timeout']);
      assert.ok(result.observedAt);assert.equal(result.reportEvidence.counts,null);
    });
    await t.test('denied scope and writes reject, with original producer envelope unchanged',async()=>{
      await reset();await pool.query('UPDATE grants SET allowed=FALSE');await assert.rejects(read()(input()),{statusCode:403});
      await pool.query('UPDATE grants SET allowed=TRUE');
      await assert.rejects(read({authorize:async client=>{await client.query("UPDATE grants SET allowed=FALSE");return true;}})(input()),/authorization_unavailable/);
      const producer=require('../src/services/resourceOperationalSnapshotProducer').createResourceOperationalSnapshotProducer({pool,sourceBinding:'test',authorize});
      const result=await producer({tenantId:'1',locationId:'10'});assert.equal(result.readiness,'not_ready');assert.equal(result.snapshot,null);assert.equal(Object.hasOwn(result,'sourceAssessment'),false);
    });
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
