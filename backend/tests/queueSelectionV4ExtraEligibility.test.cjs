const test = require('node:test');
const assert = require('node:assert/strict');
// No external database is reachable. Exercise the real capture adapter, workflow,
// amendment command, availability guard and child repository against SQL fixtures.
const dbId = require.resolve('../src/config/db');
require.cache[dbId] = {id:dbId,filename:dbId,loaded:true,exports:{query(){throw Error('External DB forbidden');}}};
const v4 = require('../src/services/queueSelectionCaptureV4');
const legacy = require('../src/services/queueSelectionCapture');
const commands = require('../src/services/queueSelectionCommandService');
const scope = {tenantId:'1',locationId:'2',actorUserId:'3'};
const member = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-10-23T02:00:00Z');
function configuration(mode, extras=[]) {
 return {labels:{service:'Service',resources:'Resources',duration:'Duration',extras:'Extras'},
 assignment:mode==='named'?{mode:'named',allocationIdentity:'named_member'}:{mode:'automatic',allocationIdentity:'pooled_capacity'},
 duration:{mode:'adjustable',visible:true,baseMinutes:60,minCount:1,maxCount:3,stepCount:1,defaultCount:1},extras,
 execution:{resourceStart:'together',extraStart:'with_parent',extraContainment:'within_parent',selectedExtraResolution:'explicit_required'}};
}
function fixture({mode='pooled',requirement='optional',configured=true,legacyIds=[],deeper=false}={}) {
 const services = ['22','23','24'].map((id,index)=>({id,name:'Service '+id,service_revision:'1',offered:true,
 pool_id:String(10+index),units_required:1,requirement_revision:'1',pool_name:'Pool '+index,capacity:2,pool_revision:'1',tracking_enabled:true,
 policy_revision:'4',selection_mode:index===1?mode:'pooled',duration_options:[60,120,180],extra_service_ids:index===0?legacyIds:[],
 configuration:configuration(index===1?mode:'pooled',index===0?(configured?[{serviceId:'23',selection:requirement}]:[]):index===1&&deeper?[{serviceId:'24',selection:'optional'}]:[])}));
 const members=[{id:member,pool_id:'11',name:'Member A',revision:'1',display_order:0,is_active:true,archived_at:null},
 {id:other,pool_id:'12',name:'Wrong pool',revision:'1',display_order:0,is_active:true,archived_at:null}];
 const calls=[]; const writes=[];
 const state={busy:null,services,members,calls,writes};
 state.query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes("to_regclass") && sql.includes("booking_v4_reservations"))return {rows:[{available:true}]};
  if(sql.includes("FROM booking_v4_reservations"))return {rows:[]};
  if (/^\s*(INSERT|UPDATE|DELETE)\b/u.test(sql)) {writes.push({sql,args});return {rows:[]};}
  if(sql.includes('FROM queue_stage_attempts'))return {rows:[{n:'0'}]};
  if(sql.includes('FROM queue_reservation_groups'))return {rows:[]};
  if(sql.includes('FROM resource_allocations'))return {rows:sql.includes('pool_id')&&state.busy==='in-service'?[{resource_member_id:mode==='named'?member:null,units:2}]:[]};
  if(sql.includes('FROM resource_ledger_reservations'))return {rows:state.busy==='held'?[{resource_member_id:mode==='named'?member:null,units:2,starts_at:now,ends_at:new Date(+now+3600000)}]:[]};
  if(sql.includes('FROM vendor_services s JOIN location_services l')&&sql.includes('service_revision'))return {rows:services};
  if(sql.includes('FROM resource_pool_members WHERE'))return {rows:members};
  if(sql.includes('FROM resource_pool_members m WHERE'))return {rows:members.map(m=>({id:m.id,availability:'provisional_free'}))};
  if(sql.includes('FROM queue_workflow_'))return {rows:[{revision:'1',mode:'linear',stations:[],stages:[]}]};
  if(sql.includes('clock_timestamp() AS observed_at FROM store_locations'))return {rows:[{timezone:'UTC',observed_at:now}]};
  if(sql.includes('FROM store_hours'))return {rows:[]};
  if(sql==='SELECT clock_timestamp() AS observed_at')return {rows:[{observed_at:now}]};
  if(sql==='SELECT clock_timestamp() AS at')return {rows:[{at:now}]};
  if(sql.includes('FROM queue_service_policies q JOIN vendor_services'))return {rows:services.map(s=>({service_id:s.id,revision:s.policy_revision,configuration:s.configuration,capacity:s.capacity,units_required:s.units_required}))};
  if(sql.includes('FROM vendor_services s JOIN location_services l'))return {rows:services.map(s=>({...s,has_configuration:!!s.configuration}))};
  if(sql.includes('FROM location_resource_pools'))return {rows:sql.includes('FOR UPDATE')?[{id:args[2],capacity:2,tracking_enabled:true}]:services.map(s=>({id:s.pool_id,name:s.pool_name,capacity:2,available_units:2,tracking_enabled:true,active_members:2}))};
  throw Error('Unexpected SQL: '+sql);
 };
 return state;
}
function input(mode='pooled') {
 return [{serviceSelectionId:'service',serviceId:'22',resources:[{resourceSelectionId:'resource',quantity:1,durationCount:1,durationPolicyRevision:'4',extras:[{extraSelectionId:'extra',serviceId:'23',quantity:1,durationCount:1,durationPolicyRevision:'4',...(mode==='named'?{resourceMemberIds:[member]}:{})}]}]}];
}
async function capture(f, selections=input()) { const catalog=await v4.readCatalog(f,scope);return v4.capture(f,scope,selections,catalog.catalogRevision); }
for (const mode of ['pooled','named']) for(const requirement of ['optional','required']) {
 test(`real V4 adapter accepts ${requirement} ${mode} extra absent from legacy IDs`,async()=>{
  const f=fixture({mode,requirement}),result=await capture(f,input(mode));
  assert.equal(result.contractVersion,4);assert.equal(result.items.length,2);
  const extra=result.items.find(i=>i.selectionKind==='extra');
  assert.equal(extra.serviceId,'23');assert.equal(extra.selectionRequirement,requirement);
  assert.equal(extra.resource.poolId,'11');assert.equal(extra.resource.totalUnits,1);
  assert.equal(extra.resourceMemberId,mode==='named'?member:null);
  assert.equal(f.writes.length,0,'capture cannot induce holds or allocations');
 });
}
test('V4 unconfigured extra rejects even if legacy IDs allow it',async()=>{
 await assert.rejects(capture(fixture({configured:false,legacyIds:['23']})),{code:'EXTRA_NOT_ELIGIBLE'});
});
test('required V4 extras and unsupported deeper nesting remain guarded',async()=>{
 const missing=input();missing[0].resources[0].extras=[];
 await assert.rejects(capture(fixture({requirement:'required'}),missing),{code:'REQUIRED_EXTRA_MISSING'});
 await assert.rejects(capture(fixture({deeper:true})),{code:'UNSUPPORTED_EXTRA_NESTING'});
});
test('named extra identity cannot borrow a member from another pool',async()=>{
 const selections=input('named');selections[0].resources[0].extras[0].resourceMemberIds=[other];
 await assert.rejects(capture(fixture({mode:'named'}),selections),{code:'NAMED_EXTRA_MEMBER_UNAVAILABLE'});
});
test('legacy V3 capture does not gain configured V4 eligibility',async()=>{
 const f=fixture();for(const s of f.services)s.configuration=null;
 const selections=[{serviceSelectionId:'service',serviceId:'22',resources:[{resourceSelectionId:'resource',quantity:1,durationMinutes:60,extras:[{extraSelectionId:'extra',serviceId:'23',quantity:1,durationMinutes:60}]}]}];
 const catalog=await legacy.readCatalog(f,scope);
 await assert.rejects(legacy.capture(f,scope,selections,catalog.catalogRevision),{code:'EXTRA_NOT_ELIGIBLE'});
 // Even the existing V4 flags alone cannot bypass the legacy relationship.
 await assert.rejects(legacy.capture(f,scope,selections,catalog.catalogRevision,{allowConfiguredV4:true,allowNamedExtrasV1:true}),{code:'EXTRA_NOT_ELIGIBLE'});
});
for(const mode of ['pooled','named']) for(const busy of ['held','in-service']) {
 test(`published ${mode} extra rejects ${busy} capacity before any write; release permits amendment`,async()=>{
  const f=fixture({mode});const previousInput=input(mode);previousInput[0].resources[0].extras=[];
  const previous=await capture(f,previousInput),catalog=await v4.readCatalog(f,scope);
  for(const item of previous.items)item.stageId='stage';
  const args={scope,ticket:{_id:'ticket',status:'waiting'},p:{contract_version:4,workflow_configuration_revision:'1',items:previous.items,revision:'1',stage_id:'stage',workflow_mode:'linear'},stage:{},action:'amend',body:{contractVersion:4,serviceSelections:input(mode),expectedCatalogRevision:catalog.catalogRevision,reason:'Add configured extra'},draft:{id:'draft'}};
  f.busy=busy;
  // New/draft capture remains demand-only even when occupancy is busy.
  await capture(f,input(mode));assert.equal(f.writes.length,0);
  await assert.rejects(commands.execute(f,null,args),{code:'RESOURCE_CAPACITY_UNAVAILABLE',statusCode:409});
  assert.equal(f.writes.length,0,'no partial revision, hold cancellation, child or allocation write');
  const locks=f.calls.filter(c=>c.sql.includes('FOR UPDATE')&&c.sql.includes('location_resource_pools'));
  assert.deepEqual(locks.map(c=>c.args[2]),['11']);
  f.busy=null;await commands.execute(f,null,args);
  assert.ok(f.writes.some(c=>c.sql.includes('UPDATE ticket_service_plans')));
  assert.equal(f.writes.some(c=>/INSERT INTO (resource_allocations|resource_ledger_reservations)/u.test(c.sql)),false);
 });
}

