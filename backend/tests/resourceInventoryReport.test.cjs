const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createResourceInventoryReconciliationReport, REPORT_VERSION } = require('../src/services/resourceInventoryReconciliationReport');
const { buildResourceInventoryReport } = require('../src/services/resourceInventoryReportAnalysis');
const { COLLECTIONS } = require('../src/services/resourceInventoryReportQueries');
const scope = { tenantId:'1',locationId:'10',sourceBinding:'test',queueKind:'location' };
function fixture() {
  const names = Object.keys(COLLECTIONS);
  return { reportVersion:REPORT_VERSION,scope,window:{from:'2026-10-12T00:00:00.000Z',to:'2026-10-12T04:00:00.000Z'},
    observedAt:'2026-10-12T01:00:00.000Z',ledger:{revision:'1',writer_coverage_complete:false},
    counts:Object.fromEntries([...names,'historicalTickets','servedWithoutExplicitStart','startedWithoutCapturedPlan','convertedWithoutAllocation','bookingParentsWithoutItems'].map(key=>[key,'0'])),
    data:Object.fromEntries(names.map(key=>[key,[]])),exceeded:[],bounds:Object.fromEntries(names.map(key=>[key,COLLECTIONS[key].maximum])) };
}
const has = (report,code) => report.findings.counts.some(item=>item.code===code);
function ticketConversionFixture(historical = false) {
  const input = fixture();
  const items = [{ serviceId:'1000',durationMinutes:30,resource:{ known:true,poolId:'100',unitsRequired:1,poolRevision:'1',requirementRevision:'1' } }];
  input.data.pools = [{ id:'100',capacity:4,revision:'1',tracking_enabled:true }];
  input.data.requirements = [{ service_id:'1000',pool_id:'100',units_required:1,revision:'1' }];
  input.data.work = [{ id:'1',status:'called',join_channel:'vendor',service_started_at:input.observedAt,
    items,plan_source:'staff_selection',plan_captured_at:input.observedAt,execution_mode:'parallel' }];
  const binding = { id:'9',ticket_id:'1',booking_id:null,booking_item_id:null,state:'converted',
    pool_id:'100',pool_revision:'1',requirement_revision:'1',units:1,starts_at:input.observedAt,ends_at:'2026-10-12T01:30:00Z',duration_us:'1800000000' };
  const allocation = { id:'2',ticket_id:'1',reservation_id:'9',pool_id:'100',pool_revision:'1',units:1,
    started_at:input.observedAt,expected_end_at:binding.ends_at,reservation_end_matches:true,
    reservation_start_valid:true,ticket_reservation_start_matches:true,ticket_start_matches:true };
  if (historical) input.data.historicalConversions = [{ ...allocation,released_at:binding.ends_at,
    binding_ticket_id:binding.ticket_id,binding_booking_id:null,binding_item_id:null,binding_state:'converted',
    binding_pool_id:'100',binding_pool_revision:'1',binding_units:1,requirement_revision:'1',
    starts_at:binding.starts_at,ends_at:binding.ends_at,binding_duration_us:binding.duration_us,booking_interval_matches:null,
    work_id:'1',service_started_at:input.observedAt,plan_source:'staff_selection',plan_booking_id:null,plan_items:items }];
  else input.data.allocations = [allocation];
  input.data.bindings = [binding];
  return input;
}
for (const historical of [false,true]) {
  test(`ticket-owned ${historical ? 'released' : 'held'} conversions retain source lineage without booking false positives`,()=>{
    const input = ticketConversionFixture(historical);
    const report = buildResourceInventoryReport(input);
    assert.ok(!report.findings.counts.some(finding=>finding.classification==='integrity_difference'));
    assert.equal(report.inventory.protectedBindings.length,0);
    assert.equal(report.readiness,'not_ready');
    assert.equal(report.authoritativeInventoryComplete,false);
    assert.equal(report.customerEstimateChanged,false);
    const allocation = historical ? input.data.historicalConversions[0] : input.data.allocations[0];
    if (historical) allocation.binding_ticket_id = '3';
    else input.data.bindings[0].ticket_id = '3';
    assert.ok(has(buildResourceInventoryReport(input),'allocation_ticket_conversion_lineage_mismatch'));
    if (historical) allocation.binding_ticket_id = '1';
    else input.data.bindings[0].ticket_id = '1';
    allocation.ticket_reservation_start_matches = false;
    assert.ok(has(buildResourceInventoryReport(input),'ticket_conversion_interval_mismatch'));
    allocation.ticket_reservation_start_matches = true;
    if (historical) allocation.requirement_revision = '2';
    else input.data.bindings[0].requirement_revision = '2';
    assert.ok(has(buildResourceInventoryReport(input),'conversion_captured_binding_mismatch'));
    if (historical) allocation.binding_duration_us = '3600000000';
    else input.data.bindings[0].duration_us = '3600000000';
    assert.ok(has(buildResourceInventoryReport(input),'ticket_conversion_duration_mismatch'));
    if (historical) allocation.binding_duration_us = null;
    else input.data.bindings[0].duration_us = null;
    assert.ok(has(buildResourceInventoryReport(input),'ticket_conversion_duration_unknown'));
  });
}
test('V4 multi-resource plans reconcile the matching captured item without booking assumptions',()=>{
  const input = fixture();
  const items = [
    { serviceId:'1000',selectionId:'resource-1',durationMinutes:30,
      resource:{known:true,poolId:'100',unitsRequired:1,poolRevision:'1',requirementRevision:'1'} },
    { serviceId:'2000',selectionId:'extra-1',durationMinutes:15,
      resource:{known:true,poolId:'200',unitsRequired:1,poolRevision:'1',requirementRevision:'1'} },
  ];
  input.data.pools = [{id:'100',capacity:4,revision:'1',tracking_enabled:true},{id:'200',capacity:4,revision:'1',tracking_enabled:true}];
  input.data.requirements = [{service_id:'1000',pool_id:'100',units_required:1,revision:'1'},{service_id:'2000',pool_id:'200',units_required:1,revision:'1'}];
  input.data.work = [{id:'1',status:'called',join_channel:'vendor',service_started_at:input.observedAt,
    items,plan_source:'staff_selection',plan_contract_version:4,plan_captured_at:input.observedAt,execution_mode:'parallel'}];
  input.data.allocations = [{id:'2',ticket_id:'1',reservation_id:'9',pool_id:'200',pool_revision:'1',units:1,
    started_at:input.observedAt,expected_end_at:'2026-10-12T01:15:00Z',reservation_end_matches:true,
    reservation_start_valid:true,ticket_reservation_start_matches:true,ticket_start_matches:true}];
  input.data.bindings = [{id:'9',ticket_id:'1',booking_id:null,booking_item_id:null,state:'converted',pool_id:'200',pool_revision:'1',
    requirement_revision:'1',units:1,starts_at:input.observedAt,ends_at:'2026-10-12T01:15:00Z',duration_us:'900000000'}];
  const report = buildResourceInventoryReport(input);
  assert.ok(!has(report,'unsupported_composition'));
  assert.ok(!has(report,'allocation_ticket_conversion_lineage_mismatch'));
  assert.ok(!has(report,'ticket_conversion_duration_unknown'));
  assert.ok(!has(report,'ticket_conversion_duration_mismatch'));
  assert.equal(report.readiness,'not_ready');
});
test('ambiguous conversion sources remain findings and booking plans cannot adopt ticket bindings',()=>{
  const input=ticketConversionFixture();
  input.data.bindings[0].booking_id='5';
  assert.ok(has(buildResourceInventoryReport(input),'reservation_source_lineage_unknown'));
  input.data.bindings[0].booking_id=null;
  input.data.work[0].plan_source='booking'; input.data.work[0].booking_id='5';
  assert.ok(has(buildResourceInventoryReport(input),'allocation_booking_conversion_lineage_mismatch'));
});
test('ticket protections validate captured demand and never join a null booking item group',()=>{
  const input=ticketConversionFixture(); input.data.allocations=[];
  input.data.bindings[0].state='protected'; input.data.work[0].service_started_at=null;
  const report=buildResourceInventoryReport(input);
  assert.equal(report.inventory.protectedBindings.length,1);
  assert.equal(report.inventory.protectedBindings[0].source,'ticket');
  assert.equal(report.inventory.protectedBindings[0].workRef,'ticket:1:10:1');
  assert.equal(report.inventory.protectedBindings[0].bookingItemRef,null);
  input.data.bindings[0].overlaps_window=false;
  const outsideWindow=buildResourceInventoryReport(input);
  assert.equal(outsideWindow.inventory.linkedBindings[0].source,'ticket');
  assert.equal(outsideWindow.inventory.linkedBindings[0].workRef,'ticket:1:10:1');
  assert.ok(!report.findings.counts.some(finding=>finding.classification==='integrity_difference'));
  input.data.bindings[0].units=2;
  assert.ok(has(buildResourceInventoryReport(input),'ticket_binding_captured_demand_mismatch'));
  input.data.bindings[0].duration_us='3600000000';
  assert.ok(has(buildResourceInventoryReport(input),'ticket_binding_duration_mismatch'));
  for (const status of ['waiting','skipped','pending_carry_over']) {
    input.data.work[0].status=status;
    assert.ok(has(buildResourceInventoryReport(input),'ticket_binding_lifecycle_mismatch'));
  }
  input.data.work[0].status='called'; input.data.work[0].service_started_at=input.observedAt;
  assert.ok(has(buildResourceInventoryReport(input),'ticket_binding_lifecycle_mismatch'));
  input.data.work[0].service_started_at=null; input.data.work[0].service_ended_at=input.observedAt;
  assert.ok(has(buildResourceInventoryReport(input),'ticket_binding_lifecycle_mismatch'));
  input.data.bindings[0].ticket_id='3';
  assert.ok(has(buildResourceInventoryReport(input),'ticket_binding_work_missing'));
});
test('unsupported and legacy work is retained, sanitized, and never produces readiness',()=>{
  const input=fixture();
  input.data.work=[{id:'1',status:'waiting',join_channel:'vendor',items:[null,{name:'PRIVATE',serviceId:'2',resource:{known:false}}],plan_source:'staff_selection',execution_mode:'parallel',plan_captured_at:input.observedAt,customer_email:'PRIVATE'},
    {id:'2',status:'called',service_started_at:input.observedAt,join_channel:'developer'}];
  input.counts.servedWithoutExplicitStart='17';
  const report=buildResourceInventoryReport(input);
  assert.equal(report.inventory.work.length,2);
  assert.equal(report.readiness,'not_ready'); assert.equal(report.snapshot,null);
  assert.equal(report.authoritativeInventoryComplete,false);
  assert.ok(has(report,'unsupported_composition')); assert.ok(has(report,'timing_without_allocation'));
  assert.equal(report.findings.counts.find(item=>item.code==='historical_service_start_unknown').classification,'evidence_gap');
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  assert.equal(report.inventory.work[0].plan.revision,null);
  assert.match(report.inventory.work[0].plan.contentFingerprint,/^[a-f0-9]{64}$/);
});
test('unknown and overdue allocation ends never release held occupancy',()=>{
  const input=fixture(); input.data.pools=[{id:'100',capacity:1,revision:'1'}];
  input.data.allocations=[{id:'1',ticket_id:'1',pool_id:'100',units:1,expected_end_at:null},
    {id:'2',ticket_id:'2',pool_id:'100',units:1,expected_end_at:'2026-10-11T00:00:00Z'}];
  const report=buildResourceInventoryReport(input);
  assert.equal(report.inventory.allocations.length,2);
  assert.ok(has(report,'allocation_expected_end_unknown')); assert.ok(has(report,'allocation_expected_end_overdue'));
  assert.ok(has(report,'observed_held_units_exceed_capacity'));
  assert.ok(!has(report,'potential_held_and_protected_capacity_conflict'));
});
test('binding and allocation demand differences stay visible without assuming repairs',()=>{
  const input=fixture(); input.data.pools=[{id:'100',capacity:4,revision:'2'},{id:'200',capacity:4,revision:'2'}];
  input.data.requirements=[{service_id:'1000',pool_id:'100',units_required:1,revision:'2'}];
  input.data.bookingItems=[{id:'1',service_id:'1000',item_count:'1',booking_quantity:1,booking_status:'confirmed',interval_not_elapsed:true,duration_minutes:'60'}];
  input.data.bindings=[{id:'1',booking_item_id:'1',pool_id:'200',units:2,pool_revision:'1',requirement_revision:'1',state:'protected',
    starts_at:input.observedAt,ends_at:input.window.to,booking_interval_matches:true}];
  input.data.work=[{id:'1',items:[{resource:{known:true,poolId:'100',unitsRequired:1}}]}];
  input.data.allocations=[{id:'1',ticket_id:'1',pool_id:'200',units:2}];
  const report=buildResourceInventoryReport(input);
  assert.ok(has(report,'protected_binding_current_demand_difference'));
  assert.ok(has(report,'protected_binding_frozen_revision_stale'));
  assert.ok(has(report,'allocation_captured_demand_mismatch'));
});
test('past and adjacent protection cannot conflict with current held demand',()=>{
  const input=fixture(); input.data.pools=[{id:'100',capacity:1,revision:'1'}];
  input.data.allocations=[{id:'1',ticket_id:'1',pool_id:'100',units:1,started_at:input.observedAt}];
  input.data.bindings=[{id:'1',pool_id:'100',units:1,state:'protected',starts_at:input.window.from,ends_at:input.observedAt}];
  assert.ok(!has(buildResourceInventoryReport(input),'potential_held_and_protected_capacity_conflict'));
  input.data.bindings.push({id:'2',pool_id:'100',units:1,state:'protected',starts_at:input.observedAt,ends_at:input.window.to});
  const report=buildResourceInventoryReport(input);
  assert.ok(!has(report,'protected_units_exceed_capacity'));
  assert.equal(report.findings.counts.find(i=>i.code==='potential_held_and_protected_capacity_conflict').classification,'evidence_gap');
});
test('capacity sweep preserves sub-millisecond interval overlaps',()=>{
  const input=fixture(); input.data.pools=[{id:'100',capacity:1,revision:'1'}];
  const base=BigInt(Date.parse(input.observedAt))*1000n;
  input.data.bindings=[{id:'1',pool_id:'100',units:1,state:'protected',starts_at:input.observedAt,ends_at:input.observedAt,
    starts_at_us:String(base),ends_at_us:String(base+600n),overlaps_window:true},
    {id:'2',pool_id:'100',units:1,state:'protected',starts_at:input.observedAt,ends_at:input.observedAt,
      starts_at_us:String(base+500n),ends_at_us:String(base+1000n),overlaps_window:true}];
  assert.ok(has(buildResourceInventoryReport(input),'protected_units_exceed_capacity'));
});
test('capacity comparison uses exact observation within the displayed millisecond',()=>{
  const input=fixture(),base=BigInt(Date.parse(input.observedAt))*1000n;
  input.observedAtUs=String(base+500n);
  input.data.pools=[{id:'100',capacity:1,revision:'1'}];
  input.data.allocations=[{id:'1',pool_id:'100',units:1}];
  input.data.bindings=[{id:'1',pool_id:'100',units:1,state:'protected',starts_at:input.window.from,ends_at:input.observedAt,
    starts_at_us:String(base-1000n),ends_at_us:String(base+499n),overlaps_window:true}];
  assert.ok(!has(buildResourceInventoryReport(input),'potential_held_and_protected_capacity_conflict'));
  input.data.bindings[0].ends_at_us=String(base+501n);
  assert.ok(has(buildResourceInventoryReport(input),'potential_held_and_protected_capacity_conflict'));
});
test('booking allocation requires the captured item conversion even with identical demand',()=>{
  const input=fixture(); input.data.work=[{id:'1',plan_source:'booking',booking_id:'5',items:[{bookingItemId:'7'}]}];
  input.data.allocations=[{id:'1',ticket_id:'1',pool_id:'100',units:1,reservation_id:'9'}];
  input.data.bindings=[{id:'9',booking_id:'5',booking_item_id:'8',pool_id:'100',units:1,state:'converted'}];
  assert.ok(has(buildResourceInventoryReport(input),'allocation_booking_conversion_lineage_mismatch'));
  input.data.bindings[0].booking_item_id='7';
  assert.ok(!has(buildResourceInventoryReport(input),'allocation_booking_conversion_lineage_mismatch'));
  input.data.allocations[0].reservation_id=null;
  assert.ok(has(buildResourceInventoryReport(input),'allocation_booking_conversion_lineage_mismatch'));
});
test('connection acquisition and rollback failures are sanitized',async()=>{
  const read=createResourceInventoryReconciliationReport({pool:{connect:async()=>{throw new Error('PRIVATE database host');}},sourceBinding:'test',authorize:async()=>true});
  await assert.rejects(read({tenantId:'1',locationId:'10',windowFrom:'2026-10-12T00:00:00Z',windowTo:'2026-10-12T01:00:00Z'}),
    error=>error.code==='resource_report_authorization_unavailable' && !error.message.includes('PRIVATE'));
  let released=false;
  const acquired=createResourceInventoryReconciliationReport({pool:{connect:async()=>({query:async()=>{throw new Error('PRIVATE');},release:()=>{released=true;}})},sourceBinding:'test',authorize:async()=>true});
  await assert.rejects(acquired({tenantId:'1',locationId:'10',windowFrom:'2026-10-12T00:00:00Z',windowTo:'2026-10-12T01:00:00Z'}),/authorization_unavailable/);
  assert.equal(released,true);
});
test('maximum-sized item reconciliation uses bounded grouped lookups',()=>{
  const input=fixture();
  for(let index=1;index<=20000;index++){
    const key=String(index);
    input.data.bookingItems.push({id:key,item_count:'1',booking_quantity:1,booking_status:'confirmed',interval_not_elapsed:true,duration_minutes:'60'});
    input.data.bindings.push({id:key,booking_item_id:key,state:'converted'});
  }
  const report=buildResourceInventoryReport(input);
  assert.equal(report.inventory.bookingItems.length,20000);
  assert.equal(report.inventory.bookingItems[19999].bindingRefs[0],'reservation:1:10:20000');
});
test('converted immutable revision and source interval differences are integrity findings',()=>{
  const input=fixture();
  input.data.allocations=[{id:'1',pool_id:'100',pool_revision:'2',units:1,reservation_id:'9'}];
  input.data.bindings=[{id:'9',booking_item_id:'7',pool_id:'100',pool_revision:'1',units:1,state:'converted',booking_interval_matches:false}];
  input.data.bookingItems=[{id:'7'}];
  const report=buildResourceInventoryReport(input);
  assert.ok(has(report,'allocation_conversion_mismatch'));
  assert.equal(report.findings.counts.find(i=>i.code==='converted_booking_interval_mismatch').classification,'integrity_difference');
  input.data.bindings[0].pool_revision='2'; input.data.bindings[0].booking_interval_matches=true;
  const matching=buildResourceInventoryReport(input);
  assert.ok(!has(matching,'allocation_conversion_mismatch')); assert.ok(!has(matching,'converted_booking_interval_mismatch'));
});
test('frozen allocation and captured booking evidence cannot silently diverge',()=>{
  const input=fixture();
  const item={bookingItemId:'7',scheduledStartAt:input.observedAt,scheduledEndAt:input.window.to,
    resource:{known:true,poolId:'100',unitsRequired:1,poolRevision:'1',requirementRevision:'1'}};
  input.data.work=[{id:'1',plan_source:'booking',booking_id:'5',items:[item]}];
  input.data.allocations=[{id:'1',ticket_id:'1',pool_id:'100',pool_revision:'2',units:1,reservation_id:'9',reservation_end_matches:false}];
  input.data.bindings=[{id:'9',booking_id:'5',booking_item_id:'7',pool_id:'100',pool_revision:'2',requirement_revision:'2',units:1,state:'converted',starts_at:input.window.from,ends_at:input.window.to}];
  const report=buildResourceInventoryReport(input);
  assert.ok(has(report,'allocation_captured_demand_mismatch'));
  assert.ok(has(report,'allocation_conversion_mismatch'));
  assert.ok(has(report,'conversion_captured_binding_mismatch'));
  input.data.work[0].plan_source='staff_selection';
  assert.ok(has(buildResourceInventoryReport(input),'staff_allocation_with_booking_conversion'));
});
test('missing frozen intervals and pending conversion are visible',()=>{
  const input=fixture(); input.data.work=[{id:'1',plan_source:'booking',booking_id:'5',items:[{bookingItemId:'7',scheduledStartAt:'invalid'}]}];
  input.data.allocations=[{id:'1',ticket_id:'1',reservation_id:'9'}];
  input.data.bindings=[{id:'9',booking_id:'5',booking_item_id:'7',state:'converted',booking_interval_matches:true}];
  input.data.bookingItems=[{id:'7',booking_status:'pending'}];
  const report=buildResourceInventoryReport(input);
  assert.equal(report.findings.counts.find(i=>i.code==='captured_booking_interval_unknown').classification,'evidence_gap');
  assert.ok(has(report,'pending_booking_with_conversion'));
});
test('expired work retains its stored lifecycle status',()=>{
  const input=fixture(); input.data.work=[{id:'1',status:'expired',service_started_at:input.observedAt}];
  assert.equal(buildResourceInventoryReport(input).inventory.work[0].queueStatus,'expired');
});
test('row overflow keeps exact totals but does not evaluate partial inventory',()=>{
  const input=fixture(); input.exceeded=['work']; input.counts.work='10001';
  const report=buildResourceInventoryReport(input);
  assert.equal(report.scanStatus,'row_limit_exceeded'); assert.equal(report.counts.work,'10001');
  assert.equal(report.inventory,null); assert.equal(report.findings.counts,null);
});
test('released history overflow cannot accept conversion existence as evaluated evidence',()=>{
  const input=fixture(); input.exceeded=['historicalConversions']; input.counts.historicalConversions='10001';
  const report=buildResourceInventoryReport(input);
  assert.equal(report.counts.historicalConversions,'10001'); assert.equal(report.scanStatus,'row_limit_exceeded');
  assert.equal(report.inventory,null); assert.equal(report.findings.status,'not_evaluated');
});
test('scope and window validation happens before connecting',async()=>{
  const read=createResourceInventoryReconciliationReport({pool:{connect:()=>assert.fail('connect')},sourceBinding:'test',authorize:async()=>true});
  await assert.rejects(read({...scope,tenantId:'9223372036854775808'}),/scope/);
  await assert.rejects(read({tenantId:'1',locationId:'10',windowFrom:'2026-02-30T00:00:00Z',windowTo:'2026-03-01T00:00:00Z'}),/window/);
});
const databaseUrl=process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
test('real PostgreSQL scoped inventory, reconciliation, authorization and read bounds',{skip:!databaseUrl},async t=>{
  const url=new URL(databaseUrl); assert.equal(url.hostname,'127.0.0.1');
  assert.ok(['/getprio_test','/getprio_ledger_test'].includes(url.pathname));
  const {Pool}=require('pg'),schema=`inventory_${randomUUID().replaceAll('-','')}`;
  const pool=new Pool({connectionString:databaseUrl,options:`-c search_path=${schema}`,max:4});
  try {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN NEW.updated_at=now(); RETURN NEW; END';
      CREATE TABLE users(id BIGINT PRIMARY KEY);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT,UNIQUE(id,tenant_id));
      CREATE TABLE vendor_services(id BIGINT PRIMARY KEY,tenant_id BIGINT,UNIQUE(id,tenant_id));
      CREATE TABLE location_services(location_id BIGINT,service_id BIGINT,UNIQUE(location_id,service_id));
      CREATE TABLE tickets(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,status TEXT,join_channel TEXT,
        developer_project_id BIGINT,customer_confirmed_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now(),service_started_at TIMESTAMPTZ,service_ended_at TIMESTAMPTZ,
        service_priority_band TEXT DEFAULT 'normal',carry_over_count INTEGER DEFAULT 0,current_queue_day_id BIGINT,original_queue_day_id BIGINT,
        customer_email TEXT DEFAULT 'PRIVATE',UNIQUE(id,tenant_id,location_id));
      CREATE TABLE bookings(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,status TEXT,pending_expires_at TIMESTAMPTZ,
        payment_proof_object_key TEXT,scheduled_start_at TIMESTAMPTZ,scheduled_end_at TIMESTAMPTZ,queue_ticket_id BIGINT);
      CREATE TABLE booking_bundle_items(id BIGINT PRIMARY KEY,booking_id BIGINT,tenant_id BIGINT,location_id BIGINT,service_id BIGINT,
        booking_quantity INTEGER DEFAULT 1,scheduled_start_at TIMESTAMPTZ,scheduled_end_at TIMESTAMPTZ);
      CREATE TABLE ticket_service_plans(ticket_id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,booking_id BIGINT,
        source TEXT,execution_mode TEXT,contract_version INTEGER,items JSONB,created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE queue_days(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,business_date DATE,state TEXT,intake_mode TEXT,
        version BIGINT,deadline_version BIGINT,last_reconciled_at TIMESTAMPTZ,last_reconciliation_error TEXT);
      CREATE TABLE queue_ticket_segments(id BIGINT PRIMARY KEY,ticket_id BIGINT,queue_day_id BIGINT,sequence INTEGER,
        priority_band TEXT,activated_at TIMESTAMPTZ,ended_at TIMESTAMPTZ,legacy_inferred BOOLEAN);
      CREATE TABLE grants(tenant_id BIGINT,location_id BIGINT,allowed BOOLEAN);
      INSERT INTO store_locations VALUES(10,1),(20,2);
      INSERT INTO vendor_services VALUES(1000,1),(2000,2);
      INSERT INTO location_services VALUES(10,1000),(20,2000);
      INSERT INTO grants VALUES(1,10,true);`);
    for(const migration of ['20261003_add_resource_capacity_foundation.sql','20261007_add_resource_ledger_foundation.sql'])
      await pool.query(fs.readFileSync(path.resolve(__dirname,'../../database/migrations',migration),'utf8'));
    await pool.query(`INSERT INTO location_resource_pools(id,tenant_id,location_id,name,capacity) VALUES(100,1,10,'PRIVATE',4),(200,2,20,'OTHER',4);
      INSERT INTO service_resource_requirements(tenant_id,location_id,service_id,pool_id,units_required) VALUES(1,10,1000,100,1);
      INSERT INTO resource_ledger_scopes(tenant_id,location_id) VALUES(1,10);
      INSERT INTO tickets(id,tenant_id,location_id,status,join_channel,service_started_at) VALUES
        (1,1,10,'called','vendor',now()-interval '3 hours'),(2,1,10,'waiting','online',NULL),
        (3,1,10,'served','vendor',NULL),(4,2,20,'waiting','online',NULL);
      INSERT INTO bookings VALUES(1,1,10,'confirmed',NULL,NULL,now()-interval '10 minutes',now()+interval '50 minutes',NULL),
        (2,1,10,'confirmed',NULL,NULL,now()-interval '3 hours',now()-interval '2 hours',1),
        (3,1,10,'pending',now()-interval '1 minute',NULL,now(),now()+interval '1 hour',NULL);
      INSERT INTO booking_bundle_items(id,booking_id,tenant_id,location_id,service_id,scheduled_start_at,scheduled_end_at)
        SELECT id,id,1,10,1000,scheduled_start_at,scheduled_end_at FROM bookings;
      INSERT INTO resource_ledger_reservations(id,tenant_id,location_id,booking_id,booking_item_id,pool_id,pool_revision,requirement_revision,units,starts_at,ends_at,state)
        SELECT 1,1,10,2,2,100,1,1,1,scheduled_start_at,scheduled_end_at,'converted' FROM bookings WHERE id=2;
      INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,reservation_id,started_at,expected_end_at)
        SELECT 1,10,1,100,1,1,1,service_started_at,service_started_at+interval '1 hour' FROM tickets WHERE id=1;`);
    const authorize=async(client,s)=> (await client.query('SELECT allowed FROM grants WHERE tenant_id=$1 AND location_id=$2',[s.tenantId,s.locationId])).rows[0]?.allowed===true;
    const input=()=>({tenantId:'1',locationId:'10',windowFrom:new Date(Date.now()-60000).toISOString(),windowTo:new Date(Date.now()+3600000).toISOString()});
    const read=(options={})=>createResourceInventoryReconciliationReport({pool,sourceBinding:'test',authorize,...options});
    await t.test('underlying demand, outside-window conversions, history and private scope remain visible',async()=>{
      const report=await read()(input());
      assert.equal(report.scanStatus,'complete'); assert.equal(report.counts.work,'2'); assert.equal(report.counts.historicalTickets,'3');
      assert.equal(report.inventory.allocations.length,1); assert.equal(report.inventory.linkedBindings.length,1);
      assert.equal(report.inventory.protectedBindings.length,0);
      assert.equal(report.inventory.bookingItems.find(i=>i.bookingItemRef.endsWith(':1')).classification,'unadmitted_demand');
      assert.equal(report.inventory.bookingItems.find(i=>i.bookingItemRef.endsWith(':3')).classification,'expired_pending');
      assert.ok(has(report,'eligible_booking_without_binding')); assert.ok(has(report,'allocation_expected_end_overdue'));
      assert.ok(!has(report,'historical_conversion_without_allocation')); assert.ok(!has(report,'allocation_ticket_start_mismatch'));
      assert.ok(!JSON.stringify(report).includes('PRIVATE')); assert.ok(!JSON.stringify(report).includes('OTHER'));
      assert.ok(Object.isFrozen(report.inventory.work)); assert.equal(report.readiness,'not_ready');
      assert.equal((await pool.query('SELECT state FROM resource_ledger_reservations')).rows[0].state,'converted');
      await assert.rejects(pool.query('UPDATE location_resource_pools SET tracking_enabled=true WHERE id=100'),/resource_pools_tracking_disabled_check/);
      await assert.rejects(pool.query('UPDATE resource_ledger_scopes SET writer_coverage_complete=true'),/resource_ledger_coverage_disabled_check/);
    });
    await t.test('early allocation and unconfirmed non-called work violate held lifecycle evidence',async()=>{
      await pool.query(`UPDATE resource_allocations SET started_at=started_at-interval '1 minute' WHERE ticket_id=1;
        UPDATE tickets SET status='waiting',join_channel='online',service_started_at=(SELECT started_at FROM resource_allocations WHERE ticket_id=1) WHERE id=1;
        UPDATE bookings SET status='pending' WHERE id=2;`);
      const report=await read()(input());
      assert.ok(has(report,'allocation_conversion_mismatch'));
      assert.ok(has(report,'held_allocation_ticket_not_called'));
      assert.ok(has(report,'held_allocation_confirmation_missing'));
      assert.ok(has(report,'pending_booking_with_conversion'));
      await pool.query(`UPDATE resource_allocations SET started_at=(SELECT starts_at FROM resource_ledger_reservations WHERE id=1) WHERE ticket_id=1;
        UPDATE tickets SET status='called',join_channel='vendor',service_started_at=(SELECT started_at FROM resource_allocations WHERE ticket_id=1) WHERE id=1;
        UPDATE bookings SET status='confirmed' WHERE id=2;`);
    });
    await t.test('released conversions are validated separately and never count as occupancy',async()=>{
      const intervals=(await pool.query('SELECT starts_at,ends_at FROM resource_ledger_reservations WHERE id=1')).rows[0];
      const item={serviceId:'1000',bookingItemId:'2',durationMinutes:60,scheduledStartAt:intervals.starts_at.toISOString(),scheduledEndAt:intervals.ends_at.toISOString(),
        resource:{known:true,poolId:'100',poolRevision:1,requirementRevision:1,unitsRequired:1}};
      await pool.query("INSERT INTO ticket_service_plans(ticket_id,tenant_id,location_id,booking_id,source,execution_mode,items) VALUES(1,1,10,2,'booking','parallel',$1)",[JSON.stringify([item])]);
      await pool.query(`UPDATE resource_allocations SET released_at=now(),outcome='completed' WHERE ticket_id=1;
        UPDATE tickets SET status='served',service_ended_at=now() WHERE id=1;`);
      const valid=await read()(input());
      assert.equal(valid.counts.historicalConversions,'1'); assert.equal(valid.inventory.allocations.length,0);
      assert.equal(valid.inventory.historicalConversions[0].occupancyState,'released');
      assert.ok(!valid.findings.counts.some(i=>i.recordType==='historical_allocation'));
      await pool.query(`INSERT INTO tickets(id,tenant_id,location_id,status,join_channel) VALUES(8,1,10,'served','vendor');
        INSERT INTO bookings SELECT 8,1,10,'confirmed',NULL,NULL,scheduled_start_at,scheduled_end_at,NULL FROM bookings WHERE id=2;
        INSERT INTO booking_bundle_items(id,booking_id,tenant_id,location_id,service_id,scheduled_start_at,scheduled_end_at)
          SELECT 8,8,1,10,1000,scheduled_start_at,scheduled_end_at FROM bookings WHERE id=8;
        INSERT INTO resource_ledger_reservations(id,tenant_id,location_id,booking_id,booking_item_id,pool_id,pool_revision,requirement_revision,units,starts_at,ends_at,state)
          SELECT 8,1,10,8,8,100,1,1,1,scheduled_start_at,scheduled_end_at,'converted' FROM bookings WHERE id=8;
        INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,reservation_id,started_at,expected_end_at,released_at,outcome)
          SELECT 1,10,8,100,1,1,8,starts_at,ends_at,now(),'completed' FROM resource_ledger_reservations WHERE id=8;`);
      const bounded=await read({limits:{historicalConversions:1}})(input());
      assert.equal(bounded.counts.historicalConversions,'2'); assert.equal(bounded.inventory,null);
      assert.equal(bounded.findings.status,'not_evaluated');
      await pool.query(`DELETE FROM resource_allocations WHERE ticket_id=8;
        DELETE FROM resource_ledger_reservations WHERE id=8;
        DELETE FROM booking_bundle_items WHERE id=8;
        DELETE FROM bookings WHERE id=8;
        DELETE FROM tickets WHERE id=8;`);
      for(const state of ['protected','cancelled']){
        await pool.query('UPDATE resource_ledger_reservations SET state=$1 WHERE id=1',[state]);
        const altered=await read()(input());
        assert.equal(altered.counts.historicalConversions,'1');
        assert.equal(altered.inventory.historicalConversions[0].bindingState,state);
        assert.equal(altered.inventory.allocations.length,0);
        assert.ok(altered.findings.counts.some(i=>i.recordType==='historical_allocation' && i.code==='allocation_conversion_mismatch'));
      }
      await pool.query("UPDATE resource_ledger_reservations SET state='converted' WHERE id=1");
      await pool.query('UPDATE resource_allocations SET units=2 WHERE ticket_id=1');
      const invalid=await read()(input());
      assert.ok(invalid.findings.counts.some(i=>i.recordType==='historical_allocation' && i.code==='allocation_conversion_mismatch'));
      assert.ok(!has(invalid,'historical_conversion_without_allocation'));
      await pool.query('DELETE FROM ticket_service_plans WHERE ticket_id=1');
      const gap=await read()(input());
      assert.ok(gap.findings.counts.some(i=>i.code==='historical_conversion_plan_unknown' && i.classification==='evidence_gap'));
      await pool.query(`UPDATE resource_allocations SET units=1,released_at=NULL,outcome=NULL WHERE ticket_id=1;
        UPDATE tickets SET status='called',service_ended_at=NULL WHERE id=1;`);
    });
    await t.test('recoverable skipped work, plan and active segment remain inventoried',async()=>{
      await pool.query(`INSERT INTO tickets(id,tenant_id,location_id,status,join_channel) VALUES(7,1,10,'skipped','vendor');
        INSERT INTO ticket_service_plans(ticket_id,tenant_id,location_id,source,execution_mode,items) VALUES(7,1,10,'staff_selection','parallel','[]');
        INSERT INTO queue_days(id,tenant_id,location_id,business_date,state,version,deadline_version) VALUES(7,1,10,current_date,'closed',1,1);
        INSERT INTO queue_ticket_segments(id,ticket_id,queue_day_id,sequence,priority_band,activated_at,legacy_inferred) VALUES(7,7,7,1,'recovery',now(),false);`);
      const report=await read()(input());
      assert.equal(report.counts.work,'3');
      const work=report.inventory.work.find(i=>i.workRef.endsWith(':7'));
      assert.equal(work.queueStatus,'skipped'); assert.ok(work.plan);
      assert.ok(report.inventory.segments.some(i=>i.workRef.endsWith(':7')));
      assert.ok(report.inventory.queueDays.some(i=>i.queueDayRef.endsWith(':7') && i.version==='1'));
      await pool.query('DELETE FROM queue_ticket_segments WHERE id=7');
      await pool.query('DELETE FROM queue_days WHERE id=7');
      await pool.query('DELETE FROM ticket_service_plans WHERE ticket_id=7');
      await pool.query('DELETE FROM tickets WHERE id=7');
    });
    await t.test('ledger overlap loads mismatched source item even outside source window',async()=>{
      await pool.query(`INSERT INTO bookings VALUES(6,1,10,'confirmed',NULL,NULL,now()+interval '2 hours',now()+interval '3 hours',NULL);
        INSERT INTO booking_bundle_items(id,booking_id,tenant_id,location_id,service_id,scheduled_start_at,scheduled_end_at)
          SELECT 6,6,1,10,1000,scheduled_start_at,scheduled_end_at FROM bookings WHERE id=6;
        INSERT INTO resource_ledger_reservations(id,tenant_id,location_id,booking_id,booking_item_id,pool_id,pool_revision,requirement_revision,units,starts_at,ends_at)
          VALUES(6,1,10,6,6,100,1,1,2,now(),now()+interval '30 minutes');`);
      const report=await read()(input());
      assert.ok(report.inventory.bookingItems.some(i=>i.bookingItemRef.endsWith(':6')));
      assert.ok(has(report,'protected_booking_interval_or_eligibility_mismatch'));
      assert.ok(has(report,'protected_binding_current_demand_difference'));
      await pool.query('DELETE FROM resource_ledger_reservations WHERE id=6');
      await pool.query('DELETE FROM booking_bundle_items WHERE id=6');
      await pool.query('DELETE FROM bookings WHERE id=6');
    });
    await t.test('authorizer cannot write; failed authorization exposes no inventory',async()=>{
      await assert.rejects(read({authorize:async client=>{await client.query('UPDATE grants SET allowed=false');return true;}})(input()),/authorization_unavailable/);
      await assert.rejects(read()({...input(),tenantId:'2',locationId:'20'}),error=>error.statusCode===403);
      assert.equal((await pool.query('SELECT allowed FROM grants')).rows[0].allowed,true);
    });
    await t.test('repeatable read is coherent across concurrent source changes',async()=>{
      let calls=0;
      const report=await read({authorize:async(client,s)=>{
        const permitted=await authorize(client,s);
        if(++calls===1) await pool.query("INSERT INTO tickets(id,tenant_id,location_id,status,join_channel) VALUES(5,1,10,'waiting','qr')");
        return permitted;
      }})(input());
      assert.equal(report.counts.work,'2'); assert.equal(report.inventory.work.length,2); assert.equal(calls,2);
      assert.equal((await read()(input())).counts.work,'3');
    });
    await t.test('grant revoked during observation is denied by fresh authorization',async()=>{
      let calls=0;
      await assert.rejects(read({authorize:async(client,s)=>{
        const permitted=await authorize(client,s);
        if(++calls===1) await pool.query('UPDATE grants SET allowed=false');
        return permitted;
      }})(input()),error=>error.statusCode===403);
      await pool.query('UPDATE grants SET allowed=true');
    });
    await t.test('row and byte limits never return partial inventory as complete',async()=>{
      const rows=await read({limits:{work:1}})(input()); assert.equal(rows.counts.work,'3'); assert.equal(rows.inventory,null);
      assert.equal(rows.findings.counts,null); assert.equal(rows.scanStatus,'row_limit_exceeded');
      const bytes=await read({maximumBytes:4096})(input()); assert.equal(bytes.scanStatus,'byte_limit_exceeded');
      assert.equal(bytes.inventory,null); assert.ok(Buffer.byteLength(JSON.stringify(bytes))<=4096);
    });
    await t.test('statement timeout preserves unavailable count semantics',async()=>{
      const slowPool={connect:async()=>{
        const client=await pool.connect();
        return {release:()=>client.release(),query:async(sql,params)=>{
          if(sql.startsWith('WITH scope_tickets')) await client.query('SELECT pg_sleep(0.1)');
          return client.query(sql,params);
        }};
      }};
      const report=await read({pool:slowPool,statementTimeoutMs:10})(input());
      assert.equal(report.counts,null); assert.equal(report.scanStatus,'unavailable');
      assert.deepEqual(report.blockers,['resource_report_read_timeout']);
    });
    await t.test('count query timeout returns unavailable counts, never fabricated zero',async()=>{
      const blocker=await pool.connect();
      try {
        await blocker.query('BEGIN'); await blocker.query('LOCK TABLE tickets IN ACCESS EXCLUSIVE MODE');
        const report=await read({lockTimeoutMs:10})(input());
        assert.equal(report.scanStatus,'unavailable'); assert.equal(report.counts,null); assert.equal(report.inventory,null);
        assert.deepEqual(report.blockers,['resource_report_read_timeout']);
      } finally {await blocker.query('ROLLBACK');blocker.release();}
    });
  } finally {await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();}
});
