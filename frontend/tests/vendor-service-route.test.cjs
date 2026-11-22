require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveServiceEditor,serviceEditorPath}=require('../src/vendor/serviceEditorRoute.ts');
test('service editor resolves persisted slugs only within authorized service IDs and retains scope',()=>{
 const services=[{id:'a',slug:'court'},{id:'b',slug:'foreign'}];
 assert.equal(resolveServiceEditor('court',services,new Set(['a'])),services[0]);
 assert.equal(resolveServiceEditor('foreign',services,new Set(['a'])),undefined);
 assert.equal(serviceEditorPath('court','?workspace=administration&business=club'),'/dashboard/services/court/edit?workspace=administration&business=club');
});
test('service save keeps the current draft and reports reload failures through the editor handler',()=>{
 const fs=require('node:fs');
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');
 const start=source.indexOf('  async function handleSaveService(');
 const end=source.indexOf('  async function handleToggleServiceActive',start);
 const handler=source.slice(start,end);
 assert.ok(start>=0 && end>start);
 assert.match(handler,/vendorDashboardCatalog\.saveService\(token, selectedTenantSlug/);
 assert.match(handler,/await reloadServices\(\)/);
 assert.match(handler,/setServiceDialogOpen\(false\)/);
 assert.match(handler,/catch \(saveError\)/);
 assert.match(handler,/setError\(getErrorMessage\(saveError\)\)/);
});
