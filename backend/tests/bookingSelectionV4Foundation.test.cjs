const { test } = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../src/services/bookingSelectionContractV4');
const capture = require('../src/services/bookingSelectionCaptureV4');
const member = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const scope = { tenantId: '7', locationId: '8' };
const lineage = { bookingId: '9', bookingItemId: '10' };
const input = () => ({ contractVersion: 4, scheduledStartAt: '2026-11-02T01:00:00Z', selections: [{ serviceSelectionId: 'root', serviceId: '11', resources: [{ resourceSelectionId: 'leaf', resourceMemberId: member, quantity: 1, durationCount: 2, durationPolicyRevision: '3', extras: [] }] }] });
const config = () => ({ labels: {service:'Service',resources:'Courts',duration:'Hours',extras:'Extras'}, assignment:{mode:'named',allocationIdentity:'named_member'}, duration:{mode:'adjustable',visible:true,baseMinutes:60,minCount:1,maxCount:4,stepCount:1,defaultCount:1}, extras:[], execution:{resourceStart:'together',extraStart:'with_parent',extraContainment:'within_parent',selectedExtraResolution:'explicit_required'} });
function client(overrides = {}) {
  const calls=[];
  const row={tenant_id:'7',location_id:'8',service_id:'11',service_name:'Court rental',service_revision:'2026-10-01T00:00:00Z',pool_id:'12',pool_revision:2,requirement_revision:1,units_required:1,capacity:2,tracking_enabled:true,policy_revision:'3',configuration:config(),member_id:member,member_revision:'4',member_name:'Court1',member_active:true,member_archived_at:null,pool_archived_at:null,timezone:'Asia/Manila',observed_at:new Date('2026-10-23T00:00:00Z'),...overrides};
  return { calls, row, async query(sql, values) { calls.push({sql,values}); if(sql.includes('FROM vendor_services'))return {rows:[row]}; if(sql.includes('FROM store_hours'))return {rows:overrides.hours || [{weekday:1,opensAt:'09:00',closesAt:'13:00',isClosed:false}]}; if(sql.includes('FROM vendor_availability_exceptions'))return {rows:overrides.exceptions || []}; if(sql.includes('FROM vendor_availability_blocks'))return {rows:overrides.blocks || []}; throw Error('Unexpected SQL'); } };
}
const make = (c=client(), value=input()) => capture.captureBookingSelectionV4(c,scope,value,lineage);
test('capability is off; no reservation or queue publication is advertised',()=>{ assert.equal(contract.capabilities().enabled,false); assert.equal(contract.capabilities().confirmation,false); assert.throws(()=>contract.assertConfirmationEnabled(),{code:'BOOKING_V4_NOT_ENABLED'}); });
test('future scheduled interval, exact member/count, immutable lineage and public projection',async()=>{
 const c=client(), value=input(), result=await make(c,value);
 assert.equal(result.scheduledEndAt,'2026-11-02T03:00:00.000Z'); assert.equal(result.durationMinutes,120); assert.equal(result.durationCount,2); assert.equal(result.resourceMemberId,member); assert.equal(result.bookingItemId,'10'); assert.equal(result.policyRevision,'3'); assert.equal(result.resourceMemberRevision,'4'); assert.ok(Object.isFrozen(result.durationPolicy));
 value.selections[0].resources[0].durationCount=4;c.row.configuration.duration.baseMinutes=30;assert.equal(result.durationMinutes,120);
 const publicData=contract.publicSelection(result); assert.deepEqual(Object.keys(publicData).sort(),['durationCount','durationMinutes','resourceName','scheduledEndAt','scheduledStartAt','serviceName'].sort()); assert.ok(!JSON.stringify(publicData).includes(member));
 assert.ok(c.calls.every(x=>/^\s*SELECT/.test(x.sql))); assert.ok(c.calls[0].sql.includes('resource_pool_members'));assert.deepEqual(c.calls[0].values,['7','8','11',member]);
});
test('reject unsupported roots/resources/extras/quantity and client-derived fields',async()=>{
 for(const edit of [v=>v.selections.push(structuredClone(v.selections[0])),v=>v.selections[0].resources.push(structuredClone(v.selections[0].resources[0])),v=>v.selections[0].resources[0].extras.push({}),v=>v.selections[0].resources[0].quantity=2,v=>v.selections[0].resources[0].durationMinutes=120,v=>v.reservationId='spoof']) {const v=input();edit(v);await assert.rejects(make(client(),v));}
});
test('policy revision, minimum, maximum, step and fixed counts are authoritative',async()=>{
 const stale=input();stale.selections[0].resources[0].durationPolicyRevision='2';await assert.rejects(make(client(),stale),{code:'STALE_DURATION_POLICY'});
 for(const count of [0,5,1.5]){const v=input();v.selections[0].resources[0].durationCount=count;await assert.rejects(make(client(),v));}
 const c=client();Object.assign(c.row.configuration.duration,{minCount:1,maxCount:3,stepCount:2});await assert.rejects(make(c),{code:'INVALID_DURATION_COUNT'});
 const fixed=client();Object.assign(fixed.row.configuration.duration,{mode:'fixed',minCount:1,maxCount:1,defaultCount:1,stepCount:1});await assert.rejects(make(fixed),{code:'INVALID_DURATION_COUNT'});
});
test('cross tenant/location/service/member, disabled and archived mappings fail closed',async()=>{
 for(const override of [{tenant_id:'99'},{location_id:'99'},{service_id:'99'},{member_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},{member_active:false},{member_archived_at:'2026-01-01'},{pool_archived_at:'2026-01-01'},{tracking_enabled:false},{units_required:2}])await assert.rejects(make(client(override)));
 const c=client();c.row.configuration.assignment={mode:'automatic',allocationIdentity:'pooled_capacity'};await assert.rejects(make(c),{code:'UNSUPPORTED_BOOKING_SELECTION'});
});
test('future start must be after authoritative observed time; timestamps require offsets',async()=>{
 for(const start of ['2026-10-23T00:00:00Z','2026-10-22T00:00:00Z','2026-11-02T09:00:00','nonsense']){const v=input();v.scheduledStartAt=start;await assert.rejects(make(client(),v));}
});
test('closing equality accepted; split gap and overrun rejected',async()=>{
 const v=input();v.selections[0].resources[0].durationCount=4;assert.equal((await make(client(),v)).scheduledEndAt,'2026-11-02T05:00:00.000Z');
 await assert.rejects(make(client({hours:[{weekday:1,opensAt:'09:00',closesAt:'10:00',isClosed:false},{weekday:1,opensAt:'11:00',closesAt:'13:00',isClosed:false}]})),{code:'BOOKING_DURATION_EXCEEDS_STORE_HOURS'});
});
test('overnight interval uses previous local business date, not UTC weekday or now',async()=>{
 const v=input();v.scheduledStartAt='2026-11-01T17:00:00Z';
 const r=await make(client({hours:[{weekday:0,opensAt:'22:00',closesAt:'03:00',isClosed:false}]}),v);assert.equal(r.businessDate,'2026-11-01');assert.equal(r.scheduledEndAt,'2026-11-01T19:00:00.000Z');
});
test('invalid zone, exceptions and vendor schedule rules are explicitly unsupported',async()=>{
 await assert.rejects(make(client({timezone:'bad/zone'})),{code:'BOOKING_HOURS_UNAVAILABLE'});
 for(const overrides of [{exceptions:[{id:'1'}]},{blocks:[{id:'2'}]}])await assert.rejects(make(client(overrides)),{code:'UNSUPPORTED_BOOKING_AVAILABILITY'});
});
test('confirmed edited hours assessment keeps input and returns retain disposition; no clock release',async()=>{
 const original=await make();const before=JSON.stringify(original);
 const result=capture.assessConfirmedHours(original,{timezone:'Asia/Manila',hours:[{weekday:1,opensAt:'09:00',closesAt:'10:00',isClosed:false}]});
 assert.deepEqual(result,{status:'needs_staff_resolution',reasonCode:'BOOKING_DURATION_EXCEEDS_STORE_HOURS',reservationDisposition:'retain'});assert.equal(JSON.stringify(original),before);
 assert.equal(capture.assessConfirmedHours(original,{timezone:'Asia/Manila',hours:[{weekday:1,opensAt:'09:00',closesAt:'13:00',isClosed:false}]}).status,'fits');
 assert.equal(capture.assessConfirmedHours(original,{timezone:'bad/zone',hours:[]}).reservationDisposition,'retain');
});

