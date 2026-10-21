const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function fixture({failCommit=false}={}){
 const sequence=[];let receipt=null;let created=0;
 const client={query:async(sql,args)=>{
  if(sql.includes('SELECT payload_hash,result'))return {rows:receipt?[receipt]:[]};
  if(sql.includes('SELECT l.is_active'))return {rows:[{is_active:true,tenant_active:true,queue_lifecycle_mode:'enforced',timezone:'UTC'}]};
  if(sql.includes("UPDATE queue_plan_drafts SET state='published'"))return {rows:[{id:'plan',revision:'2',published_ticket_id:'ticket'}]};
  if(sql.includes('INSERT INTO queue_plan_command_receipts'))receipt={payload_hash:args[4],result:JSON.parse(args[5])};
  return {rows:[]};
 }};
 const mocks={
  './queueServiceHoursService':{},
  '../config/db':{pool:{}},
  '../repositories/queuePlanDrafts':{find:async()=>({id:'plan',state:'draft',revision:'1',customer:{name:'QA'},notes:null,catalog_revision:'catalog',lines:[]}),validateDraft:()=>{},dto:()=>({id:'plan'})},
  '../repositories/queuePlanProjection':{read:async()=>({id:'plan',ticketId:'ticket'})},
  './queuePlanCatalog':{captureLines:async()=>[],assignStages:async()=>null},
  './queueWorkflowService':{read:async()=>({mode:'linear',configurationRevision:'1'})},
  './queueService':{assertQueueIntakeOpen:async()=>({businessDate:'2026-10-20'}),assertWaitingIntakeCapacityAvailable:async()=>{},createTicketForTenantInTransaction:async()=>{created++;return {_id:'ticket'};},recordCreatedTicketEvent:async()=>{}},
  './queueHelpers':{getDateKey:()=>{throw Error('unexpected fallback');}},
  './vendorQueueTransactionService':{withVendorQueueTransaction:async(_context,operation)=>{sequence.push('begin');const result=await operation(client,null,{tenantMemberships:[{role:'owner'}]});if(failCommit){receipt=null;sequence.push('rollback');throw Error('commit failed');}sequence.push('commit');return result;}},
  './platformMaintenanceService':{assertNewIntake:async()=>{}},
  './entitlementAdmissionService':{admit:async()=>{}},
  './storeHoursService':{assertLocationOpenForCustomerJoin:async()=>{}},
  './contentModeration':{assertPublicTextFieldsAllowed:()=>{}},
  './queueEvents':{publish:(tenant,payload,scope)=>sequence.push({tenant,payload,scope})},
 };
 const file=path.join(__dirname,'../src/services/queuePlanPublishService.js');const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:id=>Object.hasOwn(mocks,id)?mocks[id]:require(id),Buffer,console},{filename:file});
 const context={tenant:{_id:'1',slug:'courts'},location:{_id:'10'},actorUserId:'2'};
 const command={draftId:'plan',operationKey:'publish-unit',body:{expectedPlanRevision:'1',expectedCatalogRevision:'catalog'}};
 return {service:module.exports,context,command,sequence,created:()=>created};
}
test('published request invalidates its tenant/location after commit; same-key receipt replay creates no request or duplicate hint',async()=>{
 const f=fixture();const first=await f.service.publish(f.context,f.command);assert.equal(f.created(),1);
 const hints=f.sequence.filter(value=>typeof value==='object');assert.equal(hints.length,1);assert.equal(f.sequence.at(-2),'commit');assert.equal(hints[0].tenant,'courts');assert.equal(hints[0].scope.locationId,'10');assert.equal(hints[0].payload.planId,'plan');
 const replay=await f.service.publish(f.context,f.command);assert.equal(JSON.stringify(replay),JSON.stringify(first));assert.equal(f.created(),1);assert.equal(f.sequence.filter(value=>typeof value==='object').length,1);assert.equal(f.sequence.at(-1),'commit');
});
test('publication rollback emits no operational invalidation',async()=>{
 const f=fixture({failCommit:true});await assert.rejects(f.service.publish(f.context,f.command),/commit failed/);assert.equal(f.sequence.at(-1),'rollback');assert.equal(f.sequence.filter(value=>typeof value==='object').length,0);
});
