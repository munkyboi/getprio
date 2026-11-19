const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {quality}=require('../src/services/localResourceAvailabilityQuality');
const {attach}=require('../src/services/queueReadEventStream');
const queueEvents=require('../src/services/queueEvents');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('quality gates archived, untracked, expired and inconsistent observations without mutating records',()=>{
 const base={id:'1',tracking_enabled:true,archived_at:null};
 assert.deepEqual(quality(base,[]),{availabilityQuality:'observed',availabilityReasonCodes:[]});
 for(const [pool,issues,reason] of [
  [{...base,archived_at:'2026-10-20'},[],'pool_archived'],
  [{...base,tracking_enabled:false},[],'tracking_disabled'],
  [base,[{code:'protection_expired',poolId:'1'}],'protection_expired'],
  [base,[{code:'protection_inconsistent',poolId:'1'}],'protection_inconsistent'],
  [base,[{code:'active_timing_without_allocation'}],'reconciliation_required']]){
  const before=JSON.stringify({pool,issues});const result=quality(pool,issues);
  assert.equal(result.availabilityQuality,'unknown');assert.ok(result.availabilityReasonCodes.includes(reason));
  assert.equal(JSON.stringify({pool,issues}),before);
 }
 assert.equal(quality(base,[{code:'pool_over_capacity',poolId:'2'}]).availabilityQuality,'observed');
});
function stream(revalidate){
 const req=new EventEmitter();const writes=[];let closed=0;let heartbeat;let cleared=0;
 const context={tenant:{_id:'1',slug:'dashboard-stream-unit'},location:{_id:'10'}};
 const close=attach({req,res:{write:value=>writes.push(value),end:()=>closed++},context,queueEvents,revalidate:()=>revalidate(context),setTimer:fn=>{heartbeat=fn;return 1;},clearTimer:()=>cleared++});
 return {req,writes,close,heartbeat:()=>heartbeat(),closed:()=>closed,cleared:()=>cleared};
}
test('stream forwards only scoped hints after fresh authorization and closes revoked/expired streams',async()=>{
 let authorized=true;let checks=0;
 const s=stream(async context=>{checks++;if(!authorized)throw Error('revoked');return context;});
 queueEvents.publish('dashboard-stream-unit',{locationId:'20'},{locationId:'20'});await tick();assert.equal(checks,0);
 queueEvents.publish('dashboard-stream-unit',{locationId:'10'},{locationId:'10'});await tick();assert.equal(checks,1);assert.match(s.writes[0],/queue-plans-updated/);
 authorized=false;s.heartbeat();await tick();assert.equal(s.closed(),1);assert.equal(s.cleared(),1);
 queueEvents.publish('dashboard-stream-unit',{}, {locationId:'10'});await tick();assert.equal(checks,2);assert.equal(s.writes.length,1);
 s.req.emit('close');assert.equal(s.closed(),1);
});
test('stream rejects changed tenant/location context and coalesces bursts while checking access',async()=>{
 let release;let checks=0;
 const s=stream(async context=>{checks++;if(checks===1)await new Promise(resolve=>release=resolve);return context;});
 for(let i=0;i<100;i++)queueEvents.publish('dashboard-stream-unit',{i},{locationId:'10'});
 assert.equal(checks,1);release();await tick();assert.equal(checks,2);assert.equal(s.writes.length,2);assert.match(s.writes[1],/"i":99/);s.close();
 const changed=stream(async context=>({...context,location:{_id:'99'}}));changed.heartbeat();await tick();assert.equal(changed.closed(),1);assert.equal(changed.writes.length,0);
});
