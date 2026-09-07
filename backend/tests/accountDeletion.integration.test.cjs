const test = require('node:test');
const assert = require('node:assert/strict');
const url = process.env.ACCOUNT_DELETION_TEST_DATABASE_URL;

test('account deletion against disposable PostgreSQL', { skip: !url }, async (t) => {
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/getprio_deletion_test', 'Use only the disposable test database');
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname));
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = 'false';
  const db = require('../src/config/db');
  const bcrypt = require('bcryptjs');
  const deletionModule = require('../src/services/accountDeletionService');
  const service = {...deletionModule, ...deletionModule.createAccountDeletionService({refreshQueues: async () => {}})};
  const worker = require('../src/services/accountDeletionWorker');
  const sessions = require('../src/services/sessionService');
  const users = require('../src/repositories/users');
  const { authenticate } = require('../src/middleware/auth');
  const ids = [];
  let scope;
  async function fixture(password = 'correct-password') {
    const suffix = require('node:crypto').randomUUID();
    const {rows: [row]} = await db.pool.query(
      'INSERT INTO users(name,username,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id',
      ['Deletion fixture', suffix, suffix+'@example.invalid', password ? await bcrypt.hash(password, 4) : null]);
    ids.push(row.id);
    return users.findUserById(row.id);
  }
  const auth = req => new Promise((resolve, reject) => authenticate(req, {}, e => e ? reject(e) : resolve(req)));
  try {
    const slug = 'delete-test-' + require('node:crypto').randomUUID();
    const tenant = (await db.pool.query("INSERT INTO tenants(name,slug) VALUES('Deletion fixture',$1) RETURNING id",[slug])).rows[0];
    scope = (await db.pool.query("INSERT INTO store_locations(tenant_id,name,slug) VALUES($1,'Deletion fixture','main') RETURNING id,tenant_id",[tenant.id])).rows[0];
    await t.test('wrong password leaves account and sessions unchanged', async () => {
      const user = await fixture();
      await assert.rejects(service.requestDeletion({userId:user._id,password:'wrong'}), {code:'INVALID_PASSWORD'});
      assert.equal((await users.findUserById(user._id)).deletionRequestedAt, null);
      assert.equal((await db.pool.query('SELECT * FROM account_deletion_requests WHERE user_id=$1',[user._id])).rowCount,0);
    });
    await t.test('atomic revocation, retry, blocked login, evidence gates and final erasure', async () => {
      const user = await fixture();
      const session = await sessions.createAuthSession({user,authMethod:'password'});
      await db.pool.query("INSERT INTO mobile_push_registrations(user_id,installation_id,token,platform) VALUES($1,$2,$2,'ios')",[user._id,'fixture-'+user._id]);
      const result = await service.requestDeletion({userId:user._id,password:'correct-password'});
      assert.equal(result.status,'accepted');
      const retry = await service.requestDeletion({userId:user._id,password:'correct-password'});
      assert.equal(retry.requestId,result.requestId);
      assert.equal((await db.pool.query('SELECT is_active FROM mobile_push_registrations WHERE user_id=$1',[user._id])).rows[0].is_active,false);
      const request = (method,path) => ({method,originalUrl:path,headers:{authorization:'Bearer '+session.accessToken}});
      await assert.rejects(auth(request('GET','/api/account/profile')), {statusCode:401});
      await auth(request('POST','/api/account/delete'));
      await assert.rejects(sessions.createAuthSession({user:await users.findUserById(user._id),authMethod:'password'}), {code:'ACCOUNT_DELETION_PENDING'});
      const load = async () => (await db.pool.query('SELECT * FROM account_deletion_requests WHERE id=$1',[result.requestId])).rows[0];
      assert.equal(await db.withTransaction(async c => worker.processRequest(c,await load())),false);
      // Missing tasks must fail closed, rather than an empty set being treated as complete.
      await db.pool.query('DELETE FROM account_deletion_tasks WHERE request_id=$1',[result.requestId]);
      await db.pool.query("UPDATE account_deletion_requests SET retention_notice='No retained records in fixture.' WHERE id=$1",[result.requestId]);
      assert.equal(await db.withTransaction(async c => worker.processRequest(c,await load())),false);
      for(const kind of service.REQUIRED_TASKS) {
        await db.pool.query("INSERT INTO account_deletion_tasks(request_id,kind,status,evidence) VALUES($1,$2,'completed','fixture evidence')",[result.requestId,kind]);
      }
      assert.equal(await db.withTransaction(async c => worker.processRequest(c,await load())),true);
      assert.equal(await users.findUserById(user._id),null);
      assert.equal((await load()).status,'completed');
      assert.equal((await load()).user_id,null);
      assert.equal((await db.pool.query('SELECT * FROM auth_sessions WHERE user_id=$1',[user._id])).rowCount,0);
    });
    async function ticketFixture(user, status) {
      const key = require('node:crypto').randomUUID();
      const sequence = Math.floor(Math.random()*1000000000)+1000;
      return (await db.pool.query(`INSERT INTO tickets(tenant_id,location_id,user_id,ticket_number,sequence,date_key,
        lookup_code,customer_name,status,queue_date_key) VALUES($1,$2,$3,$4,$5,'2099-01-01',$4,'Deletion fixture',$6,'2099-01-01') RETURNING *`,
        [scope.tenant_id,scope.id,user._id,key,sequence,status])).rows[0];
    }
    await t.test('only waiting and carry-over tickets cancel, once, and events are recorded', async () => {
      const user = await fixture(), other = await fixture();
      const tickets = [];
      for (const status of ['waiting','pending_carry_over','called','served','cancelled']) tickets.push(await ticketFixture(user,status));
      const unrelated = await ticketFixture(other,'waiting');
      await service.requestDeletion({userId:user._id,password:'correct-password'});
      await service.requestDeletion({userId:user._id,password:'correct-password'});
      const rows = (await db.pool.query('SELECT * FROM tickets WHERE id=ANY($1::bigint[]) ORDER BY id',[tickets.map(t=>t.id)])).rows;
      assert.deepEqual(rows.map(t=>t.status),['cancelled','cancelled','called','served','cancelled']);
      assert.ok(rows[0].cancelled_at && rows[0].terminal_at);
      assert.equal(rows[0].current_queue_day_id,null);
      assert.equal(rows[0].status_reason,'account_deletion');
      const events = (await db.pool.query("SELECT * FROM queue_events WHERE ticket_id=ANY($1::bigint[]) AND event_type='ticket_cancelled'",[tickets.map(t=>t.id)])).rows;
      assert.equal(events.length,2);
      assert.deepEqual(events.map(e=>e.from_status).sort(),['pending_carry_over','waiting']);
      assert.equal((await db.pool.query('SELECT status FROM tickets WHERE id=$1',[unrelated.id])).rows[0].status,'waiting');
    });
    await t.test('a concurrent call-next preserves the called ticket', async () => {
      const user = await fixture();
      const ticket = await ticketFixture(user,'waiting');
      const caller = await db.pool.connect();
      await caller.query('BEGIN');
      await caller.query("UPDATE tickets SET status='called' WHERE id=$1",[ticket.id]);
      let started;
      const entered = new Promise(resolve => { started = resolve; });
      const concurrent = service.createAccountDeletionService({
        refreshQueues: async () => {},
        transaction: callback => db.withTransaction(client => callback({
          query(sql, params) {
            if (sql.startsWith('UPDATE tickets SET notify_by_email')) started();
            return client.query(sql, params);
          }
        }))
      });
      const pending = concurrent.requestDeletion({userId:user._id,password:'correct-password'});
      await entered;
      await caller.query('COMMIT');
      caller.release();
      await pending;
      assert.equal((await db.pool.query('SELECT status FROM tickets WHERE id=$1',[ticket.id])).rows[0].status,'called');
    });
    await t.test('later deletion failure rolls ticket cancellation and events back', async () => {
      const user = await fixture();
      const ticket = await ticketFixture(user,'waiting');
      const failing = service.createAccountDeletionService({
        refreshQueues: async () => {},
        transaction: callback => db.withTransaction(client => callback({
          query(sql, params) {
            if (sql.startsWith('DELETE FROM vendor_reviews')) throw Error('cleanup failed');
            return client.query(sql, params);
          }
        }))
      });
      await assert.rejects(failing.requestDeletion({userId:user._id,password:'correct-password'}),/cleanup failed/);
      assert.equal((await db.pool.query('SELECT status FROM tickets WHERE id=$1',[ticket.id])).rows[0].status,'waiting');
      assert.equal((await db.pool.query('SELECT * FROM queue_events WHERE ticket_id=$1',[ticket.id])).rowCount,0);
      assert.equal((await users.findUserById(user._id)).deletionRequestedAt,null);
    });
    await t.test('passwordless deletion requires recent provider authentication', async () => {
      const user = await fixture(null);
      await assert.rejects(service.requestDeletion({userId:user._id,password:''}),{code:'PROVIDER_REAUTH_REQUIRED'});
      await assert.rejects(service.requestDeletion({userId:user._id,session:{authMethod:'google',primaryAuthenticatedAt:new Date(Date.now()-3600000)}}),{code:'PROVIDER_REAUTH_REQUIRED'});
      const receipt = await service.requestDeletion({userId:user._id,session:{authMethod:'google',primaryAuthenticatedAt:new Date()}});
      assert.equal(receipt.status,'accepted');
    });
    await t.test('failure during revocation rolls the request and user state back', async () => {
      const user = await fixture();
      const failing = service.createAccountDeletionService({revokeSessions: async () => {throw Error('simulated failure');}});
      await assert.rejects(failing.requestDeletion({userId:user._id,password:'correct-password'}),/simulated failure/);
      assert.equal((await users.findUserById(user._id)).deletionRequestedAt,null);
      assert.equal((await db.pool.query('SELECT * FROM account_deletion_requests WHERE user_id=$1',[user._id])).rowCount,0);
    });
  } finally {
    await db.pool.query('DELETE FROM account_deletion_requests WHERE user_id=ANY($1::bigint[]) OR (user_id IS NULL AND retention_notice=$2)',[ids,'No retained records in fixture.']);
    await db.pool.query('DELETE FROM tickets WHERE user_id=ANY($1::bigint[])',[ids]);
    await db.pool.query('DELETE FROM users WHERE id=ANY($1::bigint[])',[ids]);
    if (scope) await db.pool.query('DELETE FROM tenants WHERE id=$1',[scope.tenant_id]);
    await db.pool.end();
  }
});
