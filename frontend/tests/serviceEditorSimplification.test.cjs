require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');
const {validateServiceEditor}=require('../src/vendor/serviceEditorValidation.ts');
test('invalid Advanced field is revealed before focus, nested details open and draft retained',()=>{
 const events=[],frames=[],old=global.window;global.window={requestAnimationFrame:fn=>frames.push(fn)};
 const detail={open:false,parentElement:null},field={willValidate:true,validity:{valid:false},validationMessage:'Bad link',value:'retained',isConnected:true,closest:selector=>selector==='details'?detail:{dataset:{serviceTab:'advanced'}},focus:()=>events.push(detail.open?'focused-visible':'focused-hidden'),reportValidity:()=>events.push('validity')};
 try{assert.equal(validateServiceEditor({elements:[field],querySelector:selector=>selector.includes('tab-trigger')?{click:()=>events.push('advanced')}:null},{checkingSlug:false,slugAvailable:true,slugMessage:'',quantityError:''}),'Bad link');frames.forEach(fn=>fn());assert.deepEqual(events,['advanced','focused-visible','validity']);assert.equal(field.value,'retained');}finally{global.window=old;}
});
test('delayed local location state uses authoritative bootstrap rows, preserving null and zero overrides',()=>{
 const a=source.indexOf('    if (!dashboardBootstrapQuery.data',source.indexOf('  const openServiceDialog =')),b=source.indexOf('\n  },[',a),fn=source.slice(a,b);
 const service={id:'s',slug:'court',name:'Court'},assignments=[{serviceId:'s',locationId:'1',capacity:2,isActive:true,priceAmountCents:0,priceDisplay:'Custom'},{serviceId:'s',locationId:'2',capacity:1,isActive:false,priceAmountCents:null,priceDisplay:null}];let draft,error;
 const c={service,locations:[],selectedLocationSlug:'one',dashboardBootstrapQuery:{data:{locationsResponse:{locations:[{id:'1',slug:'one'},{id:'2',slug:'two'}]}}},locationServicesQuery:{data:{locationServices:assignments}},servicesQuery:{},setError:v=>error=v,setEditingServiceSlug(){},setEditingServiceId(){},setServiceSlugManuallyEdited(){},setServiceSlugMessage(){},setServiceSlugAvailable(){},setCheckingServiceSlug(){},setServiceForm:v=>draft=v,setServiceDialogOpen(){},normalizeGroupFundedSettings:v=>v};
 vm.runInNewContext(ts.transpileModule('(function(){'+fn+'})()', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
 assert.equal(error,'');assert.equal(draft.locationServices.length,2);assert.equal(draft.locationServices[0].priceAmountCents,0);assert.equal(draft.locationServices[0].priceDisplay,'Custom');assert.equal(draft.locationServices[1].priceAmountCents,null);
 c.dashboardBootstrapQuery={isError:true};draft=null;vm.runInNewContext(ts.transpileModule('(function(){'+fn+'})()', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);assert.equal(draft,null);assert.match(error,/loading/);
});
test('same scoped editor is not reinitialized by refreshed SSE query identities',()=>{
 const a=source.indexOf('  useEffect(()=>{\n    if (!routeServiceSlug)'),b=source.indexOf('\n  useEffect(() => {',a),fragment=source.slice(a,b);let opens=0,callback;const c={useEffect:fn=>callback=fn,routeServiceSlug:'court',selectedTenantSlug:'club',dashboardBootstrapQuery:{data:{}},servicesQuery:{data:{services:[{id:'s'}]}},locationServicesQuery:{data:{}},services:[{id:'s',slug:'court'}],resolveServiceEditor:()=>({id:'s',slug:'court'}),serviceEditorScopeRef:{current:'club:s'},openServiceDialog:()=>opens++,navigate(){},location:{search:''}};
 vm.runInNewContext(ts.transpileModule(fragment,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);callback();assert.equal(opens,0);c.servicesQuery.data={services:[{id:'s'}]};callback();assert.equal(opens,0);
});
test('location-specific policy and resource actions retain clicked branch/business through leave guard',()=>{
 const a=source.indexOf('  function openServiceResourceSettings('),b=source.indexOf('  function renderServiceDialog()',a),navigations=[],state=[];
 const c={URLSearchParams,location:{search:'?location=demo&business=old'},selectedTenantSlug:'sports',requestServiceLeave:fn=>{state.push('guard');fn();},setSelectedLocationSlug:slug=>state.push(slug),setServicesTab:tab=>state.push(tab),setLocationsTab:tab=>state.push(tab),navigate:path=>navigations.push(path),workspacePath:require('../src/vendor/workspace.js').workspacePath};
 vm.runInNewContext(ts.transpileModule(source.slice(a,b),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
 c.openServiceResourceSettings('mandaue','policy');c.openServiceResourceSettings('mandaue','resources');
 assert.deepEqual(state,['guard','mandaue','queue-policy','guard','mandaue','resources']);for(const path of navigations){assert.equal(new URL(path,'https://example.test').searchParams.get('location'),'mandaue');assert.equal(new URL(path,'https://example.test').searchParams.get('business'),'sports');}
});
test('unknown location configuration cannot render an ordinary capacity editor; known resource and ordinary states stay distinct',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const a=source.indexOf('{!bookingConfigurationReady?'),b=source.indexOf('                        <ConfigurationNumber\n                          step={0.01}',a),jsx=source.slice(a+1,b).trim().replace(/\}$/u,'');
 const c={React,bookingConfigurationReady:false,resourceSettings:[],assignment:{locationSlug:'branch',capacity:1,isActive:true},locations:[{slug:'branch',name:'Branch'}],index:0,setServiceForm(){},ConfigurationNumber:props=>React.createElement('input',{'aria-label':props.label,value:props.value,readOnly:true})};
 const code=ts.transpileModule('function capacity(){return ('+jsx+');}',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,c);
 assert.doesNotMatch(renderToStaticMarkup(c.capacity()),/<input/);assert.match(renderToStaticMarkup(c.capacity()),/unavailable/);
 c.bookingConfigurationReady=true;assert.match(renderToStaticMarkup(c.capacity()),/<input/);
 c.resourceSettings=[{locationSlug:'branch',capabilityEnabled:true,ready:true}];assert.doesNotMatch(renderToStaticMarkup(c.capacity()),/<input/);assert.match(renderToStaticMarkup(c.capacity()),/Pool capacity/);
});
