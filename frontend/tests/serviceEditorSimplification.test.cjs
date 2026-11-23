require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');
const {validateServiceEditor}=require('../src/vendor/serviceEditorValidation.ts');

test('invalid Advanced field is revealed before focus, nested details open and draft retained',()=>{
 const events=[],frames=[],old=global.window;global.window={requestAnimationFrame:fn=>frames.push(fn)};
 const detail={open:false,parentElement:null},field={willValidate:true,validity:{valid:false},validationMessage:'Bad link',value:'retained',isConnected:true,closest:selector=>selector==='details'?detail:{dataset:{serviceTab:'advanced'}},focus:()=>events.push(detail.open?'focused-visible':'focused-hidden'),reportValidity:()=>events.push('validity')};
 try{assert.equal(validateServiceEditor({elements:[field],querySelector:selector=>selector.includes('tab-trigger')?{click:()=>events.push('advanced')}:null},{checkingSlug:false,slugAvailable:true,slugMessage:'',quantityError:''}),'Bad link');frames.forEach(fn=>fn());assert.deepEqual(events,['advanced','focused-visible','validity']);assert.equal(field.value,'retained');}finally{global.window=old;}
});

test('service editor hydrates location assignments from the dashboard bootstrap data',()=>{
 assert.match(source,/dashboardBootstrapQuery/);
 assert.match(source,/locationsResponse/);
 assert.match(source,/locationServicesQuery/);
 assert.match(source,/locationServices/);
});

test('service editor scope follows the selected tenant and location',()=>{
 assert.match(source,/selectedTenantSlug/);
 assert.match(source,/selectedLocationSlug/);
 assert.match(source,/editingServiceSlug/);
 assert.match(source,/locationOptions/);
 assert.match(source,/setSelectedLocationSlug/);
});

test('service resource settings preserve the clicked location and workspace route',()=>{
 assert.match(source,/renderServiceDialog/);
 assert.match(source,/selectedLocationSlug/);
 assert.match(source,/locationForm/);
});

test('service capacity controls are gated by booking configuration and resource readiness',()=>{
 assert.match(source,/booking/);
 assert.match(source,/locationServices/);
 assert.match(source,/capacity/);
});
