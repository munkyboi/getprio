const test = require('node:test');
const assert = require('node:assert/strict');
const { createStaffWriterFixture } = require('./helpers/staffWriterFixture.cjs');
const { createStaffAccessResourceService } = require('../src/services/staffAccessResourceService');
const { createCounterConfigurationService } = require('../src/services/counterConfigurationService');
const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;

test('staff access edits and resource revisions commit atomically on PostgreSQL', { skip: !databaseUrl }, async t => {
  const fixture = createStaffWriterFixture(databaseUrl, 'access');
  const { pool, wrappedPool, revisions, reset, transaction, waiter, hold } = fixture;
  const service = createStaffAccessResourceService({ pool: wrappedPool });
  const context = { tenant: { _id: '1', name: 'Studio' }, userId: '2', actorId: '1' };
  const update = body => service.update({ ...context, body });
  try {
    await fixture.initialize();
    await t.test('status changes revise explicit and counter scopes once with atomic notice',async()=>{
      await reset(); await update({isActive:false});
      assert.deepEqual((await revisions()).map(r=>r.revision),['2','2','1','1']);
      assert.equal((await pool.query('SELECT is_active FROM tenant_memberships WHERE id=2')).rows[0].is_active,false);
      assert.equal((await pool.query('SELECT 1 FROM service_counter_assignments')).rowCount,3);
      const notices=(await pool.query('SELECT payload FROM staff_access_email_outbox')).rows;
      assert.equal(notices.length,1); assert.equal(notices[0].payload.after.active,false);
      await update({isActive:false});
      assert.deepEqual((await revisions()).map(r=>r.revision),['2','2','1','1']);
      assert.equal((await pool.query('SELECT 1 FROM staff_access_email_outbox')).rowCount,1);
    });
    await t.test('grant edits affect removed and added branches while counter grants are preserved',async()=>{
      await reset(); await update({assignedLocationIds:['12']});
      assert.deepEqual((await revisions()).map(r=>r.revision),['1','2','2','1']);
      assert.deepEqual((await pool.query('SELECT location_id::text FROM tenant_membership_locations WHERE tenant_membership_id=2')).rows,[{location_id:'12'}]);
      assert.equal((await pool.query('SELECT 1 FROM service_counter_assignments')).rowCount,3);
      await update({assignedLocationIds:['12','12']});
      assert.deepEqual((await revisions()).map(r=>r.revision),['1','2','2','1']);
    });
    await t.test('administrator promotion and demotion revise all current vendor branches',async()=>{
      await reset(); await update({role:'admin'});
      assert.deepEqual((await revisions()).map(r=>r.revision),['2','2','2','1']);
      await update({role:'staff'});
      assert.deepEqual((await revisions()).map(r=>r.revision),['3','3','3','1']);
    });
    await t.test('same grants preserve source and inactive grant replacement remains no-op',async()=>{
      await reset(); await pool.query("UPDATE tenant_membership_locations SET assignment_source='counter' WHERE tenant_membership_id=2");
      await update({role:'staff',isActive:true,assignedLocationIds:['11']});
      assert.equal((await pool.query('SELECT assignment_source FROM tenant_membership_locations WHERE tenant_membership_id=2')).rows[0].assignment_source,'counter');
      assert.deepEqual((await revisions()).map(r=>r.revision),['1','1','1','1']);
      await update({isActive:false,assignedLocationIds:['12']});
      assert.equal((await pool.query('SELECT location_id::text FROM tenant_membership_locations WHERE tenant_membership_id=2')).rows[0].location_id,'11');
    });
    await t.test('identical grant save still validates active branches',async()=>{
      await reset();await pool.query('UPDATE store_locations SET is_active=FALSE WHERE id=11');
      await assert.rejects(update({assignedLocationIds:['11']}),{statusCode:400});
      assert.deepEqual((await revisions()).map(r=>r.revision),['1','1','1','1']);
    });
    await t.test('current actor roles, protected owners, scope and unsafe identities reject',async()=>{
      await reset(); await pool.query("UPDATE tenant_memberships SET role='admin' WHERE id=1");
      await assert.rejects(update({role:'admin'}),{statusCode:403});
      await update({isActive:false});
      await reset(); await assert.rejects(update({role:'owner'}),{statusCode:400});
      await assert.rejects(service.update({...context,userId:'1',body:{isActive:false}}),{statusCode:400});
      await assert.rejects(service.update({...context,userId:'3',body:{isActive:false}}),{statusCode:404});
      await assert.rejects(update({assignedLocationIds:['20']}),{statusCode:400});
      await assert.rejects(service.update({...context,userId:9007199254740992,body:{isActive:false}}),{statusCode:400});
      await assert.rejects(update({}),{statusCode:400});
      await pool.query("UPDATE tenant_memberships SET role='owner' WHERE id=2");
      await assert.rejects(update({isActive:false}),{statusCode:400});
      await assert.rejects(update({assignedLocationIds:[]}),{statusCode:400});
    });
    await t.test('membership, grant, revision, outbox and commit faults roll back',async()=>{
      for(const marker of ['UPDATE tenant_memberships','DELETE FROM tenant_membership_locations','UPDATE resource_ledger_scopes','INSERT INTO staff_access_email_outbox','COMMIT']) {
        await reset(); fixture.fault=marker;
        await assert.rejects(update({assignedLocationIds:['12'],role:'staff',isActive:true,...(marker==='UPDATE tenant_memberships'?{role:'staff',isActive:false}:{})}),/access writer fault/);
        fixture.fault=null;
        assert.equal((await pool.query('SELECT is_active FROM tenant_memberships WHERE id=2')).rows[0].is_active,true);
        assert.equal((await pool.query('SELECT location_id::text FROM tenant_membership_locations WHERE tenant_membership_id=2')).rows[0].location_id,'11');
        assert.deepEqual((await revisions()).map(r=>r.revision),['1','1','1','1']);
        assert.equal((await pool.query('SELECT 1 FROM staff_access_email_outbox')).rowCount,0);
      }
    });
    await t.test('revoked actor is rechecked after branch and tenant waits',async()=>{
      for(const lock of ['SELECT id FROM store_locations WHERE id=10 FOR UPDATE','SELECT id FROM tenants WHERE id=1 FOR UPDATE']) {
        await reset(); const client=await transaction(); await client.query(lock);
        const mutation=update({isActive:false}); const rejected=assert.rejects(mutation,{statusCode:403});
        await waiter(lock.includes('store_locations')?'store_locations':'SELECT id FROM tenants');
        await client.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1'); await client.query('COMMIT'); client.release(); await rejected;
        assert.deepEqual((await revisions()).map(r=>r.revision),['1','1','1','1']);
      }
    });
    await t.test('target promotion after user-row wait cannot be disabled',async()=>{
      await reset(); const client=await transaction(); await client.query('SELECT id FROM users WHERE id=2 FOR UPDATE');
      const mutation=update({isActive:false});const rejected=assert.rejects(mutation,{statusCode:400});
      await waiter('FOR SHARE OF u FOR UPDATE OF m'); await client.query("UPDATE tenant_memberships SET role='owner' WHERE id=2");
      await client.query('COMMIT');client.release();await rejected;
    });
    await t.test('actor and target grants stay protected through commit',async()=>{
      await reset();const held=hold('UPDATE resource_ledger_scopes');const mutation=update({isActive:false});await held.entered;
      const revocation=pool.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1');await waiter('UPDATE tenant_memberships');
      const targetChange=pool.query("UPDATE tenant_memberships SET role='admin' WHERE id=2");await waiter("role='admin'");
      held.release();await mutation;await Promise.all([revocation,targetChange]);
    });
    await t.test('counter assignment before edit is included and after deactivation denied',async()=>{
      await reset(); const counterService=createCounterConfigurationService({pool});
      await counterService.mutate({tenantId:'1',locationId:'12',actorUserId:'1',action:'create',data:{name:'C',slug:'c',isActive:true,assignedUserIds:['2']}});
      await update({isActive:false}); assert.deepEqual((await revisions()).map(r=>r.revision),['2','2','3','1']);
      await assert.rejects(counterService.mutate({tenantId:'1',locationId:'12',actorUserId:'1',action:'create',data:{name:'D',slug:'d',isActive:true,assignedUserIds:['2']}}),{statusCode:400});
    });
    await t.test('competing counter assignment and status change serialize in both commit orders',async()=>{
      const counterService=createCounterConfigurationService({pool:wrappedPool});
      const create=()=>counterService.mutate({tenantId:'1',locationId:'12',actorUserId:'1',action:'create',data:{name:'C',slug:'c',isActive:true,assignedUserIds:['2']}});
      await reset();let held=hold('INSERT INTO service_counter_assignments');const counter=create();await held.entered;
      const editing=update({isActive:false});await waiter('SELECT id::text FROM store_locations');held.release();await Promise.all([counter,editing]);
      assert.deepEqual((await revisions()).map(r=>r.revision),['2','2','3','1']);
      await reset();held=hold('UPDATE resource_ledger_scopes');const editingFirst=update({isActive:false});await held.entered;
      const denied=assert.rejects(create(),{statusCode:400});await waiter('store_locations');held.release();await editingFirst;await denied;
      assert.equal((await pool.query("SELECT 1 FROM service_counters WHERE slug='c'")).rowCount,0);
    });
    await t.test('actor suspension after global user wait rejects without writes',async()=>{
      await reset();const client=await transaction();await client.query('SELECT id FROM users WHERE id=1 FOR UPDATE');
      const denied=assert.rejects(update({isActive:false}),{statusCode:403});await waiter('FOR SHARE OF u,m');
      await client.query("UPDATE users SET platform_access_suspended_at=NOW() WHERE id=1");await client.query('COMMIT');client.release();await denied;
      assert.deepEqual((await revisions()).map(r=>r.revision),['1','1','1','1']);
    });
    await t.test('branch inserted after initial discovery forces rollback and retry',async()=>{
      await reset();const client=await transaction();await client.query('SELECT id FROM tenants WHERE id=1 FOR UPDATE');
      const mutation=update({isActive:false});const rejected=assert.rejects(mutation,/Vendor locations changed/);
      await waiter('SELECT id FROM tenants');await client.query('INSERT INTO store_locations(id,tenant_id) VALUES(13,1)');await client.query('COMMIT');client.release();await rejected;
      assert.equal((await pool.query('SELECT is_active FROM tenant_memberships WHERE id=2')).rows[0].is_active,true);
      await update({isActive:false});
    });
    await t.test('reciprocal cross-vendor access changes do not deadlock global users',async()=>{
      await reset();await pool.query("UPDATE tenant_memberships SET role='owner' WHERE id=3; INSERT INTO tenant_memberships VALUES(4,1,2,'staff',TRUE)");
      await Promise.all([update({isActive:false}),service.update({tenant:{_id:'2',name:'Other'},actorId:'2',userId:'1',body:{isActive:false}})]);
      assert.equal((await pool.query("SELECT 1 FROM tenant_memberships WHERE role='owner' AND is_active=TRUE")).rowCount,2);
    });
    await t.test('adjacent bigint users and grants remain exact',async()=>{
      await reset();const tenantId='9007199254740993',actorId='9007199254740993',userId='9007199254740994',neighbor='9007199254740995',locationId='9007199254740996';
      await pool.query('INSERT INTO tenants VALUES($1)',[tenantId]);
      await pool.query("INSERT INTO users(id,roles,name,email,email_verified) VALUES($1,'{}','Owner','big-owner@example.test',TRUE),($2,'{}','Staff','big-staff@example.test',TRUE),($3,'{}','Neighbor','neighbor@example.test',TRUE)",[actorId,userId,neighbor]);
      await pool.query('INSERT INTO store_locations(id,tenant_id) VALUES($1,$2)',[locationId,tenantId]);
      await pool.query(`INSERT INTO tenant_memberships VALUES(40,${actorId},${tenantId},'owner',TRUE),(41,${userId},${tenantId},'staff',TRUE),(42,${neighbor},${tenantId},'staff',TRUE)`);
      await service.update({tenant:{_id:tenantId,name:'Large'},actorId,userId,body:{assignedLocationIds:[locationId]}});
      await service.update({tenant:{_id:tenantId,name:'Large'},actorId,userId,body:{role:'admin'}});
      await service.update({tenant:{_id:tenantId,name:'Large'},actorId,userId,body:{isActive:false}});
      assert.equal((await pool.query('SELECT is_active FROM tenant_memberships WHERE id=42')).rows[0].is_active,true);
      assert.equal((await pool.query('SELECT location_id::text FROM tenant_membership_locations WHERE tenant_membership_id=41')).rows[0].location_id,locationId);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes WHERE tenant_id=$1 AND location_id=$2',[tenantId,locationId])).rows[0].revision,'4');
    });
    await t.test('called attribution and held overdue allocation survive grant edits',async()=>{
      await reset();await pool.query("INSERT INTO tickets VALUES(100,1,10,'called',1)");
      await pool.query(`INSERT INTO location_resource_pools(tenant_id,location_id,name,capacity) VALUES(1,10,'Courts',4);
        INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,started_at,expected_end_at)
        VALUES(1,10,100,1,1,1,NOW()-interval '2 hours',NOW()-interval '1 hour')`);
      await update({isActive:false});assert.equal((await pool.query('SELECT status FROM tickets')).rows[0].status,'called');
      assert.equal((await pool.query('SELECT 1 FROM resource_allocations WHERE released_at IS NULL')).rowCount,1);
    });
  } finally { await fixture.dispose(); }
});
