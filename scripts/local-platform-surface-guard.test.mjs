import test from 'node:test'; import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {validateLocalSurfaceArtifact,readPrivateArtifact,verifyLocalSurfaceSource,verifyLocalSurfaceDatabase} from './helpers/localPlatformSurfaceGuard.mjs';
const valid={databaseNonce:'a'.repeat(64),manifestSha256:'b'.repeat(64),env:{NODE_ENV:'development',LOCAL_API_PROFILE:'core',API_ENVIRONMENT:'production',LOCAL_API_ORIGIN:'http://127.0.0.1:5091',PORT:'5091',DATABASE_URL:'postgresql://local:local@127.0.0.1:5432/getprio_local_pool_demo_surfaces_core_20261023',JWT_SECRET:'a'.repeat(40),CSRF_SECRET:'b'.repeat(40),DEVELOPER_API_KEY_PEPPER:'c'.repeat(40),LOCAL_BROWSER_COOKIE_PREFIX:'surface_review',AUTH_COOKIE_SECURE:'false',CLIENT_URL:'http://127.0.0.1:5191',APP_BASE_URL:'http://127.0.0.1:5191',CUSTOMER_APP_URL:'http://127.0.0.1:5191',VENDOR_APP_URL:'http://127.0.0.1:5192',MARKETING_URL:'http://127.0.0.1:5190',PLATFORM_DASHBOARD_URL:'http://127.0.0.1:5193',DEVELOPER_PORTAL_URL:'http://127.0.0.1:5194'}};
test('launcher accepts only guarded new core / sandbox profiles',()=>{
 assert.equal(validateLocalSurfaceArtifact(valid).port,5091);
 const sandbox={...valid,env:{...valid.env,LOCAL_API_PROFILE:'sandbox',API_ENVIRONMENT:'sandbox',LOCAL_API_ORIGIN:'http://127.0.0.1:5092',PORT:'5092',DATABASE_URL:valid.env.DATABASE_URL.replace('_core_','_sandbox_'),LOCAL_BROWSER_COOKIE_PREFIX:''}};assert.equal(validateLocalSurfaceArtifact(sandbox).port,5092);
 for(const patch of [{NODE_ENV:'production'},{LOCAL_API_PROFILE:'other'},{PORT:'5007'},{LOCAL_API_ORIGIN:'http://evil.example:5091'},{DATABASE_URL:'postgresql://local@127.0.0.1:5432/getprio_local_pool_demo_vendor_5187_clone_20261023'},{DATABASE_URL:'postgresql://local@db.example:5432/getprio_local_pool_demo_surfaces_core_20261023'},{API_ENVIRONMENT:'sandbox'},{CSRF_SECRET:valid.env.JWT_SECRET},{SMTP_HOST:'smtp.example'},{PAYMONGO_SECRET_KEY:'not-allowed'}]) assert.throws(()=>validateLocalSurfaceArtifact({...valid,env:{...valid.env,...patch}}));
 assert.throws(()=>validateLocalSurfaceArtifact({...valid,databaseNonce:'short'}));assert.throws(()=>validateLocalSurfaceArtifact({...valid,manifestSha256:'bad'}));
});
test('artifact must be regular mode600 outside source and source manifest hash must match',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'getprio-local-surface-unit-'));try {
 const source=path.join(temp,'source');fs.mkdirSync(source);const filename=path.join(temp,'artifact.json');fs.writeFileSync(filename,JSON.stringify(valid),{mode:0o600});assert.equal(readPrivateArtifact(filename,source).databaseNonce,valid.databaseNonce);
 fs.chmodSync(filename,0o644);assert.throws(()=>readPrivateArtifact(filename,source));fs.chmodSync(filename,0o600);fs.symlinkSync(filename,path.join(temp,'link.json'));assert.throws(()=>readPrivateArtifact(path.join(temp,'link.json'),source));
 const inside=path.join(source,'private.json');fs.writeFileSync(inside,'{}',{mode:0o600});assert.throws(()=>readPrivateArtifact(inside,source));
 const manifest=path.join(temp,'manifest.json');fs.writeFileSync(manifest,'{}');assert.throws(()=>verifyLocalSurfaceSource(source,manifest,'0'.repeat(64)),/hash mismatch/);
 const hash=crypto.createHash('sha256').update('{}').digest('hex');assert.throws(()=>verifyLocalSurfaceSource(source,manifest,hash),/Full committed source/);
 } finally {fs.rmSync(temp,{recursive:true});}
});
test('database identity and ownership nonce are required before application listen',async()=>{
 const identity=validateLocalSurfaceArtifact(valid);const row={database_name:identity.databaseName,server_address:'127.0.0.1',ownership_comment:identity.comment};
 await verifyLocalSurfaceDatabase({query:async()=>({rows:[row]})},identity);
 for(const patch of [{database_name:'retained_database'},{server_address:'192.168.1.2'},{ownership_comment:'wrong'},{ownership_comment:null}]) await assert.rejects(()=>verifyLocalSurfaceDatabase({query:async()=>({rows:[{...row,...patch}]})},identity));
});
test('full source manifest verifies every byte and rejects drift, duplicate paths, and traversal',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'getprio-surface-manifest-unit-'));try{
  const root=path.join(temp,'source');fs.mkdirSync(root);const sha=crypto.createHash('sha256').update('unit-source').digest('hex');const entries=[];
  for(let i=0;i<1700;i++){const name=`file-${i}.txt`;fs.writeFileSync(path.join(root,name),'unit-source');entries.push({path:name,sha256:sha});}
  const filename=path.join(temp,'manifest.json');function write(files){const raw=JSON.stringify({sourceCommit:'a'.repeat(40),files});fs.writeFileSync(filename,raw);return crypto.createHash('sha256').update(raw).digest('hex');}
  let hash=write(entries);assert.equal(verifyLocalSurfaceSource(root,filename,hash).files,1700);
  fs.writeFileSync(path.join(root,'file-1699.txt'),'drift');assert.throws(()=>verifyLocalSurfaceSource(root,filename,hash),/Source hash mismatch/);fs.writeFileSync(path.join(root,'file-1699.txt'),'unit-source');
  hash=write([...entries.slice(0,1699),entries[0]]);assert.throws(()=>verifyLocalSurfaceSource(root,filename,hash),/Unsafe source manifest path/);
  hash=write([{path:'../escape',sha256:sha},...entries.slice(1)]);assert.throws(()=>verifyLocalSurfaceSource(root,filename,hash),/Unsafe source manifest path/);
 }finally{fs.rmSync(temp,{recursive:true});}
});
