const test=require('node:test');
const assert=require('node:assert/strict');
const {requireWithMocks}=require('./testSupport.cjs');
test('slow mixed dispatch claims just in time and stops without leasing the backlog',async()=>{
  let clock=0;const claims=[],marked=[],timeouts=[];
  const pending=[{id:'q1',tenant_id:'1'},{id:'q2',tenant_id:'1'},...['r1','r2','r3'].map(id=>({id,booking_id:'1',tenant_id:'1'}))];
  const {createQueueNotificationOutboxDispatcher}=requireWithMocks('../src/services/queueNotificationOutboxDispatcher.js',{
    '../repositories/queueNotificationOutbox':{claimBatch:async(worker,limit)=>{claims.push(limit);return pending.length?[pending.shift()]:[];},markSent:async id=>marked.push(id)},
    '../repositories/tenants':{findTenantById:async()=>null},
    './bookingReminderService':{dispatch:async(_intent,_worker,{timeoutMs})=>{timeouts.push(timeoutMs);clock+=Math.min(10000,timeoutMs);}}
  });
  const worker=createQueueNotificationOutboxDispatcher({nowMs:()=>clock,maxRuntimeMs:15000});
  assert.equal(await worker.runBatch(),4);assert.deepEqual(claims,[1,1,1,1]);assert.deepEqual(marked,['q1','q2','r1','r2']);
  assert.deepEqual(timeouts,[15000,5000]);assert.deepEqual(pending.map(i=>i.id),['r3']);
});
