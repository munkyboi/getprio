const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),path=require('node:path');
test('actual mounted API authenticates and projects real bounded Vendor resources without fixture activation',()=>{
 const script=String.raw`
const assert=require('node:assert/strict'),Module=require('node:module'),jwt=require('jsonwebtoken');
const original=Module._load;let state={},queries=[];
const user=()=>({_id:'1',roles:['vendor'],mfaEnabled:state.mfa!==false,platformAccessSuspendedAt:state.suspended?'now':null,tenantMemberships:[{tenantId:'1',role:state.role||'owner',isActive:true}]});
const rows=(sql,values=[])=>{
 queries.push({sql,values});
 assert.ok(!/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(sql),'GET must not mutate '+sql);
 if(/^(?:BEGIN|SET LOCAL|COMMIT|ROLLBACK)/.test(sql))return [];
 if(sql.includes('WHERE t.slug=$1'))return values[0]==='missing'||values[1]!=='main'||state.inactive?[]:[{tenant_id:values[0]==='other'?'2':'1',location_id:values[0]==='other'?'20':'10',queue_lifecycle_mode:'legacy',timezone:'Asia/Manila'}];
 if(sql.includes('SELECT l.id FROM store_locations'))return state.revokedLocation?[]:[{id:'10'}];
 if(sql.includes('SELECT u.roles,m.role'))return values[1]!=='1'||state.revokedMembership||state.deleted||(state.revokeAfterRead&&queries.filter(q=>q.sql.includes('SELECT u.roles,m.role')).length>1)?[]:[{roles:['vendor'],role:state.role||'owner'}];
 if(sql.includes('tenant_membership_locations'))return state.assigned===false?[]:[{exists:true,id:'10'}];
 if(sql.includes('to_regclass(format'))return [{available:true}];
 if(sql.includes('FROM booking_v4_reservations r')){assert.ok(sql.includes("held.resource_member_id IS NOT DISTINCT FROM r.resource_member_id"));assert.ok(sql.includes("d.snapshot->>'bookingSelectionRevision'=r.selection_revision::text"));assert.ok(sql.includes("held.child_plan_revision"));return state.bookingHold&&!state.exactQueueCover?[{id:'600',pool_id:'100',units:1,protects_now:true,protection_expired:false,protection_inconsistent:false}]:[];}
 if(sql.includes(' AS as_of'))return [{as_of:'2026-10-25T03:00:00.000Z',revision:'8'}];
 if(sql.includes('FROM location_resource_pools'))return Array.from({length:state.oversized?51:1},(_,i)=>({id:String(100+i),name:state.largeName?'x'.repeat(530000):'Courts',capacity:state.overCapacity?1:4,tracking_enabled:true,revision:1,archived_at:null}));
 if(sql.includes('FROM resource_allocations a'))return [{id:'200',pool_id:'100',ticket_id:'300',units:1,started_at:'2026-10-25T01:00:00Z',expected_end_at:'2026-10-25T02:00:00Z',overdue:true,ticket_number:'VD1',status:'called',timing_active:true}];
 if(sql.includes('FROM resource_ledger_reservations r'))return [{id:'400',pool_id:'100',units:1,protects_now:true,protection_expired:!!state.expired,protection_inconsistent:false}];
 if(sql.includes('FROM tickets w LEFT JOIN'))return [];
 if(sql.includes('FROM queue_days'))return [];
 if(sql.includes('SELECT EXISTS(SELECT 1 FROM queue_day_closures'))return [{closed:false}];
 if(sql.includes('SELECT count(*)::int AS count FROM tickets'))return [{count:2}];
 if(sql.includes('FROM service_counters'))return [{_id:'500',slug:'desk',name:'Dispatch',isActive:true}];
 throw new Error('Unexpected SQL '+sql);
};
class Pool{async connect(){return {query:async(sql,values)=>({rows:rows(sql,values)}),release(){}};}async query(sql,values){return {rows:rows(sql,values)};}async end(){}}
Module._load=function(name,...args){if(name==='pg')return {Pool};if(name==='dotenv')return {config(){return {parsed:{}};}};if(name==='../repositories/users')return {findUserById:async()=>user()};if(name==='../repositories/authSessions')return {findSessionById:async()=>({_id:'1',surface:'app',status:'active',expiresAt:'2099-01-01',mfaVerifiedAt:'2026-10-25'}),touchSession:async()=>{}};return original.call(this,name,...args);};
(async()=>{const imported=await import('./src/app.ts');const app=imported.default.default||imported.default;const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
const base='http://127.0.0.1:'+server.address().port;const token=jwt.sign({sub:'1',session_id:1},process.env.JWT_SECRET);const route='/api/vendor/tenant/club/locations/main/resource-operations/snapshot';
async function request(url=route,authenticated=true){const r=await fetch(base+url,{headers:authenticated?{Authorization:'Bearer '+token}:{}});return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json().catch(()=>null)};}
try{
 assert.equal((await request(route,false)).status,401);
 for(const plan of ['free','pro']){state={plan};queries=[];const r=await request();assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.equal(r.body.contractVersion,'vendor-resource-operations-v1');assert.ok(!('localDemo'in r.body));assert.deepEqual(r.body.scope,{tenantId:'1',locationId:'10'});assert.equal(r.body.pools[0].allocatedUnits,1);assert.equal(r.body.pools[0].protectedUnitsNow,1);assert.equal(r.body.pools[0].availableUnits,2);assert.equal(r.body.pools[0].overdueUnits,1);assert.equal(r.body.dispatchAdviceOnly,true);assert.equal(r.body.forecastReadiness,'not_evaluated');assert.ok(queries[0].sql.includes('REPEATABLE READ READ ONLY'));assert.equal(queries.filter(q=>q.sql.includes('SELECT u.roles,m.role')).length,2);assert.ok(queries.filter(q=>/FROM (?:location_resource_pools|resource_allocations a|resource_ledger_reservations r|service_counters)/.test(q.sql)).every(q=>q.sql.includes('LIMIT')));}
 assert.equal((await request('/api/vendor/tenant/club/locations/main/resource-operations')).status,404,'legacy fixture route stays unavailable with fixture flag off');
 state={role:'staff',assigned:true};assert.equal((await request()).status,200);state={role:'staff',assigned:false};assert.equal((await request()).status,403);
 state={bookingHold:true};const promised=await request();assert.equal(promised.status,200);assert.equal(promised.body.pools[0].protectedUnitsNow,2);assert.equal(promised.body.pools[0].availableUnits,1);state={bookingHold:true,exactQueueCover:true};const dedup=await request();assert.equal(dedup.body.pools[0].protectedUnitsNow,1);assert.equal(dedup.body.pools[0].availableUnits,2);
 state={};assert.equal((await request(route.replace('/club/','/other/'))).status,403);assert.equal((await request(route.replace('/club/','/missing/'))).status,404);
 for(const [next,status]of [[{inactive:true},404],[{revokedLocation:true},404],[{revokedMembership:true},403],[{revokeAfterRead:true},403],[{deleted:true},403],[{role:'unknown'},403],[{mfa:false},403],[{suspended:true},403],[{oversized:true},409],[{largeName:true},409]]){state=next;queries=[];assert.equal((await request()).status,status,JSON.stringify(next));}
 state={};assert.equal((await request(route.replace('/club/','/'+ 'a'.repeat(161)+'/'))).status,400);
 state={overCapacity:true,expired:true};const unsafe=await request();assert.equal(unsafe.status,200);assert.equal(unsafe.body.reconciliation.required,true);assert.equal(unsafe.body.pools[0].availabilityQuality,'unknown');assert.equal(unsafe.body.pools[0].allocatedUnits,1);assert.equal(unsafe.body.counterDispatch[0].canCallNext,false);
 console.log('PASS actual app mounted route, auth/MFA, tenant/location/role/status, real DTO, legacy negative, bounds, read-only projection');
}finally{await new Promise(r=>server.close(r));await require('./src/config/db').pool.end();}})().catch(e=>{console.error(e);process.exitCode=1;});`;
 const r=spawnSync(process.execPath,['--import','tsx','-e',script],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:30000,env:{...process.env,NODE_ENV:'test',API_ENVIRONMENT:'production',LOCAL_API_PROFILE:'',LOCAL_POOL_DEMO_ENABLED:'0',JWT_SECRET:'offline-vendor-contract-test-secret',DATABASE_URL:'postgresql://test:test@127.0.0.1:1/offline_never_connected',AUTH_COOKIE_SECURE:'false'}});
 assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
});
