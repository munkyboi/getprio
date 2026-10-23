require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Module=require('node:module');
// Only the portal shell is replaced; the actual request picker and its catalog logic render.
const load=Module._load;
Module._load=function(id,parent,...rest){if(id==='./TaskDialog'&&parent?.filename.endsWith('NamedQueuePlanDialog.tsx'))return {TaskDialog:({children})=>React.createElement('section',null,children),QueueConfirmation:()=>null};return load.call(this,id,parent,...rest);};
const {NamedQueuePlanDialog}=require('../src/vendor/NamedQueuePlanDialog.tsx');Module._load=load;
const {VendorToastProvider}=require('../src/vendor/VendorToasts.tsx');
function render(options,extra={}){return renderToStaticMarkup(React.createElement(VendorToastProvider,null,React.createElement(NamedQueuePlanDialog,{initial:{customerName:'',customerEmail:'',customerPhone:'',notes:'',catalogRevision:null,selections:[]},options:[],v4Options:options,catalogRevision:'mandaue-empty',mode:'draft',busy:false,uncertain:false,error:'',publishAvailable:false,onClose(){},onSave:async()=>{},onPublish:async()=>{},onAmend:async()=>{},onRetry:async()=>{},...extra})));}
const empty={contractVersion:4,catalogRevision:'mandaue-empty',observedAt:'2026-10-21T00:00:00Z',workflow:{mode:'linear',stages:[]},capabilities:{publication:true,childOutcomes:true,automaticNamedMemberSelection:false},quote:{status:'unavailable'},serviceHoursWindow:{status:'unavailable',observedAt:'2026-10-21T00:00:00Z',timezone:'Asia/Manila',opensAt:null,closesAt:null,remainingWholeMinutes:null,provisional:true},services:[]};
test('an empty scoped executable catalog does not invent Courts, Equipment or Trainers filters',()=>{
 const html=render(empty);const filters=html.match(/<div class="service-resource-filters"[\s\S]*?<\/div>/)?.[0]||'';
 assert.doesNotMatch(filters,/>Courts<|>Basic Equipments<|>Trainers</);
});
const {queueResourceCatalog}=require('../src/vendor/queueResourceCatalog.ts');
const setup={pools:[{id:'13',name:'Court',capacity:2,trackingEnabled:false,archivedAt:null,serviceIds:['1']},{id:'14',name:'Equipment',capacity:10,trackingEnabled:false,archivedAt:null,serviceIds:['2']}],services:[{id:'1',name:'Court Rental',poolId:'13',requestable:false,reasonCodes:['SERVICE_POLICY_NOT_CONFIGURED','RESOURCE_TRACKING_DISABLED']},{id:'2',name:'Equipment Rental',poolId:'14',requestable:false,reasonCodes:['SERVICE_POLICY_NOT_CONFIGURED','RESOURCE_TRACKING_DISABLED']},{id:'6',name:'Trainer',poolId:null,requestable:false,reasonCodes:['SERVICE_POLICY_NOT_CONFIGURED','RESOURCE_MAPPING_MISSING']}]};
test('unrequestable setup shows authoritative labels and reasons to staff without selectable cards',()=>{
 const html=render({...empty,resourceSetup:setup});assert.match(html,/>Court</);assert.match(html,/>Equipment</);assert.match(html,/Court Rental/);assert.match(html,/Set a queue policy/);assert.match(html,/tracking is not enabled/);assert.match(html,/Ask an administrator/);assert.doesNotMatch(html,/Review queue setup|Enable resource tracking/);assert.doesNotMatch(html,/class="service-resource-card(?:\s|")/);assert.doesNotMatch(html,/>Trainers<|>Basic Equipments<|>Courts</);
});
test('every ready service mapping to one pool retains exact member identity and pool label',()=>{
 const pool={id:'pool-a',name:'Shared named pool',capacity:3,trackingEnabled:true,archivedAt:null,serviceIds:['first','second']};
 const choices=['first','second'].map(id=>({id,name:id,resourceReady:true,assignmentPolicy:{mode:'named'},durationPolicy:{baseMinutes:30},resourceMembers:[{id:id+'-member',name:id+' member',isActive:true,archivedAt:null,displayOrder:1,availability:{state:'provisional_free'}}]}));
 const options={...empty,services:choices,resourceSetup:{pools:[pool],services:choices.map(choice=>({id:choice.id,name:choice.name,poolId:pool.id,requestable:true,reasonCodes:[]}))}};
 const items=queueResourceCatalog(options);assert.deepEqual(items.map(item=>item.serviceId),['first','second']);assert.deepEqual(items.map(item=>item.id),['first-member','second-member']);assert.ok(items.every(item=>item.poolId==='pool-a'&&item.category==='Shared named pool'));
 options.resourceSetup.services[1].requestable=false;options.resourceSetup.services[1].reasonCodes=['REQUIRED_EXTRA_NOT_READY'];assert.deepEqual(queueResourceCatalog(options).map(item=>item.serviceId),['first']);
});
test('missing projection or unmatched pool mapping never invents executable identities',()=>{
 assert.deepEqual(queueResourceCatalog({...empty,resourceSetup:setup}),[]);assert.deepEqual(queueResourceCatalog(empty),[]);
 const choice={id:'foreign',resourceReady:true,assignmentPolicy:{mode:'automatic'},durationPolicy:{baseMinutes:30}};
 assert.deepEqual(queueResourceCatalog({...empty,services:[choice],resourceSetup:{pools:setup.pools,services:[{id:'foreign',name:'foreign',poolId:'13',requestable:true,reasonCodes:[]}]}}),[]);
});

