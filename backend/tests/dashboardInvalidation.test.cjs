const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function load(name,mocks){const file=path.join(__dirname,'../src/services',name);const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:id=>Object.hasOwn(mocks,id)?mocks[id]:require(require.resolve(id,{paths:[path.dirname(file)]})),console,Buffer},{filename:file});return module.exports;}
const context={tenant:{_id:'1',slug:'courts'},location:{_id:'10'},actorUserId:'2'};
function fixture({expired=false,rollback=false}={}){
 const sequence=[];const client={query:async()=>({rows:[]})};
 const transaction={withVendorQueueTransaction:async(_scope,operation)=>{sequence.push('begin');const result=await operation(client,null,{tenantMemberships:[{role:'owner'}]});if(rollback){sequence.push('rollback');throw Error('commit failed');}sequence.push('commit');return result;}};
 const events={publish:(slug,payload,scope)=>sequence.push({slug,payload,scope})};
 return {sequence,transaction,events,client,expired};
}
test('published-plan expiry read/list emits only after committed actual expiry, never ordinary reads or rollback',async()=>{
 for(const mode of ['read','list'])for(const expired of [false,true])for(const rollback of [false,true]){
  const f=fixture({expired,rollback});
  const service=load('queuePlanDraftService.js',{'../config/db':{pool:{}},'./vendorQueueTransactionService':f.transaction,'./queueEvents':f.events,'../repositories/queuePlanDrafts':{find:async()=>({id:'p',state:'published'}),list:async()=>({plans:[{id:'p'}]})},'../repositories/queuePlanProjection':{read:async()=>({id:'p'})},'../repositories/queueGroupedLedger':{expireUnstarted:async()=>expired}});
  const operation=mode==='read'?service.read(context,'p'):service.list(context,null,'active');
  if(rollback)await assert.rejects(operation,/commit failed/);else await operation;
  const hints=f.sequence.filter(item=>typeof item==='object');assert.equal(hints.length,expired&&!rollback?1:0);
  if(hints.length){assert.equal(f.sequence.at(-2),'commit');assert.equal(hints[0].slug,'courts');assert.equal(hints[0].scope.locationId,'10');}
 }
});
test('named configuration mutation invalidates scoped readers after commit and never after rollback',async()=>{
 for(const rollback of [false,true]){
  const f=fixture({rollback});f.client.query=async sql=>({rows:sql.includes('SELECT id::text,name,capacity')?[{id:'100',capacity:4}]:[]});
  const service=load('queueNamedResourceConfigurationService.js',{'../config/db':{pool:{}},'./vendorQueueTransactionService':f.transaction,'./queueEvents':f.events,'../repositories/queueCommandReceipt':{execute:async(_client,_scope,_command,operation)=>operation()}});
  const operation=service.reorderMembers(context,{poolId:'100',memberIds:[],operationKey:'key'});
  if(rollback)await assert.rejects(operation,/commit failed/);else await operation;
  const hints=f.sequence.filter(item=>typeof item==='object');assert.equal(hints.length,rollback?0:1);if(hints.length){assert.equal(f.sequence.at(-2),'commit');assert.equal(hints[0].scope.locationId,'10');}
 }
});
test('SSE auth revalidation reloads JWT/session/user/MFA without touching inactivity; ordinary authenticate still touches',async()=>{
 let touches=0,loads=0,verified=0;let status='active';let privileged=false;let mfa=true;
 const file=path.join(__dirname,'../src/middleware/auth.js');const module={exports:{}};
 const mocks={jsonwebtoken:{verify:()=>{verified++;return {session_id:7,sub:'2'};}},'../config/env':{jwtSecret:'unit',authCookieSecure:false,sessionInactivityMinutes:30},'../repositories/authSessions':{findSessionById:async()=>({ _id:7,status,expiresAt:new Date(Date.now()+60000),mfaVerifiedAt:mfa?'yes':null}),touchSession:async()=>touches++},'../repositories/users':{findUserById:async()=>{loads++;return {roles:['staff'],mfaEnabled:true};}},'../services/permissions':{},'../services/mfaService':{userRequiresPrivilegedMfa:()=>privileged},'../services/browserSessionService':{getAccessCookie:()=>null,parseCookies:()=>({})},'./apiPath':{normalizeApiPath:v=>v},'../services/sandboxTestAccountAccess':{assertRequestAllowed:()=>{}}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:id=>mocks[id],Date,Number,String,Set},{filename:file});
 const auth=module.exports;const req={headers:{authorization:'Bearer unit'},method:'GET',originalUrl:'/vendor/tenant/courts/queue/stream'};
 await auth.revalidateAuthenticatedUser(req);await auth.revalidateAuthenticatedUser(req);assert.equal(touches,0);assert.equal(loads,2);assert.equal(verified,2);
 await new Promise((resolve,reject)=>auth.authenticate(req,{},error=>error?reject(error):resolve()));assert.equal(touches,1);
 status='revoked';await assert.rejects(auth.revalidateAuthenticatedUser(req),{statusCode:401});assert.equal(touches,1);
 status='active';privileged=true;mfa=false;await assert.rejects(auth.revalidateAuthenticatedUser(req),{code:'MFA_VERIFICATION_REQUIRED'});assert.equal(touches,1);
});
test('committed command expiry notifies before RESERVATION_EXPIRED error; failed commit never notifies',async()=>{
 for(const rollback of [false,true]){
  const f=fixture({rollback});const mocks={};
  for(const name of ['../config/db','../repositories/queuePlanDrafts','../repositories/queuePlanProjection','../repositories/queueGroupedLedger','../repositories/tickets','./queuePlanCatalog','./queueWorkflowService','./queueService','./ticketServiceTimingService','./counterDispatchService','../repositories/queueEvents','./developerWebhookService','./queueStageService'])mocks[name]={};
  Object.assign(mocks,{'../config/db':{pool:{}},'./vendorQueueTransactionService':f.transaction,'./queueEvents':f.events,'./queueCounterBinding':{validate:()=>{}},'../repositories/queuePlanDrafts':{find:async()=>({id:'plan',state:'published'})},'../repositories/queueGroupedLedger':{expireUnstarted:async()=>true},'../repositories/queuePlanProjection':{read:async()=>({id:'plan'})}});
  const service=load('queuePlanCommandService.js',mocks);
  await assert.rejects(service.execute(context,{draftId:'plan',action:'start',operationKey:'expiry-unit',body:{expectedTicketRevision:'1',expectedPlanRevision:'1',currentStageId:'stage',expectedStageRevision:'1'}}),rollback?/commit failed/:{code:'RESERVATION_EXPIRED'});
  const hints=f.sequence.filter(item=>typeof item==='object');assert.equal(hints.length,rollback?0:1);if(hints.length){assert.equal(f.sequence.at(-2),'commit');assert.equal(hints[0].payload.planId,'plan');}
 }
});
