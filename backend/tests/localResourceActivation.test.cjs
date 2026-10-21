const test=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{runInNewContext}=require('node:vm'),{createRequire}=require('node:module');
const config=()=>({labels:{service:'Service',resources:'Courts',duration:'Duration',extras:'Extras'},assignment:{mode:'named',allocationIdentity:'named_member'},duration:{mode:'fixed',visible:true,baseMinutes:30,minCount:1,maxCount:1,stepCount:1,defaultCount:1},extras:[],execution:{resourceStart:'together',extraStart:'with_parent',extraContainment:'within_parent',selectedExtraResolution:'explicit_required'}});
function fixture(){
 const state={pool:{id:'13',capacity:2,tracking_enabled:false,revision:1,archived_at:null},setup:[{id:'1',pool_id:'13',capacity:2,units_required:1,tracking_enabled:false,active_members:2,configuration:config()}],authorized:true,serviceGrant:true,role:'owner',workflow:{mode:'linear',stages:[]},guard:true,capability:true,live:false,invalid:false,receipts:new Map(),queries:[],events:[],committed:false,failCommit:false};let before;
 const client={query:async(sql,args=[])=>{state.queries.push({sql,args});
  if(sql==='BEGIN'){before={pool:structuredClone(state.pool),receipts:new Map(state.receipts)};state.committed=false;return {rows:[]};}
  if(sql==='ROLLBACK'){state.pool=before.pool;state.receipts=before.receipts;return {rows:[]};}
  if(sql==='COMMIT'){if(state.failCommit)throw Error('commit failed');state.committed=true;return {rows:[],command:'COMMIT'};}
  if(sql.includes('SELECT id FROM store_locations'))return {rows:[{id:'4'}]};
  if(sql.includes('SELECT id FROM tenants'))return {rows:[{id:'1'}]};
  if(sql.includes('INSERT INTO resource_ledger_scopes'))return {rows:[]};
  if(sql.includes('to_regclass'))return {rows:[{receipts:state.capability,tracking_supported:state.capability}]};
  if(sql.includes('SELECT payload_hash,result FROM queue_plan_command_receipts'))return {rows:state.receipts.has(args[3])?[state.receipts.get(args[3])]:[]};
  if(sql.includes('INSERT INTO queue_plan_command_receipts')){state.receipts.set(args[3],{payload_hash:args[4],result:JSON.parse(args[5])});return {rows:[]};}
  if(sql.includes('SELECT revision FROM resource_ledger_scopes'))return {rows:[{revision:'1'}]};
  if(sql.includes('SELECT *,id::text'))return {rows:args[2]==='13'?[structuredClone(state.pool)]:[]};
  if(sql.includes('SELECT s.id::text'))return {rows:state.setup};
  if(sql.includes('SELECT 1 FROM service_resource_requirements'))return {rows:state.invalid?[{}]:[]};
  if(sql.includes('SELECT 1 FROM resource_allocations'))return {rows:state.live?[{}]:[]};
  if(sql.startsWith('UPDATE location_resource_pools')){state.pool.tracking_enabled=true;state.pool.revision++;return {rows:[],rowCount:1};}
  if(sql.startsWith('UPDATE resource_ledger_scopes'))return {rows:[],rowCount:1};
  if(sql.includes('SELECT slug FROM tenants'))return {rows:[{slug:'sports'}]};
  throw Error('Unexpected query '+sql);
 },release:()=>{}};
 const file=require.resolve('../src/services/localResourceActivationService'),real=createRequire(file),module={exports:{}};
 runInNewContext(readFileSync(file,'utf8'),{module,exports:module.exports,require:name=>name==='../config/db'?{pool:{connect:async()=>client}}:name==='./localFixtureTenantScope'?{read:async()=>state.guard?{tenantId:'1',locationId:'4',anchorLocationId:'1'}:null}:name==='./vendorQueueTransactionService'?{readAuthorizedVendorQueueActor:async(_client,scope,permission,options)=>{assert.equal(permission,'tenant.location.manage');assert.equal(options.forShare,true);state.queries.push({sql:'FRESH_ACTOR',args:[]});return state.authorized?{tenantMemberships:[{role:state.role}]}:null;}}:name==='./queueWorkflowService'?{read:async()=>state.workflow}:name==='./permissions'?{userHasPermission:()=>state.serviceGrant}:name==='./queueEvents'?{publish:(...args)=>{assert.equal(state.committed,true);state.events.push(args);}}:real(name)},{filename:file});
 const scope={tenantId:'1',locationId:'4',actorUserId:'5',localRequest:true},body={expectedPoolRevision:'1',configurationVersion:'a'.repeat(64)};
 const read=async()=>({version:'a'.repeat(64),pools:[structuredClone(state.pool)],trackingAvailable:false});
 return {state,client,service:module.exports,scope,body,activate:(key='activate-1',input=body)=>module.exports.activate(scope,'13',input,key,read)};
}
test('activation changes only tracking and revisions, audits actor via receipt, scoped hint after commit and exact replay before stale readiness',async()=>{
 const f=fixture();const result=await f.activate();assert.equal(f.state.pool.tracking_enabled,true);assert.equal(f.state.pool.revision,2);assert.equal(result.activation.actorUserId,'5');assert.equal(f.state.events.length,1);assert.equal(f.state.events[0][2].locationId,'4');
 const writes=f.state.queries.filter(q=>/^UPDATE/.test(q.sql));assert.equal(writes.length,2);assert.ok(writes[0].sql.includes('tracking_enabled=TRUE,revision=revision+1'));assert.ok(!writes.some(q=>/capacity=|configuration=|membership|marker/.test(q.sql)));
 f.state.live=true;f.state.setup=[];const replay=await f.activate();assert.deepEqual(replay,JSON.parse(JSON.stringify(result)));assert.equal(f.state.events.length,1);assert.equal(f.state.queries.filter(q=>/^UPDATE/.test(q.sql)).length,2);
 const actorAt=f.state.queries.findIndex(q=>q.sql==='FRESH_ACTOR'),receiptAt=f.state.queries.findIndex(q=>q.sql.includes('SELECT payload_hash,result'));assert.ok(actorAt<receiptAt);
 await assert.rejects(f.activate('activate-1',{...f.body,expectedPoolRevision:'2'}),{code:'IDEMPOTENCY_CONFLICT'});
 f.state.authorized=false;await assert.rejects(f.activate(),{statusCode:403});
});
test('denied actor/capability, stale revisions and commit failure never leave activation or emit hints',async()=>{
 for(const variant of ['actor','servicePermission','staff','scope','constraint','revision','configVersion','archived','live','requirements','policy','members','requiredExtra','commit']){
  const f=fixture();let body=f.body;
  if(variant==='actor')f.state.authorized=false;if(variant==='servicePermission')f.state.serviceGrant=false;if(variant==='staff')f.state.role='staff';if(variant==='scope')f.state.guard=false;if(variant==='constraint')f.state.capability=false;
  if(variant==='revision')body={...body,expectedPoolRevision:'2'};if(variant==='configVersion')body={...body,configurationVersion:'b'.repeat(64)};if(variant==='archived')f.state.pool.archived_at='2026-10-01';if(variant==='live')f.state.live=true;if(variant==='requirements')f.state.invalid=true;if(variant==='policy')f.state.setup[0].configuration=null;if(variant==='members')f.state.setup[0].active_members=0;if(variant==='requiredExtra')f.state.setup[0].configuration.extras=[{serviceId:'2',selection:'required'}];if(variant==='commit')f.state.failCommit=true;
  await assert.rejects(f.activate('key-'+variant,body),undefined,variant);assert.equal(f.state.pool.tracking_enabled,false,variant);assert.equal(f.state.pool.revision,1,variant);assert.equal(f.state.events.length,0,variant);assert.equal(f.state.receipts.size,0,variant);
 }
});
test('management preflight matches activation: ignores only target disabled tracking, dependent pool and required extra policy remain enforced',async()=>{
 const f=fixture();let state=await f.service.describe(f.client,f.scope,[f.state.pool]);assert.equal(state.available,true);assert.equal(state.pools[0].status,'ready');
 f.state.setup[0].configuration.extras=[{serviceId:'2',selection:'required'}];f.state.setup.push({id:'2',pool_id:'14',capacity:10,units_required:1,tracking_enabled:false,active_members:0,configuration:{...config(),assignment:{mode:'automatic',allocationIdentity:'pooled_capacity'}}});
 state=await f.service.describe(f.client,f.scope,[f.state.pool]);assert.equal(state.pools[0].status,'blocked');await assert.rejects(f.activate(),{code:'SERVICE_POLICY_SETUP_REQUIRED'});
 f.state.setup[1].tracking_enabled=true;state=await f.service.describe(f.client,f.scope,[f.state.pool]);assert.equal(state.pools[0].status,'ready');
 f.state.setup.push({id:'3',pool_id:'13',configuration:null});await f.activate();assert.equal(f.state.setup[2].configuration,null);
});

