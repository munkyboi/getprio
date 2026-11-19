const test=require('node:test'),assert=require('node:assert/strict');
const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
const repository=require('../src/repositories/resourceCapacity');
const activationId=require.resolve('../src/services/localResourceActivationService'),activationCache=require.cache[activationId];
test.afterEach(()=>{if(activationCache)require.cache[activationId]=activationCache;else delete require.cache[activationId];});
const scope={tenantId:'7',locationId:'8',actorUserId:'35'};
// Scoped deterministic SQL/transaction adapter; no PostgreSQL or application calls.
function fixture({tracking=true,archived=null,authorized=true,serviceActive=true}={}){
 let state={pools:[{id:'1',name:'Courts',capacity:3,tracking_enabled:tracking,revision:1,archived_at:archived}],requirements:[],scopeRevision:1,immutable:{members:['Court1','Court2'],allocations:['in-service'],promises:['confirmed'],captures:['frozen']}},tail=Promise.resolve();const queries=[];
 function client(data){return{async query(sql,args=[]){queries.push({sql,args});
  if(sql.includes('FROM location_resource_pools')){
   const rows=args[0]===scope.tenantId&&args[1]===scope.locationId?data.pools.filter(pool=>args.length<3||pool.id===args[2]):[];
   // Honor the obsolete SQL predicate to ensure active-pool regression fails.
   return{rows:structuredClone(sql.includes('tracking_enabled = FALSE')?rows.filter(pool=>!pool.tracking_enabled):rows)};
  }
  if(sql.includes('FROM service_resource_requirements'))return{rows:structuredClone(data.requirements)};
  if(sql.includes('INSERT INTO service_resource_requirements')){const old=data.requirements.find(row=>row.service_id===args[2]);const row={service_id:args[2],pool_id:args[3],units_required:args[4],revision:(old?.revision||0)+1};data.requirements=data.requirements.filter(row=>row.service_id!==args[2]);data.requirements.push(row);return{rows:[structuredClone(row)],rowCount:1};}
  if(sql.includes('UPDATE resource_ledger_scopes')){data.scopeRevision++;return{rows:[],rowCount:1};}
  if(sql.includes('FROM tenants'))return{rows:[{id:'7',slug:null}]};
  if(sql.includes('FROM store_locations'))return{rows:[{id:'8'}]};
  if(sql.includes('FROM vendor_services'))return{rows:serviceActive?[{id:'9',name:'Court rental',is_active:true}]:[]};
  throw Error(sql);
 }};}
 const transaction=async fn=>{let release;const prior=tail;tail=new Promise(resolve=>release=resolve);await prior;const draft=structuredClone(state);try{const result=await fn(client(draft));state=draft;return result;}finally{release();}};
 const mocks={'./queueTypeService':{assertConfiguration:async()=>{}},'../config/db':{pool:{},withTransaction:transaction},'../repositories/resourceCapacity':repository,'../repositories/resourceLedger':{withScopeTransaction:async(options,fn)=>transaction(async c=>{queries.push({sql:'location-first lock',args:[]});if(!await options.authorize(c,scope))throw Object.assign(new Error('Not authorized'),{statusCode:403});return fn(c);})},'./resourcePoolLifecycleService':{describe:async(_c,_s,pools)=>pools},'./vendorQueueTransactionService':{readAuthorizedVendorQueueActor:async()=>authorized?{}:null},'./permissions':{userHasPermission:()=>authorized}};
 require.cache[activationId]={id:activationId,filename:activationId,loaded:true,exports:{describe:async()=>({available:false})}};
 const service=loadModuleWithMocks(require.resolve('../src/services/resourceConfigurationService'),mocks);
 return{queries,state:()=>structuredClone(state),repoClient:()=>client(state),read:()=>service.getConfiguration(scope),save:body=>service.saveConfiguration(scope,body),body:async(extra={})=>({action:'requirement',version:(await service.getConfiguration(scope)).version,serviceId:'9',poolId:'1',unitsRequired:1,...extra})};
}
test('active and inactive pools support requirement add/update without changing pool/tracking or immutable work',async()=>{
 for(const tracking of [true,false]){const f=fixture({tracking}),before=f.state();let result=await f.save(await f.body());assert.equal(result.requirements[0].units_required,1);result=await f.save(await f.body({unitsRequired:2}));assert.equal(result.requirements[0].revision,2);assert.equal(result.requirements[0].units_required,2);assert.deepEqual(f.state().pools,before.pools);assert.deepEqual(f.state().immutable,before.immutable);assert.equal(f.state().scopeRevision,before.scopeRevision+2);assert.ok(f.queries.some(query=>/FROM location_resource_pools[\s\S]*FOR UPDATE/u.test(query.sql)));assert.ok(!f.queries.some(query=>/UPDATE (location_resource_pools|resource_allocations|booking_v4_reservations|resource_pool_members)/u.test(query.sql)));}
});
test('repository refuses missing/foreign pool, archived pool, overcapacity and invalid units with structured errors',async()=>{
 const cases=[{options:{},data:{poolId:'2'},code:'RESOURCE_POOL_NOT_FOUND',statusCode:404},{options:{archived:'2026-10-23'},data:{},code:'RESOURCE_POOL_ARCHIVED',statusCode:409},{options:{},data:{unitsRequired:4},code:'RESOURCE_REQUIREMENT_EXCEEDS_CAPACITY',statusCode:400},{options:{},data:{unitsRequired:0},code:'RESOURCE_REQUIREMENT_INVALID_UNITS',statusCode:400}];
 for(const row of cases){const f=fixture(row.options),before=f.state();await assert.rejects(repository.setDraftRequirement(scope,{serviceId:'9',poolId:'1',unitsRequired:1,...row.data},{client:f.repoClient()}),{code:row.code,statusCode:row.statusCode});assert.deepEqual(f.state(),before);}
 const f=fixture();await assert.rejects(repository.setDraftRequirement({...scope,tenantId:'99'},{serviceId:'9',poolId:'1',unitsRequired:1},{client:f.repoClient()}),{code:'RESOURCE_POOL_NOT_FOUND',statusCode:404});
 await assert.rejects(repository.setDraftRequirement({...scope,locationId:'99'},{serviceId:'9',poolId:'1',unitsRequired:1},{client:f.repoClient()}),{code:'RESOURCE_POOL_NOT_FOUND',statusCode:404});
 await assert.rejects(repository.setDraftRequirement(scope,{serviceId:'9',poolId:'1',unitsRequired:1}),/explicit transaction client/);
});
test('service preserves stale-version, authorization and active-location-service boundaries without writes',async()=>{
 for(const options of [{authorized:false},{serviceActive:false},{archived:'2026-10-23'},{}]){const f=fixture(options),before=f.state();if(options.authorized===false){await assert.rejects(f.save({action:'requirement',version:'a'.repeat(64),serviceId:'9',poolId:'1',unitsRequired:1}),{statusCode:403});}else{const body=await f.body();if(options.archived)await assert.rejects(f.save(body),{code:'RESOURCE_POOL_ARCHIVED',statusCode:409});else if(options.serviceActive===false)await assert.rejects(f.save(body),{code:'RESOURCE_SERVICE_NOT_OFFERED',statusCode:400});else await assert.rejects(f.save({...body,version:'a'.repeat(64)}),{code:'RESOURCE_CONFIGURATION_STALE',statusCode:409});}assert.deepEqual(f.state(),before);}
 for(const [fields,error] of [[{serviceId:'99'},{code:'RESOURCE_SERVICE_NOT_OFFERED',statusCode:400}],[{poolId:'2'},{code:'RESOURCE_POOL_NOT_FOUND',statusCode:404}],[{unitsRequired:4},{code:'RESOURCE_REQUIREMENT_EXCEEDS_CAPACITY',statusCode:400}]]){const f=fixture(),before=f.state();await assert.rejects(f.save(await f.body(fields)),error);assert.deepEqual(f.state(),before);}
});
test('competing configuration versions serialize; stale update cannot alter mapping or add a revision',async()=>{
 const f=fixture(),body=await f.body();const result=await Promise.allSettled([f.save(body),f.save({...body,unitsRequired:2})]);assert.equal(result.filter(row=>row.status==='fulfilled').length,1);assert.equal(result.find(row=>row.status==='rejected').reason.code,'RESOURCE_CONFIGURATION_STALE');assert.equal(f.state().requirements.length,1);assert.equal(f.state().requirements[0].revision,1);assert.equal(f.state().scopeRevision,2);
});
