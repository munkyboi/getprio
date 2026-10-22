const test=require('node:test');
const assert=require('node:assert/strict');
const {assertAvailable,addedIntervals}=require('../src/services/queueAmendAvailability');
const scope={tenantId:'1',locationId:'2'},now=new Date('2026-10-21T10:00:00Z');
const item=(member=null,units=1,durationMinutes=60,extra={})=>({selectionId:crypto.randomUUID(),stageId:'stage',resourceMemberId:member,durationMinutes,resource:{poolId:'3',totalUnits:units},...extra});
function client({capacity=4,active=[],held=[]}={}) {
 const calls=[];
 return {calls,async query(sql,args){calls.push({sql,args});
  assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE)\s+(?!OF)/u);
  if(sql.includes('FROM location_resource_pools'))return {rows:[{id:args[2],capacity,tracking_enabled:true}]};
  if(sql==='SELECT clock_timestamp() AS at')return {rows:[{at:now}]};
  if(sql.includes('FROM resource_allocations'))return {rows:active};
  if(sql.includes('FROM resource_ledger_reservations')){assert.deepEqual(args.slice(0,4),['1','2','10','ticket']);return {rows:held};}
  throw Error(sql);
 }};
}
// Use pool 10 so deterministic lock ordering can be checked independently.
const row=(...args)=>{const value=item(...args);value.resource.poolId='10';return value;};
const hold=(member=null,units=1,start=0,end=60)=>({resource_member_id:member,units,starts_at:new Date(+now+start*60000),ends_at:new Date(+now+end*60000)});
const conflict={code:'RESOURCE_CAPACITY_UNAVAILABLE',statusCode:409};
test('regenerated selection IDs, reorder and pure removals/reductions do not turn old busy demand into additions',async()=>{
 const previous=[row('A'),row(null,2,60)];
 const next=[row(null,1,30),row('A')];
 assert.deepEqual(addedIntervals(previous,next).added,[]);
 const db={query(){throw Error('Unchanged or reduced demand must not query current occupancy');}};
 await assertAvailable(db,scope,'ticket',previous,next);
});
test('new named members reject other protected holds and explicitly unreleased service allocations',async()=>{
 for(const state of [{held:[hold('B')]},{active:[{resource_member_id:'B',units:1}]},{active:[{resource_member_id:null,units:1}]}]){
  const db=client(state);
  await assert.rejects(assertAvailable(db,scope,'ticket',[row('A')],[row('A'),row('B')]),conflict);
  assert.match(db.calls[0].sql,/FOR UPDATE/u);
  assert.match(db.calls.find(call=>call.sql.includes('FROM resource_ledger_reservations')).sql,/ticket_id IS DISTINCT FROM \$4/u);
 }
});
test('new named member can be added after release and unrelated occupied members do not imply a named conflict',async()=>{
 await assertAvailable(client({active:[{resource_member_id:'C',units:1}]}),scope,'ticket',[row('A')],[row('A'),row('B')]);
});
test('only added pooled units are checked; existing waiting demand remains demand-only',async()=>{
 await assertAvailable(client({capacity:2,active:[{units:1,resource_member_id:null}]}),scope,'ticket',[row(null,1)],[row(null,2)]);
 await assert.rejects(assertAvailable(client({capacity:3,active:[{units:2,resource_member_id:null}]}),scope,'ticket',[row(null,1)],[row(null,3)]),conflict);
});
test('an existing busy named selection does not prevent adding a different free member',async()=>{
 await assertAvailable(client({capacity:2,active:[{resource_member_id:'A',units:1}]}),scope,'ticket',[row('A')],[row('A'),row('B')]);
});
test('all added named members share pool capacity, even when each fits separately',async()=>{
 await assert.rejects(assertAvailable(client({capacity:2,active:[{resource_member_id:'C',units:1}]}),scope,'ticket',[],[row('A'),row('B')]),conflict);
});
test('duration extensions inspect only added intervals while active allocations never expire on expected end',async()=>{
 const previous=[row(null,1,30)],next=[row(null,1,60)];
 assert.deepEqual(addedIntervals(previous,next).added.map(({start,end})=>[start,end]),[[30*60000,60*60000]]);
 await assertAvailable(client({capacity:1,held:[hold(null,1,0,30)]}),scope,'ticket',previous,next);
 await assert.rejects(assertAvailable(client({capacity:1,held:[hold(null,1,30,60)]}),scope,'ticket',previous,next),conflict);
 await assert.rejects(assertAvailable(client({capacity:1,active:[{units:1,resource_member_id:null,expected_end_at:new Date(+now-60000)}]}),scope,'ticket',previous,next),conflict);
});
test('flattened extras and concurrent additions share capacity, stages cannot borrow old demand',async()=>{
 const previous=[row(null,1,60)],extra=row(null,2,60,{selectionKind:'extra',parentResourceSelectionId:'parent'});
 await assert.rejects(assertAvailable(client({capacity:3,held:[hold(null,2)]}),scope,'ticket',previous,[...previous,extra]),conflict);
 const changed=[row('A',1,60,{stageId:'other-stage'})];
 assert.equal(addedIntervals([row('A')],changed).added.length,1);
 await assert.rejects(assertAvailable(client({held:[hold('A')]}),scope,'ticket',[row('A')],changed),conflict);
});
test('affected pool locks are numeric ordered and terminal reservations are excluded by the authoritative query',async()=>{
 const db=client();
 // This query client intentionally does not return reservations for this case.
 db.query=async function(sql,args){this.calls.push({sql,args});
  if(sql.includes('FROM location_resource_pools'))return {rows:[{id:args[2],capacity:4,tracking_enabled:true}]};
  if(sql==='SELECT clock_timestamp() AS at')return {rows:[{at:now}]};
  assert.match(sql,/released_at IS NULL|state='protected'/u);return {rows:[]};
 };
 const a=row('A'),b=row('B');b.resource.poolId='2';
 await assertAvailable(db,scope,'ticket',[],[a,b]);
 assert.deepEqual(db.calls.filter(call=>call.sql.includes('FROM location_resource_pools')).map(call=>call.args[2]),['2','10']);
});
test('two independent one-unit pools do not count each other\'s simultaneous additions',async()=>{
 const db=client();
 db.query=async function(sql,args){this.calls.push({sql,args});
  if(sql.includes('FROM location_resource_pools'))return {rows:[{id:args[2],capacity:1,tracking_enabled:true}]};
  if(sql==='SELECT clock_timestamp() AS at')return {rows:[{at:now}]};
  assert.ok(['2','10'].includes(args[2]));return {rows:[]};
 };
 const court=row('court'),equipment=row('equipment');equipment.resource.poolId='2';
 await assertAvailable(db,scope,'ticket',[],[court,equipment]);
});
