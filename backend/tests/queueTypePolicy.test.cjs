const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
const target=path.resolve(__dirname,'../src/services/queueTypeService.js');
const service=loadModuleWithMocks(target,{'../config/db':{},'../repositories/resourceLedger':{},'../services/entitlementResolver':{},'../services/securityAuditService':{}});
test('queue capabilities depend on current policy not tier labels or booking',()=>{
 const policy=(queue,resourceQueue,workflowQueue)=>({lifecycle:{state:'active'},features:Object.fromEntries(Object.entries({queue,resourceQueue,workflowQueue,booking:true}).map(([k,enabled])=>[k,{enabled}]))});
 assert.deepEqual(service.capabilities(policy(true,false,false)),{simple:true,resource:false,workflow:false});
 assert.deepEqual(service.capabilities(policy(true,true,false)),{simple:true,resource:true,workflow:false});
 assert.deepEqual(service.capabilities(policy(true,true,true)),{simple:true,resource:true,workflow:true});
 assert.deepEqual(service.capabilities(policy(false,true,true)),{simple:false,resource:false,workflow:false});
 assert.deepEqual(service.capabilities({lifecycle:{state:'active'},features:{queue:{enabled:true}}}),{simple:true,resource:false,workflow:false});
 assert.equal(service.capabilities({...policy(true,true,true),lifecycle:{state:'restricted'}}).workflow,false);
});
test('strict future-only setting commands reject implicit conversion or malformed revisions',()=>{
 const valid={type:'simple',expectedRevision:'1',confirmedFutureOnly:true};assert.doesNotThrow(()=>service.validate(valid));
 for(const patch of [{type:'pro'},{type:'legacy'},{expectedRevision:1},{expectedRevision:'0'},{confirmedFutureOnly:false},{convertExisting:true},{reason:null}])assert.throws(()=>service.validate({...valid,...patch}),{code:'INVALID_COMMAND'});
});
const fixtures=require('../src/domain/planPolicyFixtures');
test('published defaults retain economical billing slug and separate booking',()=>{
 for(const [slug,expected] of Object.entries({free:[false,false],economical:[true,false],pro:[true,true],enterprise:[true,true]})){
 const f=fixtures.PLAN_POLICY_FIXTURES[slug].features;assert.deepEqual([f.resourceQueue,f.workflowQueue],expected);assert.equal(f.queue,true);
 }
 assert.equal(fixtures.PLAN_POLICY_FIXTURES.free.features.booking,false);
});
function commandHarness({role='owner',revision='1',resource=false,actor=true,resourceReady=false}={}){
 const writes=[],audits=[],events=[];
 const scope={tenantId:'1',locationId:'2',actorUserId:'3'};
 let current='simple';
 const client={query:async(sql,args)=>{
  if(sql.startsWith('SELECT l.slug'))return {rows:[{slug:'main',tenant_slug:'tenant',queue_type:current,revision}]};
  if(sql.includes('SELECT s.id::text'))return {rows:resourceReady?[{id:'5'}]:[]};
  if(sql.includes('information_schema'))return {rows:[{ready:true}]};
  if(sql.startsWith('UPDATE store_locations')){writes.push({sql,args});current=args[2];revision=String(BigInt(revision)+1n);return {rows:[]};}
  throw new Error(`Unexpected SQL ${sql}`);
 }};
 const module=loadModuleWithMocks(target,{
 '../config/db':{pool:{},withTransaction:fn=>fn(client)},
 '../repositories/resourceLedger':{withScopeTransaction:async(options,fn)=>{if(!await options.authorize(client,scope))throw Object.assign(new Error('Forbidden'),{statusCode:403});return fn(client);}},
 '../repositories/queueCommandReceipt':{execute:async(c,s,command,fn)=>{assert.equal(command.action,'location_queue_type');return fn();}},
 '../services/entitlementResolver':{resolveTenantPolicy:async(id,options)=>{assert.equal(options.client,client);return {lifecycle:{state:'active'},features:{queue:{enabled:true},resourceQueue:{enabled:resource},workflowQueue:{enabled:false}}};}},
 '../services/vendorQueueTransactionService':{readAuthorizedVendorQueueActor:async()=>actor?{tenantMemberships:[{role}]}:null},
 '../services/permissions':{userHasPermission:()=>true},
 '../services/securityAuditService':{record:async value=>audits.push(value)},
 '../services/queueEvents':{publish:(...value)=>events.push(value)},
 '../services/queueWorkflowService':{read:async()=>({mode:'linear',stages:[]})},
 '../services/queueResourceMinimumFeasibility':{evaluate:()=>({requestable:resourceReady})}
 });
 return {module,writes,audits,events,context:{tenant:{_id:'1',slug:'tenant'},location:{_id:'2'},actorUserId:'3'}};
}
test('current owner grant and revision are rechecked before any setting write',async()=>{
 for(const options of [{role:'staff'},{actor:false}]){const h=commandHarness(options);await assert.rejects(()=>h.module.put(h.context,{type:'simple',expectedRevision:'1',confirmedFutureOnly:true},'key'),{statusCode:403});assert.equal(h.writes.length,0);}
 const h=commandHarness({revision:'2'});await assert.rejects(()=>h.module.put(h.context,{type:'simple',expectedRevision:'1',confirmedFutureOnly:true},'key'),{code:'STALE_REVISION'});assert.equal(h.writes.length,0);
});
test('unsupported new type is denied without rewriting historical work',async()=>{
 const h=commandHarness();await assert.rejects(()=>h.module.put(h.context,{type:'resource',expectedRevision:'1',confirmedFutureOnly:true},'key'),{code:'QUEUE_TYPE_NOT_INCLUDED'});assert.equal(h.writes.length,0);assert.equal(h.audits.length,0);assert.equal(h.events.length,0);
});
test('unchanged simple configuration is credit-neutral and does not rewrite or emit work',async()=>{
 const h=commandHarness();const response=await h.module.put(h.context,{type:'simple',expectedRevision:'1',confirmedFutureOnly:true},'key');assert.equal(response.type,'simple');assert.equal(h.writes.length,0);assert.equal(h.audits.length,0);assert.equal(h.events.length,0);
});
test('legacy resolver advanced capabilities use published plan, not stale subscriber snapshot',()=>{
 const r=loadModuleWithMocks(require.resolve('../src/services/entitlementResolver'),{'../repositories/entitlementResolver':{}});
 const values=r.buildLegacyValues({plan:{legacyEntitlements:{queueSystemAccess:true,resourceQueueAccess:false,workflowQueueAccess:true}},subscription:{legacyEntitlements:{queueSystemAccess:true,resourceQueueAccess:true,workflowQueueAccess:false}}});
 assert.equal(values.features.resourceQueue.enabled,false);assert.equal(values.features.workflowQueue.enabled,true);
});

