const test=require('node:test'),assert=require('node:assert/strict');
const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
const at=new Date('2026-10-17T12:00:00Z'),scope={tenantId:'1',locationId:'10',actorUserId:'1'},context={tenant:{_id:'1'},location:{_id:'10'},actorUserId:'1'},actor={roles:[],tenantMemberships:[{tenantId:'1',role:'owner',isActive:true}]};
function fixture(){
 const state={current:new Map(),next:new Map(),versions:new Map(),plans:new Map(),queries:[],peeks:[],currentReads:[],liveAllocations:new Set(),waiting:new Map(),active:true,open:true,authorized:true};
 const client={query:async(sql,args=[])=>{state.queries.push(sql);
  if(sql.includes('SELECT l.*'))return {rows:[{id:'10',is_active:state.active,tenant_active:true,queue_lifecycle_mode:'enforced',service_timing_enabled:true,timezone:'Asia/Manila'}]};
  if(sql.includes('FOR SHARE OF l,t'))return {rows:[{id:'10'}]};
  if(sql.includes('FROM service_counters'))return {rows:['one','two'].includes(args[2])?[{id:args[2]==='one'?'1':'2',slug:args[2],name:args[2],is_active:true}]:[]};
  if(sql.includes('clock_timestamp()'))return {rows:[{at}]};
  if(sql.includes('AS version FROM ticket_service_plans'))return {rows:state.versions.has(args[2])?[{version:String(state.versions.get(args[2]))}]:[]};
  if(sql.includes('FROM queue_plan_drafts'))return {rows:state.plans.has(args[2])?[{id:state.plans.get(args[2]).id,published_ticket_id:args[2]}]:[]};
  if(sql.startsWith('SET LOCAL'))return {rows:[]};
  throw new Error('Unexpected query: '+sql);
 }};
 const service=loadModuleWithMocks(require.resolve('../src/services/queueCounterControlsService'),{
  '../config/db':{withTransaction:fn=>fn(client)},
  '../repositories/tickets':{listReadyWaitingTickets:async(_tenant,options)=>state.waiting.get(options.serviceCounterId)||[state.next.get(options.serviceCounterId)].filter(Boolean),findCurrentCalledTicket:async(_tenant,options)=>{state.currentReads.push(options);const current=state.current.get(options.serviceCounterId);return options.excludeAllocatedService&&current?.serviceStartedAt&&!current.serviceEndedAt&&state.liveAllocations.has(current._id)?null:current||null;},peekNextWaitingTicket:async(_tenant,options)=>{state.peeks.push(options);return state.next.get(options.serviceCounterId)||null;}},
  '../repositories/queueDays':{findLatestByLocation:async()=>state.open?{_id:'9',businessDate:'2026-10-17',currentClosesAt:new Date('2026-10-18T00:00:00Z')}:null},
  '../repositories/queueDayClosures':{findActiveClosure:async()=>null},
  './queueServiceHoursService':{readWindow:async()=>({status:'open',observedAt:at.toISOString(),closesAt:'2026-10-17T13:00:00Z'})},
  './localPoolDemoScope':{readLocalPoolDemoScope:async()=>null},
  './vendorQueueTransactionService':{readAuthorizedVendorQueueActor:async()=>state.authorized?actor:null},
  '../repositories/queuePlanProjection':{read:async(_c,_s,draft)=>[...state.plans.values()].find(p=>p.id===draft.id)},
 });
 const read=counterSlug=>service.read(context,{counterSlug,requestKey:'request-'+counterSlug});
 return {state,read,service};
}
const ticket=id=>({_id:id,ticketNumber:'Q'+id,status:'called',joinChannel:'vendor',serviceCounterId:'1',customerName:'QA',serviceStartedAt:null});
const plan=id=>({id:'plan-'+id,contractVersion:4,state:'called',ticketRevision:'2',planRevision:'1',workflow:{mode:'linear'},currentStage:{id:'stage',attemptId:'attempt',revision:'2',state:'called',startedAt:null},capabilities:{execution:true,childOutcomes:true},allowedActions:['start','skip'],reservationGroups:[{id:'group',state:'protected',stageAttemptId:'attempt',planRevision:'1',expiresAt:'2026-10-17T12:05:00Z'}],allocationGroups:[],resourceWait:null});
test('counter context binds plan actions to the selected lane without a location-wide plan block',async()=>{
 const f=fixture();f.state.current.set('1',ticket('27'));f.state.versions.set('27',4);f.state.plans.set('27',plan('27'));f.state.next.set('2',{...ticket('28'),status:'waiting'});
 const one=await f.read('one');assert.equal(one.current.kind,'plan');assert.equal(one.actions.start.enabled,true);assert.equal(one.actions.skip.enabled,true);assert.deepEqual(one.actions.start.command.body,{expectedTicketRevision:'2',expectedPlanRevision:'1',currentStageId:'stage',expectedStageRevision:'2',counterSlug:'one',expectedCounterId:'1',reservationGroupId:'group'});assert.equal(one.actions.callNext.blockReason.code,'COUNTER_OCCUPIED');
 const two=await f.read('two');assert.equal(two.current,null);assert.equal(two.actions.callNext.enabled,true);assert.equal(two.actions.callNext.command.kind,'legacy');assert.equal(two.actions.callNext.command.body.expectedCounterId,'2');assert.notEqual(one.contextKey,two.contextKey);assert.equal(two.requestKey,'request-two');assert.equal(f.state.peeks.at(-1).dateKey,'20261017');
 assert.ok(f.state.queries.every(sql=>!/^\s*(INSERT|UPDATE|DELETE)/iu.test(sql)));
});
test('expired plan protection is read-only and blocks Start/Skip without reconciling or inventing availability',async()=>{
 const f=fixture(),p=plan('27');p.allowedActions=['amend'];p.reservationGroups[0].expiresAt='2026-10-17T11:59:00Z';f.state.current.set('1',ticket('27'));f.state.versions.set('27',4);f.state.plans.set('27',p);
 const result=await f.read('one');assert.equal(result.actions.start.blockReason.code,'RESERVATION_EXPIRED');assert.equal(result.actions.skip.blockReason.code,'RESERVATION_EXPIRED');assert.equal(result.actions.manageRequest.command.planId,'plan-27');assert.ok(f.state.queries.every(sql=>!/^\s*(INSERT|UPDATE|DELETE)/iu.test(sql)));
});
test('legacy customer confirmation is a scanner action; started work cannot be skipped',async()=>{
 const f=fixture();f.state.current.set('1',{...ticket('1'),joinChannel:'qr'});let result=await f.read('one');assert.equal(result.actions.start.blockReason.code,'CUSTOMER_CONFIRMATION_REQUIRED');assert.equal(result.actions.confirm.command.kind,'scan');assert.equal(result.actions.skip.enabled,true);
 f.state.current.set('1',{...ticket('1'),serviceStartedAt:'2026-10-17T11:00:00Z'});result=await f.read('one');assert.equal(result.actions.skip.blockReason.code,'SERVICE_ALREADY_STARTED');assert.equal(result.actions.complete.command.action,'complete');
});
test('started resource-backed service leaves dispatch free without removing service or allocation',async()=>{
 const f=fixture(),started={...ticket('27'),serviceStartedAt:'2026-10-17T11:00:00Z'};
 f.state.current.set('1',started);f.state.liveAllocations.add('27');
 f.state.versions.set('27',4);f.state.plans.set('27',{...plan('27'),state:'in_service'});
 f.state.next.set('1',{...ticket('28'),status:'waiting'});
 const result=await f.read('one');
 assert.equal(result.current,null);assert.equal(result.actions.callNext.enabled,true);assert.equal(result.actions.callNextEligible.enabled,true);
 assert.equal(result.actions.start.enabled,false);assert.equal(result.actions.complete.enabled,false);assert.equal(result.actions.interrupt.enabled,false);
 assert.equal(f.state.currentReads[0].excludeAllocatedService,true);assert.equal(f.state.currentReads[0].locationId,'10');
 assert.equal(f.state.current.get('1'),started);assert.ok(f.state.liveAllocations.has('27'));
 assert.ok(f.state.queries.every(sql=>!/^\s*(INSERT|UPDATE|DELETE)/iu.test(sql)));
});
test('called and unallocated started work still occupy dispatch outside the fixture',async()=>{
 const f=fixture();f.state.next.set('1',{...ticket('28'),status:'waiting'});
 for(const current of [ticket('27'),{...ticket('27'),serviceStartedAt:'2026-10-17T11:00:00Z'}]){
  f.state.current.set('1',current);
  const result=await f.read('one');assert.equal(result.current.ticketId,'27');assert.equal(result.actions.callNext.blockReason.code,'COUNTER_OCCUPIED');assert.equal(result.actions.callNextEligible.blockReason.code,'COUNTER_OCCUPIED');
 }
});
test('closed scope, missing plan identity and revoked access fail closed',async()=>{
 const f=fixture();f.state.open=false;assert.equal((await f.read('one')).actions.callNext.blockReason.code,'QUEUE_DAY_CLOSED');f.state.open=true;f.state.current.set('1',ticket('27'));f.state.versions.set('27',4);assert.equal((await f.read('one')).actions.start.blockReason.code,'PLAN_RECONCILIATION_REQUIRED');f.state.authorized=false;await assert.rejects(f.read('one'),{statusCode:403});await assert.rejects(f.service.read(context,{counterSlug:'one',requestKey:''}),{code:'INVALID_COUNTER_CONTEXT'});
});

