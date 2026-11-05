const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {configuration,createStorage}=require('../src/services/localApplicationImageStorage');
const source={NODE_ENV:'test',DATABASE_URL:'postgres://qa@127.0.0.1/getprio_local_pool_demo_images_test',LOCAL_APPLICATION_IMAGE_STORAGE_ENABLED:'1',LOCAL_APPLICATION_IMAGE_DATABASE:'getprio_local_pool_demo_images_test',LOCAL_APPLICATION_IMAGE_PUBLIC_ORIGIN:'http://127.0.0.1:5094'};
const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
const upload={tenant:{_id:'7'},location:{slug:'main',_id:'9'},actorUserId:'12',contentType:'image/png',body:png};
const booking={_id:'51',tenantId:'7',locationId:'9',customerUserId:'12'};
const proof={purpose:'booking-proof',booking,actorUserId:'12',objectKey:'payment-proofs/tenants/7/bookings/51/123-abc.png',contentType:'image/png',body:png};
const idOf=asset=>asset.publicUrl.split('/').pop();
async function setup(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'getprio-app-images-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const state={source:{...source},role:true,user:true,tenant:true,location:true,db:true,address:'127.0.0.1',commitFail:false,requests:[],clock:1000000,proofKey:null,booking:true,status:'confirmed',checkedIn:false};
 const client={release(){},async query(sql,args=[]){state.requests.push({sql,args});
  if(sql==='COMMIT'&&state.commitFail)throw new Error('commit failure');
  if(sql.includes('current_database()'))return{rows:[{database_name:state.db?source.LOCAL_APPLICATION_IMAGE_DATABASE:'other',server_address:state.address}]};
  if(sql.includes('FROM users'))return{rows:state.user?[{id:args[0]}]:[]};
  if(sql.includes('FROM tenants'))return{rows:state.tenant?[{id:args[0]}]:[]};
  if(sql.includes('FROM store_locations'))return{rows:state.location?[{id:'9'}]:[]};
  if(sql.includes('FROM bookings'))return{rows:state.booking&&args[0]==='51'&&args[1]==='7'&&args[2]==='9'&&args[3]==='12'?[{id:'51',tenant_id:'7',location_id:'9',customer_user_id:'12',payment_proof_object_key:state.proofKey,status:state.status,checked_in_at:state.checkedIn?'now':null}]:[]};
  return{rows:[]};
 }};
 const options={pool:{connect:async()=>client},source:()=>state.source,directory,now:()=>state.clock,assertSize:async size=>{if(size<1||size>200*1024)throw Object.assign(new Error('size'),{statusCode:400})},authorize:async(_c,scope,permission)=>{state.authorization={scope,permission};return state.role?{}:null}};
 return{storage:createStorage(options),options,state,directory,client};
}
const denied=e=>[403,404,503].includes(e.statusCode);
test('configuration is independently opt-in, local, exact and query-free',()=>{
 assert.ok(configuration(source));
 for(const delta of[{LOCAL_APPLICATION_IMAGE_STORAGE_ENABLED:'0'},{NODE_ENV:'production'},{DATABASE_URL:source.DATABASE_URL+'?host=remote'},{DATABASE_URL:source.DATABASE_URL+'?options=-csearch_path=evil'},{DATABASE_URL:'postgres://qa@remote/getprio_local_pool_demo_images_test'},{LOCAL_APPLICATION_IMAGE_DATABASE:'other'},{LOCAL_APPLICATION_IMAGE_PUBLIC_ORIGIN:'https://example.com'},{LOCAL_APPLICATION_IMAGE_ROOT:'../relative'}])assert.equal(configuration({...source,...delta}),null);
});
test('all public Vendor purposes support normal active actors, saved and draft branch scopes',async t=>{
 const{storage,state,directory}=await setup(t);
 for(const purpose of ['theme-logo','theme-background','location','service','payment-qr']){
  const asset=await storage.store({...upload,purpose});assert.deepEqual((await storage.readPublic(idOf(asset))).body,png);assert.match(state.authorization.permission,/^tenant\./);assert.equal(state.authorization.scope.tenantId,'7');assert.equal(JSON.stringify(asset).includes('cleanup'),false);
 }
 state.location=false;const draft=await storage.store({...upload,purpose:'location',location:{slug:'new-branch'}});assert.equal(state.authorization.scope.locationId,null);assert.ok(await storage.readPublic(idOf(draft)));
 state.role=false;await assert.rejects(storage.store({...upload,purpose:'service',location:null}),denied);state.role=true;
 await assert.rejects(storage.store({...upload,purpose:'location',location:{slug:'../x'}}),denied);
 await assert.rejects(storage.store({...upload,purpose:'theme-logo',location:{slug:'main',_id:'999'}}),denied);
 const root=path.join(directory,(await fs.readdir(directory))[0]);for(const file of await fs.readdir(root))assert.equal((await fs.stat(path.join(root,file))).mode&0o077,0);
});
test('avatar own-user only, no tenant membership needed, blocked user cannot upload/read',async t=>{
 const{storage,state,client}=await setup(t);state.tenant=false;
 const a=await storage.store({purpose:'avatar',user:{_id:'12'},actorUserId:'12',contentType:'image/png',body:png},client);
 assert.deepEqual((await storage.readPublic(idOf(a))).body,png);
 await assert.rejects(storage.store({purpose:'avatar',user:{_id:'13'},actorUserId:'12',contentType:'image/png',body:png}),denied);
 state.user=false;await assert.rejects(storage.readPublic(idOf(a)),denied);await assert.rejects(storage.store({purpose:'avatar',user:{_id:'12'},actorUserId:'12',contentType:'image/png',body:png}),denied);
});
test('proof keeps objectKey-only contract; public denies; association and customer/vendor ACL rechecked on issuance/read',async t=>{
 const{storage,state}=await setup(t);const asset=await storage.store(proof);assert.equal(asset.objectKey,proof.objectKey);assert.equal(asset.publicUrl,undefined);
 const crypto=require('node:crypto'),id=crypto.createHash('sha256').update(proof.objectKey).digest('hex').slice(0,48);
 await assert.rejects(storage.readPublic(id),denied);
 const saved={...booking,paymentProofObjectKey:proof.objectKey};
 await assert.rejects(storage.proofAccess({booking:saved,actorUserId:'12',readerKind:'customer'}),denied);
 state.proofKey=proof.objectKey;const url=await storage.proofAccess({booking:saved,actorUserId:'12',readerKind:'customer'});const q=Object.fromEntries(new URL(url).searchParams);
 assert.deepEqual((await storage.readPrivate(id,q)).body,png);
 await assert.rejects(storage.proofAccess({booking:saved,actorUserId:'99',readerKind:'customer'}),denied);
 const vendor=await storage.proofAccess({booking:saved,actorUserId:'99',readerKind:'vendor'});assert.equal(state.authorization.permission,'tenant.booking.manage');assert.ok(vendor);
 state.role=false;await assert.rejects(storage.proofAccess({booking:saved,actorUserId:'99',readerKind:'vendor'}),denied);state.role=true;
 await assert.rejects(storage.readPrivate(id,{...q,readerId:'99'}),denied);
 state.proofKey='foreign';await assert.rejects(storage.readPrivate(id,q),denied);
});
test('private signatures expire, cannot exceed300s, and are invalidated on restart; tampering fails',async t=>{
 const{storage,state,options,directory}=await setup(t);await storage.store(proof);state.proofKey=proof.objectKey;
 const url=new URL(await storage.proofAccess({booking:{...booking,paymentProofObjectKey:proof.objectKey},actorUserId:'12',readerKind:'customer'})),id=url.pathname.split('/').pop(),q=Object.fromEntries(url.searchParams);
 const restarted=createStorage(options);await assert.rejects(restarted.readPrivate(id,q),denied);
 await assert.rejects(storage.readPrivate(id,{...q,expires:state.clock+300001}),denied);
 state.clock+=300000;await assert.rejects(storage.readPrivate(id,q),denied);state.clock-=300000;
 const root=path.join(directory,(await fs.readdir(directory))[0]);await fs.writeFile(path.join(root,id+'.image'),'tampered');await assert.rejects(storage.readPrivate(id,q),denied);
});
test('proof upload rejects foreign booking/customer and arrived/canceled/already submitted states',async t=>{
 const{storage,state}=await setup(t);
 await assert.rejects(storage.store({...proof,actorUserId:'99'}),denied);
 await assert.rejects(storage.store({...proof,booking:{...booking,tenantId:'8'}}),denied);
 state.checkedIn=true;await assert.rejects(storage.store(proof),denied);state.checkedIn=false;
 state.status='canceled';await assert.rejects(storage.store(proof),denied);state.status='confirmed';
 state.proofKey=proof.objectKey;await assert.rejects(storage.store(proof),denied);
});
test('MIME/signature/dynamic-size, nonlocal DB and missing actor fail without files',async t=>{
 const{storage,state,directory}=await setup(t);
 for(const value of[{...upload,purpose:'location',contentType:'image/svg+xml'},{...upload,purpose:'location',body:Buffer.from('bad')},{...upload,purpose:'location',body:Buffer.concat([png,Buffer.alloc(200*1024)])}])await assert.rejects(storage.store(value),e=>e.statusCode===400);
 state.address='10.0.0.2';await assert.rejects(storage.store({...upload,purpose:'location'}),denied);state.address='127.0.0.1';state.db=false;await assert.rejects(storage.store({...upload,purpose:'location'}),denied);assert.deepEqual(await fs.readdir(directory),[]);
});
test('service rollback cleanup, DB commit failure, partial write cleanup and quota/symlink protections',async t=>{
 const{storage,state,directory}=await setup(t);const a=await storage.store({...upload,purpose:'location'});await a.cleanup();const root=path.join(directory,(await fs.readdir(directory))[0]);assert.deepEqual(await fs.readdir(root),[]);
 state.commitFail=true;await assert.rejects(storage.store({...upload,purpose:'location'}),/commit failure/);state.commitFail=false;assert.deepEqual(await fs.readdir(root),[]);
 const original=fs.open;fs.open=async(...args)=>{const handle=await original(...args);if(String(args[0]).endsWith('.json')&&args[1]==='wx'){const write=handle.writeFile.bind(handle);handle.writeFile=async content=>{await write(content.subarray(0,1));throw new Error('partial write')};}return handle;};try{await assert.rejects(storage.store({...upload,purpose:'location'}),/partial write/);}finally{fs.open=original}assert.deepEqual(await fs.readdir(root),[]);
 const b=await storage.store({...upload,purpose:'location'});const id=idOf(b);await fs.unlink(path.join(root,id+'.image'));await fs.symlink('/etc/hosts',path.join(root,id+'.image'));await assert.rejects(storage.readPublic(id),denied);await assert.rejects(storage.store({...upload,purpose:'location'}),denied);
 await fs.unlink(path.join(root,id+'.image'));for(let n=0;n<255;n++)await fs.writeFile(path.join(root,'quota-'+n),'');await assert.rejects(storage.store({...upload,purpose:'location'}),denied);
});
test('new local account/tenant IDs need no config list; disabled mode preserves production fallback',async t=>{
 const{storage,state}=await setup(t);state.location=false;
 const fresh=await storage.store({...upload,purpose:'location',tenant:{_id:'88'},actorUserId:'99',location:{slug:'fresh-signup'}});assert.ok(fresh.publicUrl);assert.equal(state.authorization.scope.tenantId,'88');assert.equal(state.authorization.scope.actorUserId,'99');
 const avatar=await storage.store({purpose:'avatar',user:{_id:'99'},actorUserId:'99',contentType:'image/png',body:png});assert.ok(avatar.publicUrl);
 state.source.LOCAL_APPLICATION_IMAGE_STORAGE_ENABLED='0';state.source.NODE_ENV='production';assert.equal(await storage.store({...upload,purpose:'location'}),null);
 state.source.LOCAL_APPLICATION_IMAGE_STORAGE_ENABLED='1';await assert.rejects(storage.store({...upload,purpose:'location'}),e=>e.statusCode===503);
});
