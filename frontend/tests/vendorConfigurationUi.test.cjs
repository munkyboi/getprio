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
 const calls=[];const context={editingLocationSlug:'',locationSlugAvailable:true,locationSlugMessage:'',token:'fixture',selectedTenantSlug:'vendor',locationForm:{name:'New branch',slug:'new-branch',hours:[{weekday:1,opensAt:'09:00',closesAt:'17:00',isClosed:false}]},setBusyAction(){},setError(value){context.error=value;},getErrorMessage:error=>error.message,setEditingLocationSlug(value){context.editingLocationSlug=value;},setEditingLocationId(){},setLocationSlugManuallyEdited(){},setLocationForm(update){context.locationForm=update(context.locationForm);},vendorDashboardOperations:{saveLocation:async(_token,_tenant,slug,body)=>{calls.push({slug,body});return{location:{slug:'new-branch',id:'created'}};},saveLocationHours:async()=>{throw Error('Hours unavailable');}}};
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