test('trusted V4 handoff cannot be reused for a different parent or extra identity',async()=>{
 const f=fixture(),selections=[{serviceSelectionId:'service',serviceId:'22',resources:[{resourceSelectionId:'resource',quantity:1,durationMinutes:60,extras:[{extraSelectionId:'extra',serviceId:'23',quantity:1,durationMinutes:60}]}]}];
 const catalog=await legacy.readCatalog(f,scope);
 for(const mismatch of [{serviceSelectionId:'other'},{parentServiceId:'24'},{resourceSelectionId:'other'},{serviceId:'24'}]) {
  const eligibility={serviceSelectionId:'service',parentServiceId:'22',resourceSelectionId:'resource',serviceId:'23',...mismatch};
  await assert.rejects(legacy.capture(f,scope,selections,catalog.catalogRevision,{allowConfiguredV4:true,allowNamedExtrasV1:true,validatedV4Extras:new Map([['extra',eligibility]])}),{code:'EXTRA_NOT_ELIGIBLE'});
 }
});
test('V4 adapter still aggregates simultaneous pooled extras across parent resources',async()=>{
 const f=fixture(),selections=input();
 const second=structuredClone(selections[0].resources[0]);second.resourceSelectionId='second';second.extras[0].extraSelectionId='secondExtra';second.extras[0].quantity=2;
 selections[0].resources.push(second);
 await assert.rejects(capture(f,selections),{code:'RESOURCE_CAPACITY_EXCEEDED'});
 assert.equal(f.writes.length,0);
});
test('V4 named extra cannot duplicate a simultaneous member across parent resources',async()=>{
 const f=fixture({mode:'named'}),selections=input('named');
 const second=structuredClone(selections[0].resources[0]);second.resourceSelectionId='second';second.extras[0].extraSelectionId='secondExtra';selections[0].resources.push(second);
 await assert.rejects(capture(f,selections),{code:'NAMED_RESOURCE_DUPLICATE'});
 assert.equal(f.writes.length,0);
});

test('historical V2 line drafts reject injected nested extras',()=>{
 const drafts=require('../src/repositories/queuePlanDrafts');
 assert.throws(()=>drafts.validateDraft({lines:[{lineId:'line',serviceId:'22',quantity:1,durationMinutes:60,extras:[{serviceId:'23'}]}]}),{code:'INVALID_PLAN'});
});
