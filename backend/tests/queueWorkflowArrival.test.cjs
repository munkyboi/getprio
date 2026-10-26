const test=require('node:test'),assert=require('node:assert/strict');
const Module=require('node:module');
async function runScenario(run){
 const target=require.resolve('../src/services/queueStageService'),original=Module._load;
 const state={active:true,allocations:[],reservations:[],reservationGroups:[],allocationGroups:[],now:new Date('2026-10-26T02:00:00Z'),day:'2026-10-26',sequence:0,poolCommands:0,checkedDurations:[]};
 Module._load=function(request,parent,...args){if(parent?.filename===target){if(request==='./queueService')return {assertQueueDayOpen:async()=>({businessDate:state.day})};if(request==='./storeHoursService')return {assertLocationOpenForCustomerJoin:async()=>{}};if(request==='./queueServiceHoursService')return {assertPlanFits:async(client,scope,items)=>state.checkedDurations.push(items.map(item=>item.stageId))};}return original.call(this,request,parent,...args);};
 delete require.cache[target];const service=require(target);
 const stages=[{id:'a1',stage_id:'s1',ordinal:1,attempt:'1',state:'awaiting_arrival',arrival_contract_version:1,resource_requirement:{kind:'none'},readiness_required:false,station_id:'reception',station_snapshot:{serviceCounterIds:['1']}},{id:'a2',stage_id:'s2',ordinal:2,attempt:'1',state:'pending',arrival_contract_version:1,resource_requirement:{kind:'none'},readiness_required:true,station_id:'results',station_snapshot:{serviceCounterIds:['2']}}];
 const ticket={_id:'100',status:'waiting',serviceStartedAt:null,serviceEndedAt:null,serviceCounterId:null};
 const plan={workflow_mode:'multi_station',revision:'1',items:[{stageId:'s1',durationMinutes:10},{stageId:'s2',durationMinutes:15}],stage_id:'s1',stage_attempt_id:'a1'};
 const client={query:async(sql,args=[])=>{
  if(sql.includes('FROM store_locations l JOIN tenants'))return {rows:[{is_active:state.active,tenant_active:true,service_timing_enabled:false}]};
  if(sql==='SELECT clock_timestamp() AS at')return {rows:[{at:state.now}]};
  if(sql.startsWith('SELECT * FROM queue_reservation_groups')||sql.startsWith('SELECT 1 FROM resource_ledger_reservations')||sql.startsWith('SELECT 1 FROM resource_allocations')||sql.startsWith('SELECT * FROM queue_child_attempts'))return {rows:[]};
  if(sql.startsWith('SELECT 1 FROM queue_allocation_groups'))return {rows:state.allocationGroups.filter(row=>!row.released_at)};
  if(sql.startsWith('SELECT auto_pause'))return {rows:[{auto_pause_enabled:false}]};
  if(sql.startsWith('SELECT id FROM resource_allocations'))return {rows:state.allocations.filter(row=>!row.released_at)};
  if(sql.startsWith('SELECT r.id::text FROM resource_ledger_reservations'))return {rows:state.reservations.filter(row=>row.state==='protected')};
  if(sql.includes('SELECT id,expected_members FROM queue_allocation_groups'))return {rows:state.allocationGroups.filter(row=>!row.released_at)};
  if(sql.startsWith('SELECT items'))return {rows:[{items:plan.items}]};
  if(sql.includes('SELECT DISTINCT ON(stage_id)'))return {rows:[...new Map(stages.map(stage=>[stage.stage_id,stage])).values()].sort((a,b)=>a.ordinal-b.ordinal).map(stage=>({...stage}))};
  if(sql.includes('SELECT clock_timestamp() AS now'))return {rows:[{now:state.now}]};
  if(sql.startsWith('SELECT 1 FROM queue_allocation_groups'))return {rows:state.allocationGroups.filter(row=>!row.released_at)};
  if(sql.startsWith('INSERT INTO queue_stage_attempts')&&sql.includes('assigned_user_id')){stages.push({id:args[0],stage_id:args[4],attempt:args[5],ordinal:args[6],state:args[11],station_id:args[7],station_snapshot:JSON.parse(args[8]),label:args[9],resource_requirement:JSON.parse(args[13]),readiness_required:args[14],arrival_contract_version:args[12]});return {rows:[]};}
  if(sql.startsWith('INSERT INTO queue_stage_attempts')){stages.push({id:args[0],stage_id:args[4],attempt:args[5],ordinal:args[6],state:args[13],station_id:args[7],station_snapshot:JSON.parse(args[8]),label:args[9],resource_requirement:JSON.parse(args[10]),readiness_required:args[11],arrival_contract_version:args[12]});return {rows:[]};}
  if(sql.startsWith('UPDATE queue_stage_attempts')&&sql.includes('WHERE ticket_id=$1')){for(const stage of stages)if(['pending','waiting','called','awaiting_arrival','awaiting_readiness'].includes(stage.state)){stage.state='cancelled';stage.ended_at=state.now;}return {rows:[]};}
  if(sql.startsWith('UPDATE queue_stage_attempts')){
   const stage=stages.find(stage=>stage.id===args[0]);assert.ok(stage);
   if(sql.includes("state='waiting',arrived_at")){stage.state='waiting';stage.arrived_at=args[2];stage.station_waiting_at=args[2];stage.station_queue_sequence=++state.sequence;stage.station_queue_date_key=args[4];}
   else if(sql.includes("state='waiting'")){stage.state='waiting';}
   else if(sql.includes("state='awaiting_arrival',ready_at")){stage.state='awaiting_arrival';stage.ready_at=state.now;}
   else if(sql.includes("state='skipped',ended_at")){stage.state='skipped';stage.ended_at=state.now;}
   else if(sql.includes("state='in_service',started_at")){stage.state='in_service';stage.started_at=state.now;}
   else {stage.state=args[1];if(sql.includes('ended_at='))stage.ended_at=state.now;}
   return {rows:[]};
  }
  if(sql.startsWith('UPDATE ticket_service_plans SET journey_cancelled_at')){plan.journey_cancelled_at=state.now;return {rows:[]};}
  if(sql.startsWith('UPDATE ticket_service_plans SET stage_attempt_id=$4')){plan.stage_attempt_id=args[3];return {rows:[]};}
  if(sql.startsWith('UPDATE ticket_service_plans')){if(args.length>3){plan.stage_id=args[3];plan.stage_attempt_id=args[4];}return {rows:[]};}
  if(sql.startsWith('UPDATE tickets')){if(sql.includes("status='skipped'"))ticket.status='skipped';if(sql.includes("status='waiting'"))ticket.status='waiting';if(sql.includes("status='cancelled'")){ticket.status='cancelled';if(ticket.serviceStartedAt)ticket.serviceEndedAt=state.now;}if(sql.includes("status='served'")){ticket.status='served';ticket.serviceEndedAt=state.now;}if(sql.includes('service_started_at=COALESCE'))ticket.serviceStartedAt ||= state.now;if(sql.includes('service_counter_id=NULL'))ticket.serviceCounterId=null;return {rows:[]};}
  throw new Error(`Unmodelled query ${sql}`);
 }};
 const execute=(index,action,body={})=>service.execute(client,{executeCommand:async command=>{
  state.poolCommands++;
  if(command.command==='cancelReservation'){const row=state.reservations.find(row=>row.id===command.payload.reservationId);row.state='cancelled';for(const group of state.reservationGroups)if(state.reservations.filter(row=>row.group_id===group.id).every(row=>row.state==='cancelled'))group.state='cancelled';return;}
  if(command.command==='release'){for(const row of state.allocations)row.released_at=state.now;for(const group of state.allocationGroups)group.released_at=state.now;stages[index].state=command.payload.outcome==='completed'?'completed':'interrupted';stages[index].ended_at=state.now;return;}
  throw new Error('No resource stage may allocate');
 }},{scope:{tenantId:'1',locationId:'2',actorUserId:'3'},tenant:{_id:'1'},location:{_id:'2',timezone:'Asia/Manila'},ticket,p:plan,stage:stages[index],action,body,actor:{tenantMemberships:[{role:'owner'}]},timing:{applyTicketService:async()=>{throw new Error('No resource stage must not use pool timing');}}});
 const recover=(index,action,body={reason:'Customer is present'})=>require('../src/services/queuePlanRecoveryService')[action](client,{scope:{tenantId:'1',locationId:'2',actorUserId:'3'},tenant:{_id:'1'},location:{_id:'2'},ticket,p:plan,stage:stages[index],body,queue:{assertQueueIntakeOpen:async()=>({_id:'today',businessDate:state.day})},queueEvent:async()=>{},readTicket:async()=>ticket});
 try{await run({state,stages,ticket,plan,execute,client,recover});}finally{Module._load=original;delete require.cache[target];}
}
test('two-station journey requires explicit first arrival, readiness and next-day destination arrival',()=>runScenario(async({state,stages,ticket,plan,execute})=>{
 await assert.rejects(()=>execute(0,'start'),/Call this stage/);
 await execute(0,'arrive');assert.equal(stages[0].state,'waiting');assert.equal(stages[0].station_queue_date_key,'20261026');
 stages[0].state='called';ticket.status='called';ticket.serviceCounterId='1';
 await execute(0,'start');assert.equal(stages[0].state,'in_service');await execute(0,'complete');assert.equal(ticket.status,'called');assert.equal(ticket.serviceCounterId,null);
 assert.equal(plan.stage_attempt_id,'a2');assert.equal(stages[1].state,'awaiting_readiness');assert.equal(stages[1].station_waiting_at,undefined);assert.equal(state.poolCommands,0);
 await assert.rejects(()=>execute(1,'arrive'),/Confirm readiness/);
 state.now=new Date('2026-10-27T02:00:00Z');state.day='2026-10-27';
 await execute(1,'ready');assert.equal(stages[1].state,'awaiting_arrival');assert.equal(stages[1].station_queue_sequence,undefined);
 await execute(1,'arrive');assert.equal(stages[1].state,'waiting');assert.equal(stages[1].station_queue_date_key,'20261027');assert.equal(stages[1].station_waiting_at,state.now);
 stages[1].state='called';ticket.status='called';ticket.serviceCounterId='2';await execute(1,'start');await execute(1,'complete');
 assert.equal(ticket.status,'served');assert.equal(stages[1].state,'completed');assert.ok(ticket.serviceEndedAt);assert.deepEqual(state.checkedDurations,[['s1'],['s2']]);assert.equal(state.poolCommands,0);
}));
test('arrival is not repeatable without a new stage attempt and does not create another position',()=>runScenario(async({execute,state})=>{await execute(0,'arrive');await assert.rejects(()=>execute(0,'arrive'),/Confirm readiness/);assert.equal(state.sequence,1);}));

