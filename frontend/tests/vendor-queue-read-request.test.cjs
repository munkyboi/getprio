require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {queueReadRequest}=require('../src/vendor/queueReadRequest.ts');
const {ApiError,retryAfterDeadline}=require('../src/api/client.ts');
test('Retry-After supports seconds and HTTP dates without invented deadlines',()=>{
 assert.equal(retryAfterDeadline('30',1000),31000);
 assert.equal(retryAfterDeadline('Thu, 15 Oct 2026 08:58:45 GMT',0),Date.parse('2026-10-15T08:58:45Z'));
 assert.equal(retryAfterDeadline(null,1000),undefined);
 assert.equal(retryAfterDeadline('invalid',1000),undefined);
});
test('one server cooldown prevents further per-ticket and resource reads until its deadline',async()=>{
 const oldFetch=global.fetch,oldNow=Date.now;let calls=0,now=1000;
 Date.now=()=>now;
 global.fetch=async()=>{calls++;return calls===1?{ok:false,status:429,headers:new Headers({'Retry-After':'30'}),json:async()=>({message:'Too many requests'})}:{ok:true,status:200,json:async()=>({ok:true})};};
 try{
  await assert.rejects(queueReadRequest('/ticket/1',{token:'cookie-session'}),e=>e instanceof ApiError&&e.retryAt===31000);
  await assert.rejects(queueReadRequest('/ticket/2',{token:'cookie-session'}),e=>e.status===429);
  await assert.rejects(queueReadRequest('/resource-operations',{token:'cookie-session'}),e=>e.status===429);
  assert.equal(calls,1);
  now=31000;
  assert.deepEqual(await queueReadRequest('/ticket/2',{token:'cookie-session'}),{ok:true});
  assert.equal(calls,2);
 }finally{global.fetch=oldFetch;Date.now=oldNow;}
});
