const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');const vm=require('node:vm');const {createRequire}=require('node:module');
function load(file,mocks){const full=path.join(__dirname,'../src',file),module={exports:{}},normal=createRequire(full);vm.runInNewContext(fs.readFileSync(full,'utf8'),{require:name=>Object.hasOwn(mocks,name)?mocks[name]:normal(name),module,exports:module.exports,Buffer,URL,process},{filename:full});return module.exports;}
const image=Buffer.from([137,80,78,71,13,10,26,10]);
test('Vendor theme/media integrations use purpose/actor, keep response metadata, clean failed asset inserts',async()=>{
 for(const [file,assetType,purpose]of[['publicBoardThemeUploadService.js','logo','theme-logo'],['publicBoardThemeUploadService.js','background','theme-background'],['vendorMediaUploadService.js','location','location'],['vendorMediaUploadService.js','service','service']]){
  let call,cleanups=0,fail=false;const service=load('services/'+file,{
   './localApplicationImageStorage':{storeApplicationImage:async input=>{call=input;return{objectKey:'local-key',publicUrl:'http://127.0.0.1:5094/image',cleanup:async()=>cleanups++}}},
   './localImageStorage':{storeLocalImage:async()=>{throw new Error('legacy must not execute')}},
   './imageUploadPolicy':{assertImageUploadSize:async()=>{}},'../config/env':{},
   '../repositories/publicBoardThemes':{createAsset:async data=>{if(fail)throw new Error('asset DB failed');return{_id:'19',...data}}}
  });
  const result=await service.uploadBinary({tenant:{_id:'7'},location:null,user:{_id:'12'},assetType,body:{assetType,fileName:'photo.png',contentType:'image/png'},fileBuffer:image});
  assert.equal(call.purpose,purpose);assert.equal(call.actorUserId,'12');assert.equal(result.asset.publicUrl,'http://127.0.0.1:5094/image');assert.equal(cleanups,0);
  fail=true;await assert.rejects(service.uploadBinary({tenant:{_id:'7'},user:{_id:'12'},assetType,body:{assetType,fileName:'photo.png',contentType:'image/png'},fileBuffer:image}),/asset DB failed/);assert.equal(cleanups,1);
 }
});
test('avatar retains deletion lock/transaction client and cleans files after update or commit failure',async()=>{
 for(const failure of ['update','commit']){
  let cleaned=0,update=false,locked=false;const client={query:async sql=>{assert.match(sql,/FOR UPDATE/);locked=true;return{rows:[{deletion_requested_at:null}]}}};
  const service=load('services/userAvatarUploadService.js',{
   './localApplicationImageStorage':{storeApplicationImage:async(input,c)=>{assert.equal(c,client);assert.ok(locked);assert.equal(input.purpose,'avatar');assert.equal(input.actorUserId,'12');return{publicUrl:'http://127.0.0.1/avatar',cleanup:async()=>cleaned++}}},
   './localImageStorage':{storeLocalImage:async()=>{throw new Error('legacy must not execute')}},'./imageUploadPolicy':{assertImageUploadSize:async()=>{}},'../config/env':{},
   '../config/db':{withTransaction:async fn=>{const result=await fn(client);if(failure==='commit')throw new Error('commit failed');return result}},
   '../repositories/users':{updateUser:async()=>{update=true;if(failure==='update')throw new Error('update failed');return{_id:'12'}}}
  });
  await assert.rejects(service.uploadAvatar({user:{_id:'12'},fileName:'a.png',contentType:'image/png',fileBuffer:image}),new RegExp(failure+' failed'));assert.ok(update);assert.equal(cleaned,1);
 }
});
test('proof integration forwards current actor, keeps metadata only, and signs access through private adapter',async()=>{
 let store,access;const service=load('services/paymentProofStorageService.js',{
  './localApplicationImageStorage':{storeApplicationImage:async input=>{store=input;return{objectKey:input.objectKey}},applicationProofAccess:async input=>{access=input;return'http://127.0.0.1/private?signature=temporary'}},
  './localImageStorage':{storeLocalImage:async()=>{throw new Error('legacy must not execute')},localProofAccess:async()=>{throw new Error('legacy must not execute')}},'./imageUploadPolicy':{assertImageUploadSize:async()=>{}},'../config/env':{}
 });
 const booking={_id:'51',tenantId:'7',locationId:'9',customerUserId:'12'};
 const result=await service.uploadBinary({booking,actorUserId:'12',body:{fileName:'receipt.png',contentType:'image/png'},fileBuffer:image});assert.equal(store.purpose,'booking-proof');assert.equal(store.actorUserId,'12');assert.equal(result.proof.publicUrl,undefined);assert.match(result.proof.objectKey,/^payment-proofs\/tenants\/7\/bookings\/51\//);
 const viewed=await service.createViewAccess({booking:{...booking,paymentProofObjectKey:result.proof.objectKey},actorUserId:'99',readerKind:'vendor'});assert.equal(access.actorUserId,'99');assert.equal(access.readerKind,'vendor');assert.equal(viewed.access.expiresInSeconds,300);
});

test('payment QR compatibility adapter uses the shared purpose ACL', async () => {
 let input;
 const service=load('services/localVendorPaymentQrStorage.js',{
  './localApplicationImageStorage':{storeApplicationImage:async value=>{input=value;return {publicUrl:'http://127.0.0.1/qr'}}}
 });
 const result=await service.storeLocalVendorPaymentQr({tenant:{_id:'7'},location:{slug:'main'},actorUserId:'12',contentType:'image/png',body:image});
 assert.equal(input.purpose,'payment-qr');assert.equal(input.actorUserId,'12');assert.equal(result.publicUrl,'http://127.0.0.1/qr');
});
