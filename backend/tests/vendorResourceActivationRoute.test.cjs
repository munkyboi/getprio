const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),path=require('node:path');
test('actual app normal activation capability is guarded, revisioned, atomic, audited and idempotent',()=>{
const script=String.raw`
const assert=require('node:assert/strict'),Module=require('node:module'),jwt=require('jsonwebtoken');const load=Module._load;
const policy={labels:{service:'Service',resources:'Courts',duration:'Duration',extras:'Extras'},assignment:{mode:'named',allocationIdentity:'named_member'},duration:{mode:'fixed',visible:true,baseMinutes:30,minCount:1,maxCount:1,stepCount:1,defaultCount:1},extras:[],execution:{resourceStart:'together',extraStart:'with_parent',extraContainment:'within_parent',selectedExtraResolution:'explicit_required'}};
let state,open=false,before,events=0,sqls=[],receipts=new Map(),client;
function reset(extra={}){state={pool:{id:'13',capacity:2,tracking_enabled:false,revision:1,archived_at:null},role:'owner',active:true,audits:0,...extra};receipts=new Map();events=0;sqls=[];}
const cfg=()=>({version:state.badConfig?'b'.repeat(64):'a'.repeat(64),pools:[structuredClone(state.pool)],trackingAvailable:false});
async function query(sql,args=[]){sqls.push({sql,args});
 if(sql==='BEGIN'){before={pool:structuredClone(state.pool),audits:state.audits,receipts:new Map(receipts)};open=true;return {rows:[]};}
 if(sql==='COMMIT'){if(state.failCommit)throw Error('commit failed');open=false;return {rows:[],command:'COMMIT'};}
 if(sql==='ROLLBACK'){state.pool=before.pool;state.audits=before.audits;receipts=before.receipts;open=false;return {rows:[]};}
 if(sql.includes('SELECT id FROM store_locations'))return {rows:state.active?[{id:'10'}]:[]};
 if(sql.includes('SELECT t.id FROM tenants'))return {rows:state.active?[{id:'1'}]:[]};
 if(sql.includes('SELECT u.roles,m.role'))return {rows:state.revoked?[]:[{roles:['vendor'],role:state.role}]};
 if(sql.includes('INSERT INTO resource_ledger_scopes'))return {rows:[]};
 if(sql.includes("to_regclass('public.queue_plan_command_receipts')"))return {rows:[{receipts:!state.schemaMissing,audit_ready:!state.schemaMissing,tracking_supported:!state.schemaMissing}]};
 if(sql.includes('SELECT payload_hash,result'))return {rows:receipts.has(args[3])?[receipts.get(args[3])]:[]};
 if(sql.includes('INSERT INTO queue_plan_command_receipts')){assert.ok(open);receipts.set(args[3],{payload_hash:args[4],result:JSON.parse(args[5])});return {rows:[]};}
 if(sql.includes('SELECT revision FROM resource_ledger_scopes'))return {rows:[{revision:'1'}]};
 if(sql.includes('SELECT *,id::text'))return {rows:args[2]==='13'?[structuredClone(state.pool)]:[]};
 if(sql.includes('SELECT s.id::text'))return {rows:[{id:'1',pool_id:'13',capacity:2,units_required:1,tracking_enabled:state.pool.tracking_enabled,active_members:state.noMembers?0:2,configuration:state.badPolicy?null:policy}]};
 if(sql.includes('SELECT 1 FROM service_resource_requirements'))return {rows:state.invalidDemand?[{}]:[]};
 if(sql.includes('SELECT 1 FROM resource_allocations'))return {rows:state.live?[{}]:[]};
 if(sql.includes('to_regclass(format'))return {rows:[{available:true}]};
 if(sql.includes('SELECT 1 FROM booking_v4_reservations'))return {rows:state.bookingPromise?[{}]:[]};
 if(sql.includes('SELECT v.revision::text'))return {rows:[]};
 if(sql.startsWith('UPDATE location_resource_pools')){assert.ok(open);state.pool.tracking_enabled=true;state.pool.revision++;return {rows:[],rowCount:1};}
 if(sql.startsWith('UPDATE resource_ledger_scopes'))return {rows:[],rowCount:1};
 if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
 if(sql.includes('SELECT event_digest'))return {rows:[]};
 if(sql.includes('INSERT INTO security_audit_events')){assert.ok(open,'audit must share transaction');if(state.auditFails)throw Error('audit failed');state.audits++;return {rows:[{id:1,event_digest:'test-digest',occurred_at:new Date()}]};}
 if(sql.includes('SELECT slug FROM tenants'))return {rows:[{slug:'club'}]};
 throw Error('Unexpected SQL '+sql);
}
client={query,release(){}};class Pool{async connect(){return client;}async query(...a){return query(...a);}async end(){}}
Module._load=function(name,...args){if(name==='./queueTypeService')return {assertConfiguration:async(c,s)=>{assert.equal(c,client);assert.equal(s.tenantId,'1');assert.equal(s.locationId,'10');}};if(name==='dotenv')return {config(){return {parsed:{}};}};if(name==='pg')return {Pool};if(name==='../repositories/users')return {findUserById:async()=>({_id:'1',roles:['vendor'],mfaEnabled:true,tenantMemberships:[{tenantId:'1',role:state.role,isActive:true}]})};if(name==='../repositories/authSessions')return {findSessionById:async()=>({_id:'1',surface:'app',status:'active',expiresAt:'2099-01-01',mfaVerifiedAt:'2026-10-25'}),touchSession:async()=>{}};if(name==='../repositories/tenants')return {findTenantBySlug:async slug=>({_id:slug==='club'?'1':'2',slug,isActive:true})};if(name==='../repositories/storeLocations')return {findLocationByTenantAndSlug:async()=>({_id:'10',tenantId:'1',isActive:true})};if(name==='../services/resourceConfigurationService')return {getConfigurationInTransaction:async()=>cfg()};if(name==='./queueEvents'||name==='../services/queueEvents')return {publish(){assert.equal(open,false,'SSE only after commit');events++;}};return load.call(this,name,...args);};
(async()=>{reset();const imported=await import('./src/app.ts');const app=imported.default.default||imported.default;const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const base='http://127.0.0.1:'+server.address().port;const token=jwt.sign({sub:'1',session_id:1},process.env.JWT_SECRET);const route='/api/vendor/tenant/club/locations/main/resources/13/tracking/activate';const body={expectedPoolRevision:'1',configurationVersion:'a'.repeat(64)};
async function request({url=route,input=body,key='enable-1',authenticated=true}={}){return new Promise((resolve,reject)=>{const r=require('node:http').request(base+url,{method:'POST',headers:{host:'127.0.0.1:5091','Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})}},response=>{let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(text)}));});r.on('error',reject);r.end(JSON.stringify(input));});}
try{
 const service=require('./src/services/vendorResourceActivationService');
 for(const profile of [{NODE_ENV:'production',LOCAL_API_PROFILE:'core',VENDOR_RESOURCE_ACTIVATION_ENABLED:'1'},{NODE_ENV:'test',LOCAL_API_PROFILE:'',VENDOR_RESOURCE_ACTIVATION_ENABLED:'1'},{NODE_ENV:'test',LOCAL_API_PROFILE:'core',VENDOR_RESOURCE_ACTIVATION_ENABLED:'0'}])assert.equal(service.enabled(profile),false);
 process.env.VENDOR_RESOURCE_ACTIVATION_ENABLED='0';assert.equal((await request()).status,404);process.env.VENDOR_RESOURCE_ACTIVATION_ENABLED='1';process.env.LOCAL_API_PROFILE='';assert.equal((await request()).status,404);process.env.LOCAL_API_PROFILE='core';process.env.NODE_ENV='production';assert.equal((await request()).status,404);process.env.NODE_ENV='test';
 assert.equal((await request({authenticated:false})).status,401);assert.equal((await request({url:route.replace('/club/','/foreign/')})).status,403);
 for(const [extra,status]of [[{role:'staff'},403],[{revoked:true},403],[{active:false},404],[{schemaMissing:true},404],[{badConfig:true},409],[{pool:{id:'13',capacity:2,tracking_enabled:false,revision:2,archived_at:null}},409],[{live:true},409],[{bookingPromise:true},409],[{invalidDemand:true},409],[{badPolicy:true},409],[{noMembers:true},409],[{auditFails:true},500],[{failCommit:true},500]]){reset(extra);const r=await request();assert.equal(r.status,status,JSON.stringify(extra)+' '+JSON.stringify(r));assert.equal(state.pool.tracking_enabled,false);assert.equal(state.audits,0);assert.equal(events,0);}
 reset();assert.equal((await request({input:{...body,trackingEnabled:true}})).status,400);assert.equal((await request({key:''})).status,400);
 for(const role of ['owner','admin']){reset({role});const r=await request();assert.equal(r.status,200,JSON.stringify(r));assert.equal(state.pool.tracking_enabled,true);assert.equal(state.pool.revision,2);assert.equal(state.audits,1);assert.equal(events,1);const replay=await request();assert.deepEqual(replay,r);assert.equal(state.audits,1);assert.equal(events,1);assert.equal((await request({input:{...body,expectedPoolRevision:'2'}})).status,409);assert.equal(sqls.filter(x=>x.sql.startsWith('UPDATE location_resource_pools')).length,1);assert.ok(sqls.some(x=>x.sql.includes('FOR NO KEY UPDATE')));assert.ok(!sqls.some(x=>/UPDATE.*(?:subscription|booking|tenant_membership)|four-court|local_pool_demo_scopes/.test(x.sql)));}
 console.log('PASS real mounted activation flag/auth/role/scope/revisions/retry/rollback/audit/SSE; no actual DB');
}finally{await new Promise(r=>server.close(r));await require('./src/config/db').pool.end();}})().catch(e=>{console.error(e);process.exitCode=1;});`;
const r=spawnSync(process.execPath,['--import','tsx','-e',script],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:30000,env:{...process.env,NODE_ENV:'test',API_ENVIRONMENT:'production',LOCAL_API_PROFILE:'core',LOCAL_API_ORIGIN:'http://127.0.0.1:5091',LOCAL_POOL_DEMO_ENABLED:'0',VENDOR_RESOURCE_ACTIVATION_ENABLED:'1',JWT_SECRET:'offline-activation-contract-test-secret',DATABASE_URL:'postgresql://test:test@127.0.0.1:1/getprio_local_pool_demo_offline',AUTH_COOKIE_SECURE:'false'}});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
});