test('unstarted cancellation resolves every protected member/group and never serves the journey',()=>runScenario(async({state,stages,ticket,execute})=>{
 stages[0].resource_requirement={kind:'pool'};stages[0].state='called';ticket.status='called';
 state.reservationGroups=[{id:'g',state:'protected'}];state.reservations=[{id:'r1',group_id:'g',state:'protected'},{id:'r2',group_id:'g',state:'protected'}];
 await execute(0,'cancelJourney',{reason:'Customer cancelled'});
 assert.equal(ticket.status,'cancelled');assert.ok(stages.every(stage=>stage.state==='cancelled'));assert.ok(state.reservations.every(row=>row.state==='cancelled'));assert.equal(state.reservationGroups[0].state,'cancelled');assert.equal(state.poolCommands,2);
}));
test('active cancellation retains allocation/group until explicit outcome, then resolves cancelled without handoff',()=>runScenario(async({state,stages,ticket,plan,execute})=>{
 stages[0].resource_requirement={kind:'pool'};stages[0].state='in_service';stages[0].started_at=state.now;ticket.status='called';ticket.serviceStartedAt=state.now;
 state.allocations=[{id:'a',released_at:null}];state.allocationGroups=[{id:'g',expected_members:[{allocationId:'a'}],released_at:null}];
 await execute(0,'cancelJourney',{reason:'Cancel later steps'});assert.equal(ticket.status,'called');assert.equal(state.poolCommands,0);assert.equal(state.allocations[0].released_at,null);assert.equal(state.allocationGroups[0].released_at,null);assert.equal(stages[1].state,'cancelled');
 await execute(0,'complete',{allocationGroupId:'g'});assert.equal(ticket.status,'cancelled');assert.ok(state.allocations[0].released_at);assert.ok(state.allocationGroups[0].released_at);assert.equal(plan.stage_attempt_id,'a1');assert.equal(state.poolCommands,1);
 await assert.rejects(()=>execute(0,'handoff'),/parent ticket must remain open/);
}));

