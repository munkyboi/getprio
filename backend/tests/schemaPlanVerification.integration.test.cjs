const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.env.NOTIFICATION_INBOX_TEST_DATABASE_URL;

test('deployment verifies published allowance consistency on disposable PostgreSQL', {skip:!url}, async t => {
  const parsed=new URL(url);
  assert.equal(parsed.pathname,'/getprio_inbox_test');
  assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname));
  const {Pool}=require('pg');
  const pool=new Pool({connectionString:url,ssl:false});
  const client=await pool.connect();
  const script=fs.readFileSync(path.resolve(__dirname,'../../scripts/db-verify-schema.sh'),'utf8');
  const start=script.indexOf('DO $$\nDECLARE\n  plan_count integer;');
  assert.ok(start>=0);
  const sql=script.slice(start,script.indexOf('END $$;',start)+'END $$;'.length);
  async function scenario(name,update,expectedError) {
    await t.test(name,async()=>{
      await client.query('SAVEPOINT scenario');
      try {
        if(update) await client.query(update);
        if(expectedError) await assert.rejects(client.query(sql),expectedError);
        else await client.query(sql);
      } finally { await client.query('ROLLBACK TO SAVEPOINT scenario'); }
    });
  }
  try {
    await client.query('BEGIN');
    // Only session-local policy copies are changed. Parallel inbox/account tests
    // and the disposable database's public policy rows remain untouched.
    await client.query('CREATE TEMP TABLE subscription_plans AS TABLE public.subscription_plans');
    await client.query('CREATE TEMP TABLE plan_allowances AS TABLE public.plan_allowances');
    await scenario('seeded published plans pass',null);
    await scenario('published economical booking limit 500 passes without resetting it',`
      UPDATE subscription_plans SET entitlements=jsonb_set(entitlements,'{monthlyServiceBookings}','500'),policy_revision=policy_revision+1 WHERE slug='economical';
      UPDATE plan_allowances SET monthly_limit=500 WHERE plan_slug='economical' AND allowance_key='serviceBookings';
    `);
    await scenario('retired journey fields may be absent without becoming required policy',"UPDATE subscription_plans SET entitlements=entitlements-'monthlyQueueEmailJourneys' WHERE slug='free'");
    await scenario('historical null email fields do not reinstate the retired quota',"UPDATE subscription_plans SET entitlements=jsonb_set(entitlements,'{monthlyQueueEmailJourneys}','null') WHERE slug='free'");
    await scenario('retired normalized allowance drift is ignored',"UPDATE plan_allowances SET monthly_limit=1 WHERE plan_slug='free' AND allowance_key='queueEmailJourneys'");
    await scenario('normalized allowance drift still fails',"UPDATE plan_allowances SET monthly_limit=501 WHERE plan_slug='economical' AND allowance_key='serviceBookings'",/Published plan allowances/);
    await scenario('missing required allowance fails',"DELETE FROM plan_allowances WHERE plan_slug='free' AND allowance_key='queueTickets'",/Published plan allowances/);
    await scenario('invalid entitlement type fails',`UPDATE subscription_plans SET entitlements=jsonb_set(entitlements,'{monthlyTickets}','"500"') WHERE slug='free'`,/Published plan allowances/);
    await scenario('missing entitlement fails',"UPDATE subscription_plans SET entitlements=entitlements-'monthlyServiceBookings' WHERE slug='free'",/Published plan allowances/);
    await scenario('negative limit fails even if representations agree',`
      UPDATE subscription_plans SET entitlements=jsonb_set(entitlements,'{monthlyServiceBookings}','-1') WHERE slug='free';
      UPDATE plan_allowances SET monthly_limit=-1 WHERE plan_slug='free' AND allowance_key='serviceBookings';
    `,/Published plan allowances/);
    await scenario('missing plan fails',"DELETE FROM subscription_plans WHERE slug='pro'",/Expected all four/);
    await scenario('paid price protection remains enforced',"UPDATE subscription_plans SET monthly_amount_cents=1 WHERE slug='pro'",/Subscription price invariants/);
  } finally {
    await client.query('ROLLBACK'); client.release(); await pool.end();
  }
});
