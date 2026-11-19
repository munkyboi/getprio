require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {renderToStaticMarkup}=require('react-dom/server');
const {QueryClient,QueryClientProvider}=require('@tanstack/react-query');
const {QueueServicePolicyEditor,policyInput,PolicyValidationError}=require('../src/vendor/QueueServicePolicyEditor.tsx');
const {readPolicyNamedCapability,namedPolicyReady,namedPolicyVerificationRequired,policyAssignmentChoices}=require('../src/vendor/queuePolicyNamedCapability.ts');
const source=fs.readFileSync(path.join(__dirname,'../src/vendor/QueueServicePolicyEditor.tsx'),'utf8');
const scope={tenant:'club',location:'mandaue',serviceId:'1'};
const stored={labels:{service:'Service',resources:'Courts',duration:'Duration',extras:'Extras'},assignment:{mode:'automatic',allocationIdentity:'pooled_capacity'},duration:{mode:'adjustable',visible:true,baseMinutes:60,minCount:1,maxCount:8,stepCount:1,defaultCount:1},extras:[],execution:{resourceStart:'together',extraStart:'with_parent',extraContainment:'within_parent',selectedExtraResolution:'explicit_required'}};
const config={version:'v',pools:[{id:'13',name:'Courts',capacity:2,tracking_enabled:false,revision:6}],requirements:[{service_id:'1',pool_id:'13',units_required:1}],services:[{id:'1',name:'Pickleball Court Rental'}],trackingAvailable:false};
const registry={pool:{id:'13',name:'Courts',capacity:2},members:[{id:'court-a',name:'Court1',isActive:true,archivedAt:null}],holdsCreated:false};
const read=(changes={},policy=stored)=>readPolicyNamedCapability('token',scope,policy,{configuration:async()=>config,members:async id=>{assert.equal(id,'13');return registry;},...changes});
const services=[{id:'1',name:'Pickleball Court Rental',isActive:true},{id:'2',name:'Basic Equipment',isActive:true},{id:'6',name:'Trainer',isActive:true}];
const assignments=[{locationId:'4',serviceId:'1',isActive:true},{locationId:'4',serviceId:'2',isActive:true},{locationId:'4',serviceId:'6',isActive:false},{locationId:'1',serviceId:'6',isActive:true}];
function render(overrides={}){return renderToStaticMarkup(React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(QueueServicePolicyEditor,{token:'token',tenant:'club',location:'mandaue',services,assignments,locations:[{id:'4',slug:'mandaue',name:'Mandaue'},{id:'1',slug:'demo',name:'Demo'}],servicesReady:true,assignmentsReady:true,canManage:true,onBusy(){},onCloseForm(){},onNotice(){},...overrides})));}
test('actual Queue policy list uses active selected-location assignments without changing shared service records',()=>{
 const before=JSON.stringify(services);const html=render();assert.match(html,/<h3>Pickleball Court Rental<\/h3>/);assert.match(html,/<h3>Basic Equipment<\/h3>/);assert.doesNotMatch(html,/<h3>Trainer<\/h3>/);assert.match(render({location:'demo'}),/<h3>Trainer<\/h3>/);assert.equal(JSON.stringify(services),before);
});
test('policy list fails closed for loading/error/unresolved location instead of showing businesswide services',()=>{
 for(const overrides of [{servicesReady:false},{assignmentsReady:false},{location:'new-not-loaded',locations:[{id:'1',slug:'demo',name:'Demo'}]}])assert.doesNotMatch(render(overrides),/<h3>(Trainer|Pickleball Court Rental|Basic Equipment)<\/h3>/);
});
test('named authoring is available from actual mapped members while current policy is automatic and tracking is off',async()=>{
 const value=await read();assert.equal(value.state,'ready');assert.equal(namedPolicyReady(value,scope),true);assert.equal(policyAssignmentChoices(value,scope,'automatic').find(item=>item.value==='named').label,'Select named members');assert.equal(config.pools[0].tracking_enabled,false);
});
test('missing mapping, invalid units, archived pools and inactive/archived members have explicit blocked reasons',async()=>{
 const cases=[{configuration:async()=>({...config,requirements:[]})},{configuration:async()=>({...config,requirements:[{...config.requirements[0],units_required:2}]})},{configuration:async()=>({...config,pools:[{...config.pools[0],archived_at:'now'}]})},{members:async()=>({...registry,members:[]})},{members:async()=>({...registry,members:[{...registry.members[0],isActive:false},{...registry.members[0],archivedAt:'now'}]})}];
 for(const change of cases){const result=await read(change);assert.equal(result.state,'blocked');assert.ok(result.message);assert.equal(policyAssignmentChoices(result,scope,'automatic').some(item=>item.value==='named'),false);}
});
test('named guards retain same-pool extra restriction including optional extras, without erasing extras',async()=>{
 const same={...config,requirements:[...config.requirements,{service_id:'2',pool_id:'13',units_required:1}]};
 for(const selection of ['required','optional'])assert.equal((await read({configuration:async()=>same},{...stored,extras:[{serviceId:'2',selection}]})).state,'blocked');
 const distinct={...same,requirements:[same.requirements[0],{service_id:'2',pool_id:'14',units_required:1}]};assert.equal((await read({configuration:async()=>distinct},{...stored,extras:[{serviceId:'2',selection:'required'}]})).state,'ready');
});
test('permission/network failures and wrong-pool responses are unknown, preserving a selected named value',async()=>{
 for(const change of [{configuration:async()=>{throw Object.assign(new Error('Forbidden'),{status:403});}},{members:async()=>{throw new Error('Network unavailable');}},{members:async()=>({...registry,pool:{...registry.pool,id:'other'}})}]){
  const result=await read(change);assert.equal(result.state,'unknown');assert.ok(result.message);const choice=policyAssignmentChoices(result,scope,'named').find(item=>item.value==='named');assert.equal(choice.disabled,true);assert.equal(namedPolicyReady(result,scope),false);
 }
 const ready=await read();assert.equal(namedPolicyReady(ready,{...scope,location:'demo'}),false);
});
test('assignment changes preserve all fetched extras and clone them rather than mutating policy state',()=>{
 const original={...stored,extras:[{serviceId:'2',selection:'required'},{serviceId:'3',selection:'optional'}]};
 const draft={labels:stored.labels,assignment:'named',mode:'adjustable',visible:true,duration:{baseMinutes:'60',minCount:'1',maxCount:'8',stepCount:'1',defaultCount:'1'},executionConfirmed:true};
 const result=policyInput(draft,original);assert.deepEqual(result.extras,original.extras);assert.notEqual(result.extras,original.extras);assert.notEqual(result.extras[0],original.extras[0]);assert.equal(result.assignment.mode,'named');assert.equal(original.assignment.mode,'automatic');
});
function discoveryHarness(){
 let options=null;const deferred=[];let seq=0;
 const context={tenant:'club',location:'mandaue',token:'token',crypto:{randomUUID:()=>String(++seq)},setOptions:update=>{options=typeof update==='function'?update(options):update;},readPolicyNamedCapability:(_token,s)=>new Promise(resolve=>deferred.push({scope:s,resolve}))};vm.createContext(context);
 const start=source.indexOf('  function discoverResourceChoices('),end=source.indexOf('  async function load(',start);vm.runInContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return{context,deferred,get:()=>options,clear:()=>{options=null;}};
}
test('actual discovery handler ignores late results after service changes or closing and never resets draft fields',async()=>{
 const h=discoveryHarness(),record={policy:{configuration:stored}};
 h.context.discoverResourceChoices(record,'1');h.context.discoverResourceChoices(record,'2');
 h.deferred[0].resolve({...scope,state:'ready',message:'old'});await Promise.resolve();assert.equal(h.get().serviceId,'2');assert.equal(h.get().pending,true);
 h.deferred[1].resolve({...scope,serviceId:'2',state:'ready',message:'new'});await Promise.resolve();assert.equal(h.get().message,'new');
 h.context.discoverResourceChoices(record,'1');h.clear();h.deferred[2].resolve({...scope,state:'ready',message:'closed'});await Promise.resolve();assert.equal(h.get(),null);
});
test('actual load handler opens policy before optional registry discovery resolves, and rejects inactive branch cards',async()=>{
 const h=discoveryHarness();let record=null,draft=null,error='',reads=0;Object.assign(h.context,{serviceId:'1',canManage:true,busy:false,unknown:false,loadingPolicy:{current:false},offeredServices:[services[0]],setError:v=>{error=v;},setServiceId(){},lock(){},getQueueServiceConfiguration:async()=>{reads++;return{configurationRevision:'2',policy:{serviceId:'1',configuration:stored}};},draftFrom:c=>({...c,kept:'typed'}),client:{setQueryData(){}},setRecord:v=>{record=v;},setDraft:v=>{draft=v;},setSection(){},setValidationIssue(){},setInitial(){}});
 const start=source.indexOf('  async function load('),end=source.indexOf('  function close(',start);vm.runInContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,h.context);
 await h.context.load('1');assert.equal(record.configurationRevision,'2');assert.equal(draft.kept,'typed');assert.equal(h.get().pending,true);assert.equal(h.deferred.length,1);
 await h.context.load('6');assert.equal(reads,1);assert.match(error,/no longer offered/);assert.equal(draft.kept,'typed');
});
function saveHarness(storedPolicy){
 const state={calls:[],error:''};const context={Error,record:{configurationRevision:'2',policy:{configuration:storedPolicy}},draft:{labels:stored.labels,assignment:'named',mode:'adjustable',visible:true,duration:{baseMinutes:'60',minCount:'1',maxCount:'8',stepCount:'1',defaultCount:'2'},executionConfirmed:true},canManage:true,busy:false,offeredServices:[services[0]],serviceId:'1',tenant:'club',location:'mandaue',token:'token',options:{...scope,state:'unknown',message:'Cannot verify location-management access.'},pending:{current:null},policyInput,PolicyValidationError,namedPolicyReady,namedPolicyVerificationRequired,crypto:{randomUUID:()=> 'same-key'},setError:v=>{state.error=v;},setSection(){},setValidationIssue(){},lock(){},saveQueueServiceConfiguration:async(...args)=>{state.calls.push(args);return{configurationRevision:'3',policy:{configuration:args[4].configuration}};},setUnknown(){},client:{setQueryData(){},invalidateQueries:()=>Promise.resolve()},setRecord(){},setDraft(){},setOptions(){},onCloseForm(){},onNotice(){},setBusy(){},onBusy(){}};
 vm.createContext(context);const start=source.indexOf('  async function save('),end=source.indexOf('  return (\n    <section',start);vm.runInContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);return{context,state};
}
test('actual save retains authorized existing named mode despite optional registry403, but blocks an unverified new named transition',async()=>{
 const existing={...stored,assignment:{mode:'named',allocationIdentity:'named_member'},extras:[{serviceId:'2',selection:'optional'}]};
 const allowed=saveHarness(existing);await allowed.context.save();assert.equal(allowed.state.calls.length,1);assert.deepEqual(allowed.state.calls[0][4].configuration.extras,existing.extras);assert.equal(allowed.state.calls[0][4].configuration.duration.defaultCount,2);
 const blocked=saveHarness(stored);await blocked.context.save();assert.equal(blocked.state.calls.length,0);assert.match(blocked.state.error,/Cannot verify/);
});
test('actual unknown-save retry preserves frozen command even if optional capability later becomes unavailable',async()=>{
 const h=saveHarness(stored),body={expectedRevision:'2',configuration:stored};h.context.pending.current={body,key:'original-key'};await h.context.save();assert.equal(h.state.calls.length,1);assert.equal(h.state.calls[0][4],body);assert.equal(h.state.calls[0][5],'original-key');
});
