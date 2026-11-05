const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');
const { waitForDatabaseLock } = require('./helpers/waitForDatabaseLock.cjs');
const load = (name, mocks) => loadModuleWithMocks(require.resolve(name), mocks);

function vendorCompletionHandler(mocks) {
  const routes=[];
  const router=new Proxy({}, {get:(_,method)=>(...args)=>routes.push({method,args})});
  const fallback=new Proxy({}, {get:()=>()=>undefined});
  const imports={express:{Router:()=>router},'express-rate-limit':{rateLimit:()=>()=>{},ipKeyGenerator:value=>value},'../middleware/asyncHandler':value=>value,
    '../middleware/auth':{authenticate(){}},'../services/contentModeration':{assertPublicTextFieldsAllowed(){}},
    '../services/authService':{normalizeEmail:value=>String(value||'').trim().toLowerCase(),getRequestIp:req=>req.ip,getUserAgent:()=> 'fixture'},
    '../utils/phone':require('../src/utils/phone'),
    '../services/sandboxTestAccountAccess':require('../src/services/sandboxTestAccountAccess'),
    '../services/mfaService':{userRequiresPrivilegedMfa:require('../src/services/mfaService').userRequiresPrivilegedMfa},
    '../services/browserSessionService':{issueBrowserSession:()=>({csrfToken:'fixture'})},
    '../services/authUserPayloadService':{buildBaseAuthUserPayload:async user=>({_id:user._id,roles:user.roles})},
    '../config/env':{accessTokenTtlMinutes:15},...mocks};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../src/routes/authRoutes.js'),'utf8'),{require:name=>imports[name]||fallback,module:{exports:{}},process});
  return routes.find(({method,args})=>method==='post'&&args[0]==='/register/vendor/complete').args.at(-1);
}