test('missing or duplicate mapping and malformed scope cannot create a capture',async()=>{
 const c=client();c.query=async()=>({rows:[]});await assert.rejects(make(c),{code:'BOOKING_RESOURCE_NOT_ELIGIBLE'});
 const duplicate=client();const query=duplicate.query.bind(duplicate);duplicate.query=async(sql,v)=>{const r=await query(sql,v);return sql.includes('FROM vendor_services')?{rows:[...r.rows,...r.rows]}:r;};await assert.rejects(make(duplicate),{code:'BOOKING_RESOURCE_NOT_ELIGIBLE'});
 await assert.rejects(capture.captureBookingSelectionV4(client(),{tenantId:'7',locationId:'8 OR TRUE'},input(),lineage),{code:'INVALID_BOOKING_SCOPE'});
});
test('required extras are not silently discarded; optional extras remain unselected',async()=>{
 const c=client();c.row.configuration.extras=[{serviceId:'13',selection:'required'}];await assert.rejects(make(c),{code:'UNSUPPORTED_BOOKING_SELECTION'});
 c.row.configuration.extras[0].selection='optional';assert.equal((await make(c)).quantity,1);
});
test('non-Manila timezone determines scheduled day and future fit',async()=>{
 const v=input();v.scheduledStartAt='2026-11-02T14:00:00Z';
 const r=await make(client({timezone:'America/New_York'}),v);assert.equal(r.businessDate,'2026-11-02');assert.equal(r.scheduledEndAt,'2026-11-02T16:00:00.000Z');
});
test('input identity, revisions and calendar dates are validated without silent inference',async()=>{
 for(const edit of [v=>v.selections[0].resources[0].resourceSelectionId='root',v=>v.selections[0].resources[0].resourceMemberId=null,v=>v.selections[0].resources[0].durationPolicyRevision=null,v=>v.scheduledStartAt='2026-02-30T01:00:00Z']){const v=input();edit(v);await assert.rejects(make(client(),v));}
});
test('internal extra lineage fields cannot overwrite frozen capture identity or tenant',async()=>{
 const r=await capture.captureBookingSelectionV4(client(),scope,input(),{...lineage,tenantId:'99',durationCount:99});assert.equal(r.tenantId,'7');assert.equal(r.durationCount,2);
});
