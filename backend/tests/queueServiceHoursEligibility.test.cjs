const test=require('node:test'),assert=require('node:assert/strict');
const hours=require('../src/services/queueServiceHoursService');
const eligibility=require('../src/services/queueServiceHoursEligibilityService');
const {attach}=require('../src/services/queueReadEventStream');
const {EventEmitter}=require('node:events');
const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const window=now=>hours.windowAt({now,timezone:'UTC',hours:[{weekday:2,opensAt:'09:00',closesAt:'17:00',isClosed:false}]});
const item=(id,stage,minutes,extra={})=>({selectionId:id,selectionKind:'resource',serviceSelectionId:id,serviceId:id,stageId:stage,durationMinutes:minutes,storeHoursEnforcementVersion:1,...extra});
const plan={ticket_id:'1',stage_id:'a',stage_attempt_id:'aa',items:[item('one','a',30)]};
const attempts=[{id:'aa',stage_id:'a',ordinal:1,state:'waiting'}];
const workflow={mode:'linear'};
test('tagged eligibility changes only after exact fit threshold, retaining explicit duration reason and no mutation',()=>{
 const before=JSON.stringify(plan);
 const fits=eligibility.evaluate(plan,workflow,attempts,window('2026-10-20T16:30:00.000Z'));
 assert.equal(fits.status,'fits');assert.equal(fits.nextChangeAt,'2026-10-20T16:30:00.001Z');assert.equal(fits.requiredDurationMinutes,30);
 const late=eligibility.evaluate(plan,workflow,attempts,window('2026-10-20T16:30:00.001Z'));
 assert.equal(late.status,'does_not_fit');assert.equal(late.reason.code,'SERVICE_DURATION_EXCEEDS_STORE_HOURS');assert.equal(late.nextChangeAt,null);
 assert.equal(JSON.stringify(plan),before);
});
test('legacy stays not_enforced, malformed provenance/graph unavailable, closed never resource conflict',()=>{
 const legacy={...plan,items:plan.items.map(({storeHoursEnforcementVersion,...item})=>item)};
 assert.deepEqual(eligibility.evaluate(legacy,null,[],null),eligibility.NOT_ENFORCED);
 for(const bad of [{...plan,items:[...plan.items,item('two','a',30,{storeHoursEnforcementVersion:2})]},plan]){
  const value=eligibility.evaluate(bad,null,attempts,window('2026-10-20T16:00:00Z'));
  assert.equal(value.status,'unavailable');assert.equal(value.reason.code,'STORE_HOURS_UNAVAILABLE');
 }
 assert.equal(eligibility.evaluate(plan,workflow,attempts,window('2026-10-20T18:00:00Z')).status,'does_not_fit');
});
test('remaining ordered stage maxima include future work, excluding completed history and quantity',()=>{
 const p={...plan,stage_id:'b',stage_attempt_id:'bb',items:[item('one','a',120),item('two','b',30,{quantity:99}),item('other','b',45),item('three','c',20)]};
 const stages=[{stageId:'a',serviceIds:['one']},{stageId:'b',serviceIds:['two','other']},{stageId:'c',serviceIds:['three']}];
 const at=[{id:'aa',stage_id:'a',ordinal:1,state:'completed'},{id:'bb',stage_id:'b',ordinal:2,state:'waiting'},{id:'cc',stage_id:'c',ordinal:3,state:'pending'}];
 const value=eligibility.evaluate(p,{mode:'multi_station',stages},at,window('2026-10-20T16:00:00Z'));
 assert.equal(value.requiredDurationMinutes,65);assert.equal(value.status,'does_not_fit');
 assert.equal(eligibility.evaluate(p,{mode:'multi_station',stages},at.slice(1),window('2026-10-20T16:00:00Z')).status,'unavailable');
});
test('batch uses one supplied scope window and scoped bulk queries without writes',async()=>{
 const queries=[];const client={query:async(sql,args)=>{queries.push({sql,args});
  if(sql.includes('queue_workflow_versions'))return {rows:[{revision:'3',mode:'linear'}]};
  if(sql.includes('queue_stage_attempts'))return {rows:attempts.map(row=>({...row,ticket_id:'1'}))};
  throw Error(sql);
 }};
 const result=await eligibility.readMany(client,{tenantId:'2',locationId:'4'},[{...plan,workflow_configuration_revision:'3'}],{window:window('2026-10-20T16:00:00Z')});
 assert.equal(result.get('1').status,'fits');assert.equal(queries.length,2);assert.ok(queries.every(q=>q.args[0]==='2'&&q.args[1]==='4'&&!/INSERT|UPDATE|DELETE/.test(q.sql)));
});
test('semantic signature ignores observation/countdown jitter and notices eligibility/window/reason changes',()=>{
 const first=eligibility.evaluate(plan,workflow,attempts,window('2026-10-20T16:00:00Z'));
 const second=eligibility.evaluate(plan,workflow,attempts,window('2026-10-20T16:01:00Z'));
 assert.equal(eligibility.signature([['1',first]],true),eligibility.signature([['1',second]],true));
 const late=eligibility.evaluate(plan,workflow,attempts,window('2026-10-20T16:31:00Z'));
 assert.notEqual(eligibility.signature([['1',first]],true),eligibility.signature([['1',late]],true));
});
function stream(){
 const req=new EventEmitter(),writes=[],listeners=[];let heartbeat,timeout,closed=0,authorized=true,samples=0,checks=0,clears=0;
 let state={signature:'fits',observedAt:'2026-10-20T16:29:59.000Z',nextChangeAt:'2026-10-20T16:30:00.001Z',complete:true};
 const context={tenant:{_id:'1',slug:'t'},location:{_id:'2'}};
 const close=attach({req,res:{write:value=>writes.push(value),end:()=>closed++},context,
  queueEvents:{subscribe:(slug,fn,options)=>{assert.equal(slug,'t');assert.equal(options.locationId,'2');listeners.push(fn);return()=>listeners.pop();}},
  revalidate:async()=>{checks++;if(!authorized)throw Error('revoked');return context;},sampleHours:async()=>{assert.equal(checks,samples+1);samples++;return state;},
  setTimer:fn=>{heartbeat=fn;return 1;},clearTimer:()=>{},setBoundaryTimer:(fn,delay)=>{timeout={fn,delay};return 2;},clearBoundaryTimer:()=>{clears++;timeout=null;}});
 return {req,writes,close,heartbeat:()=>heartbeat(),timeout:()=>timeout,mutate:()=>listeners[0]({locationId:'2'}),set:value=>state=value,revoke:()=>authorized=false,samples:()=>samples,closed:()=>closed,clears:()=>clears,listeners};
}
test('server time-only boundary invalidates without command/poll; timer uses DB delay and cleanup/revocation',async()=>{
 const s=stream();await tick();assert.equal(s.writes.length,0);assert.equal(s.timeout().delay,1001);
 s.set({signature:'blocked',observedAt:'2026-10-20T16:30:00.001Z',nextChangeAt:null,complete:true});s.timeout().fn();await tick();
 assert.match(s.writes[0],/event: queue-plans-updated/);assert.match(s.writes[0],/"locationId":"2"/);assert.equal(s.samples(),2);
 s.heartbeat();await tick();assert.equal(s.writes.filter(v=>v.includes('queue-plans-updated')).length,1);
 s.revoke();s.heartbeat();await tick();assert.equal(s.closed(),1);assert.equal(s.samples(),3);assert.equal(s.listeners.length,0);s.req.emit('close');assert.equal(s.closed(),1);
});
test('heartbeat detects opening/recovery and normal mutation rearms nearest threshold',async()=>{
 const s=stream();await tick();s.set({signature:'open-again',observedAt:'2026-10-21T09:00:00Z',nextChangeAt:'2026-10-21T09:00:10Z',complete:true});s.heartbeat();await tick();
 assert.match(s.writes[0],/queue-plans-updated/);assert.equal(s.timeout().delay,10000);
 s.set({signature:'amended',observedAt:'2026-10-21T09:00:01Z',nextChangeAt:'2026-10-21T09:00:05Z',complete:true});s.mutate();await tick();assert.equal(s.timeout().delay,4000);assert.ok(s.clears()>0);s.close();assert.equal(s.timeout(),null);
});
test('hours configuration emits only after transaction commits and none on rollback',async()=>{
 const events=[];let committed=false,rollback=false;
 const service=loadModuleWithMocks(require.resolve('../src/services/locationHoursService'),{
  '../config/db':{pool:{}},'../repositories/storeLocations':{replaceHours:async()=>['hours']},
  './vendorQueueTransactionService':{withVendorQueueTransaction:async(_opts,fn)=>{const result=await fn({query:async()=>({rows:[]})});if(rollback)throw Error('rollback');committed=true;return result;}},
  './queueEvents':{publish:(...args)=>{assert.equal(committed,true);events.push(args);}}
 });
 const context=[{_id:'1',slug:'t'},{_id:'2'},[],{actorUserId:'3'}];
 assert.deepEqual(await service.replaceLocationHours(...context),['hours']);assert.equal(events.length,1);assert.equal(events[0][2].locationId,'2');
 rollback=true;committed=false;await assert.rejects(service.replaceLocationHours(...context),/rollback/);assert.equal(events.length,1);
});

