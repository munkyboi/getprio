const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');
const { waitForDatabaseLock } = require('./helpers/waitForDatabaseLock.cjs');
const { runIdempotentHandler } = require('./helpers/runIdempotentHandler.cjs');
const load = (name, mocks) => loadModuleWithMocks(require.resolve(name), mocks);

test('subscription creation rejects an already-rounded numeric tenant before SQL', async () => {
  const billing = load('../src/repositories/billing', { '../config/db': {}, '../services/subscriptionPlans': {} });
  await assert.rejects(billing.createTenantSubscription({ tenantId: 9007199254740993 }, { client: { query: () => assert.fail('unsafe tenant reached SQL') } }), { code: 'INVALID_TENANT_ID' });
});

const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
test('scheduled execution prepares tenant serialization before legacy child locks', { skip: !databaseUrl, timeout: 45000 }, async t => {
  const url = new URL(databaseUrl); assert.equal(url.hostname, '127.0.0.1'); assert.ok(['/getprio_test', '/getprio_ledger_test'].includes(url.pathname));
  const { Pool } = require('pg');
  const schema = `scheduled_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: databaseUrl, application_name: schema, options: `-c search_path=${schema} -c statement_timeout=5000`, max: 8 });
  let barrier, fault;
  const db = { pool, withTransaction: async callback => {
    const raw = await pool.connect();
    const client = { query: async (sql, values) => {
      if (fault && sql.includes("SET status = 'effective'")) throw new Error('transition completion fault');
      const result = await raw.query(sql, values);
      if (barrier && (barrier.fragment ? sql.includes(barrier.fragment) : sql === 'SELECT id FROM tenants WHERE id = $1 FOR UPDATE')) { barrier.reached(); await barrier.release; }
      return result;
    } };
    try { await raw.query('BEGIN'); const value = await callback(client); await raw.query('COMMIT'); return value; }
    catch (error) { await raw.query('ROLLBACK'); throw error; }
    finally { raw.release(); }
  } };
  const billing = load('../src/repositories/billing', { '../config/db': db, '../services/subscriptionPlans': {} });
  const repository = load('../src/repositories/subscriptionLifecycle', { '../config/db': db, './billing': billing });
  const service = load('../src/services/subscriptionLifecycleService', { '../config/db': db, '../repositories/subscriptionLifecycle': repository, '../repositories/subscriptionPlans': {} });
  const run = () => service.executeDue();
  const reset = async () => {
    fault = false;
    await pool.query(`TRUNCATE tenants,users,subscription_plans,tenant_subscriptions,subscription_transitions,idempotency_records RESTART IDENTITY CASCADE;
      INSERT INTO tenants VALUES(1),(2); INSERT INTO users VALUES(1); INSERT INTO subscription_plans VALUES('free'),('pro');
      INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status,current_period_start,current_period_end) VALUES(1,'pro','active',NOW()-INTERVAL '1 month',NOW()-INTERVAL '1 minute');
      INSERT INTO subscription_transitions(tenant_id,from_subscription_id,from_plan_slug,to_plan_slug,transition_type,status,reason,effective_at) VALUES(1,1,'pro','free','paid_exit','scheduled','Scheduled paid exit',NOW()-INTERVAL '1 second');`);
  };
  const state = async () => ({ subscriptions: (await pool.query('SELECT id::text,tenant_id::text,plan_slug,status FROM tenant_subscriptions ORDER BY id')).rows, transitions: (await pool.query('SELECT id::text,status FROM subscription_transitions ORDER BY id')).rows });
  const wait = fragment => waitForDatabaseLock(pool, schema, fragment);
  try {
    await pool.query(`CREATE SCHEMA ${schema}; CREATE TABLE tenants(id BIGINT PRIMARY KEY); CREATE TABLE users(id BIGINT PRIMARY KEY); CREATE TABLE subscription_plans(slug TEXT PRIMARY KEY);`);
    const init = fs.readFileSync(path.resolve(__dirname, '../../database/init.sql'), 'utf8');
    for (const table of ['tenant_subscriptions','subscription_transitions','idempotency_records']) await pool.query(init.match(new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?\\n\\);`))[0]);
    await t.test('actual executeDue commits one expiry/replacement and repeated execution is empty', async () => {
      await reset(); const result = await run();
      assert.equal(result.transitions[0].status, 'effective'); assert.equal(result.transitions[0].metadata.toSubscriptionId, '2');
      assert.deepEqual((await state()).subscriptions.map(row => row.status), ['expired','active']);
      assert.deepEqual((await run()).transitions, []);
    });
    await t.test('completion fault rolls expiry replacement and transition back and retries', async () => {
      await reset(); const before = await state(); fault = true;
      await assert.rejects(run(), /completion fault/); assert.deepEqual(await state(), before);
      fault = false; await run(); assert.equal((await state()).transitions[0].status, 'effective');
    });
    for (const scenario of [
      { table: 'subscription_transitions', clause: 'id=1', code: 'SUBSCRIPTION_TRANSITION_BUSY' },
      { table: 'tenant_subscriptions', clause: 'id=1', code: 'SUBSCRIPTION_BUSY' },
      { table: 'subscription_plans', clause: "slug='free'", code: 'SUBSCRIPTION_PLAN_BUSY' }
    ]) {
      await t.test(`${scenario.table} legacy-first FK writer gets the tenant after rollback and permits retry`, async () => {
        await reset(); const holder = await pool.connect(); let reached, release;
        const entered = new Promise(resolve => { reached=resolve; }); barrier = { reached, release: new Promise(resolve => { release=resolve; }) };
        try {
          await holder.query('BEGIN'); await holder.query(`SELECT * FROM ${scenario.table} WHERE ${scenario.clause} FOR UPDATE`);
          const pending = assert.rejects(run(), { code: scenario.code }); await entered;
          const write = holder.query("INSERT INTO subscription_transitions(tenant_id,to_plan_slug,transition_type,status,reason,effective_at) VALUES(1,'free','admin_resolution','scheduled','Legacy publisher',NOW()+INTERVAL '1 day')");
          try { await wait('INSERT INTO subscription_transitions'); } finally { barrier=null; release(); }
          await pending; await write; await holder.query('COMMIT');
          assert.equal((await state()).subscriptions.length, 1);
          await run(); assert.equal((await state()).transitions[0].status, 'effective');
        } finally { barrier=null; release(); await holder.query('ROLLBACK'); holder.release(); }
      });
    }
    await t.test('execution-first holds parent through commit and later restricted status wins cleanly', async () => {
      await reset(); const holder=await pool.connect(); let reached,release;
      const entered=new Promise(resolve=>{reached=resolve;}); barrier={reached,release:new Promise(resolve=>{release=resolve;})};
      const execution=run(); execution.catch(()=>{});
      try {
        await entered; await holder.query('BEGIN');
        const update=holder.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE'); update.catch(()=>{});
        try { await wait('SELECT id FROM tenants WHERE id=1'); } finally { barrier=null;release(); }
        await execution; await update; await holder.query("UPDATE tenant_subscriptions SET status='suspended' WHERE tenant_id=1 AND status='active'");await holder.query('COMMIT');
        assert.deepEqual((await state()).subscriptions.map(row=>row.status),['expired','suspended']);
      } finally {barrier=null;release();await holder.query('ROLLBACK');holder.release();}
    });
    await t.test('accepted target plan and predecessor stay locked until mutation commits',async()=>{
      await reset();let reached,release;
      const entered=new Promise(resolve=>{reached=resolve;});barrier={fragment:"SET status = 'expired'",reached,release:new Promise(resolve=>{release=resolve;})};
      const pending=run();pending.catch(()=>{});await entered;
      try{
        for(const sql of ["SELECT slug FROM subscription_plans WHERE slug='free' FOR UPDATE NOWAIT",'SELECT id FROM tenant_subscriptions WHERE id=1 FOR UPDATE NOWAIT','SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT'])await assert.rejects(pool.query(sql),{code:'55P03'});
      }finally{barrier=null;release();}
      await pending;assert.equal((await state()).transitions[0].status,'effective');
    });
    for (const scenario of [
      { name:'moved tenant', sql:'UPDATE subscription_transitions SET tenant_id=2 WHERE id=1', code:'SUBSCRIPTION_TRANSITION_SCOPE_CHANGED' },
      { name:'changed predecessor', sql:'UPDATE subscription_transitions SET from_subscription_id=NULL WHERE id=1', code:'SUBSCRIPTION_REVISION_CONFLICT' },
      { name:'future effective time', sql:"UPDATE subscription_transitions SET effective_at=NOW()+INTERVAL '1 day' WHERE id=1", message:/not ready/ }
    ]) {
      await t.test(`tenant wait revalidates ${scenario.name} before writes`, async () => {
        await reset(); const holder=await pool.connect();
        try {
          await holder.query('BEGIN'); await holder.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
          const pending=assert.rejects(run(),scenario.code?{code:scenario.code}:scenario.message);
          try {await wait('SELECT id FROM tenants WHERE id = $1');await holder.query(scenario.sql);}finally{await holder.query('COMMIT');}
          await pending; assert.equal((await state()).subscriptions[0].status,'active');
        } finally{await holder.query('ROLLBACK');holder.release();}
      });
    }
    for (const status of ['past_due','unpaid','suspended']) {
      await t.test(`scheduled ${status} predecessor cannot be silently converted to Free`, async()=>{
        await reset();await pool.query('UPDATE tenant_subscriptions SET status=$1',[status]);const before=await state();
        await assert.rejects(run(),{code:'RESTRICTED_TO_FREE_DENIED'});assert.deepEqual(await state(),before);
      });
    }
    await t.test('paid upgrade still needs confirmed provider evidence and ambiguous history fails closed', async()=>{
      await reset();await pool.query("UPDATE subscription_transitions SET to_plan_slug='pro',transition_type='upgrade'");
      await assert.rejects(run(),{code:'PAID_PROVIDER_EVIDENCE_REQUIRED'});
      await pool.query("INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status) VALUES(1,'pro','active')");
      await assert.rejects(run(),{code:'SUBSCRIPTION_AMBIGUOUS'});
    });
    await t.test('concurrent already-effective transition is a no-op and confirmed paid evidence is retained',async()=>{
      await reset();await db.withTransaction(async client=>{
        const scheduledContext=await repository.prepareScheduledTransition('1',{client});
        await client.query("UPDATE subscription_transitions SET status='effective' WHERE id=1");
        assert.equal((await repository.executeTransition('1',{client,scheduledContext})).status,'effective');
      });assert.equal((await state()).subscriptions.length,1);
      await reset();const evidence={status:'confirmed',provider:'test',paymentId:'verified-1'};
      await pool.query("UPDATE subscription_transitions SET to_plan_slug='pro',transition_type='upgrade',metadata=$1::jsonb",[JSON.stringify({providerEvidence:evidence})]);
      const result=await run();assert.deepEqual(result.transitions[0].metadata.providerEvidence,evidence);assert.equal((await state()).subscriptions[1].plan_slug,'pro');
    });
    await t.test('opaque scheduled context isolates target/client/reuse and legacy direct execution remains separate', async()=>{
      await reset();
      await db.withTransaction(async client=>{
        const scheduledContext=await repository.prepareScheduledTransition('1',{client});
        for(const [target, selected] of [['2',client],['1',pool]])await assert.rejects(repository.executeTransition(target,{client:selected,scheduledContext}),{code:'SCHEDULED_TRANSITION_CONTEXT_REQUIRED'});
        await repository.executeTransition('1',{client,scheduledContext});
        await assert.rejects(repository.executeTransition('1',{client,scheduledContext}),{code:'SCHEDULED_TRANSITION_CONTEXT_REQUIRED'});
      });
      assert.equal(await db.withTransaction(client=>repository.prepareScheduledTransition('404',{client})),null);
      await assert.rejects(repository.prepareScheduledTransition('1'),/transaction client/);
      await assert.rejects(repository.executeTransition('1',{client:pool,scheduledContext:{}}),{code:'SCHEDULED_TRANSITION_CONTEXT_REQUIRED'});
    });
    await t.test('adjacent BIGINT tenant and predecessor identities create replacement at only the selected tenant',async()=>{
      await reset();const ids=['9007199254740992','9007199254740993'];await pool.query('DELETE FROM subscription_transitions');
      for(const id of ids){await pool.query('INSERT INTO tenants VALUES($1)',[id]);await pool.query("INSERT INTO tenant_subscriptions(id,tenant_id,plan_slug,status) VALUES($1,$1,'pro','active')",[id]);}
      await pool.query("INSERT INTO subscription_transitions(id,tenant_id,from_subscription_id,from_plan_slug,to_plan_slug,transition_type,status,reason,effective_at) VALUES($1,$1,$1,'pro','free','paid_exit','scheduled','Exact tenant exit',NOW()-INTERVAL '1 second')",[ids[1]]);
      await run();const rows=(await state()).subscriptions;
      assert.equal(rows.find(row=>row.id===ids[0]).status,'active');assert.equal(rows.find(row=>row.id===ids[1]).status,'expired');
      assert.equal(rows.find(row=>row.plan_slug==='free').tenant_id,ids[1]);
    });
    await t.test('same-key partial batch retry preserves an earlier commit and replays final successful response',async()=>{
      await reset();await pool.query("INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status) VALUES(2,'pro','active'); INSERT INTO subscription_transitions(tenant_id,from_subscription_id,from_plan_slug,to_plan_slug,transition_type,status,reason,effective_at) VALUES(2,2,'pro','free','paid_exit','scheduled','Second scheduled exit',NOW()-INTERVAL '0.5 seconds')");
      const records=load('../src/repositories/idempotency',{'../config/db':db});
      const claims=load('../src/services/idempotencyService',{'../repositories/idempotency':records});
      const middleware=load('../src/middleware/idempotency',{'../services/idempotencyService':claims,'../repositories/idempotency':records}).requireIdempotency('platform.subscription_transition.execute_due',{retryableErrorCodes:['SUBSCRIPTION_TRANSITION_BUSY','SUBSCRIPTION_PLAN_BUSY','SUBSCRIPTION_BUSY']});
      const request=()=>runIdempotentHandler(middleware,async(_req,res)=>res.json(await run()),{user:{_id:'1'},body:{},get:()=> 'scheduled-retry-1'});
      const holder=await pool.connect();
      try{
        await holder.query('BEGIN');await holder.query('SELECT id FROM tenant_subscriptions WHERE tenant_id=2 FOR UPDATE');
        const busy=await request();assert.equal(busy.body.code,'SUBSCRIPTION_BUSY');assert.equal((await state()).transitions[0].status,'effective');assert.equal((await state()).transitions[1].status,'scheduled');
        await holder.query('COMMIT');const success=await request();assert.equal(success.status,200);assert.equal(success.body.transitions.length,1);
        for(let i=0;i<100;i++){if((await pool.query("SELECT id FROM idempotency_records WHERE status='completed'")).rowCount)break;await new Promise(resolve=>setTimeout(resolve,10));}
        assert.deepEqual(await request(),success);assert.equal((await state()).subscriptions.length,4);
      }finally{await holder.query('ROLLBACK');holder.release();}
    });
  }finally{await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();}
});
