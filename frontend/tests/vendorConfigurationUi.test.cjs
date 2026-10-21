require('tsx/cjs');
const test=require('node:test');const assert=require('node:assert/strict');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
test('resource demand validation requires positive whole units within the selected pool capacity',()=>{
 const {validResourceUnits,hasResourceEdits}=require('../src/components/VendorResourceConfigurationForms.tsx');
 assert.equal(validResourceUnits(1),true);assert.equal(validResourceUnits(100),true);
 for(const value of [0,-1,101,1.5,'','2'])assert.equal(validResourceUnits(value),false);
 assert.equal(validResourceUnits(3,2),false);assert.equal(validResourceUnits(2,2),true);
 const pool={kind:'pool',name:'Courts',initialName:'Courts',capacity:2,initialCapacity:2,version:'revision'};
 assert.equal(hasResourceEdits(pool),false);assert.equal(hasResourceEdits({...pool,capacity:3}),true);
 const requirement={kind:'requirement',existing:true,serviceId:'a',poolId:'b',units:1,initialServiceId:'a',initialPoolId:'b',initialUnits:1,version:'revision'};
 assert.equal(hasResourceEdits(requirement),false);assert.equal(hasResourceEdits({...requirement,poolId:'c'}),true);
});

test('configuration input exposes validation guidance and disabled pending controls',()=>{
 const {ConfigurationScope,ConfigurationInput,ConfigurationCheck}=require('../src/vendor/ConfigurationUi.tsx');
 const html=render(ConfigurationScope,{busy:true,children:[React.createElement(ConfigurationInput,{key:'name',label:'Pool name',error:'Name is required',value:'',onChange(){}}),React.createElement(ConfigurationCheck,{key:'toggle',label:'Enable counter',checked:true,onChange(){}})]});
 assert.match(html,/aria-invalid="true"/);assert.match(html,/aria-describedby=/);assert.match(html,/Name is required/);assert.equal((html.match(/ disabled=""/g)||[]).length,2);
});
test('retrying a location hours failure updates the already-created location instead of creating it again', async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');
 const start=source.indexOf('  async function saveLocation()'),end=source.indexOf('  function selectConfigurationLocation',start);
 const calls=[];const context={locationSlug:undefined,editingLocationSlug:'',locationSlugAvailable:true,locationSlugMessage:'',token:'fixture',selectedTenantSlug:'vendor',locationForm:{name:'New branch',slug:'new-branch',hours:[{weekday:1,opensAt:'09:00',closesAt:'17:00',isClosed:false}]},setBusyAction(){},setError(value){context.error=value;},getErrorMessage:error=>error.message,setEditingLocationSlug(value){context.editingLocationSlug=value;},setEditingLocationId(){},setLocationSlugManuallyEdited(){},setLocationForm(update){context.locationForm=update(context.locationForm);},vendorDashboardOperations:{saveLocation:async(_token,_tenant,slug,body)=>{calls.push({slug,body});return{location:{slug:'new-branch',id:'created'}};},saveLocationHours:async()=>{throw Error('Hours unavailable');}}};
 const compiled=ts.transpileModule(source.slice(start,end)+'\nsaveLocation;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const save=vm.runInNewContext(compiled,context);
 await save();assert.equal(context.error,'Hours unavailable');assert.equal(context.editingLocationSlug,'new-branch');
 await save();assert.equal(calls.length,2);assert.equal(calls[0].slug,null);assert.equal(calls[1].slug,'new-branch');assert.equal(Object.hasOwn(calls[1].body,'slug'),false);assert.equal(context.locationForm.hours.length,1);
});

test('resource requirements cannot save against unavailable service or pool metadata',()=>{
 const {validResourceEditor}=require('../src/components/VendorResourceConfigurationForms.tsx');
 const data={pools:[{id:'pool',capacity:2}],services:[{id:'service',name:'Court'}]};
 const editor={kind:'requirement',existing:true,serviceId:'service',poolId:'pool',units:2};
 assert.equal(validResourceEditor(editor,data),true);
 assert.equal(validResourceEditor({...editor,serviceId:'inactive'},data),false);
 assert.equal(validResourceEditor({...editor,poolId:'removed'},data),false);
 assert.equal(validResourceEditor({...editor,units:3},data),false);
 assert.equal(validResourceEditor(editor),false);
});