test('same-tenant anchor guard resolves target independently and rejects foreign, ambiguous, missing and nonlocal scopes',async()=>{
 const file=require.resolve('../src/services/localFixtureTenantScope'),real=createRequire(file),module={exports:{}};
 const state={configuration:true,database:'getprio_local_pool_demo_exact',address:'127.0.0.1',marker:true,anchors:[{tenant_id:'1',location_id:'1'}],target:true,verified:true};
 const client={query:async(sql,args)=>{assert.ok(!/^\s*(INSERT|UPDATE|DELETE|ALTER)/iu.test(sql));if(sql.includes('current_database()'))return {rows:[{database_name:state.database,server_address:state.address,has_marker:state.marker}]};if(sql.includes('FROM public.local_pool_demo_scopes')){assert.equal(args[0],'1');return {rows:state.anchors};}if(sql.includes('FROM store_locations')){assert.equal(args[0],'1');assert.equal(args[1],'4');return {rows:state.target?[{id:'4'}]:[]};}throw Error(sql);}};
 runInNewContext(readFileSync(file,'utf8'),{module,exports:module.exports,require:name=>name==='./localPoolDemoScope'?{localPoolDemoConfiguration:()=>state.configuration?{databaseName:'getprio_local_pool_demo_exact'}:null,readLocalPoolDemoScope:async(_client,scope)=>state.verified&&scope.tenantId==='1'&&scope.locationId==='1'}:real(name)},{filename:file});
 const helper=module.exports,scope={tenantId:'1',locationId:'4'};assert.equal((await helper.read(client,scope)).locationId,'4');assert.equal((await helper.read(client,scope)).anchorLocationId,'1');
 for(const [key,value] of [['configuration',false],['database','foreign'],['address','203.0.113.10'],['marker',false],['anchors',[]],['anchors',[{tenant_id:'2',location_id:'1'}]],['anchors',[{tenant_id:'1',location_id:'1'},{tenant_id:'1',location_id:'9'}]],['target',false],['verified',false]]){const old=state[key];state[key]=value;assert.equal(await helper.read(client,scope),null,key);state[key]=old;}
 assert.equal(helper.loopbackRequest({socket:{remoteAddress:'127.0.0.1'}}),true);assert.equal(helper.loopbackRequest({socket:{remoteAddress:'203.0.113.10'},headers:{'x-forwarded-for':'127.0.0.1'}}),false);
});
test('already-enabled no-change command records receipt but emits no invalidation',async()=>{const f=fixture();f.state.pool.tracking_enabled=true;const result=await f.activate();assert.equal(result.activation.afterRevision,'1');assert.equal(f.state.events.length,0);assert.equal(f.state.queries.filter(q=>/^UPDATE/.test(q.sql)).length,0);});

