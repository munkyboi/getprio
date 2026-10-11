require('tsx/cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const {confirmCurrentTicket}=require('../src/api/vendorDashboardQueue.ts');

test('vendor scanner sends rotating credentials separately and keeps ordinary ticket codes',async()=>{
  const original=global.fetch;const requests=[];
  global.fetch=async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({ticket:{id:'1',status:'called'}}),{status:200,headers:{'Content-Type':'application/json'}});};
  try{const value='QB'+'A'.repeat(32);await confirmCurrentTicket('auth','demo','?location=main',value);await confirmCurrentTicket('auth','demo','?location=main','ABC12345');assert.deepEqual(JSON.parse(requests[0].options.body),{barcodeToken:value});assert.deepEqual(JSON.parse(requests[1].options.body),{lookupCode:'ABC12345'});assert.equal(requests[0].url,requests[1].url);assert.match(requests[0].url,/queue\/current\/confirm\?location=main$/);}
  finally{global.fetch=original;}
});

const {ArrivalBarcodeController}=require('../src/utils/arrivalBarcode.ts');
function credential(value='A'){return {barcodeToken:'QB'+value.repeat(32),issuedAt:'2026-10-11T01:00:00.000Z',expiresAt:'2026-10-11T01:02:00.000Z',serverNow:'2026-10-11T01:00:00.000Z'};}
function harness(fetchBarcode){let now=0;let wallOverride;const states=[];const tasks=[];const controller=new ArrivalBarcodeController({fetchBarcode,onChange:s=>states.push(s),now:()=>now,wallNow:()=>wallOverride ?? now,schedule:(callback,delay)=>{const task={callback,delay,cancelled:false};tasks.push(task);return()=>{task.cancelled=true;};}});return {controller,states,tasks,setNow:value=>{now=value;},setWallNow:value=>{wallOverride=value;}};}
test('web barcode uses server lifetime with round trip compensation and fails closed at expiry',async()=>{
  let resolve;let calls=0;const h=harness(()=>{calls++;return calls===1?new Promise(r=>{resolve=r;}):Promise.reject(new Error('Offline'));});const pending=h.controller.refresh();h.setNow(5000);resolve(credential());await pending;assert.equal(h.states.at(-1).remainingSeconds,115);assert.equal(h.states.at(-1).value,credential().barcodeToken);
  h.setNow(120000);h.tasks.at(-1).callback();assert.equal(h.states.at(-1).value,'');assert.equal(h.states.at(-1).loading,true);await new Promise(r=>setImmediate(r));assert.equal(h.states.at(-1).error,'Offline');assert.equal(h.states.at(-1).value,'');h.controller.dispose();
});
test('web barcode pause and disposal invalidate pending responses and resume fetches current value',async()=>{
  let resolve;let calls=0;const h=harness(()=>++calls===1?new Promise(r=>{resolve=r;}):Promise.resolve(credential('B')));const pending=h.controller.refresh();h.controller.pause();resolve(credential());await pending;assert.equal(h.states.at(-1).value,'');assert.equal(h.states.at(-1).loading,false);await h.controller.refresh();assert.equal(h.states.at(-1).value,credential('B').barcodeToken);h.controller.pause();assert.equal(h.states.at(-1).value,'');assert.equal(h.tasks.at(-1).cancelled,true);h.controller.dispose();
  const disposed=harness(()=>new Promise(r=>{resolve=r;}));const late=disposed.controller.refresh();disposed.controller.dispose();const count=disposed.states.length;resolve(credential());await late;assert.equal(disposed.states.length,count);
});
test('web barcode rejects malformed expired or inconsistent server credentials without static fallback',async()=>{
  for(const response of [{...credential(),barcodeToken:'fixed-code'},{...credential(),serverNow:'2026-10-11T01:03:00.000Z'},{...credential(),issuedAt:'bad'},{...credential(),serverNow:'2026-10-11T00:59:00.000Z'}]){const h=harness(()=>Promise.resolve(response));await h.controller.refresh();assert.equal(h.states.at(-1).value,'');assert.match(h.states.at(-1).error,/expired/);assert.equal(h.tasks.length,0);h.controller.dispose();}
});

test('web barcode expires after OS sleep even when monotonic time pauses',async()=>{
  let calls=0;const h=harness(()=>++calls===1?Promise.resolve(credential()):Promise.reject(new Error('Offline')));await h.controller.refresh();h.setNow(1000);h.setWallNow(121000);h.tasks.at(-1).callback();assert.equal(h.states.at(-1).value,'');assert.equal(h.states.at(-1).loading,true);await new Promise(r=>setImmediate(r));assert.equal(calls,2);assert.equal(h.states.at(-1).error,'Offline');h.controller.dispose();
});
test('web barcode accounts for sleep during request and refreshes after backwards clock changes',async()=>{
  let resolve;const h=harness(()=>new Promise(r=>{resolve=r;}));const pending=h.controller.refresh();h.setNow(100);h.setWallNow(5000);resolve(credential());await pending;assert.equal(h.states.at(-1).remainingSeconds,115);h.setWallNow(4000);h.tasks.at(-1).callback();assert.equal(h.states.at(-1).value,'');h.controller.dispose();resolve(credential());
  const expired=harness(()=>new Promise(r=>{resolve=r;}));const asleep=expired.controller.refresh();expired.setWallNow(121000);resolve(credential());await asleep;assert.equal(expired.states.at(-1).value,'');assert.match(expired.states.at(-1).error,/expired/);expired.controller.dispose();
});