test('plan Start never advertises a confirmation bypass for a customer-joined request',async()=>{
 const f=fixture();f.state.current.set('1',{...ticket('27'),joinChannel:'qr'});f.state.versions.set('27',4);f.state.plans.set('27',plan('27'));
 const result=await f.read('one');assert.equal(result.actions.start.enabled,false);assert.equal(result.actions.start.blockReason.code,'CUSTOMER_CONFIRMATION_REQUIRED');assert.equal(result.actions.manageRequest.command.kind,'openRequest');assert.equal(result.actions.confirm.enabled,true);assert.equal(result.actions.confirm.command.kind,'scan');
});

test('FIFO call and conflict-free eligible call target different server-selected plans',async()=>{
 const f=fixture();
 for(const [id,conflict] of [['4',true],['6',false]]){
  const p={...plan(id),state:'waiting',allowedActions:['call'],resourceWait:conflict?{code:'RESOURCE_OCCUPIED',message:'Court 1 is in service on another request.'}:null};
  f.state.plans.set(id,p);f.state.versions.set(id,4);
 }
 const fifo={...ticket('4'),status:'waiting'},eligible={...ticket('6'),status:'waiting'};
 f.state.next.set('1',fifo);f.state.waiting.set('1',[fifo,eligible]);
 const result=await f.read('one');
 assert.equal(result.fifoNext.planId,'plan-4');assert.equal(result.next.planId,'plan-6');
 assert.equal(result.actions.callNext.command,null);assert.equal(result.actions.callNextEligible.command.planId,'plan-6');
 assert.equal(result.actions.callNext.blockReason.code,'RESOURCE_OCCUPIED');assert.equal(result.actions.callNext.blockReason.message,'Court 1 is in service on another request.');assert.equal(result.actions.callNextEligible.command.body.dispatchMode,'nextEligible');
 assert.equal(result.actions.callNext.enabled,false);assert.equal(result.actions.callNextEligible.enabled,true);
 // Once the authoritative conflict clears, FIFO becomes callable without
 // choosing a later request, and eligibility is recomputed independently.
 f.state.plans.set('4',{...f.state.plans.get('4'),resourceWait:null});
 const clear=await f.read('one');
 assert.equal(clear.actions.callNext.enabled,true);assert.equal(clear.actions.callNext.blockReason,null);
 assert.equal(clear.actions.callNext.command.planId,'plan-4');assert.equal(clear.actions.callNext.command.body.dispatchMode,undefined);
 assert.equal(clear.actions.callNextEligible.command.planId,'plan-4');
});

