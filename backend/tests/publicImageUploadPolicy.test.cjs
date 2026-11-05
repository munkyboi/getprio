const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
const databaseUrl=process.env.IMAGE_POLICY_TEST_DATABASE_URL;

test('public/account discovery and byte enforcement share live PostgreSQL policy without cached errors',{skip:!databaseUrl},async t=>{
 const url=new URL(databaseUrl);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/getprio_test');
 const {Pool}=require('pg'),express=require('express');
 const schema=`image_policy_${randomUUID().replaceAll('-','')}`;
 const admin=new Pool({connectionString:databaseUrl}),pool=new Pool({connectionString:databaseUrl,options:`-c search_path=${schema}`});
 let server;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);await pool.query('CREATE TABLE platform_settings(key text PRIMARY KEY,value text)');
  const platform=loadModuleWithMocks(path.resolve(__dirname,'../src/repositories/platform.js'),{'../config/db':{pool}});
  const policy=loadModuleWithMocks(path.resolve(__dirname,'../src/services/imageUploadPolicy.js'),{'../repositories/platform':platform});
  const routes=[],router=new Proxy({},{get:(_,method)=>(...args)=>routes.push({method,args})});
  const fallback=new Proxy({},{get:()=>()=>undefined});
  const mocks={'express':{Router:()=>router},'../services/imageUploadPolicy':policy,'../middleware/asyncHandler':fn=>fn};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../src/routes/publicRoutes.js'),'utf8'),{require:name=>mocks[name]||fallback,module:{exports:{}}});
  const handler=routes.find(route=>route.method==='get'&&route.args[0]==='/upload-policy').args.at(-1);
  const app=express();
  for(const route of ['/api/public/upload-policy','/api/v1/public/upload-policy'])app.get(route,(req,res,next)=>Promise.resolve(handler(req,res)).catch(next));
  app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({message:error.message}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  await t.test('fresh anonymous aliases, authenticated-service DTO and enforcement agree at each setting including exact byte boundary',async()=>{
   for(const kb of [200,1,300,8192]){
    await pool.query("INSERT INTO platform_settings VALUES('max_image_upload_kb',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[String(kb)]);
    for(const route of ['/api/public/upload-policy','/api/v1/public/upload-policy']){
     const response=await fetch(base+route);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
     assert.deepEqual(await response.json(),{maxImageUploadKb:kb,maxImageUploadBytes:kb*1024});
    }
    assert.deepEqual(await policy.getImageUploadPolicy(),{maxImageBytes:kb*1024});
    await policy.assertImageUploadSize(kb*1024);await assert.rejects(policy.assertImageUploadSize(kb*1024+1),{code:'IMAGE_UPLOAD_SIZE_EXCEEDED'});
   }
  });
  await t.test('absent or invalid persisted value uses the existing server fallback only',async()=>{
   await pool.query('DELETE FROM platform_settings');assert.equal((await policy.getPublicImageUploadPolicy()).maxImageUploadBytes,204800);
   for(const value of ['0','8193','1.5','not-a-number']){
    await pool.query("INSERT INTO platform_settings VALUES('max_image_upload_kb',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[value]);
    assert.deepEqual(await policy.getPublicImageUploadPolicy(),{maxImageUploadKb:200,maxImageUploadBytes:204800});
   }
  });
  await t.test('unavailable settings fail uncached with no invented byte limit',async()=>{
   await pool.query('DROP TABLE platform_settings');
   for(const route of ['/api/public/upload-policy','/api/v1/public/upload-policy']){
    const response=await fetch(base+route);assert.equal(response.status,500);assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json();assert.equal(Object.hasOwn(body,'maxImageUploadBytes'),false);
   }
   await assert.rejects(policy.assertImageUploadSize(1));
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