test('pooled stage completion releases the group and advances to readiness in the same command',()=>runScenario(async({state,stages,ticket,plan,execute})=>{
 stages[0].resource_requirement={kind:'pool'};stages[0].state='in_service';stages[0].started_at=state.now;ticket.status='called';ticket.serviceStartedAt=state.now;
 state.allocations=[{id:'a',released_at:null}];state.allocationGroups=[{id:'g',expected_members:[{allocationId:'a'}],released_at:null}];
 await execute(0,'complete',{allocationGroupId:'g'});assert.ok(state.allocations[0].released_at);assert.ok(state.allocationGroups[0].released_at);assert.equal(plan.stage_attempt_id,'a2');assert.equal(stages[1].state,'awaiting_readiness');assert.equal(stages[1].station_queue_sequence,undefined);assert.equal(ticket.status,'called');
}));
test('historical contract0 retains its explicit handoff without new arrival semantics',()=>runScenario(async({state,stages,ticket,plan,execute})=>{
 stages[0].arrival_contract_version=0;stages[0].state='completed';stages[0].ended_at=state.now;stages[1].arrival_contract_version=0;ticket.status='called';ticket.serviceStartedAt=state.now;
 await execute(0,'handoff');assert.equal(plan.stage_attempt_id,'a2');assert.equal(stages[1].state,'waiting');assert.equal(ticket.status,'waiting');
}));
test('fresh inactive location denies new stage Start without changing its state',()=>runScenario(async({state,stages,ticket,execute})=>{
 stages[0].state='called';ticket.status='called';state.active=false;await assert.rejects(()=>execute(0,'start'),/inactive/);assert.equal(stages[0].state,'called');assert.equal(ticket.serviceStartedAt,null);
}));
test('two no-resource journeys share one physical counter slot; another counter remains independent',async()=>{
 const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');let occupied=true,calls=0;
 const dispatch=loadModuleWithMocks(require.resolve('../src/services/counterDispatchService'),{'../repositories/tickets':{
 findCurrentCalledTicket:async(tenant,options)=>options.serviceCounterId==='1'&&occupied?{_id:'first',serviceStartedAt:'now',serviceEndedAt:null}:null,
 callNextWaitingTicket:async()=>{calls++;return {_id:'second'};},listWaitingTickets:async()=>[]}});
 const client={query:async()=>({rows:[{id:'1'}]})},scope={tenantId:'1',locationId:'2',dateKey:'20261026'};
 await assert.rejects(()=>dispatch.claimNext(client,scope,{serviceCounter:{_id:'1'}}),{code:'COUNTER_OCCUPIED'});assert.equal(calls,0);
 assert.equal((await dispatch.claimNext(client,scope,{serviceCounter:{_id:'2'}}))._id,'second');
 occupied=false;assert.equal((await dispatch.claimNext(client,scope,{serviceCounter:{_id:'1'}}))._id,'second');assert.equal(calls,2);
});
test('expired workflow protection requires fresh arrival, preserving prior station history; legacy keeps waiting',async()=>{
 const ledger=require('../src/repositories/queueGroupedLedger');
 for(const version of [0,1]){
  const updates=[],events=[];const client={query:async(sql,args=[])=>{
   if(sql.includes('SELECT t.status,a.started_at'))return {rows:[{status:'called',stage_started_at:null,arrival_contract_version:version,station_queue_sequence:'42',station_waiting_at:'before',station_queue_date_key:'20261026',arrived_at:'arrived'}]};
   if(sql.includes('SELECT id,plan_revision::text,stage_attempt_id'))return {rows:[{id:'g',plan_revision:'1',stage_attempt_id:'a'}]};
   if(sql.startsWith('SELECT 1 FROM queue_allocation_groups'))return {rows:[]};
   if(sql.startsWith('UPDATE')){updates.push({sql,args});return {rows:[]};}
   if(sql.includes('INSERT INTO queue_plan_events')){events.push(JSON.parse(args[5]));return {rows:[]};}throw new Error(sql);
  }};
  assert.equal(await ledger.expireUnstarted(client,{tenantId:'1',locationId:'2',actorUserId:'3',actorRole:'owner'},{id:'draft',published_ticket_id:'100'}),true);
  const stage=updates.find(row=>row.sql.startsWith('UPDATE queue_stage_attempts'));assert.equal(stage.args[1],version===1?'awaiting_arrival':'waiting');assert.match(stage.sql,/station_queue_sequence=CASE/);
  assert.equal(events[0].priorStationQueue.sequence,'42');assert.equal(events[0].priorStationQueue.arrivedAt,'arrived');assert.equal(events[0].state,version===1?'awaiting_arrival':'waiting');
  assert.ok(updates.some(row=>row.sql.includes("queue_reservation_groups SET state='expired'")));assert.ok(updates.some(row=>row.sql.includes("resource_ledger_reservations SET state='cancelled'")));assert.ok(!updates.some(row=>row.sql.includes('UPDATE resource_allocations')));
 }
});

