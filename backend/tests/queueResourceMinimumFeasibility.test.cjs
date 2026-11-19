const test=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{runInNewContext}=require('node:vm'),{createRequire}=require('node:module');
const minimum=require('../src/services/queueResourceMinimumFeasibility');
const configuration=(mode='automatic',minutes=30,extras=[])=>({labels:{service:'Service',resources:'Resources',duration:'Duration',extras:'Extras'},assignment:{mode,allocationIdentity:mode==='named'?'named_member':'pooled_capacity'},duration:{mode:'fixed',visible:true,baseMinutes:minutes,minCount:1,maxCount:1,stepCount:1,defaultCount:1},extras,execution:{resourceStart:'together',extraStart:'with_parent',extraContainment:'within_parent',selectedExtraResolution:'explicit_required'}});
const row=(id,pool,capacity=2,config=configuration())=>({id,pool_id:pool,name:'Service '+id,capacity,units_required:1,tracking_enabled:true,archived_at:null,active_members:2,configuration:config});
const linear={configurationRevision:'1',mode:'linear',stations:[],stages:[]};
function loaded(file,overrides){const real=createRequire(file),module={exports:{}};runInNewContext(readFileSync(file,'utf8'),{module,exports:module.exports,Buffer,structuredClone,require:name=>Object.hasOwn(overrides,name)?overrides[name]:real(name)},{filename:file});return module.exports;}
async function canonicalCapture(rows,workflow=linear,{duplicateNamed=false}={}){
 const pools=[...new Map(rows.map(r=>[r.pool_id,{id:r.pool_id,name:'Pool '+r.pool_id,capacity:r.capacity,tracking_enabled:r.tracking_enabled,archived_at:r.archived_at,active_members:r.active_members}])).values()];let sequence=0;
 const members=pools.flatMap(pool=>Array.from({length:pool.active_members},()=>({id:'00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0'),pool_id:pool.id,name:'Member '+sequence,is_active:true,archived_at:null,revision:'1',display_order:sequence})));
 const legacyRows=rows.map(r=>({...r,service_revision:'1',offered:true,requirement_revision:'1',pool_name:'Pool '+r.pool_id,pool_revision:'1',policy_revision:'1',selection_mode:r.configuration.assignment.mode==='named'?'named':'pooled',duration_options:Array.from({length:(r.configuration.duration.maxCount-r.configuration.duration.minCount)/r.configuration.duration.stepCount+1},(_,i)=>(r.configuration.duration.minCount+i*r.configuration.duration.stepCount)*r.configuration.duration.baseMinutes),extra_service_ids:r.configuration.extras.map(e=>e.serviceId)}));
 const client={query:async(sql)=>{assert.ok(!/^\s*(INSERT|UPDATE|DELETE|ALTER)/iu.test(sql));
  if(sql.includes('SELECT s.id::text,s.name,s.updated_at'))return {rows:legacyRows};
  if(sql.includes('SELECT q.service_id::text'))return {rows:rows.map(r=>({...r,service_id:r.id,revision:'1'}))};
  if(sql.includes('SELECT s.id::text,s.name,r.pool_id'))return {rows:rows.map(r=>({...r,has_configuration:true}))};
  if(sql.includes('SELECT id,pool_id::text,name,revision::text'))return {rows:members};
  if(sql.includes('SELECT clock_timestamp()'))return {rows:[{observed_at:new Date('2026-10-21T00:00:00Z')}]};
  if(sql.includes('SELECT p.id::text,GREATEST'))return {rows:pools.map(p=>({id:p.id,available_units:p.capacity}))};
  if(sql.includes('SELECT m.id,')&&sql.includes('AS availability'))return {rows:members.map(m=>({id:m.id,availability:'provisional_free'}))};
  if(sql.includes('FROM location_resource_pools WHERE'))return {rows:pools};
  throw Error('Unmapped capture query: '+sql);
 }};
 const legacy=loaded(require.resolve('../src/services/queueSelectionCapture'),{'./queueWorkflowService':{read:async()=>workflow}});
 const v4=loaded(require.resolve('../src/services/queueSelectionCaptureV4'),{'./queueSelectionCapture':legacy,'./queueServiceHoursService':{readWindow:async()=>({status:'closed'})}});
 const catalog=await v4.readCatalog(client,{tenantId:'1',locationId:'4'}),root=rows[0];const rootMember=root.configuration.assignment.mode==='named'?members.find(m=>m.pool_id===root.pool_id):null;
 const extras=root.configuration.extras.filter(e=>e.selection==='required').map(e=>{const child=rows.find(r=>r.id===e.serviceId);let member=child.configuration.assignment.mode==='named'?members.find(m=>m.pool_id===child.pool_id&&m.id!==rootMember?.id):null;if(duplicateNamed&&rootMember)member=rootMember;return {extraSelectionId:'extra'+child.id,serviceId:child.id,quantity:1,durationCount:child.configuration.duration.minCount,durationPolicyRevision:'1',...(child.configuration.assignment.mode==='named'?{resourceMemberIds:member?[member.id]:[]}: {})};});
 return v4.capture(client,{tenantId:'1',locationId:'4'},[{serviceSelectionId:'root',serviceId:root.id,resources:[{resourceSelectionId:'resource',resourceMemberId:rootMember?.id||null,quantity:1,durationCount:root.configuration.duration.maxCount,durationPolicyRevision:'1',extras}]}],catalog.catalogRevision);
}
test('minimum feasibility agrees with real nonpublishing V4 capture on combined capacity, containment, named and workflow failures',async()=>{
 const withExtra=(mode='automatic',minutes=30)=>configuration(mode,minutes,[{serviceId:'2',selection:'required'}]);
 const cases=[
  [[row('1','13',1,withExtra()),row('2','13',1)],linear,'RESOURCE_CAPACITY_EXCEEDED'],
  [[row('1','13',2,withExtra()),row('2','14',2,configuration('automatic',60))],linear,'EXTRA_DURATION_EXCEEDS_PARENT'],
  [[row('1','13',2,withExtra()),row('2','13',2,configuration('named'))],linear,'EXTRA_RESOURCE_CONFLICT'],
  [[{...row('1','13',2,configuration('named')),active_members:0}],linear,'NAMED_RESOURCE_REQUIRED'],
  [[{...row('1','13',2,configuration('named')),units_required:2}],linear,'NAMED_RESOURCE_REQUIRED'],
  [[{...row('1','13',2),units_required:3}],linear,'RESOURCE_CONFIGURATION_REQUIRED'],
  [[row('1','13')],{...linear,mode:'multi_station',stages:[]},'WORKFLOW_SERVICE_UNASSIGNED'],
  [[row('1','13')],{...linear,mode:'multi_station',stages:[{stageId:'a',serviceIds:['1']},{stageId:'b',serviceIds:['1']}]},'WORKFLOW_SERVICE_UNASSIGNED'],
 ];
 for(const [rows,workflow,code] of cases){assert.equal(minimum.evaluate(rows[0],rows,{workflow}).requestable,false,code);await assert.rejects(canonicalCapture(rows,workflow),{code});}
});
test('existential positive witnesses preserve distinct named shared pools, omitted optional extras and adjustable legal parent count',async()=>{
 const namedRows=[row('1','13',2,configuration('named',30,[{serviceId:'2',selection:'required'}])),row('2','13',2,configuration('named'))];
 assert.equal(minimum.evaluate(namedRows[0],namedRows,{workflow:linear}).requestable,true);await canonicalCapture(namedRows);await assert.rejects(canonicalCapture(namedRows,linear,{duplicateNamed:true}),{code:'NAMED_RESOURCE_DUPLICATE'});
 const optional=[row('1','13',2,configuration('named',30,[{serviceId:'2',selection:'optional'}])),row('2','13',2,configuration('automatic',60))];assert.equal(minimum.evaluate(optional[0],optional,{workflow:linear}).requestable,true);await canonicalCapture(optional);
 const adjustable=[row('1','13',2,configuration('automatic',30,[{serviceId:'2',selection:'required'}])),row('2','14',2,configuration('automatic',60))];adjustable[0].configuration.duration={mode:'adjustable',visible:true,baseMinutes:30,minCount:1,maxCount:3,stepCount:2,defaultCount:1};assert.equal(minimum.evaluate(adjustable[0],adjustable,{workflow:linear}).requestable,true);await canonicalCapture(adjustable);
 adjustable[0].configuration.duration.maxCount=2;assert.equal(minimum.evaluate(adjustable[0],adjustable,{workflow:linear}).requestable,false);await assert.rejects(canonicalCapture(adjustable),{code:'INVALID_DURATION_POLICY'});
});
