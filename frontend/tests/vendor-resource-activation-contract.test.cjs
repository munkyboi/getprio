require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {prepareResourceActivation,submitResourceActivation,resourceActivationCapability}=require('../src/vendor/resourceActivationCommand.ts');
const cap=kind=>({capability:kind,available:true,pools:[{poolId:'13',poolRevision:'1',status:'ready',blockReason:null}]});
const configuration=()=>({version:'a'.repeat(64),pools:[],requirements:[],services:[],trackingAvailable:false,resourceActivation:cap('vendor-resource-activation-v1')});
test('real capability selects distinct activation route; only explicit legacy capability selects old route',()=>{
 const cfg=configuration();assert.match(prepareResourceActivation(cfg,'13','club','main','retry-1').path,/\/resources\/13\/tracking\/activate$/);
 const legacy={...cfg,resourceActivation:undefined,localActivation:cap('local-resource-activation-v1')};assert.match(prepareResourceActivation(legacy,'13','club','main','retry-1').path,/\/resources\/13\/activate$/);
 assert.equal(resourceActivationCapability({...cfg,localActivation:cap('local-resource-activation-v1')}).capability,'vendor-resource-activation-v1');
 for(const change of [{resourceActivation:undefined},{resourceActivation:{...cfg.resourceActivation,available:false}},{resourceActivation:{...cfg.resourceActivation,pools:[{...cfg.resourceActivation.pools[0],status:'blocked',blockReason:{message:'Resolve live work.'}}]}}])assert.throws(()=>prepareResourceActivation({...cfg,...change},'13','club','main','retry-1'));
});
test('uncertain retries preserve route, idempotency key and exact revision payload',async()=>{
 const original=global.fetch,calls=[];let fail=true;global.fetch=async(url,options)=>{calls.push({url:String(url),options});if(fail){fail=false;throw new TypeError('offline');}return new Response(JSON.stringify(configuration()),{status:200,headers:{'Content-Type':'application/json'}});};
 try{const attempt=prepareResourceActivation(configuration(),'13','club','main','same-attempt');await assert.rejects(submitResourceActivation('test-session',attempt));await submitResourceActivation('test-session',attempt);assert.equal(calls.length,2);assert.equal(calls[0].url,calls[1].url);assert.equal(calls[0].options.headers['Idempotency-Key'],'same-attempt');assert.equal(calls[0].options.body,calls[1].options.body);assert.deepEqual(JSON.parse(calls[1].options.body),{expectedPoolRevision:'1',configurationVersion:'a'.repeat(64)});}finally{global.fetch=original;}
});