test('retry of readiness-gated interrupted stage requires fresh readiness before arrival and completion',()=>runScenario(async({state,stages,ticket,plan,execute})=>{
 stages[0].readiness_required=true;stages[0].state='awaiting_readiness';
 await execute(0,'ready');await execute(0,'arrive');stages[0].state='called';ticket.status='called';ticket.serviceCounterId='1';
 await execute(0,'start');await execute(0,'interrupt',{reason:'Try again'});assert.equal(stages[0].state,'interrupted');const firstStart=ticket.serviceStartedAt;
 await execute(0,'retry');const retry=stages[2];assert.equal(retry.state,'awaiting_readiness');assert.equal(retry.ready_at,undefined);assert.equal(plan.stage_attempt_id,retry.id);
 await assert.rejects(()=>execute(2,'arrive'),/Confirm readiness/);await execute(2,'ready');await execute(2,'arrive');retry.state='called';ticket.status='called';ticket.serviceCounterId='1';await execute(2,'start');await execute(2,'complete');
 assert.equal(retry.state,'completed');assert.equal(stages[0].state,'interrupted');assert.equal(ticket.serviceStartedAt,firstStart);assert.equal(plan.stage_attempt_id,'a2');assert.equal(stages[1].state,'awaiting_readiness');assert.equal(state.poolCommands,0);
}));

