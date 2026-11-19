require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {prepareResourceActivation,submitResourceActivation}=require('../src/vendor/resourceActivationCommand.ts');
const {LocalResourceActivation}=require('../src/vendor/LocalResourceActivation.tsx');
const configuration={version:'config-7',trackingAvailable:false,localActivation:{capability:'local-resource-activation-v1',available:true,pools:[{poolId:'13',poolRevision:'pool-2',status:'ready',blockReason:null}]}};
test('production tracking flag or blocked local setup never grants activation',()=>{
 assert.throws(()=>prepareResourceActivation({version:'v',trackingAvailable:false},'13','club','mandaue','key'),/not ready/);
 const blocked={...configuration,localActivation:{...configuration.localActivation,pools:[{poolId:'13',poolRevision:'pool-2',status:'blocked',blockReason:{code:'POLICY_REQUIRED',message:'Save an explicit policy first.'}}]}};
 assert.throws(()=>prepareResourceActivation(blocked,'13','club','mandaue','key'),/Save an explicit policy first/);
});
test('activation is an explicit scoped revision-checked POST and retry preserves the same frozen body/key',async()=>{
 const original=global.fetch,calls=[];let failed=true;
 global.fetch=async(url,request)=>{calls.push({url,request});return {ok:!failed,status:failed?503:200,json:async()=>failed?{message:'outcome unknown'}:configuration};};
 try{
  const attempt=prepareResourceActivation(configuration,'13','club','mandaue','same-key');
  await assert.rejects(submitResourceActivation('session',attempt),/outcome unknown/);
  const changed={...configuration,version:'config-8'};assert.equal(changed.version,'config-8');failed=false;await submitResourceActivation('session',attempt);
  assert.equal(calls.length,2);for(const call of calls){assert.match(call.url,/vendor\/tenant\/club\/locations\/mandaue\/resources\/13\/activate$/);assert.equal(call.request.method,'POST');assert.equal(call.request.credentials,'include');assert.equal(call.request.headers['Idempotency-Key'],'same-key');assert.deepEqual(JSON.parse(call.request.body),{expectedPoolRevision:'pool-2',configurationVersion:'config-7'});}
 }finally{global.fetch=original;}
});
test('rendering ready setup never activates and missing capability stays disabled',()=>{
 const props={poolId:'13',tenant:'club',location:'mandaue',token:'session',disabled:false,onBusy:()=>assert.fail(),onChanged:()=>assert.fail(),onRefresh:()=>assert.fail()};
 const ready=renderToStaticMarkup(React.createElement(LocalResourceActivation,{...props,configuration}));assert.match(ready,/Enable resource tracking/);assert.doesNotMatch(ready,/disabled=""/);
 const missing=renderToStaticMarkup(React.createElement(LocalResourceActivation,props));assert.match(missing,/disabled=""/);assert.match(missing,/unavailable in this preview/);
});

test('an idle activation owner can stay mounted without exposing a hidden pool action',()=>{
 const html=renderToStaticMarkup(React.createElement(LocalResourceActivation,{configuration,poolId:'13',tenant:'club',location:'mandaue',token:'session',disabled:false,visible:false,onBusy:()=>assert.fail(),onChanged:()=>assert.fail(),onRefresh:()=>assert.fail()}));assert.equal(html,'');
});