test('successful setting changes update only location metadata and emit audit/event after transaction',async()=>{
 const h=commandHarness({resource:true,resourceReady:true});const response=await h.module.put(h.context,{type:'resource',expectedRevision:'1',confirmedFutureOnly:true},'key');
 assert.equal(response.type,'resource');assert.equal(response.revision,'2');assert.equal(h.writes.length,1);assert.match(h.writes[0].sql,/UPDATE store_locations SET queue_type/);assert.equal(h.audits.length,1);assert.equal(h.audits[0].metadata.futureAdmissionsOnly,true);assert.equal(h.events.length,1);
});
test('resource capability alone cannot activate invalid setup',async()=>{
 const h=commandHarness({resource:true});await assert.rejects(()=>h.module.put(h.context,{type:'resource',expectedRevision:'1',confirmedFutureOnly:true},'key'),{code:'QUEUE_TYPE_NOT_READY'});assert.equal(h.writes.length,0);
});

test('legacy authority revokes new capabilities immediately after published defaults change',()=>{
 const r=loadModuleWithMocks(require.resolve('../src/services/entitlementResolver'),{'../repositories/entitlementResolver':{}});
 const input={plan:{legacyEntitlements:{queueSystemAccess:true,resourceQueueAccess:true,workflowQueueAccess:true}},subscription:{legacyEntitlements:{queueSystemAccess:true,resourceQueueAccess:true,workflowQueueAccess:true}}};
 assert.equal(r.buildLegacyValues(input).features.resourceQueue.enabled,true);
 input.plan.legacyEntitlements.resourceQueueAccess=false;input.plan.legacyEntitlements.workflowQueueAccess=false;
 assert.equal(r.buildLegacyValues(input).features.resourceQueue.enabled,false);assert.equal(r.buildLegacyValues(input).features.workflowQueue.enabled,false);
 input.plan.legacyEntitlements.resourceQueueAccess=true;input.plan.legacyEntitlements.queueSystemAccess=false;
 assert.equal(r.buildLegacyValues(input).features.resourceQueue.enabled,false);
});
