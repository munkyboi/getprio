const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{runInNewContext}=require('node:vm'),{createRequire}=require('node:module');
function fixture(){
 const state={pools:[{id:'13',name:'Courts',capacity:2,tracking_enabled:false},{id:'14',name:'Basic Equipments',capacity:10,tracking_enabled:false}],identities:[{id:'1',name:'Court rental',pool_id:'13',has_configuration:false},{id:'2',name:'Equipment',pool_id:'14',has_configuration:false},{id:'6',name:'Trainer',pool_id:null,has_configuration:false}],policies:[],choices:[],queries:[]};
 const file=require.resolve('../src/services/queueSelectionCaptureV4'),real=createRequire(file),module={exports:{}};
 const client={query:async(sql,args)=>{state.queries.push({sql,args});assert.deepEqual(Array.from(args),['1','4']);assert.ok(!/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)/iu.test(sql));
  if(sql.includes('SELECT q.service_id::text'))return {rows:state.policies};
  if(sql.includes('SELECT s.id::text,s.name'))return {rows:state.identities.map(row=>({...row,units_required:row.units_required??1,configuration:state.policies.find(p=>p.service_id===row.id)?.configuration}))};
  if(sql.includes('FROM location_resource_pools WHERE'))return {rows:state.pools.map(row=>({active_members:2,...row}))};
  throw Error(sql);
 }};
 runInNewContext(readFileSync(file,'utf8'),{module,exports:module.exports,require:name=>name==='./queueServiceHoursService'?{readWindow:async()=>({status:'open',observedAt:'2026-10-21T00:00:00Z',timezone:'UTC',opensAt:'2026-10-21T00:00:00Z',closesAt:'2026-10-22T00:00:00Z',remainingWholeMinutes:1440,provisional:true})}:name==='./queueSelectionCapture'?{readCatalog:async()=>({catalogRevision:'stable',observedAt:'2026-10-21T00:00:00Z',workflow:{mode:'linear'},quote:{status:'unavailable'},services:state.choices})}:name==='./queueServicePolicyV4'?{configuration:value=>value}:real(name)},{filename:file});
 return {state,read:role=>module.exports.readCatalog(client,{tenantId:'1',locationId:'4',actorRole:role})};
}
const config=(extras=[])=>({labels:{service:'Service',resources:'Resources',duration:'Duration',extras:'Extras'},assignment:{mode:'named',allocationIdentity:'named_member'},duration:{mode:'fixed',visible:true,baseMinutes:30,minCount:1,maxCount:1,stepCount:1,defaultCount:1},execution:{resourceStart:'together',extraStart:'with_parent',extraContainment:'within_parent',selectedExtraResolution:'explicit_required'},extras});
const policy=(id,configuration=config())=>({service_id:id,revision:'1',configuration,capacity:2,units_required:1});
const choice=id=>({id,name:'Service '+id,serviceRevision:'1',resourceReady:true,availability:{availableUnits:2},quote:{status:'unavailable'},resourceMembers:[{id:'member-'+id,name:'Court '+id,isActive:true}]});
test('actual V4 builder exposes authoritative unconfigured branch pools instead of losing them with empty executable choices',async()=>{
 const f=fixture();const value=await f.read('staff');assert.equal(value.services.length,0);
 assert.deepEqual(Array.from(value.resourceSetup.pools,p=>[p.id,p.name,p.serviceIds.join(',')]),[['13','Courts','1'],['14','Basic Equipments','2']]);
 const setup=value.resourceSetup.services;
 assert.equal(setup.find(s=>s.id==='1').requestable,false);assert.ok(setup.find(s=>s.id==='1').reasonCodes.includes('SERVICE_POLICY_NOT_CONFIGURED'));assert.ok(setup.find(s=>s.id==='1').reasonCodes.includes('RESOURCE_TRACKING_DISABLED'));
 assert.equal(setup.find(s=>s.id==='6').poolId,null);assert.ok(setup.find(s=>s.id==='6').reasonCodes.includes('RESOURCE_MAPPING_MISSING'));
 assert.deepEqual(JSON.parse(JSON.stringify(await f.read('admin'))),JSON.parse(JSON.stringify(value)));assert.ok(f.state.queries.every(q=>q.args[1]==='4'));
});
test('all valid service mappings to one pool remain fully selectable; unrelated pools and archived facts stay scoped',async()=>{
 const f=fixture();f.state.pools=[{id:'13',name:'Named Courts',capacity:2,tracking_enabled:true},{id:'14',name:'Archived equipment',capacity:10,tracking_enabled:false,archived_at:'2026-10-01'}];
 f.state.identities=[{id:'1',name:'Service one',pool_id:'13',has_configuration:true},{id:'2',name:'Service two',pool_id:'13',has_configuration:true}];f.state.policies=[policy('1'),policy('2')];f.state.choices=[choice('1'),choice('2')];
 const value=await f.read('staff');assert.equal(value.services.length,2);assert.deepEqual(Array.from(value.resourceSetup.pools[0].serviceIds),['1','2']);
 for(const id of ['1','2']){assert.equal(value.resourceSetup.services.find(s=>s.id===id).requestable,true);assert.equal(value.resourceSetup.services.find(s=>s.id===id).reasonCodes.length,0);assert.equal(value.services.find(s=>s.id===id).resourceMembers.length,1);}
 assert.equal(value.resourceSetup.pools[1].archivedAt,'2026-10-01');assert.equal(value.resourceSetup.pools[1].serviceIds.length,0);
});
test('requestability follows exact V4 required-extra readiness, with separate archive and tracking setup reasons',async()=>{
 const f=fixture();f.state.pools[0].tracking_enabled=true;f.state.pools[1].archived_at='2026-10-01';f.state.identities[0].has_configuration=true;f.state.identities[1].has_configuration=true;
 f.state.policies=[policy('1',config([{serviceId:'6',selection:'required'}])),policy('2')];f.state.choices=[choice('1'),{...choice('2'),resourceReady:false}];
 const value=await f.read('owner');assert.equal(value.services.find(s=>s.id==='1').resourceReady,false);assert.equal(value.resourceSetup.services.find(s=>s.id==='1').requestable,false);assert.ok(value.resourceSetup.services.find(s=>s.id==='1').reasonCodes.includes('REQUIRED_EXTRA_NOT_READY'));
 const archived=value.resourceSetup.services.find(s=>s.id==='2');assert.ok(archived.reasonCodes.includes('RESOURCE_POOL_ARCHIVED'));assert.ok(archived.reasonCodes.includes('RESOURCE_TRACKING_DISABLED'));
});

