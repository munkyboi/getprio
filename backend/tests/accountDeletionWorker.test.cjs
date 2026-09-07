const test = require('node:test');
const assert = require('node:assert/strict');

function workerWith(client, sendEmail, config) {
  const target = require.resolve('../src/services/accountDeletionWorker');
  const mocks = {
    '../src/config/db': {pool: {connect: async () => client}},
    '../src/services/notificationService': {sendEmail},
    '../src/config/env': config
  };
  const originals = new Map();
  for (const [path,value] of Object.entries(mocks)) {
    const id = require.resolve(path);
    originals.set(id,require.cache[id]);
    require.cache[id] = {id, filename:id, loaded:true, exports:value};
  }
  delete require.cache[target];
  try { return require(target); }
  finally {
    delete require.cache[target];
    for (const [id,original] of originals) {
      if (original) require.cache[id]=original;
      else delete require.cache[id];
    }
  }
}
function fixture({locked=true, completed=false}={}) {
  const calls=[];
  const request={id:'request', user_id:1, status:completed?'completed':'pending',
    acknowledgement_sent_at:new Date(), contact_email:'fixture@example.invalid', retention_notice:'No retained data.'};
  const client={
    async query(sql) {
      calls.push(sql);
      if (sql.includes('pg_try_advisory_lock')) return {rows:[{locked}]};
      if (sql.startsWith('SELECT * FROM account_deletion_requests')) return {rows:[request]};
      if (sql.startsWith('SELECT kind,status,evidence')) return {rows:[
        'personal_data_inventory','object_storage_versions_and_caches','supplier_data','financial_and_legal_retention','backup_disposal'
      ].map(kind=>({kind,status:'completed',evidence:'case-reference'}))};
      if (sql.startsWith('SELECT * FROM users')) return {rows:[]};
      if (sql.includes('count(*)')) return {rows:[{count:0}]};
      return {rows:[]};
    },
    release(){calls.push('RELEASE');}
  };
  return {calls,client};
}
test('worker does not unlock another worker and always releases its connection', async()=>{
  const {calls,client}=fixture({locked:false});
  await workerWith(client,async()=>{throw Error('must not send');},{}).runOnce();
  assert.equal(calls.at(-1),'RELEASE');
  assert.equal(calls.some(sql=>sql.includes('pg_advisory_unlock')),false);
});
test('completion notification follows commit and clears contact only after sending',async()=>{
  const {calls,client}=fixture();
  await workerWith(client,async()=>{
    assert.ok(calls.includes('COMMIT'));
    assert.equal(calls.some(sql=>sql.includes('contact_email=NULL')),false);
    calls.push('SENT');
    return true;
  },{resendApiKey:'fixture'}).runOnce();
  assert.ok(calls.findIndex(sql=>sql.includes('contact_email=NULL'))>calls.indexOf('SENT'));
});
test('failed completion email retains its destination and schedules a retry',async()=>{
  const {calls,client}=fixture({completed:true});
  await workerWith(client,async()=>{throw Error('delivery failed');},{resendApiKey:'fixture'}).runOnce();
  assert.equal(calls.some(sql=>sql.includes('contact_email=NULL')),false);
  assert.ok(calls.some(sql=>sql.includes('attempts=attempts+1')));
});
test('missing email configuration defers processing without marking deletion complete',async()=>{
  const {calls,client}=fixture();
  await workerWith(client,async()=>{throw Error('must not send');},{}).runOnce();
  assert.ok(calls.some(sql=>sql.includes("last_error_code='EMAIL_NOT_CONFIGURED'")));
  assert.equal(calls.includes('BEGIN'),false);
});