test('incomplete scope degrades stream to polling recovery instead of claiming healthy/unchanged',async()=>{
 const s=stream();await tick();s.set({signature:null,observedAt:'2026-10-20T16:30:00Z',nextChangeAt:null,complete:false});
 s.heartbeat();await tick();assert.equal(s.closed(),1);assert.equal(s.writes.length,0);assert.equal(s.listeners.length,0);
 const client={query:async(sql,args)=>{assert.ok(!/^\s*(INSERT|UPDATE|DELETE)/i.test(sql));assert.match(sql,/LIMIT 1001/);return {rows:Array.from({length:1001},(_,index)=>({ticket_id:String(Number(args[2])+index+1),items:[]}))};}};
 let reads=0;
 const service=loadModuleWithMocks(require.resolve('../src/services/queueServiceHoursEligibilityService'),{'./queueServiceHoursService':{...hours,readWindow:async()=>{reads++;return window('2026-10-20T16:00:00Z');}}});
 const value=await service.sample(client,{tenantId:'1',locationId:'2'});assert.equal(value.complete,false);assert.equal(value.signature,null);assert.equal(reads,1);
});
test('complete batched sampler finds earliest time-only threshold beyond first 1000 using one DB window',async()=>{
 let reads=0,pages=0;const observed=window('2026-10-20T16:29:59Z');
 const service=loadModuleWithMocks(require.resolve('../src/services/queueServiceHoursEligibilityService'),{'./queueServiceHoursService':{...hours,readWindow:async()=>{reads++;return observed;}}});
 const client={query:async(sql,args)=>{
  if(sql.includes('LIMIT 1001')){pages++;assert.equal(args[2],pages===1?'0':'1000');return {rows:pages===1?Array.from({length:1001},(_,index)=>({ticket_id:String(index+1),items:[]})):[{...plan,ticket_id:'1001',workflow_configuration_revision:'3'}]};}
  if(sql.includes('queue_workflow_versions'))return {rows:[{revision:'3',mode:'linear'}]};
  if(sql.includes('queue_stage_attempts'))return {rows:attempts.map(row=>({...row,ticket_id:'1001'}))};
  throw Error(sql);
 }};
 const result=await service.sample(client,{tenantId:'1',locationId:'2'});assert.equal(result.complete,true);assert.equal(pages,2);assert.equal(reads,1);assert.equal(result.nextChangeAt,'2026-10-20T16:30:00.001Z');
});

