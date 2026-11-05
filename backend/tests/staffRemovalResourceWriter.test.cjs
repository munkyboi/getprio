const test = require('node:test');
const assert = require('node:assert/strict');
const { createStaffWriterFixture } = require('./helpers/staffWriterFixture.cjs');
const { createStaffRemovalResourceService } = require('../src/services/staffRemovalResourceService');
const { createCounterConfigurationService } = require('../src/services/counterConfigurationService');
const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;

test('staff removal and resource revisions commit atomically on PostgreSQL', { skip: !databaseUrl }, async t => {
  const fixture = createStaffWriterFixture(databaseUrl, 'removal');
  const { pool, wrappedPool, revisions, reset, transaction, waiter, hold } = fixture;
  const service = createStaffRemovalResourceService({ pool: wrappedPool });
  const context = { tenant: { _id: '1', name: 'Studio' }, userId: '2', actorId: '1' };
  const remove = () => service.remove(context);
  try {
    await fixture.initialize();
    await t.test('deduplicates affected branches, preserves other tenant and enqueues notice', async()=>{
      await reset(); await remove();
      assert.deepEqual(await revisions(),[{location_id:'10',revision:'2'},{location_id:'11',revision:'2'},{location_id:'12',revision:'1'},{location_id:'20',revision:'1'}]);
      assert.deepEqual((await pool.query('SELECT counter_id::text FROM service_counter_assignments')).rows,[{counter_id:'3'}]);
      assert.equal((await pool.query('SELECT 1 FROM tenant_memberships WHERE user_id=2 AND tenant_id=2')).rowCount,1);
      const notices=(await pool.query('SELECT payload FROM staff_access_email_outbox')).rows;
      assert.equal(notices.length,1); assert.equal(notices[0].payload.after,null);
      await assert.rejects(remove(),{statusCode:404});
      assert.equal((await pool.query('SELECT 1 FROM staff_access_email_outbox')).rowCount,1);
    });
    await t.test('administrator removal advances all tenant branches; staff without grants advances none',async()=>{
      await reset(); await pool.query("UPDATE tenant_memberships SET role='admin' WHERE id=2"); await remove();
      assert.deepEqual((await revisions()).map(r=>r.revision),['2','2','2','1']);
      await reset(); await pool.query('DELETE FROM service_counter_assignments WHERE counter_id IN (1,2); DELETE FROM tenant_membership_locations WHERE tenant_membership_id=2'); await remove();
      assert.deepEqual((await revisions()).map(r=>r.revision),['1','1','1','1']);
    });
    await t.test('assignment, membership, revision and outbox failures all roll back',async()=>{
      for(const marker of ['DELETE FROM service_counter_assignments','DELETE FROM tenant_memberships','UPDATE resource_ledger_scopes','INSERT INTO staff_access_email_outbox','COMMIT']) {
        await reset(); fixture.fault=marker; await assert.rejects(remove(),/removal writer fault/); fixture.fault=null;
        assert.equal((await pool.query('SELECT 1 FROM service_counter_assignments')).rowCount,3);
        assert.equal((await pool.query('SELECT 1 FROM tenant_memberships WHERE id=2')).rowCount,1);
        assert.deepEqual((await revisions()).map(r=>r.revision),['1','1','1','1']);
        assert.equal((await pool.query('SELECT 1 FROM staff_access_email_outbox')).rowCount,0);
      }
    });
    await t.test('revoked actor and promoted target are reread after branch lock waits',async()=>{
      for(const change of ["UPDATE tenant_memberships SET is_active=FALSE WHERE id=1","UPDATE tenant_memberships SET role='owner' WHERE id=2"]) {
        await reset(); const client=await transaction();
        try {
          await client.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
          const result=remove(); const rejection=assert.rejects(result,{statusCode:change.includes('FALSE')?403:400});
          await waiter('SELECT id::text FROM store_locations'); await client.query(change); await client.query('COMMIT'); await rejection;
        } finally { await client.query('ROLLBACK'); client.release(); }
        assert.equal((await pool.query('SELECT 1 FROM service_counter_assignments')).rowCount,3);
      }
    });
    await t.test('grants are reread after tenant and actor/target user waits',async()=>{
      const cases=[
        {lock:'SELECT id FROM tenants WHERE id=1 FOR UPDATE',wait:'SELECT id FROM tenants',change:'UPDATE tenant_memberships SET is_active=FALSE WHERE id=1',status:403},
        {lock:'SELECT id FROM users WHERE id=1 FOR UPDATE',wait:'FOR SHARE OF u,m',change:'UPDATE tenant_memberships SET is_active=FALSE WHERE id=1',status:403},
        {lock:'SELECT id FROM users WHERE id=2 FOR UPDATE',wait:'FOR SHARE OF u FOR UPDATE OF m',change:"UPDATE tenant_memberships SET role='owner' WHERE id=2",status:400}
      ];
      for(const scenario of cases) {
        await reset(); const client=await transaction();
        try {
          await client.query(scenario.lock); const removal=remove(); const rejection=assert.rejects(removal,{statusCode:scenario.status});
          await waiter(scenario.wait); await client.query(scenario.change); await client.query('COMMIT'); await rejection;
        } finally {await client.query('ROLLBACK'); client.release();}
        assert.equal((await pool.query('SELECT 1 FROM service_counter_assignments')).rowCount,3);
        assert.deepEqual((await revisions()).map(row=>row.revision),['1','1','1','1']);
      }
    });
    await t.test('counter assignment winner is discovered; subsequent assignment cannot recreate removed access',async()=>{
      await reset(); const counterService=createCounterConfigurationService({pool:wrappedPool});
      const winner=hold('INSERT INTO service_counters');
      const creating=counterService.mutate({tenantId:'1',locationId:'12',actorUserId:'1',action:'create',data:{name:'New',slug:'new',assignedUserIds:['2']}});
      await winner.entered; const removalAfterCreate=remove(); await waiter('SELECT id::text FROM store_locations');
      winner.release(); await creating; await removalAfterCreate;
      assert.equal((await revisions()).find(row=>row.location_id==='12').revision,'3');
      await assert.rejects(counterService.mutate({tenantId:'1',locationId:'12',actorUserId:'1',action:'update',counterSlug:'new',data:{name:'New',slug:'new',assignedUserIds:['2']}}),{statusCode:400});
      await reset(); const held=hold('DELETE FROM tenant_memberships'); const removal=remove(); await held.entered;
      const changing=counterService.mutate({tenantId:'1',locationId:'10',actorUserId:'1',action:'update',counterSlug:'a',data:{name:'A',slug:'a',assignedUserIds:['2']}});
      const rejection=assert.rejects(changing,{statusCode:400}); await waiter('SELECT id FROM store_locations'); held.release(); await removal; await rejection;
    });
    await t.test('new branch discovered after initial lock query causes rollback and can be retried',async()=>{
      await reset(); const held=hold('SELECT id::text FROM store_locations'); const removal=remove();
      const rejection=assert.rejects(removal,/locations changed/); await held.entered;
      await pool.query('INSERT INTO store_locations(id,tenant_id) VALUES(13,1)'); held.release(); await rejection;
      assert.equal((await pool.query('SELECT 1 FROM service_counter_assignments')).rowCount,3);
      await remove();
    });
    await t.test('reciprocal removals in different vendors use compatible user locks',async()=>{
      await reset();
      await pool.query("UPDATE tenant_memberships SET role='owner' WHERE id=3; INSERT INTO tenant_memberships VALUES(4,1,2,'staff',TRUE)");
      let reached=0, release;
      const both=new Promise(resolve=>release=resolve);
      const synchronizedPool={connect:async()=>{
        const client=await pool.connect();
        return {release:()=>client.release(),query:async(sql,args)=>{
          const result=await client.query(sql,args);
          if(sql.includes('FOR SHARE OF u,m')) {if(++reached===2) release(); await both;}
          return result;
        }};
      }};
      const concurrent=createStaffRemovalResourceService({pool:synchronizedPool});
      await Promise.all([concurrent.remove(context),concurrent.remove({tenant:{_id:'2',name:'Other'},userId:'1',actorId:'2'})]);
      assert.equal((await pool.query("SELECT 1 FROM tenant_memberships WHERE role='staff'")).rowCount,0);
      assert.equal((await pool.query("SELECT 1 FROM tenant_memberships WHERE role='owner'")).rowCount,2);
    });
    await t.test('adjacent BIGINT identities preserve membership, grants and notification isolation',async()=>{
      await reset();
      const tenantId='9007199254740993', actorId='9007199254740993', userId='9007199254740994', otherId='9007199254740995', locationId='9007199254740996';
      await pool.query(`INSERT INTO tenants VALUES($1)`,[tenantId]);
      await pool.query(`INSERT INTO users(id,roles,name,email,email_verified) VALUES($1,'{}','Big owner','big-owner@example.test',TRUE),($2,'{}','Big staff','big-staff@example.test',TRUE),($3,'{}','Neighbor','neighbor@example.test',TRUE)`,[actorId,userId,otherId]);
      await pool.query('INSERT INTO store_locations(id,tenant_id) VALUES($1,$2)',[locationId,tenantId]);
      await pool.query(`INSERT INTO tenant_memberships VALUES(40,${actorId},${tenantId},'owner',TRUE),(41,${userId},${tenantId},'staff',TRUE),(42,${otherId},${tenantId},'staff',TRUE)`);
      await pool.query(`INSERT INTO tenant_membership_locations VALUES(41,$1,'explicit',$2),(42,$1,'explicit',$2)`,[locationId,actorId]);
      await service.remove({tenant:{_id:tenantId,name:'Big studio'},userId,actorId});
      assert.equal((await pool.query('SELECT user_id::text FROM tenant_memberships WHERE id=42')).rows[0].user_id,otherId);
      assert.equal((await pool.query('SELECT 1 FROM tenant_membership_locations WHERE tenant_membership_id=42')).rowCount,1);
      assert.deepEqual((await pool.query('SELECT recipient_user_id::text FROM staff_access_email_outbox')).rows,[{recipient_user_id:userId}]);
      assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes WHERE tenant_id=$1 AND location_id=$2',[tenantId,locationId])).rows[0].revision,'2');
    });
    await t.test('called attribution and held occupancy survive staff removal',async()=>{
      await reset(); await pool.query("INSERT INTO tickets VALUES(100,1,10,'called',1)");
      await pool.query(`INSERT INTO location_resource_pools(tenant_id,location_id,name,capacity) VALUES(1,10,'Courts',4);
        INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,started_at,expected_end_at)
        VALUES(1,10,100,1,1,1,NOW()-interval '2 hours',NOW()-interval '1 hour')`);
      await remove();
      assert.deepEqual((await pool.query('SELECT status,service_counter_id::text FROM tickets')).rows,[{status:'called',service_counter_id:'1'}]);
      assert.equal((await pool.query('SELECT 1 FROM resource_allocations WHERE released_at IS NULL')).rowCount,1);
    });
    await t.test('actor grant stays locked through commit and unsafe IDs are rejected',async()=>{
      await reset(); const held=hold('DELETE FROM tenant_memberships'); const removal=remove(); await held.entered;
      const revoke=pool.query('UPDATE tenant_memberships SET is_active=FALSE WHERE id=1'); await waiter('UPDATE tenant_memberships'); held.release(); await removal; await revoke;
      await assert.rejects(service.remove({...context,userId:9007199254740992}),{statusCode:400});
      await assert.rejects(service.remove({...context,userId:'1'}),{statusCode:400});
    });
  } finally { await fixture.dispose(); }
});