test('checkbox guidance is announced through its own description ID and retains external guidance',()=>{
 const {ConfigurationCheck}=require('../src/vendor/ConfigurationUi.tsx');
 const html=render(ConfigurationCheck,{label:'Allow self check-in',description:'Customers can check in fifteen minutes before booking.',checked:true,onChange(){},'aria-describedby':'external-help'});
 const ids=html.match(/aria-describedby="([^"]+)"/)[1].split(' ');
 assert.equal(ids[0],'external-help');assert.equal(ids.length,2);
 assert.ok(html.includes(`id="${ids[1]}"`));assert.match(html,/Customers can check in fifteen minutes/);
 assert.doesNotMatch(render(ConfigurationCheck,{label:'Enable counter',checked:true,onChange(){}}),/aria-describedby=/);
});

test('counter staff search and multi-selection preserve hidden assignments',()=>{
 const {filterCounterStaff,toggleCounterStaff}=require('../src/vendor/CounterStaffAssignments.tsx');
 const staff=[{id:'one',name:'Sam Owner',email:'sam@example.invalid'},{id:'two',name:'Pat Staff',email:'pat@example.invalid'},{id:'three',name:'No Email',email:null}];
 assert.deepEqual(filterCounterStaff(staff,' PAT ').map(member=>member.id),['two']);
 assert.deepEqual(filterCounterStaff(staff,'sam@').map(member=>member.id),['one']);
 assert.equal(filterCounterStaff(staff,'null').length,0);assert.equal(filterCounterStaff(staff,'unmatched').length,0);
 const selected=['one','unavailable-member'];
 assert.deepEqual(toggleCounterStaff(selected,'two',true),['one','unavailable-member','two']);
 assert.deepEqual(toggleCounterStaff([...selected,'two'],'two',false),selected);
 assert.deepEqual(toggleCounterStaff(selected,'one',true),selected);
});

test('server canonical slug replacement retains draft and immutable ID when hours save fails', async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');
 const start=source.indexOf('  async function saveLocation()'),end=source.indexOf('  function selectConfigurationLocation',start);
 const navigations=[],hoursTargets=[];
 let rows=[{id:'stable-id',slug:'old-link'}];
 const context={locationSlug:'old-link',editingLocationSlug:'old-link',locationSlugAvailable:true,locationSlugMessage:'',token:'fixture',selectedTenantSlug:'vendor',location:{search:'?business=vendor&workspace=administration'},locationEditorPath:require('../src/vendor/locationEditorRoute.ts').locationEditorPath,locationForm:{name:'Draft name',slug:'old-link',hours:[{weekday:1,isClosed:true}]},setBusyAction(){},setError(value){context.error=value;},getErrorMessage:error=>error.message,setEditingLocationSlug(value){context.editingLocationSlug=value;},setEditingLocationId(value){context.savedId=value;},setLocationSlugManuallyEdited(){},setLocationForm(update){context.locationForm=update(context.locationForm);},setLocations(update){rows=update(rows);},navigate(...args){navigations.push(args);},vendorDashboardOperations:{saveLocation:async()=>({location:{id:'stable-id',slug:'canonical-link'}}),saveLocationHours:async(_token,_tenant,slug)=>{hoursTargets.push(slug);throw Error('Hours unavailable');}}};
 const compiled=ts.transpileModule(source.slice(start,end)+'\nsaveLocation;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 await vm.runInNewContext(compiled,context)();
 assert.equal(context.savedId,'stable-id');assert.equal(context.locationForm.name,'Draft name');assert.equal(context.locationForm.hours.length,1);
 assert.equal(rows[0].id,'stable-id');assert.equal(rows[0].slug,'canonical-link');assert.deepEqual(hoursTargets,['canonical-link']);
 assert.equal(navigations[0][0],'/dashboard/locations/canonical-link/edit?business=vendor&workspace=administration');assert.equal(navigations[0][1].replace,true);assert.equal(context.error,'Hours unavailable');
});