test('FIFO resource blocks retain the actual reason when no later request is eligible',async()=>{
 const f=fixture(),waiting={...ticket('4'),status:'waiting'};
 f.state.versions.set('4',4);f.state.next.set('1',waiting);f.state.waiting.set('1',[waiting]);
 for(const code of ['RESOURCE_OCCUPIED','RESOURCE_PROTECTED','RESOURCE_CAPACITY_UNAVAILABLE','ANONYMOUS_RESOURCE_USAGE','RESERVATION_EXPIRED','RESERVATION_CANCELLED']){
  const message=`Current resource reason: ${code}`;
  f.state.plans.set('4',{...plan('4'),state:'waiting',allowedActions:[],resourceWait:{code,message}});
  const result=await f.read('one');
  assert.equal(result.fifoNext.planId,'plan-4');assert.equal(result.next,null);
  assert.deepEqual(result.actions.callNext,{enabled:false,blockReason:{code,message},command:null});
  assert.equal(result.actions.callNextEligible.enabled,false);assert.equal(result.actions.callNextEligible.blockReason.code,'NO_READY_WAITING_TICKET');
 }
 f.state.open=false;
 assert.equal((await f.read('one')).actions.callNext.blockReason.code,'QUEUE_DAY_CLOSED');
 f.state.open=true;
 f.state.plans.set('4',{...f.state.plans.get('4'),serviceHoursEligibility:{status:'does_not_fit',reason:{code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS',message:'The request does not fit before closing.'}}});
 assert.equal((await f.read('one')).actions.callNext.blockReason.code,'SERVICE_DURATION_EXCEEDS_STORE_HOURS');
 assert.ok(f.state.queries.every(sql=>!/^\s*(INSERT|UPDATE|DELETE)/iu.test(sql)));
});

test('Next eligible excludes tagged hours-blocked/unknown while legacy keeps prior dispatch rules',async()=>{
 const f=fixture();const waiting=[];
 for(const [id,status] of [['41','does_not_fit'],['42','unavailable'],['43','fits']]){
  const p={...plan(id),state:'waiting',allowedActions:['call'],serviceHoursEligibility:{status,reason:status==='fits'?null:{code:status==='unavailable'?'STORE_HOURS_UNAVAILABLE':'SERVICE_DURATION_EXCEEDS_STORE_HOURS',message:'Hours blocked'}}};
  f.state.plans.set(id,p);f.state.versions.set(id,4);waiting.push({...ticket(id),status:'waiting'});
 }
 f.state.next.set('1',waiting[0]);f.state.waiting.set('1',waiting);
 const result=await f.read('one');assert.equal(result.next.planId,'plan-43');assert.equal(result.actions.callNext.enabled,false);assert.equal(result.actions.callNext.blockReason.code,'SERVICE_DURATION_EXCEEDS_STORE_HOURS');assert.equal(result.actions.callNextEligible.command.planId,'plan-43');assert.equal(result.fifoNext.serviceHoursEligibility.status,'does_not_fit');
 f.state.waiting.set('1',[...waiting.slice(0,2),{...ticket('44'),status:'waiting'}]);
 const legacy=await f.read('one');assert.equal(legacy.next.ticketId,'44');assert.equal(legacy.next.serviceHoursEligibility.status,'not_enforced');
});
