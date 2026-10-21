require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveServiceEditor,serviceEditorPath}=require('../src/vendor/serviceEditorRoute.ts');
test('service editor resolves persisted slugs only within authorized service IDs and retains scope',()=>{
 const services=[{id:'a',slug:'court'},{id:'b',slug:'foreign'}];
 assert.equal(resolveServiceEditor('court',services,new Set(['a'])),services[0]);
 assert.equal(resolveServiceEditor('foreign',services,new Set(['a'])),undefined);
 assert.equal(serviceEditorPath('court','?workspace=administration&business=club'),'/dashboard/services/court/edit?workspace=administration&business=club');
});
test('server canonical slug retains saved identity and draft if post-save reload fails',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');
 const start=source.indexOf('  async function handleSaveService('),end=source.indexOf('  async function handleToggleServiceActive',start);
 const navigation=[];let rows=[{id:'stable',slug:'old'}];
 const c={serviceForm:{name:'Draft service',slug:'old',bookingQuantityMin:2},serviceQuantityError:()=>null,setBusyAction(){},setError(v){c.error=v;},serviceSlugAvailable:true,editingServiceSlug:'old',token:'local',selectedTenantSlug:'club',routeServiceSlug:'old',location:{search:'?business=club'},serviceEditorPath,setEditingServiceId(v){c.id=v;},setEditingServiceSlug(v){c.editingServiceSlug=v;},setServiceForm(fn){c.serviceForm=fn(c.serviceForm);},setServices(fn){rows=fn(rows);},navigate(...args){navigation.push(args);},vendorDashboardCatalog:{saveService:async()=>({service:{id:'stable',slug:'canonical'}})},reloadServices:async()=>{throw Error('Reload unavailable');},getErrorMessage:e=>e.message};
 const js=ts.transpileModule(source.slice(start,end)+'\nhandleSaveService;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 await vm.runInNewContext(js,c)({preventDefault(){},currentTarget:{}});
 assert.equal(c.id,'stable');assert.equal(c.serviceForm.name,'Draft service');assert.equal(c.serviceForm.bookingQuantityMin,2);assert.equal(c.serviceForm.slug,'canonical');assert.equal(rows[0].id,'stable');assert.equal(c.error,'Reload unavailable');assert.equal(navigation[0][0],'/dashboard/services/canonical/edit?business=club');assert.equal(navigation[0][1].replace,true);
});
