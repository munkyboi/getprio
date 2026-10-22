require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {validateServiceEditor}=require('../src/vendor/serviceEditorValidation.ts');
const validState={quantityError:'',checkingSlug:false,slugAvailable:true,slugMessage:''};
function fixture(specs){
 const original=global.window,frames=[],events=[];global.window={requestAnimationFrame:fn=>frames.push(fn)};
 const fields=specs.map(({tab='general',valid=true,disabled=false,...rest})=>({willValidate:!disabled,validity:{valid},validationMessage:'Invalid '+tab,isConnected:true,closest:()=>({dataset:{serviceTab:tab}}),focus:()=>events.push('focus:'+tab),reportValidity:()=>events.push('report:'+tab),...rest}));
 const form={elements:fields,querySelector:selector=>selector.includes('tab-trigger')?{click:()=>events.push('tab:'+selector.match(/="([^"]+)"/)[1])}:selector.includes('slug')?fields.find(f=>f.slug):fields.find(f=>f.quantity)};
 return {fields,form,events,flush:()=>frames.splice(0).forEach(fn=>fn()),restore:()=>{global.window=original;}};
}
test('complete kept-mounted form validates hidden tabs in DOM order and reveals before focus/report',()=>{
 const f=fixture([{tab:'general',slug:true},{tab:'booking',valid:false},{tab:'locations',valid:false}]);
 try{assert.equal(validateServiceEditor(f.form,validState),'Invalid booking');assert.deepEqual(f.events,['tab:booking']);f.flush();assert.deepEqual(f.events,['tab:booking','focus:booking','report:booking']);}finally{f.restore();}
});
test('disabled constraints do not block, but an invalid enabled location is revealed',()=>{
 const f=fixture([{slug:true},{tab:'booking',valid:false,disabled:true},{tab:'locations',valid:false}]);
 try{assert.equal(validateServiceEditor(f.form,validState),'Invalid locations');f.flush();assert.equal(f.events[0],'tab:locations');}finally{f.restore();}
});
test('pending and unavailable async slug gates reveal General without mutating entered values',()=>{
 for(const state of [{...validState,checkingSlug:true},{...validState,slugAvailable:false,slugMessage:'Already used.'}]){
  const f=fixture([{slug:true,value:'typed-slug'},{tab:'booking'}]);
  try{assert.ok(validateServiceEditor(f.form,state));f.flush();assert.deepEqual(f.events,['tab:general','focus:general','report:general']);assert.equal(f.fields[0].value,'typed-slug');}finally{f.restore();}
 }
});
test('custom quantity error reveals Booking and a valid form proceeds without changing focus',()=>{
 const f=fixture([{slug:true},{tab:'booking',quantity:true,value:'8'}]);
 try{assert.equal(validateServiceEditor(f.form,{...validState,quantityError:'Maximum quantity must be at least the minimum.'}),'Maximum quantity must be at least the minimum.');f.flush();assert.equal(f.events[0],'tab:booking');assert.equal(f.fields[1].value,'8');f.events.length=0;assert.equal(validateServiceEditor(f.form,validState),null);assert.deepEqual(f.events,[]);}finally{f.restore();}
});
test('departed invalid field is not focused after tab render and missing slug cannot bypass async gate',()=>{
 const f=fixture([{tab:'locations',valid:false,isConnected:false}]);
 try{assert.equal(validateServiceEditor(f.form,validState),'Invalid locations');f.flush();assert.deepEqual(f.events,['tab:locations']);assert.ok(validateServiceEditor({elements:[],querySelector:()=>null},{...validState,slugAvailable:false}));}finally{f.restore();}
});
test('actual submit handler blocks invalid off-tab data before the save endpoint',async()=>{
 const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');const source=fs.readFileSync('src/pages/VendorDashboardPage.tsx','utf8');
 const start=source.indexOf('  async function handleSaveService('),end=source.indexOf('  async function handleToggleServiceActive(',start);let saves=0,error='';
 const f=fixture([{slug:true},{tab:'locations',valid:false}]);
 const context={validateServiceEditor,serviceQuantityError:()=>'',serviceForm:{name:'Kept'},checkingServiceSlug:false,serviceSlugAvailable:true,serviceSlugMessage:'',setError:value=>{error=value;},setBusyAction:()=>assert.fail('invalid data must not start save'),vendorDashboardCatalog:{saveService:async()=>{saves++;}}};
 vm.runInNewContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 try{await context.handleSaveService({preventDefault(){},currentTarget:f.form});assert.equal(saves,0);assert.equal(error,'Invalid locations');f.flush();assert.equal(f.events[0],'tab:locations');}finally{f.restore();}
});
