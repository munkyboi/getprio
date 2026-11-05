const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function createStaffWriterFixture(databaseUrl, label) {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_test', '/getprio_ledger_test'].includes(url.pathname));
  const schema = `staff_writer_${randomUUID().replaceAll('-', '')}`;
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, application_name: schema, max: 8 });
  const fixture = { fault: null, barrier: null };
  const wrappedPool = { connect: async () => {
    const client = await pool.connect();
    return { release: () => client.release(), query: async (sql, args) => {
      if (fixture.fault && sql.includes(fixture.fault)) throw new Error(`${label} writer fault`);
      const result = await client.query(sql, args);
      if (fixture.barrier && sql.includes(fixture.barrier.marker)) { fixture.barrier.reached(); await fixture.barrier.release; }
      return result;
    } };
  } };
  const revisions = async () => (await pool.query('SELECT location_id::text,revision::text FROM resource_ledger_scopes ORDER BY location_id')).rows;
  const types = {id:'BIGINT PRIMARY KEY',roles:'TEXT[]',email_verified:'BOOLEAN'};
  const source = fs.readFileSync(path.resolve(__dirname,'../../src/repositories/users.js'),'utf8');
  const userColumns = source.match(/const USER_COLUMNS = `([\s\S]*?)`;/)[1].split(',').map(column => column.trim().replace('users.','')).map(name => `${name} ${types[name] || 'TEXT'}`).join(',');
  async function reset() {
    fixture.fault=null; fixture.barrier=null;
    await pool.query(`TRUNCATE users,tenants,store_locations,tenant_memberships,tenant_membership_locations,
      service_counters,service_counter_assignments,subscription_plans,tenant_subscriptions,tickets,
      booking_bundle_items,location_resource_pools,resource_ledger_scopes,resource_allocations,
      resource_ledger_reservations,resource_ledger_commands,staff_access_email_outbox RESTART IDENTITY CASCADE;
      INSERT INTO users(id,roles,name,email,email_verified) VALUES(1,'{}','Owner','owner@example.test',TRUE),(2,'{}','Staff','staff@example.test',TRUE),(3,'{}','Other','other@example.test',TRUE);
      INSERT INTO tenants VALUES(1),(2);
      INSERT INTO store_locations(id,tenant_id) VALUES(10,1),(11,1),(12,1),(20,2);
      INSERT INTO tenant_memberships VALUES(1,1,1,'owner',TRUE),(2,2,1,'staff',TRUE),(3,2,2,'staff',TRUE);
      INSERT INTO tenant_membership_locations VALUES(2,11,'explicit',1),(3,20,'explicit',1);
      INSERT INTO service_counters(id,tenant_id,location_id,name,slug,is_active) VALUES(1,1,10,'A','a',TRUE),(2,1,10,'B','b',TRUE),(3,2,20,'Other','other',TRUE);
      SELECT setval(pg_get_serial_sequence('service_counters','id'),3);
      INSERT INTO service_counter_assignments VALUES(1,2),(2,2),(3,2);
      INSERT INTO resource_ledger_scopes(tenant_id,location_id) VALUES(1,10),(1,11),(1,12),(2,20);
      INSERT INTO subscription_plans VALUES('pro','{"counters":10}');
      INSERT INTO tenant_subscriptions VALUES(1,1,'active','pro','{}',NOW());`);
  }
  async function transaction() { const client=await pool.connect(); await client.query('BEGIN'); return client; }
  async function waiter(fragment) {
    for(let i=0;i<300;i++) {
      if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE $2",[schema,`%${fragment}%`])).rowCount) return;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.fail(`No lock waiter for ${fragment}`);
  }
  function hold(marker) {
    let reached, release;
    const entered=new Promise(resolve=>reached=resolve);
    const pending=new Promise(resolve=>release=resolve);
    fixture.barrier={marker,reached,release:pending};
    return {entered, release:()=>{fixture.barrier=null;release();}};
  }
  async function initialize() {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE FUNCTION set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $$;
      CREATE TABLE users(${userColumns});
      CREATE TABLE oauth_accounts(user_id BIGINT,provider TEXT,provider_user_id TEXT,email TEXT,email_verified BOOLEAN,linked_at TIMESTAMPTZ);
      CREATE TABLE tenants(id BIGINT PRIMARY KEY);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),is_active BOOLEAN DEFAULT TRUE,UNIQUE(id,tenant_id));
      CREATE TABLE tenant_memberships(id BIGINT PRIMARY KEY,user_id BIGINT REFERENCES users(id),tenant_id BIGINT REFERENCES tenants(id),role TEXT,is_active BOOLEAN);
      CREATE TABLE tenant_membership_locations(tenant_membership_id BIGINT REFERENCES tenant_memberships(id) ON DELETE CASCADE,location_id BIGINT REFERENCES store_locations(id),assignment_source TEXT,assigned_by_user_id BIGINT REFERENCES users(id),UNIQUE(tenant_membership_id,location_id));
      CREATE TABLE service_counters(id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),location_id BIGINT REFERENCES store_locations(id),name TEXT NOT NULL,slug TEXT NOT NULL,is_active BOOLEAN,created_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(location_id,slug));
      CREATE TABLE service_counter_assignments(counter_id BIGINT REFERENCES service_counters(id) ON DELETE CASCADE,user_id BIGINT REFERENCES users(id),PRIMARY KEY(counter_id,user_id));
      CREATE TABLE subscription_plans(slug TEXT PRIMARY KEY,entitlements JSONB);
      CREATE TABLE tenant_subscriptions(id BIGINT PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),status TEXT,plan_slug TEXT,entitlements JSONB,updated_at TIMESTAMPTZ);
      CREATE TABLE tickets(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,status TEXT,service_counter_id BIGINT REFERENCES service_counters(id) ON DELETE SET NULL,UNIQUE(id,tenant_id,location_id));
      CREATE TABLE booking_bundle_items(id BIGINT PRIMARY KEY,booking_id BIGINT,tenant_id BIGINT,location_id BIGINT);
      CREATE TABLE vendor_services(id BIGINT PRIMARY KEY,tenant_id BIGINT,UNIQUE(id,tenant_id));
      CREATE TABLE location_services(location_id BIGINT,service_id BIGINT,UNIQUE(location_id,service_id));`);
    for (const name of ['20261003_add_resource_capacity_foundation.sql', '20261007_add_resource_ledger_foundation.sql']) {
      await pool.query(fs.readFileSync(path.resolve(__dirname, '../../../database/migrations', name), 'utf8'));
    }
    await pool.query(fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/20260912_add_staff_access_email_outbox.sql'),'utf8'));
  }
  async function dispose() { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); }
  return Object.assign(fixture, { pool, wrappedPool, revisions, reset, transaction, waiter, hold, initialize, dispose });
}
module.exports = { createStaffWriterFixture };
