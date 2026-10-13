const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareTestDatabase } = require('./prepare-test-database.cjs');

for (const [variable, database] of [
  ['ACCOUNT_DELETION_TEST_DATABASE_URL', 'getprio_deletion_test'],
  ['NOTIFICATION_INBOX_TEST_DATABASE_URL', 'getprio_inbox_test']
]) {
  test(`${variable} rejects nonlocal or mismatched databases before connecting`, async () => {
    class UnexpectedClient { constructor() { assert.fail('Unsafe target must not create a database client'); } }
    for (const connectionString of [
      `postgresql://test@database.example.invalid/${database}`,
      'postgresql://test@127.0.0.1/prio_queue',
      `postgresql://test@127.0.0.1/${database === 'getprio_inbox_test' ? 'getprio_deletion_test' : 'getprio_inbox_test'}`
    ]) {
      await assert.rejects(prepareTestDatabase(variable, {connectionString, clientClass:UnexpectedClient}), /Only a local/);
    }
  });
  test(`${variable} creates its fixed target and applies bootstrap then migrations`, async () => {
    const clients=[];
    class FakeClient {
      constructor({connectionString}) { this.url=new URL(connectionString); this.sql=[]; clients.push(this); }
      async connect() {}
      async query(sql) { this.sql.push(sql); }
      async end() { this.closed=true; }
    }
    await prepareTestDatabase(variable, {connectionString:`postgresql://test@localhost/${database}`,clientClass:FakeClient});
    assert.equal(clients[0].url.pathname,'/postgres');
    assert.deepEqual(clients[0].sql,[`CREATE DATABASE ${database}`]);
    assert.equal(clients[1].url.pathname,`/${database}`);
    assert.match(clients[1].sql[0],/Clean-slate bootstrap/);
    assert.ok(clients[1].sql.length>100);
    assert.match(clients[1].sql.at(-1),/CREATE TABLE customer_notification_inbox/);
    assert.ok(clients.every(client=>client.closed));
  });
}

test('an arbitrary environment variable cannot select a disposable database', async () => {
  await assert.rejects(prepareTestDatabase('DATABASE_URL',{connectionString:'postgresql://test@localhost/prio_queue'}),/Unsupported/);
});

test('existing disposable database is reused, and migration errors close both clients', async () => {
  const clients=[];
  class FakeClient {
    constructor() { this.admin=clients.length===0; clients.push(this); }
    async connect() {}
    async query() { throw this.admin ? Object.assign(new Error('already exists'),{code:'42P04'}) : new Error('migration failed'); }
    async end() { this.closed=true; }
  }
  await assert.rejects(prepareTestDatabase('NOTIFICATION_INBOX_TEST_DATABASE_URL',{
    connectionString:'postgresql://test@localhost/getprio_inbox_test',clientClass:FakeClient
  }),/migration failed/);
  assert.ok(clients.every(client=>client.closed));
});
