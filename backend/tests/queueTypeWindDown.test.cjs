const test=require('node:test'),assert=require('node:assert/strict');
const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
function service(type='simple',resource=false,workflow=false){return loadModuleWithMocks(require.resolve('../src/services/queueTypeService'),{'../config/db':{},'../services/entitlementResolver':{resolveTenantPolicy:async()=>({lifecycle:{state:'active'},features:{queue:{enabled:true},resourceQueue:{enabled:resource},workflowQueue:{enabled:workflow}}})}});}
const old=[{lineId:'a',serviceId:'1',stageId:'stage',quantity:2,durationMinutes:60,resource:{known:true,poolId:'9',totalUnits:2}}];
const client=type=>({query:async()=>({rows:[{type}]})});
test('downgrade or type change preserves reductions but denies added/swapped/extended demand',async()=>{
 const s=service();await s.assertAmendment(client('simple'),{},old,[{...old[0],quantity:1,resource:{...old[0].resource,totalUnits:1}}],'linear');
 for(const change of [{quantity:3},{durationMinutes:61},{serviceId:'2'},{stageId:'other'},{resource:{known:true,poolId:'10',totalUnits:2}}])await assert.rejects(()=>s.assertAmendment(client('simple'),{},old,[{...old[0],...change}],'linear'),{code:'QUEUE_TYPE_WIND_DOWN_ONLY'});
 await assert.rejects(()=>s.assertAmendment(client('simple'),{},old,[...old,{...old[0],lineId:'b'}],'linear'),{code:'QUEUE_TYPE_WIND_DOWN_ONLY'});
 const paid=service('resource',true,true);await assert.rejects(()=>paid.assertAmendment(client('simple'),{},old,[{...old[0],quantity:3}],'linear'),{code:'QUEUE_TYPE_WIND_DOWN_ONLY'});
});
test('new unsupported advanced publication and simple bypass are rejected independently of booking',async()=>{
 const s=service();await assert.rejects(()=>s.assertAdmission(client('resource'),{},'resource'),{code:'QUEUE_TYPE_NOT_INCLUDED'});await assert.rejects(()=>s.assertAdmission(client('workflow'),{},'simple'),{code:'QUEUE_TYPE_ADMISSION_REQUIRED'});
});
test('Simple execution ignores retained mappings only when no actual binding or allocation exists',async()=>{
 const resources=require('../src/services/serviceResourceSessionService');
 for(const [allocation,bound,required] of [[false,false,false],[true,false,true],[false,true,true]]){
  const client={query:async sql=>({rows:sql.startsWith('SELECT\n    EXISTS')?[{enabled:true,bound}]:sql.includes('AS version,to_jsonb')?[{version:'1'}]:sql.startsWith('SELECT a.id')?(allocation?[{id:'1',released_at:null,outcome:null,group_id:null}]:[]):sql.includes("AS type FROM tickets")?[{type:'simple'}]:[]})};
  const state=await resources.readState(client,{_id:'3',tenantId:'1',locationId:'2',calledAt:'now'});assert.equal(state.required,required);assert.equal(Boolean(state.allocation),allocation);
 }
});
test('pinned Resource V4 records Start with the legacy timing flag off',async()=>{
 let starts=0;const current={_id:'3',tenantId:'1',locationId:'2',status:'called',serviceStartedAt:null,serviceEndedAt:null};
 const timing=loadModuleWithMocks(require.resolve('../src/services/ticketServiceTimingService'),{
 '../config/db':{},'../repositories/tickets':{findTicketByIdForUpdate:async()=>current,findTicketById:async()=>current},
 '../repositories/serviceTiming':{start:async()=>{starts++;current.serviceStartedAt='now';}},
 '../repositories/queueEvents':{createQueueEvent:async()=>({_id:'event'})},'../services/developerWebhookService':{enqueueQueueEvent:async()=>{}},'../services/queueService':{}
 });
 const client={query:async sql=>({rows:sql.startsWith('SELECT contract_version')?[{contract_version:4}]:sql.includes('SELECT l.service_timing_enabled')?[{service_timing_enabled:false,is_active:true,tenant_active:true}]:[]})};
 await timing.applySelectionTiming(client,{_id:'1'},'3','start',{location:{_id:'2'},actorUserId:'4'},'10');assert.equal(starts,1);assert.equal(current.serviceStartedAt,'now');
});
