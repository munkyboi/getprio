const test=require('node:test');
const assert=require('node:assert/strict');
const {requireWithMocks}=require('./testSupport.cjs');
test('slow mixed dispatch claims just in time and stops without leasing the backlog',async()=>{
  let clock=0;const claims=[],marked=[],timeouts=[];
  const pending=[{id:'q1',tenant_id:'1'},{id:'q2',tenant_id:'1'},...['r1','r2','r3'].map(id=>({id,booking_id:'1',tenant_id:'1'}))];
  const {createQueueNotificationOutboxDispatcher}=requireWithMocks('../src/services/queueNotificationOutboxDispatcher.js',{
    '../repositories/queueNotificationOutbox':{claimBatch:async(worker,limit,{preferBookingReminders})=>{
      claims.push(limit);let index=pending.findIndex(row=>Boolean(row.booking_id)===preferBookingReminders);
      if(index<0)index=0;return pending.length?pending.splice(index,1):[];
    },markSent:async id=>marked.push(id)},
    '../repositories/tenants':{findTenantById:async()=>null},
    './bookingReminderService':{dispatch:async(_intent,_worker,{timeoutMs})=>{timeouts.push(timeoutMs);clock+=Math.min(10000,timeoutMs);}}
  });
  const worker=createQueueNotificationOutboxDispatcher({nowMs:()=>clock,maxRuntimeMs:15000});
  assert.equal(await worker.runBatch(),4);assert.deepEqual(claims,[1,1,1,1]);assert.deepEqual(marked,['r1','q1','q2','r2']);
  assert.deepEqual(timeouts,[15000,5000]);assert.deepEqual(pending.map(i=>i.id),['r3']);
});
test('a reserved reminder is delivered before slow queue traffic consumes the run budget',async()=>{
  let clock=0;const slots=[],marked=[];
  const {createQueueNotificationOutboxDispatcher}=requireWithMocks('../src/services/queueNotificationOutboxDispatcher.js',{
    '../repositories/queueNotificationOutbox':{claimBatch:async(_worker,limit,{preferBookingReminders})=>{
      assert.equal(limit,1);slots.push(preferBookingReminders);
      return [preferBookingReminders?{id:'reminder',booking_id:'1'}:{id:'queue',tenant_id:'1'}];
    },markSent:async id=>marked.push(id)},
    '../repositories/tenants':{findTenantById:async()=>{clock+=10000;return null;}},
    './bookingReminderService':{dispatch:async()=>{clock+=10000;}}
  });
  const worker=createQueueNotificationOutboxDispatcher({nowMs:()=>clock,maxRuntimeMs:15000});
  assert.equal(await worker.runBatch(),2);assert.deepEqual(slots,[true,false]);assert.deepEqual(marked,['reminder','queue']);
});
test('one-job runs alternate first preference so neither class is starved',async()=>{
  const slots=[],marked=[];
  const {createQueueNotificationOutboxDispatcher}=requireWithMocks('../src/services/queueNotificationOutboxDispatcher.js',{
    '../repositories/queueNotificationOutbox':{claimBatch:async(_worker,_limit,{preferBookingReminders})=>{
      slots.push(preferBookingReminders);return [preferBookingReminders?{id:'reminder',booking_id:'1'}:{id:'queue',tenant_id:'1'}];
    },markSent:async id=>marked.push(id)},
    '../repositories/tenants':{findTenantById:async()=>null},
    './bookingReminderService':{dispatch:async()=>{}}
  });
  const worker=createQueueNotificationOutboxDispatcher();
  for(let i=0;i<3;i++)assert.equal(await worker.runBatch(1),1);
  assert.deepEqual(slots,[true,false,true]);assert.deepEqual(marked,['reminder','queue','reminder']);
});
