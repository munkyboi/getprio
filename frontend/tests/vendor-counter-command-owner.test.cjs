require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {executeQueueWrite,retryPendingQueueWrite}=require('../src/vendor/queueCommandOwner.ts');
const {ApiError}=require('../src/api/client.ts');
test('shared queue owner blocks duplicate writes and retains exact body/key after an ambiguous result',async()=>{
 const oldFetch=global.fetch,oldWindow=global.window,oldCustom=global.CustomEvent;
 global.window={dispatchEvent(){},sessionStorage:{getItem(){return ''},setItem(){}}};global.CustomEvent=class extends Event{constructor(name,options){super(name);this.detail=options.detail}};
 let release;const calls=[];global.fetch=async(url,options)=>{calls.push({url,options});if(calls.length===1)await new Promise(resolve=>{release=resolve});return calls.length===1?{ok:false,status:503,json:async()=>({message:'lost response'})}:{ok:true,status:200,json:async()=>({ok:true})};};
 const write={path:'/vendor/tenant/qa/queue/plans/1/start?location=test',token:'cookie-session',body:{expectedTicketRevision:'2',counterSlug:'court',expectedCounterId:'1'},key:'same-key'};
 try{
 const first=executeQueueWrite(write);await assert.rejects(executeQueueWrite(write),e=>e instanceof ApiError&&e.status===409);release();await assert.rejects(first,e=>e.status===503);
 await assert.rejects(executeQueueWrite({...write,key:'another-key'}),e=>e.status===409);
 write.body.expectedTicketRevision='999';await assert.rejects(executeQueueWrite(write),e=>e.status===409);
 assert.deepEqual(await retryPendingQueueWrite(),{ok:true});assert.equal(calls.length,2);assert.equal(calls[0].options.body,calls[1].options.body);assert.equal(calls[1].options.headers['Idempotency-Key'],'same-key');assert.equal(JSON.parse(calls[1].options.body).expectedTicketRevision,'2');
 }finally{global.fetch=oldFetch;global.window=oldWindow;global.CustomEvent=oldCustom;}
});
test('an ambiguous DELETE retains its exact method revision and key; a definitive conflict permits a new command',async()=>{
 const previous=global.fetch,calls=[];
 global.fetch=async(url,options)=>{calls.push({url,options});if(calls.length===1)throw new TypeError('Network response lost');return calls.length===2?{ok:false,status:409,json:async()=>({code:'DRAFT_CHANGED',message:'Review current draft'})}:{ok:true,status:200,json:async()=>({confirmed:true})};};
 const command={path:'/test/scoped-draft',method:'DELETE',token:'cookie-session',body:{expectedPlanRevision:'4'},key:'delete-same-key'};
 try{
  await assert.rejects(executeQueueWrite(command),/Network response lost/);
  await assert.rejects(executeQueueWrite({...command,key:'replacement-key'}),e=>e.status===409);
  await assert.rejects(retryPendingQueueWrite(),e=>e.status===409);
  assert.equal(calls.length,2);assert.equal(calls[1].options.method,'DELETE');assert.equal(calls[1].options.headers['Idempotency-Key'],'delete-same-key');assert.deepEqual(JSON.parse(calls[1].options.body),{expectedPlanRevision:'4'});
  assert.deepEqual(await executeQueueWrite({...command,key:'after-reviewed-conflict',body:{expectedPlanRevision:'5'}}),{confirmed:true});
 }finally{global.fetch=previous;}
});
test('a malformed success cannot unlock other writes or optimistically confirm publication',async()=>{
 const previous=global.fetch;let calls=0;
 global.fetch=async()=>({ok:true,status:200,json:async()=>++calls===1?{plan:{id:'own',state:'draft'}}:{plan:{id:'own',contractVersion:4,ticketId:'ticket',ticketNumber:'VD-QA',state:'waiting'}}});
 const write={path:'/test/publish',token:'cookie-session',body:{expectedPlanRevision:'1'},key:'malformed-success-key',confirmation:{kind:'draft-publish',id:'own'}};
 try{await assert.rejects(executeQueueWrite(write),/Unexpected draft response/);await assert.rejects(executeQueueWrite({...write,key:'new-key'}),e=>e.status===409);const result=await retryPendingQueueWrite();assert.equal(result.plan.ticketId,'ticket');assert.equal(calls,2);}finally{global.fetch=previous;}
});
