const test = require('node:test');
const assert = require('node:assert/strict');
const { localPoolDemoConfiguration, readLocalPoolDemoScope } = require('../src/services/localPoolDemoScope');

test('local pool opt-in cannot enable production, unrelated or remote databases', async () => {
  const local = { LOCAL_POOL_DEMO_ENABLED:'1', NODE_ENV:'development', DATABASE_URL:'postgresql://postgres@127.0.0.1:55494/getprio_local_pool_demo_test' };
  assert.deepEqual(localPoolDemoConfiguration(local), {databaseName:'getprio_local_pool_demo_test'});
  for (const override of [{LOCAL_POOL_DEMO_ENABLED:'0'}, {NODE_ENV:'production'}, {NODE_ENV:undefined},
    {DATABASE_URL:'postgresql://postgres@127.0.0.1:55494/getprio_tenant5_review'},
    {DATABASE_URL:'postgresql://postgres@production.example/getprio_local_pool_demo_test'},
    {DATABASE_URL:'postgresql://postgres@127.0.0.1:55494/getprio_local_pool_demo_test%2Fother'},
    {DATABASE_URL:'invalid'}]) assert.equal(localPoolDemoConfiguration({...local,...override}),null);
  const old=process.env.LOCAL_POOL_DEMO_ENABLED;
  try {
    process.env.LOCAL_POOL_DEMO_ENABLED='0';
    assert.equal(await readLocalPoolDemoScope({query(){assert.fail('disabled scope must never query');}}, {tenantId:'1',locationId:'2'}), null);
  } finally { if(old===undefined)delete process.env.LOCAL_POOL_DEMO_ENABLED;else process.env.LOCAL_POOL_DEMO_ENABLED=old; }
});
