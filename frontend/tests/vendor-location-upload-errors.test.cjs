const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('src/pages/VendorDashboardPage.tsx','utf8');
function uploadHandler(upload){
 const start=source.indexOf('  async function uploadLocationPaymentQr('),end=source.indexOf('  async function handleSaveTheme()',start);
 assert.ok(start>=0&&end>start);
 const state={title:'Unable to save location',error:'',busy:'',form:{slug:'new-branch',paymentQrImageUrl:'https://saved.example/previous-qr.png'}};
 const context={token:'session',selectedTenantSlug:'tenant',locationForm:state.form,
  setLocationErrorTitle:value=>{state.title=value;},setError:value=>{state.error=value;},setBusyAction:value=>{state.busy=value;},
  setLocationForm:update=>{state.form=update(state.form);},setPaymentQrUploadFile:()=>{},
  vendorDashboardOperations:{uploadLocationPaymentQr:upload},getErrorMessage:error=>error.message,showSuccessNotification:()=>{}};
 const output=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(output,context);
 const saveStart=source.indexOf('  async function saveLocation()'),saveEnd=source.indexOf('  function selectConfigurationLocation(',saveStart);
 Object.assign(context,{editingLocationSlug:'',locationSlugAvailable:false,locationSlugMessage:'Choose an available slug.'});
 vm.runInNewContext(ts.transpileModule(source.slice(saveStart,saveEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {state,run:context.uploadLocationPaymentQr,save:context.saveLocation};
}
test('rejected QR replacement identifies upload and preserves the saved payment image',async()=>{
 const f=uploadHandler(async()=>{throw new Error('Local image storage is unavailable for this location');});
 assert.equal(await f.run({name:'replacement.png',type:'image/png'}),false);
 assert.equal(f.state.title,'Unable to upload payment QR');assert.equal(f.state.error,'Local image storage is unavailable for this location');
 assert.equal(f.state.form.paymentQrImageUrl,'https://saved.example/previous-qr.png');assert.equal(f.state.busy,'');
});
test('QR validation failures identify upload without calling the endpoint or changing the saved image',async()=>{
 const f=uploadHandler(async()=>assert.fail('no valid slug'));f.state.form.slug=' ';
 assert.equal(await f.run({name:'qr.png',type:'image/png'}),false);assert.equal(f.state.title,'Unable to upload payment QR');
 assert.equal(f.state.error,'Location slug is required before uploading a payment QR.');assert.equal(f.state.form.paymentQrImageUrl,'https://saved.example/previous-qr.png');
});

test('a later Save validation error resets upload context without replacing the saved QR',async()=>{
 const f=uploadHandler(async()=>{throw new Error('upload unavailable');});
 await f.run({name:'replacement.png',type:'image/png'});await f.save();
 assert.equal(f.state.title,'Unable to save location');assert.equal(f.state.error,'Choose an available slug.');
 assert.equal(f.state.form.paymentQrImageUrl,'https://saved.example/previous-qr.png');
});
