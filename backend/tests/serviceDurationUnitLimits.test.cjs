const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const services = require('../src/repositories/vendorServices');

test('duration unit limits survive catalog writes and migration preserves existing service defaults', {skip:!process.env.RESOURCE_LEDGER_TEST_DATABASE_URL}, async()=>{
  const {Pool}=require('pg');
  const schema='unit_limits_'+randomUUID().replaceAll('-','');
  const pool=new Pool({connectionString:process.env.RESOURCE_LEDGER_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
  const client=await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    const table=fs.readFileSync(path.join(__dirname,'../../database/init.sql'),'utf8').match(/CREATE TABLE vendor_services \([\s\S]*?\n\);/)[0].replace(/ REFERENCES tenants\(id\) ON DELETE CASCADE/g,'');
    await client.query(table);
    // Start from the pre-migration schema to check existing rows and repeated application.
    await client.query('ALTER TABLE vendor_services DROP CONSTRAINT vendor_services_quantity_bounds, DROP COLUMN booking_quantity_min, DROP COLUMN booking_quantity_max');
    await client.query("INSERT INTO vendor_services(tenant_id,name,slug,duration_minutes,allow_booking_quantity) VALUES(1,'Old','old',30,true)");
    const migration=fs.readFileSync(path.join(__dirname,'../../database/migrations/20261012_add_service_duration_unit_limits.sql'),'utf8');
    await client.query(migration); await client.query(migration);
    const old=await services.findServiceByTenantAndSlug('1','old',{client});
    assert.equal(old.bookingQuantityMin,1);assert.equal(old.bookingQuantityMax,24);
    const saved=await services.createService({tenantId:'1',name:'New',slug:'new',durationMinutes:30,allowBookingQuantity:true,bookingQuantityMin:2,bookingQuantityMax:6},{client});
    assert.equal(saved.bookingQuantityMin,2);assert.equal(saved.bookingQuantityMax,6);
    const updated=await services.updateService(saved._id,{bookingQuantityMin:3,bookingQuantityMax:3},{client});
    assert.equal(updated.bookingQuantityMin,3);assert.equal(updated.bookingQuantityMax,3);
    await assert.rejects(services.updateService(saved._id,{bookingQuantityMin:4},{client}),{code:'23514'});
    const reloaded=await services.findServiceByTenantAndId('1',saved._id,{client});
    assert.equal(reloaded.bookingQuantityMin,3);assert.equal(reloaded.bookingQuantityMax,3);
  } finally {await client.query(`DROP SCHEMA ${schema} CASCADE`);client.release();await pool.end();}
});
