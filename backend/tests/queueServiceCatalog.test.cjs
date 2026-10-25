const test=require('node:test'),assert=require('node:assert/strict');
const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
function fixture({authorized=true,queue=true,booking=false,current=null}={}) {
 const calls=[];let stored=current&&structuredClone(current);
 const client={query:async()=>{throw Error('Unexpected SQL or allowance access');}};
 const ledger={withTenantCatalogTransaction:async(options,callback)=>{
  assert.equal(options.tenantId,'1');assert.equal(options.actorUserId,'actor');
  if(!await options.authorize(client,{}))throw Object.assign(Error('Denied'),{statusCode:403});
  return callback(client,['10']);
 },advanceBranchRevisions:async()=>{calls.push('revision');}};
 const catalog=loadModuleWithMocks(require.resolve('../src/services/serviceDeactivationService'),{
  '../config/db':{pool:{}},'../repositories/resourceLedger':ledger,
  './vendorQueueTransactionService':{readAuthorizedVendorQueueActor:async(_client,_scope,permission)=>{assert.equal(permission,'tenant.service.manage');calls.push('fresh-actor');return authorized?{}:null;}},
  '../repositories/vendorServices':{normalizeServiceSlug:require('../src/repositories/vendorServices').normalizeServiceSlug,findServiceByTenantAndSlug:async(tenant,slug,options)=>{assert.equal(tenant,'1');assert.equal(options.forUpdate,true);return slug==='foreign'?null:stored;}}
 });
 const service=loadModuleWithMocks(require.resolve('../src/services/queueServiceCatalogService'),{
  './serviceDeactivationService':catalog,'../repositories/resourceLedger':ledger,
  './entitlementAdmissionService':{admit:async input=>{assert.equal(input.featureKey,'queue');assert.equal(input.lockPolicy,true);calls.push('queue-feature');if(!queue)throw Object.assign(Error('No queue'),{statusCode:403});return {allowed:true};}},
  '../repositories/vendorServices':{createService:async data=>{calls.push('create');stored={_id:'2',...data};return stored;},updateService:async(id,changes)=>{assert.equal(id,'2');assert.ok(!Object.keys(changes).some(key=>/booking|price|payment/i.test(key)));calls.push('update');stored={...stored,...changes};return stored;}},
  '../repositories/storeLocations':{findLocationByTenantAndSlug:async(tenant,slug)=>{assert.equal(tenant,'1');return slug==='main'?{_id:'10',isActive:true}:null;}},
  '../repositories/locationServices':{upsertQueueLocationService:async data=>{assert.equal(data.tenantId,'1');calls.push('mapping');return data;}}
 });return{service,calls,read:()=>stored};
}
test('Free queue setup with zero allowances creates shared catalog via feature only and fresh actor',async()=>{
 const f=fixture();const result=await f.service.createQueueService({_id:'1'},{name:'Consultation',durationMinutes:30,locationServices:[{locationSlug:'main',isActive:true}]},{actorUserId:'actor'});
 assert.equal(result.service.name,'Consultation');assert.equal(result.service.tenantId,'1');assert.deepEqual(f.calls,['fresh-actor','queue-feature','create','mapping','revision']);
});
test('strict queue root and nested allowlists reject booking/pricing keys even false null unchanged',async()=>{
 const f=fixture();for(const key of ['allowBookingQuantity','bookingQuantityLabel','bookingQuantityMin','bookingQuantityMax','manualPaymentRequired','bookingCapacityScope','priceAmountCents','priceDisplay','purpose','tenantId'])for(const value of [false,null,0,'unchanged']){
 await assert.rejects(f.service.createQueueService({_id:'1'},{name:'A',durationMinutes:30,[key]:value},{actorUserId:'actor'}),{code:'QUEUE_SERVICE_FIELDS_INVALID'});
 }
 for(const key of ['capacity','priceAmountCents','priceDisplay','groupFunded','manualPaymentRequired','tenantId'])for(const value of [false,null,0])assert.throws(()=>f.service.validateQueuePayload({locationServices:[{locationSlug:'main',[key]:value}]}),{code:'QUEUE_SERVICE_FIELDS_INVALID'});
 assert.ok(!f.calls.includes('create'));
});
test('queue edit preserves Pro booking and pricing configuration exactly, uses existing ID',async()=>{
 const current={_id:'2',name:'A',slug:'a',durationMinutes:30,description:'',isActive:true,sortOrder:0,allowBookingQuantity:true,bookingQuantityLabel:'Sessions',bookingQuantityMin:2,bookingQuantityMax:7,manualPaymentRequired:true,bookingCapacityScope:'location',priceAmountCents:14500,priceDisplay:'Special price',currency:'PHP'};
 const f=fixture({booking:true,current});await f.service.updateQueueService({_id:'1'},'a',{name:'Queue renamed',locationServices:[{locationSlug:'main',sortOrder:2}]},{actorUserId:'actor'});
 for(const key of Object.keys(current).filter(key=>/booking|payment|price|currency/i.test(key)))assert.deepEqual(f.read()[key],current[key]);assert.equal(f.read()._id,'2');
});
test('queue permission, missing foreign service, foreign/inactive location and feature restrictions deny',async()=>{
 await assert.rejects(fixture({authorized:false}).service.createQueueService({_id:'1'},{name:'A',durationMinutes:30},{actorUserId:'actor'}),{statusCode:403});
 await assert.rejects(fixture({queue:false}).service.createQueueService({_id:'1'},{name:'A',durationMinutes:30},{actorUserId:'actor'}),{statusCode:403});
 await assert.rejects(fixture().service.updateQueueService({_id:'1'},'foreign',{name:'A'},{actorUserId:'actor'}),{statusCode:404});
 await assert.rejects(fixture().service.createQueueService({_id:'1'},{name:'A',durationMinutes:30,locationServices:[{locationSlug:'foreign'}]},{actorUserId:'actor'}),{statusCode:404});
});
test('queue mapping actual SQL cannot update booking capacity, pricing or retired campaign columns',async()=>{
 const repo=require('../src/repositories/locationServices');let sql;let args;
 await repo.upsertQueueLocationService({tenantId:'1',locationId:'10',serviceId:'2',isActive:false,sortOrder:3},{client:{query:async(s,a)=>{sql=s;args=a;return{rows:[{id:1,tenant_id:1,location_id:10,service_id:2,capacity:7,is_active:false,sort_order:3}]};}}});
 const mutation=sql.split('RETURNING')[0];assert.doesNotMatch(mutation,/capacity|price_|group_funded/);assert.match(mutation,/WHERE location_services.tenant_id=EXCLUDED.tenant_id/);assert.deepEqual(args,['1','10','2',false,3]);
});
test('existing booking catalog keeps booking feature admission and normal booking payload unchanged',async()=>{
 const fs=require('node:fs');const source=fs.readFileSync(require.resolve('../src/services/serviceDeactivationService'),'utf8');assert.match(source,/featureKey: "booking"/);assert.match(source,/normalizeServicePayload\(body, currentService\)/);
});
test('actual feature admission accepts exhausted Free queue configuration and denies paid booking',async()=>{
 const resolver=require('../src/services/entitlementResolver');let reads=0;
 const policy={lifecycle:{state:'active'},authority:{served:'new'},features:{queue:{enabled:true},booking:{enabled:false}},allowances:{queueTickets:{limit:0},serviceBookings:{limit:0}}};
 const actual=loadModuleWithMocks(require.resolve('../src/services/entitlementAdmissionService'),{'./entitlementResolver':{assertFeature:resolver.assertFeature,resolveTenantPolicy:async()=>{reads++;return policy;}}});
 const controls={entitlementQueueEnforcement:true,entitlementBookingEnforcement:true};
 assert.equal((await actual.admit({tenantId:'1',featureKey:'queue',controls,client:{query:()=>{throw Error('No credits SQL allowed');}},lockPolicy:true})).allowed,true);
 await assert.rejects(actual.admit({tenantId:'1',featureKey:'booking',controls}),{statusCode:403,code:'FEATURE_BOOKING_NOT_INCLUDED'});assert.equal(reads,2);
});
test('mounted queue catalog routes apply normal auth and permissions and retain shared response shape',async()=>{
 const express=require('express');const helpers=require('../src/routes/vendorRouteHelpers');
 const route=loadModuleWithMocks(require.resolve('../src/routes/vendorRoutes'),{
  '../middleware/auth':{authenticate:(req,res,next)=>{if(!req.headers.authorization)return res.status(401).json({error:'Unauthorized'});req.user={_id:'actor',roles:[]};next();},assertTenantPermission:(user,id,permission)=>{assert.equal(permission,'tenant.service.manage');if(id!=='1')throw Object.assign(Error('Denied'),{statusCode:403});},userHasTenantAccess:()=>true,revalidateAuthenticatedUser:async()=>{}},
  './vendorRouteHelpers':{...helpers,getAuthorizedTenant:async(_user,slug)=>({_id:slug==='own'?'1':'foreign'})},
  '../middleware/moderatePublicText':{moderatePublicText:(_req,_res,next)=>next()},
  '../services/queueServiceCatalogService':{createQueueService:async(tenant,body,options)=>{assert.equal(tenant._id,'1');assert.equal(options.actorUserId,'actor');return{service:{_id:'2',name:body.name,slug:'queue',durationMinutes:30,isActive:true},locationServices:[]};},updateQueueService:async()=>({service:{_id:'2',name:'Edited',slug:'queue',durationMinutes:30,isActive:true},locationServices:[]})}
 });
 const app=express();app.use(express.json());app.use('/api/vendor',route);app.use((error,req,res,next)=>res.status(error.statusCode||500).json({error:error.message}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const base=`http://127.0.0.1:${server.address().port}/api/vendor/tenant`;
 const send=(tenant,method='POST',auth=true)=>fetch(`${base}/${tenant}/queue/services${method==='PATCH'?'/queue':''}`,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'test'}:{})},body:JSON.stringify({name:'Queue'})});
 assert.equal((await send('own','POST',false)).status,401);assert.equal((await send('foreign')).status,403);
 const created=await send('own');assert.equal(created.status,201);assert.equal((await created.json()).service.id,'2');assert.equal((await send('own','PATCH')).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