test('additive requestability rejects legacy-ready choices with zero named members, invalid named units or infeasible minimum quantity',async()=>{
 for(const kind of ['zeroMembers','namedUnits','minimumQuantity']){
  const f=fixture();const configuration=config();if(kind==='minimumQuantity')configuration.assignment={mode:'automatic',allocationIdentity:'pooled_capacity'};
  f.state.pools=[{id:'13',name:'Courts',capacity:2,tracking_enabled:true,active_members:kind==='zeroMembers'?0:2}];f.state.identities=[{id:'1',name:'Rental',pool_id:'13',has_configuration:true,units_required:kind==='namedUnits'?2:kind==='minimumQuantity'?3:1}];f.state.policies=[{...policy('1',configuration),units_required:f.state.identities[0].units_required}];f.state.choices=[choice('1')];
  const value=await f.read('staff');assert.equal(value.services[0].resourceReady,true,'legacy execution presentation untouched');const setup=value.resourceSetup.services[0];assert.equal(setup.requestable,false,kind);assert.ok(setup.reasonCodes.includes(kind==='zeroMembers'?'NAMED_RESOURCES_UNAVAILABLE':'RESOURCE_REQUIREMENT_INVALID'),kind);
 }
});

test('combined same-pool minimum demand blocks the parent but preserves another feasible standalone service',async()=>{
 const f=fixture();const parent=config([{serviceId:'2',selection:'required'}]),extra=config();parent.assignment=extra.assignment={mode:'automatic',allocationIdentity:'pooled_capacity'};
 f.state.pools=[{id:'13',name:'Shared capacity',capacity:1,tracking_enabled:true,active_members:0}];f.state.identities=[{id:'1',name:'Parent',pool_id:'13',has_configuration:true},{id:'2',name:'Extra or standalone',pool_id:'13',has_configuration:true}];f.state.policies=[{...policy('1',parent),capacity:1},{...policy('2',extra),capacity:1}];f.state.choices=[choice('1'),choice('2')];
 const value=await f.read('staff');assert.equal(value.services[0].resourceReady,true);assert.equal(value.resourceSetup.services[0].requestable,false);assert.ok(value.resourceSetup.services[0].reasonCodes.includes('RESOURCE_SELECTION_INFEASIBLE'));assert.equal(value.resourceSetup.services[1].requestable,true);assert.deepEqual(Array.from(value.resourceSetup.pools[0].serviceIds),['1','2']);
});
