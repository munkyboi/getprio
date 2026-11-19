const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
const resolverPath=require.resolve('../src/services/entitlementResolver');
test('all three queue types use current published policy for model1/2 with authority off/on',async()=>{
 for(const model of [1,2])for(const authority of [false,true]){
  const input={subscription:{id:'1',planSlug:'pro',status:'active',entitlementModelVersion:model,legacyEntitlements:{queueSystemAccess:true,resourceQueueAccess:true,workflowQueueAccess:true}},plan:{slug:'pro',revision:1,legacyEntitlements:{queueSystemAccess:true,resourceQueueAccess:true,workflowQueueAccess:true}},features:{queue:true,resourceQueue:true,workflowQueue:true},allowances:{queueTickets:1},overrides:[]};
  const resolver=loadModuleWithMocks(resolverPath,{'../repositories/entitlementResolver':{loadResolverInput:async()=>input}});
  const options={queueTypePolicy:true,controls:{entitlementResolverAuthority:authority}};
  assert.ok((await resolver.resolveTenantPolicy('1',options)).features.queue.enabled);
  input.features.queue=false;
  const next=await resolver.resolveTenantPolicy('1',options);
  for(const key of ['queue','resourceQueue','workflowQueue'])assert.equal(next.features[key].enabled,false,`${model}/${authority}/${key}`);
  if(!authority||model===1)assert.equal((await resolver.resolveTenantPolicy('1',{controls:options.controls})).features.queue.enabled,true,'old queue alias intentionally remains compatible');
 }
});
test('Simple selected service captures duration without even reading a mapped or archived pool',async()=>{
 const target=require.resolve('../src/services/ticketServicePlanService');const calls=[];
 const client={query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT services.id'))return {rows:[{id:'9',name:'Shared mapped service',duration_minutes:30}]};if(sql.startsWith('INSERT INTO ticket_service_plans'))return {rows:[]};throw new Error('Unexpected resource read');}};
 const Module=require('node:module'),original=Module._load;
 Module._load=function(request,parent,...rest){if(request==='./queueTypeService'&&parent.filename===target)return {assertAdmission:async()=>({type:'simple'})};if(request==='./queueWorkflowService'&&parent.filename===target)return {read:async(client,scope,options)=>{assert.equal(options.initialize,true);return {mode:'linear'};}};return original.call(this,request,parent,...rest);};
 try{delete require.cache[target];const service=require(target);await service.captureStaffPlan(client,{tenant:{_id:'1'},location:{_id:'2'},ticket:{_id:'3'},serviceId:'9',actorUserId:'4'});}finally{Module._load=original;delete require.cache[target];}
 const items=JSON.parse(calls.find(call=>call.sql.startsWith('INSERT')).args[6]);assert.equal(items[0].durationMinutes,30);assert.equal(items[0].executionType,'simple');assert.deepEqual(items[0].resource,{known:false,reason:'simple_queue_service_label'});assert.ok(calls.every(call=>!call.sql.includes('service_resource_requirements')));
});
test('committed draft create replays after capability loss, while fresh creation and changed-key payload fail',async()=>{
 const repo=require('../src/repositories/queuePlanDrafts');const receipts=new Map();let stored,gate=0,enabled=true;
 const client={query:async(sql,args)=>{
  if(sql.includes('SELECT payload_hash,result'))return {rows:receipts.has(args[3])?[receipts.get(args[3])]:[]};
  if(sql.startsWith('INSERT INTO queue_plan_drafts')){stored={id:args[0],state:'draft',revision:'1',customer:JSON.parse(args[4]),lines:JSON.parse(args[5]),notes:args[6],catalog_revision:args[7],service_selections:null,updated_at:'now'};return {rows:[stored]};}
  if(sql.startsWith('INSERT INTO queue_plan_command_receipts')){receipts.set(args[3],{payload_hash:args[4],result:JSON.parse(args[5])});return {rows:[]};}
  if(sql.startsWith('INSERT INTO queue_plan_events'))return {rows:[]};
  if(sql.includes('FROM queue_plan_drafts WHERE'))return {rows:[stored]};throw new Error(sql);
 }};
 const scope={tenantId:'1',locationId:'2',actorUserId:'3',actorRole:'owner'},body={customer:{name:'QA'},lines:[]};
 const beforeCreate=async()=>{gate++;if(!enabled)throw Object.assign(new Error('No advanced access'),{statusCode:403});};
 const first=await repo.command(client,scope,{action:'create',operationKey:'same',body,beforeCreate});enabled=false;
 assert.deepEqual(await repo.command(client,scope,{action:'create',operationKey:'same',body,beforeCreate}),first);assert.equal(gate,1);
 await assert.rejects(()=>repo.command(client,scope,{action:'create',operationKey:'fresh',body,beforeCreate}),{statusCode:403});
 await assert.rejects(()=>repo.command(client,scope,{action:'create',operationKey:'same',body:{customer:{name:'Changed'},lines:[]},beforeCreate}),{code:'IDEMPOTENCY_CONFLICT'});assert.equal(gate,2);
});
test('Resource catalog stays linear even with a saved multi-station definition; Workflow uses it explicitly',async()=>{
 const definition={configurationRevision:'5',mode:'multi_station',executionType:'resource',stations:[{stationId:'s'}],stages:[{stageId:'stage'}]};let linearReads=0;
 const service=loadModuleWithMocks(require.resolve('../src/services/queueSelectionCapture'),{'../services/queueWorkflowService':{read:async()=>definition,readVersion:async(client,scope,revision)=>{assert.equal(revision,'1');linearReads++;return {configurationRevision:'1',mode:'linear',stations:[],stages:[]};}}});
 const client={query:async sql=>({rows:sql.includes('clock_timestamp() AS observed_at')?[{observed_at:'now'}]:[]})};
 const resource=await service.readCatalog(client,{tenantId:'1',locationId:'2'});assert.equal(resource.workflow.mode,'linear');assert.equal(linearReads,1);assert.equal(definition.mode,'multi_station');
 definition.executionType='workflow';assert.equal((await service.readCatalog(client,{})).workflow.mode,'multi_station');assert.equal(linearReads,1);
});
test('workflow parent records never enter the ordinary single-queue wait predictor',async()=>{
 const repository=loadModuleWithMocks(require.resolve('../src/repositories/waitTimePredictions'),{'../config/db':{}});const calls=[];
 const result=await repository.recordPrediction({ticketId:'1',observedAt:'2026-10-26T00:00:00Z',queueDateKey:'20261026',predictorVersion:'baseline-v1'},{client:{query:async(sql,args)=>{calls.push(sql);return {rows:[{status:'waiting',date_key:'20261025',updated_at:'2026-10-26T00:00:00Z',workflow_journey:true}]};}}});
 assert.equal(result,false);assert.equal(calls.length,1);assert.match(calls[0],/workflow_mode='multi_station'/);assert.ok(calls.every(sql=>!sql.includes('INSERT')&&!sql.includes('UPDATE wait_time')));
});