test('NONE called missed-service recovery preserves journey and requires fresh readiness/arrival before Start',()=>runScenario(async({state,stages,ticket,plan,execute,recover})=>{
 stages[0].readiness_required=true;stages[0].state='awaiting_readiness';await execute(0,'ready');await execute(0,'arrive');stages[0].state='called';ticket.status='called';ticket.serviceCounterId='1';
 await recover(0,'skip');assert.equal(stages[0].state,'skipped');assert.equal(ticket.status,'skipped');assert.equal(stages[1].state,'pending');assert.equal(state.poolCommands,0);
 await assert.rejects(()=>recover(0,'skip'),{code:'SKIP_NOT_AVAILABLE'});await recover(0,'recall');const fresh=stages[2];assert.equal(fresh.state,'awaiting_readiness');assert.equal(fresh.resource_requirement.kind,'none');assert.equal(fresh.ordinal,1);assert.equal(plan.stage_attempt_id,fresh.id);
 await assert.rejects(()=>execute(2,'arrive'),/Confirm readiness/);await execute(2,'ready');await execute(2,'arrive');fresh.state='called';ticket.status='called';ticket.serviceCounterId='1';await execute(2,'start');assert.equal(fresh.state,'in_service');await assert.rejects(()=>recover(2,'skip'),{code:'SKIP_NOT_AVAILABLE'});assert.equal(stages[0].state,'skipped');assert.equal(stages[1].state,'pending');assert.equal(state.poolCommands,0);
}));
