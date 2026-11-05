const test = require('node:test');
const assert = require('node:assert/strict');
const {createAvatarDeletionService} = require('../src/services/avatarDeletionService');
const requestId = '00000000-0000-4000-8000-000000000001';
const prefix = 'user-avatars/users/42/';
const version = (name, id) => ({Key: prefix+name, VersionId: id});
function fixture({pages = [], request = {id:'42',deletion_requested_at:new Date(),status:'pending'}, failDelete} = {}) {
  const calls = [];
  const queries = [];
  const storage = {send: async command => {
    calls.push(command);
    if (command.constructor.name === 'ListObjectVersionsCommand') {
      assert.equal(command.input.Prefix,prefix);
      assert.equal(command.input.Bucket,'public-assets');
      assert.ok(pages.length, 'unexpected list call');
      return pages.shift();
    }
    assert.equal(command.constructor.name,'DeleteObjectCommand');
    if (failDelete) throw new Error('provider unavailable');
    return {};
  }};
  const cleanup = createAvatarDeletionService({bucket:'public-assets',storage, transaction: async fn => fn({query: async (sql,params) => {
    queries.push(sql); assert.deepEqual(params,[requestId]); assert.match(sql,/FOR UPDATE OF u/);
    return {rows:request ? [request] : []};
  }})});
  return {cleanup,calls,queries};
}
test('preview enumerates every version and delete marker without deletion or attestation',async()=>{
  const f=fixture({pages:[{Versions:[version('a','1')],IsTruncated:true,NextKeyMarker:prefix+'a',NextVersionIdMarker:'1'}, {DeleteMarkers:[version('b','2')]}]});
  assert.deepEqual(await f.cleanup({requestId}),{mode:'preview',versions:2});
  assert.equal(f.calls.length,2); assert.equal(f.calls[1].input.VersionIdMarker,'1');
  assert.equal(f.queries.length,1);
});
test('apply deletes exact versions, rechecks origin, and never attests wider task',async()=>{
  const f=fixture({pages:[{Versions:[version('a','1')],IsTruncated:true,NextKeyMarker:prefix+'a',NextVersionIdMarker:'1'}, {DeleteMarkers:[version('a','2')]}, {}]});
  assert.deepEqual(await f.cleanup({requestId,apply:true}),{mode:'apply',deletedVersions:2,originEmpty:true,taskAttested:false});
  assert.deepEqual(f.calls.slice(2,4).map(c=>c.input),['1','2'].map(VersionId=>({Bucket:'public-assets',Key:prefix+'a',VersionId})));
  assert.equal(f.queries.length,1);
});
test('empty-origin retry is successful without extra deletes',async()=>{
  const f=fixture({pages:[{},{}]});
  assert.equal((await f.cleanup({requestId,apply:true})).deletedVersions,0);
});
for (const request of [null,{id:'42',status:'pending'},{id:'42',status:'completed',deletion_requested_at:new Date()},{id:'../other',status:'pending',deletion_requested_at:new Date()}]) {
  test(`invalid deletion target is rejected: ${JSON.stringify(request)}`,async()=>{
    const f=fixture({request}); await assert.rejects(f.cleanup({requestId,apply:true}),/incomplete deletion request/); assert.equal(f.calls.length,0);
  });
}
for (const entry of [{Key:'user-avatars/users/420/a',VersionId:'x'}, {Key:prefix+'a'}, {Key:prefix+'a',VersionId:''}]) {
  test(`unsafe version metadata is rejected before deletion: ${JSON.stringify(entry)}`,async()=>{
    const f=fixture({pages:[{Versions:[entry]}]}); await assert.rejects(f.cleanup({requestId,apply:true}),/Invalid avatar/); assert.equal(f.calls.length,1);
  });
}
test('malformed and repeated pagination cursors fail before deletion',async()=>{
  for(const pages of [[{IsTruncated:true}], Array(2).fill({IsTruncated:true,NextKeyMarker:prefix+'a',NextVersionIdMarker:'1'})]) {
    const f=fixture({pages}); await assert.rejects(f.cleanup({requestId,apply:true}),/pagination cursor/);
    assert.ok(f.calls.every(c=>c.constructor.name==='ListObjectVersionsCommand'));
  }
});
test('provider delete failure fails the run; retry can remove remaining versions',async()=>{
  const f=fixture({pages:[{Versions:[version('a','1')]}],failDelete:true});
  await assert.rejects(f.cleanup({requestId,apply:true}),/provider unavailable/); assert.equal(f.queries.length,1);
  const retry=fixture({pages:[{Versions:[version('a','1')]},{}]});
  assert.equal((await retry.cleanup({requestId,apply:true})).originEmpty,true);
});
test('remaining/new versions prevent a successful result',async()=>{
  const f=fixture({pages:[{}, {Versions:[version('a','new')]}]});
  await assert.rejects(f.cleanup({requestId,apply:true}),/versions remain/); assert.equal(f.queries.length,1);
});
test('invalid request ID never queries database or storage',async()=>{
  const f=fixture(); await assert.rejects(f.cleanup({requestId:'42',apply:true}),/UUID/); assert.equal(f.queries.length,0);
});
