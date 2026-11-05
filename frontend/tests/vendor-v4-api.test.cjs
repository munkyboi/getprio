require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {getQueueSelectionOptionsV4}=require('../src/api/queueSelectionsV4.ts');
const {getQueueServiceConfiguration,saveQueueServiceConfiguration}=require('../src/api/queueServiceConfigurationV4.ts');
const {listQueueSelections,saveQueueSelection}=require('../src/api/queueSelectionsV3.ts');
test('v4 options/configuration preserve explicit version, revision and caller retry key',async()=>{
 const previous=global.fetch,calls=[];
 global.fetch=async(url,options)=>{calls.push({url:String(url),options});return {ok:true,status:200,json:async()=>({contractVersion:4,configurationRevision:'7',policy:null})};};
 try{
  await getQueueSelectionOptionsV4('cookie-session','business slug','branch slug');
  assert.match(calls[0].url,/contractVersion=4/);assert.match(calls[0].url,/location=branch%20slug/);
  const current=await getQueueServiceConfiguration('cookie-session','business','branch','2');assert.equal(current.configurationRevision,'7');assert.equal(current.policy,null);
  const body={expectedRevision:'7',configuration:{explicit:'policy'}};
  await saveQueueServiceConfiguration('cookie-session','business','branch','2',body,'same-command');
  await saveQueueServiceConfiguration('cookie-session','business','branch','2',body,'same-command');
  for(const call of calls.slice(2)){assert.equal(call.options.headers['Idempotency-Key'],'same-command');assert.deepEqual(JSON.parse(call.options.body),body);assert.equal(call.options.method,'PUT');}
 }finally{global.fetch=previous;}
});
test('mixed lists retain v3 and v4 and new count drafts retain their transport version',async()=>{
 const previous=global.fetch,calls=[];
 global.fetch=async(url,options)=>{calls.push({url:String(url),options});return {ok:true,status:200,json:async()=>({plans:[{contractVersion:2},{contractVersion:3},{contractVersion:4}],nextCursor:null})};};
 try{
  const result=await listQueueSelections('cookie-session','business','branch','draft');assert.deepEqual(result.plans.map(plan=>plan.contractVersion),[3,4]);
  const body={contractVersion:4,serviceSelections:[{serviceSelectionId:'root',serviceId:'1',resources:[]}],catalogRevision:null,customer:{name:'Local test'},notes:''};
  await saveQueueSelection('cookie-session','business','branch',null,body,'draft-command');assert.equal(JSON.parse(calls[1].options.body).contractVersion,4);assert.equal(calls[1].options.headers['Idempotency-Key'],'draft-command');
 }finally{global.fetch=previous;}
});