const databaseUrl=process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
test('Free assignment and authenticated vendor setup compose current actor and parent locks', {skip:!databaseUrl,timeout:45000},async t=>{
  const url=new URL(databaseUrl);assert.equal(url.hostname,'127.0.0.1');assert.ok(['/getprio_test','/getprio_ledger_test'].includes(url.pathname));
  const {Pool}=require('pg');const schema=`free_${randomUUID().replaceAll('-','')}`;
  const pool=new Pool({connectionString:databaseUrl,application_name:schema,options:`-c search_path=${schema} -c statement_timeout=5000`,max:8});
  let barrier,fault;
  const db={pool,withTransaction:async callback=>{
    const raw=await pool.connect();const client={query:async(sql,values)=>{
      if(fault===true&&sql.includes("SET status = 'effective'"))throw new Error('Free completion fault');
      const result=await raw.query(sql,values);
      if(fault==='profile'&&sql.startsWith('UPDATE users SET roles'))throw new Error('Profile completion fault');
      if(barrier&&sql.includes(barrier.fragment)){barrier.reached();await barrier.release;}
      return result;
    }};
    try{await raw.query('BEGIN');const result=await callback(client);await raw.query('COMMIT');return result;}
    catch(error){await raw.query('ROLLBACK');throw error;}finally{raw.release();}
  }};
  const billing=load('../src/repositories/billing',{'../config/db':db,'../services/subscriptionPlans':{}});
  const repository=load('../src/repositories/subscriptionLifecycle',{'../config/db':db,'./billing':billing});
  const lifecycle=load('../src/services/subscriptionLifecycleService',{'../config/db':db,'../repositories/subscriptionLifecycle':repository,'../repositories/subscriptionPlans':{}});
  const currentUser=async(id,client)=>{
    const row=(await client.query('SELECT * FROM users WHERE id=$1',[String(id)])).rows[0];
    return row?{_id:String(row.id),roles:row.roles,name:'Fixture account',email:'owner@example.test',phone:row.phone,mfaEnabled:row.mfa_enabled,isSandboxTestAccount:row.is_sandbox_test_account,sandboxTestAccountExpiresAt:row.sandbox_test_account_expires_at,tenantMemberships:[]}:null;
  };
  let sessions=0,delivery=0;
  const handler=vendorCompletionHandler({
    '../config/db':db,'../services/subscriptionLifecycleService':lifecycle,
    '../repositories/businessCategories':{resolve:async()=>({id:'1',name:'Services'})},
    '../repositories/tenants':{
      findTenantBySlug:async(slug,{client})=>(await client.query('SELECT * FROM tenants WHERE slug=$1',[slug])).rows[0]||null,
      createTenant:async(data,{client})=>{const row=(await client.query("INSERT INTO tenants(slug,vendor_approval_status,contact_phone) VALUES($1,'approved',$2) RETURNING id,slug",[data.slug,data.contactPhone])).rows[0];return {_id:String(row.id),slug:row.slug};}
    },
    '../repositories/users':{
      findUserById:(id,{client})=>currentUser(id,client),findUserByEmail:async()=>null,findUserByUsername:async()=>null,
      addTenantMembership:async(id,tenant,role,{client})=>client.query('INSERT INTO tenant_memberships(user_id,tenant_id,role) VALUES($1,$2,$3)',[String(id),String(tenant),role]),
      updateUser:async(id,input,{client})=>{await client.query('UPDATE users SET roles=$2,phone=$3 WHERE id=$1',[String(id),Array.from(input.roles),input.phone]);return currentUser(id,client);}
    },
    '../services/sessionService':{createAuthSession:async()=>{sessions++;return {session:{expiresAt:new Date(Date.now()+60000)}};}},
    '../services/welcomeEmailService':{sendWelcomeEmail:async()=>{delivery++;}}
  });
  const invoke=async(slug='new-vendor',options={})=>{
    const req={body:{tenantName:'Fixture vendor',tenantSlug:slug,category:'Services',name:'Fixture Owner',username:'fixture_owner',email:'owner@example.test'},
      user:{_id:options.actorId||'1',name:'Fixture Owner',username:'fixture_owner',phone:'09171234567',email:'owner@example.test',roles:options.capturedRoles||['platform_admin']},
      headers:{host:'api.getprio.online'},originalUrl:'/api/auth/register/vendor/complete',auth:{session:{mfaVerifiedAt:options.mfaVerifiedAt}},ip:'127.0.0.1'};
    let body;const res={status(){return this;},json(value){body=value;}};
    await handler(req,res);return body;
  };
  const reset=async()=>{
    fault=false;sessions=0;delivery=0;
    await pool.query(`TRUNCATE tenants,users,subscription_plans,tenant_subscriptions,subscription_transitions,tenant_memberships RESTART IDENTITY CASCADE;
      INSERT INTO tenants(slug,vendor_approval_status) VALUES('fixture','approved'),('neighbor','approved');
      INSERT INTO users(id,roles,phone) VALUES(1,ARRAY['customer'],'09179876543'); INSERT INTO subscription_plans VALUES('free'),('pro');`);
  };
  const state=async()=>({subscriptions:(await pool.query('SELECT tenant_id::text,plan_slug,status FROM tenant_subscriptions ORDER BY id')).rows,transitions:(await pool.query('SELECT tenant_id::text,status,created_by_user_id::text FROM subscription_transitions ORDER BY id')).rows});
  const wait = fragment => waitForDatabaseLock(pool, schema, fragment);
  try{
    await pool.query(`CREATE SCHEMA ${schema};CREATE TABLE tenants(id BIGSERIAL PRIMARY KEY,slug TEXT UNIQUE,vendor_approval_status TEXT,contact_phone TEXT);
      CREATE TABLE users(id BIGINT PRIMARY KEY,roles TEXT[],phone TEXT,deletion_requested_at TIMESTAMPTZ,platform_access_suspended_at TIMESTAMPTZ,mfa_enabled BOOLEAN DEFAULT FALSE,is_sandbox_test_account BOOLEAN DEFAULT FALSE,sandbox_test_account_expires_at TIMESTAMPTZ);
      CREATE TABLE subscription_plans(slug TEXT PRIMARY KEY); CREATE TABLE tenant_memberships(user_id BIGINT REFERENCES users(id),tenant_id BIGINT REFERENCES tenants(id),role TEXT);`);
    const init=fs.readFileSync(path.resolve(__dirname,'../../database/init.sql'),'utf8');
    for(const table of ['tenant_subscriptions','subscription_transitions'])await pool.query(init.match(new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?\\n\\);`))[0]);
    await t.test('standalone null actor commits one Free assignment and concurrent retries retain history',async()=>{
      await reset();const results=await Promise.all([lifecycle.assignFreeToApprovedTenant('1'),lifecycle.assignFreeToApprovedTenant('1')]);
      assert.equal(results.filter(row=>row.assigned).length,1);assert.equal(results.find(row=>!row.assigned).reason,'subscription_history_exists');
      assert.deepEqual((await state()).subscriptions,[{tenant_id:'1',plan_slug:'free',status:'active'}]);assert.equal((await state()).transitions[0].created_by_user_id,null);
    });
    await t.test('missing/unapproved tenants and every existing history preserve prior behavior',async()=>{
      await reset();await assert.rejects(lifecycle.assignFreeToApprovedTenant('404'),{statusCode:404});
      await pool.query("UPDATE tenants SET vendor_approval_status='pending' WHERE id=1");assert.equal((await lifecycle.assignFreeToApprovedTenant('1')).reason,'vendor_not_approved');
      for(const status of ['active','past_due','unpaid','suspended','expired','canceled']){
        await reset();await pool.query("INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status) VALUES(1,'pro',$1)",[status]);
        assert.equal((await lifecycle.assignFreeToApprovedTenant('1')).reason,'subscription_history_exists');assert.equal((await state()).subscriptions[0].status,status);
      }
    });
    await t.test('completion failure rolls back Free history and outer composed signup state and retries',async()=>{
      await reset();fault=true;await assert.rejects(invoke(),/Free completion fault/);
      assert.deepEqual(await state(),{subscriptions:[],transitions:[]});assert.equal((await pool.query('SELECT count(*)::int n FROM tenants')).rows[0].n,2);assert.equal((await pool.query('SELECT count(*)::int n FROM tenant_memberships')).rows[0].n,0);assert.equal(sessions,0);assert.equal(delivery,0);
      fault=false;await invoke();assert.equal((await state()).transitions[0].status,'effective');
    });
    await t.test('profile failure reverses completed Free assignment membership and role mutation',async()=>{
      await reset();fault='profile';await assert.rejects(invoke(),/Profile completion fault/);
      assert.deepEqual(await state(),{subscriptions:[],transitions:[]});assert.equal((await pool.query('SELECT count(*)::int n FROM tenants')).rows[0].n,2);
      assert.equal((await pool.query('SELECT count(*)::int n FROM tenant_memberships')).rows[0].n,0);assert.deepEqual((await pool.query('SELECT roles FROM users WHERE id=1')).rows[0].roles,['customer']);assert.equal(sessions,0);assert.equal(delivery,0);
      fault=false;await invoke();assert.equal((await state()).subscriptions.length,1);
    });
    for(const scenario of [
      {table:'subscription_plans',predicate:"slug='free'",code:'SUBSCRIPTION_PLAN_BUSY'},
      {table:'users',predicate:'id=1',code:'SUBSCRIPTION_ACTOR_BUSY'}
    ]){
      await t.test(`${scenario.table} legacy first releases a blocked tenant FK and permits retry`,async()=>{
        await reset();const holder=await pool.connect();let reached,release;
        const entered=new Promise(resolve=>{reached=resolve;});barrier={fragment:'SELECT id, vendor_approval_status FROM tenants',reached,release:new Promise(resolve=>{release=resolve;})};
        try{
          await holder.query('BEGIN');await holder.query(`SELECT * FROM ${scenario.table} WHERE ${scenario.predicate} FOR UPDATE`);
          const pending=assert.rejects(lifecycle.assignFreeToApprovedTenant('1',{actorId:'1'}),{code:scenario.code});await entered;
          const child=holder.query("INSERT INTO tenant_memberships(user_id,tenant_id,role) VALUES(1,1,'owner')");child.catch(()=>{});
          try{await wait('INSERT INTO tenant_memberships');}finally{barrier=null;release();}
          await pending;await child;await holder.query('COMMIT');assert.equal((await state()).subscriptions.length,0);
          await lifecycle.assignFreeToApprovedTenant('1',{actorId:'1'});assert.equal((await state()).subscriptions.length,1);
        }finally{barrier=null;release();await holder.query('ROLLBACK');holder.release();}
      });
    }
    for(const scenario of [
      {name:'approval changed',sql:"UPDATE tenants SET vendor_approval_status='suspended' WHERE id=1",reason:'vendor_not_approved'},
      {name:'history inserted',sql:"INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status) VALUES(1,'pro','suspended')",reason:'subscription_history_exists'}
    ]){
      await t.test(`tenant wait rechecks ${scenario.name} before Free assignment`,async()=>{
        await reset();const holder=await pool.connect();try{
          await holder.query('BEGIN');await holder.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
          const pending=lifecycle.assignFreeToApprovedTenant('1');pending.catch(()=>{});
          try{await wait('SELECT id, vendor_approval_status FROM tenants');await holder.query(scenario.sql);}finally{await holder.query('COMMIT');}
          assert.equal((await pending).reason,scenario.reason);assert.equal((await state()).transitions.length,0);
        }finally{await holder.query('ROLLBACK');holder.release();}
      });
    }
    await t.test('held subscription history fails fast without replacement',async()=>{
      await reset();await pool.query("INSERT INTO tenant_subscriptions(tenant_id,plan_slug,status) VALUES(1,'pro','active')");const holder=await pool.connect();
      try{await holder.query('BEGIN');await holder.query('SELECT id FROM tenant_subscriptions WHERE tenant_id=1 FOR UPDATE');await assert.rejects(lifecycle.assignFreeToApprovedTenant('1'),{code:'SUBSCRIPTION_BUSY'});await holder.query('COMMIT');assert.equal((await lifecycle.assignFreeToApprovedTenant('1')).assigned,false);}finally{await holder.query('ROLLBACK');holder.release();}
    });
    await t.test('Free assignment first holds actor mutation plan and parent until composed commit',async()=>{
      await reset();await db.withTransaction(async client=>{
        await lifecycle.assignFreeToApprovedTenant('1',{actorId:'1'},{client});
        for(const sql of ['SELECT id FROM users WHERE id=1 FOR UPDATE NOWAIT',"SELECT slug FROM subscription_plans WHERE slug='free' FOR UPDATE NOWAIT",'SELECT id FROM tenants WHERE id=1 FOR UPDATE NOWAIT'])await assert.rejects(pool.query(sql),{code:'55P03'});
        await client.query("UPDATE users SET phone='09170000000' WHERE id=1");
      });assert.equal((await state()).subscriptions.length,1);
    });
    await t.test('concurrent vendor completions serialize actor before a new tenant and never upgrade shared actor locks',async()=>{
      await reset();let reached,release;
      const entered=new Promise(resolve=>{reached=resolve;});barrier={fragment:'FOR NO KEY UPDATE NOWAIT',reached,release:new Promise(resolve=>{release=resolve;})};
      const first=invoke('first-vendor');first.catch(()=>{});await entered;barrier=null;
      try{await assert.rejects(invoke('second-vendor'),{code:'SUBSCRIPTION_ACTOR_BUSY'});}finally{release();}
      await first;await invoke('second-vendor');assert.equal((await state()).subscriptions.length,2);
      assert.equal((await pool.query('SELECT count(*)::int n FROM tenant_memberships')).rows[0].n,2);
    });
    await t.test('current roles and phone replace stale request fallback data without restoring revoked admin',async()=>{
      await reset();const result=await invoke();assert.deepEqual(Array.from(result.user.roles),['customer','vendor']);
      const user=(await pool.query('SELECT roles,phone FROM users WHERE id=1')).rows[0];assert.deepEqual(user.roles,['customer','vendor']);assert.equal(user.phone,'09179876543');assert.equal((await pool.query("SELECT contact_phone FROM tenants WHERE slug='new-vendor'")).rows[0].contact_phone,user.phone);assert.equal(sessions,1);assert.equal(delivery,1);
    });
    for(const scenario of [
      {sql:'UPDATE users SET deletion_requested_at=NOW()',code:401},
      {sql:'UPDATE users SET platform_access_suspended_at=NOW()',code:'ACCOUNT_ACCESS_SUSPENDED'},
      {sql:"UPDATE users SET roles=ARRAY['developer']",code:'DEVELOPER_PORTAL_ONLY'},
      {sql:"UPDATE users SET roles=ARRAY['platform_admin']",code:'MFA_ENROLLMENT_REQUIRED'},
      {sql:"UPDATE users SET roles=ARRAY['platform_admin'],mfa_enabled=TRUE",code:'MFA_VERIFICATION_REQUIRED'},
      {sql:"UPDATE users SET is_sandbox_test_account=TRUE,sandbox_test_account_expires_at=NOW()+INTERVAL '1 day'",code:'SANDBOX_TEST_ACCOUNT_ONLY'}
    ]){
      await t.test(`current setup eligibility denies ${scenario.code} before domain writes`,async()=>{
        await reset();await pool.query(scenario.sql);await assert.rejects(invoke(),typeof scenario.code==='number'?{statusCode:scenario.code}:{code:scenario.code});assert.deepEqual(await state(),{subscriptions:[],transitions:[]});assert.equal((await pool.query('SELECT count(*)::int n FROM tenants')).rows[0].n,2);assert.equal(sessions,0);assert.equal(delivery,0);
      });
    }
    await t.test('current privileged user with MFA remains supported without dropping granted roles',async()=>{
      await reset();await pool.query("UPDATE users SET roles=ARRAY['platform_admin'],mfa_enabled=TRUE");const result=await invoke('privileged-vendor',{capturedRoles:['customer'],mfaVerifiedAt:new Date()});assert.ok(result.user.roles.includes('platform_admin'));assert.ok(result.user.roles.includes('vendor'));
    });
    await t.test('actor deletion winning makes the same authenticated setup attempt retry ineligible',async()=>{
      await reset();const holder=await pool.connect();try{await holder.query('BEGIN');await holder.query('SELECT id FROM users WHERE id=1 FOR UPDATE');await assert.rejects(invoke(),{code:'SUBSCRIPTION_ACTOR_BUSY'});await holder.query('UPDATE users SET deletion_requested_at=NOW() WHERE id=1');await holder.query('COMMIT');await assert.rejects(invoke(),{statusCode:401});assert.equal((await state()).subscriptions.length,0);}finally{await holder.query('ROLLBACK');holder.release();}
    });
    await t.test('exact adjacent tenant and actor IDs stay bound and unsafe numbers fail before SQL',async()=>{
      await reset();const ids=['9007199254740992','9007199254740993'];
      for(const id of ids){await pool.query("INSERT INTO tenants(id,slug,vendor_approval_status) VALUES($1,$2,'approved')",[id,id]);await pool.query("INSERT INTO users(id,roles) VALUES($1,ARRAY['customer'])",[id]);}
      await lifecycle.assignFreeToApprovedTenant(ids[1],{actorId:ids[1]});const row=(await state()).transitions[0];assert.equal(row.tenant_id,ids[1]);assert.equal(row.created_by_user_id,ids[1]);assert.equal((await state()).subscriptions[0].tenant_id,ids[1]);
      const client={query:()=>assert.fail('unsafe identity reached SQL')};await assert.rejects(lifecycle.assignFreeToApprovedTenant(9007199254740993,{}, {client}),{code:'INVALID_TENANT_ID'});await assert.rejects(lifecycle.prepareFreeAssignmentActor(9007199254740993,{client}),{code:'INVALID_ACTOR_ID'});await assert.rejects(lifecycle.prepareFreeAssignmentActor('1'),/transaction client/);await assert.rejects(lifecycle.prepareFreeAssignmentActor(null,{client}),{statusCode:401});
    });
  }finally{await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();}
});