test('minimum feasibility blocks an impossible parent while pool readiness preserves other feasible mapped services',async()=>{
 for(const kind of ['samePoolCapacity','durationContainment']){
  const f=fixture();const parent=config();parent.assignment={mode:'automatic',allocationIdentity:'pooled_capacity'};parent.extras=[{serviceId:'2',selection:'required'}];f.state.setup[0].configuration=parent;
  const extra=config();extra.assignment={mode:'automatic',allocationIdentity:'pooled_capacity'};
  if(kind==='samePoolCapacity'){f.state.pool.capacity=1;f.state.setup[0].capacity=1;}
  else extra.duration.baseMinutes=60;
  f.state.setup.push({id:'2',pool_id:kind==='samePoolCapacity'?'13':'14',capacity:kind==='samePoolCapacity'?1:2,units_required:1,tracking_enabled:kind!=='samePoolCapacity',active_members:0,configuration:extra});
  assert.equal(f.service.configured(f.state.setup[0],'13',f.state.setup,f.state.workflow),false,kind);
  const view=await f.service.describe(f.client,f.scope,[f.state.pool]);
  if(kind==='samePoolCapacity'){assert.equal(view.pools[0].status,'ready','the extra itself remains a feasible independent mapped service');await f.activate();assert.equal(f.state.pool.tracking_enabled,true);continue;}
  assert.equal(view.pools[0].status,'blocked',kind);await assert.rejects(f.activate(),{code:'SERVICE_POLICY_SETUP_REQUIRED'});assert.equal(f.state.pool.tracking_enabled,false);assert.equal(f.state.events.length,0);assert.equal(f.state.queries.filter(q=>q.sql.startsWith('UPDATE')).length,0);
 }
});
