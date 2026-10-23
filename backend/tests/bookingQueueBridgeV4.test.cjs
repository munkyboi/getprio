const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/services/queueDayLifecycleService.js'),'utf8');
const start=source.indexOf('async function closeTicketOutcomes('),end=source.indexOf('async function closeLockedQueueDay(',start);
function closeFixture(ticket){const queries=[],events=[];const c={env:{waitTimePredictionCaptureEnabled:false},CARRY_OVER_DAYS:7,stateError:(message,code)=>Object.assign(new Error(message),{code}),recordLifecycleEvent:async(...args)=>{events.push(args);return null;},outbox:{enqueue:async()=>{}},client:{query:async(sql)=>{queries.push(sql);return{rows:sql.includes('FROM tickets AS ticket')?[ticket]:[]};}},day:{_id:'1'}};vm.runInNewContext(source.slice(start,end),c);return{...c,queries,events};}
test('automatic closing retains an unstarted linked booking and its protection with staff-resolution evidence',async()=>{
 const f=closeFixture({id:'8',resource_booking:true,live_allocation:false,status:'waiting'});
 await f.closeTicketOutcomes(f.client,f.day,{source:'request_reconciliation'});
 assert.equal(f.queries.length,1);assert.equal(f.events[0][2],'booking_staff_resolution_required');assert.equal(f.events[0][3].reasonCode,'queue_closed_booking_retained');
});
test('manual close cannot silently cancel an unstarted booking, while active service remains explicitly completable',async()=>{
 let f=closeFixture({id:'8',resource_booking:true,live_allocation:false,status:'called'});
 await assert.rejects(f.closeTicketOutcomes(f.client,f.day,{closeSource:'manual'}),{code:'BOOKING_CLOSE_RESOLUTION_REQUIRED'});assert.equal(f.queries.length,1);
 f=closeFixture({id:'9',resource_booking:true,live_allocation:true,status:'called'});await f.closeTicketOutcomes(f.client,f.day,{closeSource:'manual'});assert.equal(f.queries.length,1);
 assert.match(f.queries[0],/ticket.current_queue_day_id = \$1/,'other-day bookings never enter the closure loop');
});
