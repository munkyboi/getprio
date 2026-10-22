const test = require('node:test');
const assert = require('node:assert/strict');
const url = process.env.AVATAR_CLEANUP_TEST_DATABASE_URL;

test('avatar upload and erasure serialize on a real PostgreSQL user lock', {skip: !url}, async () => {
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/getprio_avatar_cleanup_test');
  assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname));
  const {Pool} = require('pg');
  const pool = new Pool({connectionString:url});
  const schema = `avatar_race_${process.pid}_${Date.now()}`;
  const transaction = async fn => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO ${schema}`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  };
  const saved = new Map();
  const setMock = (path, exports) => {
    const id = require.resolve(path);
    saved.set(id, require.cache[id]);
    require.cache[id] = {id,filename:id,loaded:true,exports};
  };
  const requestId = '00000000-0000-4000-8000-000000000001';
  const deferred = () => {let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve};};
  const uploaded = deferred(), releaseUpload = deferred();
  const objects = [];
  const sdk = require('@aws-sdk/client-s3');
  const serviceId = require.resolve('../src/services/userAvatarUploadService');
  const policyId = require.resolve('../src/services/imageUploadPolicy');
  saved.set(serviceId,require.cache[serviceId]); saved.set(policyId,require.cache[policyId]);
  let uploadPromise;
  try {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE TABLE ${schema}.users(id bigint PRIMARY KEY,deletion_requested_at timestamptz,avatar_url text);
      CREATE TABLE ${schema}.account_deletion_requests(id uuid PRIMARY KEY,user_id bigint,status text);
      INSERT INTO ${schema}.users(id) VALUES(42);`);
    setMock('../src/config/db',{withTransaction:transaction});
    setMock('../src/config/env',{b2Region:'us-west-004',b2S3Endpoint:'https://example.invalid',b2BucketPublicBoard:'synthetic',b2KeyId:'synthetic',b2ApplicationKey:'synthetic',b2PublicBaseUrl:'https://example.invalid'});
    setMock('../src/repositories/platform',{getImageUploadLimitKb:async()=>200});
    setMock('../src/repositories/users',{updateUser:async(id,changes,{client})=>{
      await client.query('UPDATE users SET avatar_url=$2 WHERE id=$1',[id,changes.avatarUrl]);
      return {_id:id,avatarUrl:changes.avatarUrl};
    }});
    setMock('@aws-sdk/client-s3',{...sdk,S3Client:class {async send(command){
      objects.push({Key:command.input.Key,VersionId:'synthetic-version'});
      uploaded.resolve(); await releaseUpload.promise;
    }}});
    delete require.cache[serviceId]; delete require.cache[policyId];
    const service = require(serviceId);
    const args = {user:{_id:'42'},fileName:'test.jpg',contentType:'image/jpeg',fileBuffer:Buffer.from([255,216,255,224])};
    uploadPromise = service.uploadAvatar(args);
    await uploaded.promise;
    // NOWAIT proves the real upload holds the row lock while storage is in flight.
    await assert.rejects(transaction(c=>c.query('SELECT id FROM users WHERE id=42 FOR UPDATE NOWAIT')), {code:'55P03'});
    releaseUpload.resolve(); await uploadPromise;
    await transaction(async c=>{
      await c.query('SELECT id FROM users WHERE id=42 FOR UPDATE');
      await c.query("UPDATE users SET deletion_requested_at=NOW(),avatar_url=NULL WHERE id=42");
      await c.query("INSERT INTO account_deletion_requests VALUES($1,42,'pending')",[requestId]);
    });
    const {createAvatarDeletionService} = require('../src/services/avatarDeletionService');
    const cleanup = createAvatarDeletionService({transaction,bucket:'synthetic',storage:{send:async command=>{
      if (command.constructor.name==='ListObjectVersionsCommand') return {Versions:[...objects]};
      assert.equal(command.input.VersionId,'synthetic-version'); objects.length=0; return {};
    }}});
    assert.equal((await cleanup({requestId,apply:true})).originEmpty,true);
    await assert.rejects(service.uploadAvatar(args),{statusCode:403});
    assert.equal(objects.length,0);
    assert.equal((await pool.query(`SELECT avatar_url FROM ${schema}.users WHERE id=42`)).rows[0].avatar_url,null);
  } finally {
    releaseUpload.resolve(); if(uploadPromise) await uploadPromise.catch(()=>{});
    for(const [id,original] of saved) {if(original) require.cache[id]=original; else delete require.cache[id];}
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end();
  }
});