test('all historical batches skip hours and ledger reads, while DB sampling errors close stream for recovery',async()=>{
 const values=await eligibility.readMany({query:async()=>{throw Error('must not read');}},{tenantId:'1',locationId:'2'},[{ticket_id:'1',items:[]}]);assert.equal(values.get('1').status,'not_enforced');
 const req=new EventEmitter();let ended=0,samples=0;
 const context={tenant:{_id:'1',slug:'t'},location:{_id:'2'}};
 attach({req,res:{write:()=>assert.fail('no unauthorized write'),end:()=>ended++},context,queueEvents:{subscribe:()=>()=>{}},revalidate:async()=>{throw Error('revoked');},sampleHours:async()=>{samples++;},setTimer:()=>1,clearTimer:()=>{}});
 await tick();assert.equal(samples,0);assert.equal(ended,1);
});

test('slow final batch degrades stream instead of returning a healthy stale snapshot; exact10000 complete within budget',async()=>{
 const {readFileSync}=require('node:fs'),{runInNewContext}=require('node:vm'),{createRequire}=require('node:module');
 const file=require.resolve('../src/services/queueServiceHoursEligibilityService');
 const localRequire=createRequire(file);let clock=0;
 const module={exports:{}};
 runInNewContext(readFileSync(file,'utf8'),{module,exports:module.exports,require:name=>name==='node:perf_hooks'?{performance:{now:()=>clock}}:name==='./queueServiceHoursService'?{...hours,readWindow:async()=>window('2026-10-20T16:00:00Z')}:localRequire(name)},{filename:file});
 const service=module.exports;
 const slow=await service.sample({query:async()=>{clock=2001;return {rows:[{ticket_id:'1',items:[]}]};}},{tenantId:'1',locationId:'2'});
 assert.equal(slow.complete,false);assert.equal(slow.signature,null);
 const s=stream();await tick();s.set(slow);s.heartbeat();await tick();assert.equal(s.closed(),1);assert.equal(s.writes.length,0);
 clock=0;let pages=0;
 const complete=await service.sample({query:async(_sql,args)=>{pages++;clock=pages*100;return {rows:Array.from({length:pages===10?1000:1001},(_,index)=>({ticket_id:String(Number(args[2])+index+1),items:[]}))};}},{tenantId:'1',locationId:'2'});
 assert.equal(pages,10);assert.equal(complete.complete,true);assert.equal(typeof complete.signature,'string');
});