test('permitted management has a normal queue-setup action without fabricating executable choices',()=>{
 const html=render({...empty,resourceSetup:setup},{onReviewQueueSetup:()=>{}});assert.match(html,/Review queue setup/);assert.doesNotMatch(html,/Ask an administrator/);assert.doesNotMatch(html,/class="service-resource-card(?:\s|")/);
});

test('configuration feasibility blockers have distinct copy and never imply transient occupancy or closed hours',()=>{
 const {resourceSetupReason}=require('../src/vendor/queueResourceCatalog.ts');
 for(const code of ['RESOURCE_REQUIREMENT_INVALID','NAMED_RESOURCES_UNAVAILABLE','RESOURCE_SELECTION_INFEASIBLE']){assert.ok(resourceSetupReason(code));assert.doesNotMatch(resourceSetupReason(code),/closed|occupied|in service/i);}
 const html=render({...empty,resourceSetup:{pools:setup.pools,services:[{...setup.services[0],reasonCodes:['RESOURCE_SELECTION_INFEASIBLE']}]}});assert.match(html,/minimum selection cannot fit/);assert.doesNotMatch(html,/class="service-resource-card(?:\s|")/);
});

test('activation owner slots remain in the rendered tree when setup is ready or its pool is filtered out',()=>{
 const {ResourceSetupPanel}=require('../src/vendor/ResourceSetupPanel.tsx');
 const managementActions=(id,visible)=>React.createElement('span',{'data-owner':id,'data-visible':String(visible)});
 const ready={pools:setup.pools.map(pool=>({...pool,trackingEnabled:true})),services:setup.services.map(service=>({...service,requestable:true,reasonCodes:[]}))};
 for(const props of [{setup:ready,poolFilter:'all'},{setup,poolFilter:'another-pool'}]){
  const html=renderToStaticMarkup(React.createElement(ResourceSetupPanel,{...props,managementActions}));
  assert.match(html,/data-owner="13" data-visible="false"/);assert.match(html,/data-owner="14" data-visible="false"/);
 }
});

test('activation owners stay mounted when setup disappears, new pools arrive and filters change',()=>{
 const modulePath=require.resolve('../src/vendor/ResourceSetupPanel.tsx'),previousCache=require.cache[modulePath],previousLoad=Module._load;
 let owners, effects=[];
 Module._load=function(id,parent,...rest){if(id==='react'&&parent?.filename===modulePath)return {...React,useState(initial){owners??=initial();return [owners,update=>{owners=typeof update==='function'?update(owners):update;}];},useEffect(effect){effects.push(effect);}};return previousLoad.call(this,id,parent,...rest);};
 let Panel;
 try{delete require.cache[modulePath];Panel=require(modulePath).ResourceSetupPanel;}finally{Module._load=previousLoad;if(previousCache)require.cache[modulePath]=previousCache;else delete require.cache[modulePath];}
 const actions=(id,visible)=>React.createElement('span',{'data-owner':id,'data-visible':String(visible)});
 const render=(setup,poolFilter='all')=>renderToStaticMarkup(Panel({setup,poolFilter,managementActions:actions}));
 const flush=()=>{const pending=effects;effects=[];pending.forEach(effect=>effect());};
 const first={pools:[setup.pools[0]],services:[]},second={pools:[setup.pools[1]],services:[]};
 assert.match(render(first),/data-owner="13" data-visible="true"/);flush();
 assert.match(render(undefined),/data-owner="13" data-visible="false"/);flush();
 render(second);flush();const next=render(second);assert.match(next,/data-owner="13" data-visible="false"/);assert.match(next,/data-owner="14" data-visible="true"/);flush();
 const filtered=render(second,'unrelated');assert.match(filtered,/data-owner="13" data-visible="false"/);assert.match(filtered,/data-owner="14" data-visible="false"/);flush();
 assert.deepEqual(owners,['13','14']);
});
