require("tsx/cjs");
const test=require('node:test');
const assert=require('node:assert/strict');
const {createVendorNotificationQueue}=require('../src/vendor/notificationQueue.ts');
test('overflow notifications wait for a visible slot and retain their full timeout',async()=>{
 const displayed=[];const queue=createVendorNotificationQueue(item=>{displayed.push(item);return item.id});
 for(let i=0;i<5;i++)queue.show({id:`visible-${i}`,message:'Visible'});
 queue.show({id:'error',message:'Retry',color:'red',autoClose:7000});
 queue.show({id:'persistent',message:'Keep',autoClose:false});await Promise.resolve();
 assert.equal(displayed.length,5);
 displayed[0].onRemove();await Promise.resolve();assert.equal(displayed[5].id,'error');assert.equal(displayed[5].timeout,7000);assert.equal(displayed[5].priority,'high');
 displayed[1].onRemove();await Promise.resolve();assert.equal(displayed[6].timeout,0);
});
test('duplicate IDs neither restart a displayed timer nor duplicate queued feedback',async()=>{
 const displayed=[];const queue=createVendorNotificationQueue(item=>{displayed.push(item);return item.id});
 for(let i=0;i<6;i++)queue.show({id:`notice-${i}`,message:'First'});
 queue.show({id:'notice-0',message:'Duplicate',autoClose:7000});queue.show({id:'notice-5',message:'Duplicate'});await Promise.resolve();
 assert.equal(displayed.length,5);assert.equal(displayed[0].description,'First');
 displayed[0].onRemove();await Promise.resolve();assert.equal(displayed.length,6);assert.equal(displayed[5].description,'First');
 queue.dispose();displayed[1].onRemove();await Promise.resolve();queue.show({message:'Late'});assert.equal(displayed.length,6);
});

test('effect replay retains active IDs and overflow without restarting displayed timers',async()=>{
 const displayed=[];const queue=createVendorNotificationQueue(item=>{displayed.push(item);return item.id});
 for(let i=0;i<6;i++)queue.show({id:`replay-${i}`,message:'Original'});
 await Promise.resolve();queue.dispose();queue.activate();queue.show({id:'replay-0',message:'Duplicate'});await Promise.resolve();
 assert.equal(displayed.length,5);
 displayed[0].onRemove();await Promise.resolve();assert.equal(displayed.length,6);assert.equal(displayed[5].id,'replay-5');
 queue.dispose();displayed[1].onRemove();await Promise.resolve();queue.show({id:'late',message:'Late'});assert.equal(displayed.length,6);
});

test("mount effects defer display until provider replay completes",async()=>{
 const displayed=[];const queue=createVendorNotificationQueue(item=>{displayed.push(item);return item.id});
 queue.show({id:"mount",message:"Initial",autoClose:7000});assert.equal(displayed.length,0);
 queue.dispose();queue.activate();queue.show({id:"mount",message:"Replay"});await Promise.resolve();
 assert.equal(displayed.length,1);assert.equal(displayed[0].timeout,7000);assert.equal(displayed[0].description,"Initial");
});
