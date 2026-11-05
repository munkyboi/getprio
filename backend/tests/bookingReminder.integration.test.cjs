const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const url=process.env.BOOKING_REMINDER_TEST_DATABASE_URL;

test('durable upcoming booking reminders on disposable PostgreSQL',{skip:!url},async t=>{
  const parsed=new URL(url);assert.equal(parsed.pathname,'/getprio_reminders_test');assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname));
  process.env.DATABASE_URL=url;process.env.DATABASE_SSL='false';
  const db=require('../src/config/db');
  const {createBookingReminderService}=require('../src/services/bookingReminderService');
  const outbox=require('../src/repositories/queueNotificationOutbox');
  const registrations=require('../mobile/pushRegistrationRepository');
  const fixtures=[];
  const {rows:[tenant]}=await db.pool.query("INSERT INTO tenants(name,slug) VALUES('Reminder vendor',$1) RETURNING id",['reminder-'+crypto.randomUUID()]);
  const {rows:[location]}=await db.pool.query("INSERT INTO store_locations(tenant_id,name,slug,timezone) VALUES($1,'Reminder branch','main','Asia/Manila') RETURNING id",[tenant.id]);
  const {rows:[vendorService]}=await db.pool.query("INSERT INTO vendor_services(tenant_id,name,slug,duration_minutes) VALUES($1,'Reminder service','reminder-service',30) RETURNING id",[tenant.id]);
  async function fixture({stage='24h',status='confirmed',payment='paid',arrived=false,linked=false,alerts=true,shortNotice=false,largeIds=false}={}) {
    const suffix=crypto.randomUUID();
    const {rows:[user]}=await db.pool.query(`INSERT INTO users(id,name,username,email,notification_settings) VALUES(COALESCE($5::bigint,nextval('users_id_seq')),$1,$2,$3,$4) RETURNING id`, ['Reminder customer',suffix,suffix+'@example.invalid',JSON.stringify({bookingAlerts:alerts}),largeIds?"9007199254741101":null]);
    fixtures.push(user.id);
    const client=await db.pool.connect();
    try {
      // Simulate a booking confirmed before its due point, with valid fixture
      // references, in this explicitly guarded disposable DB only. Session-local
      // replication mode does not alter triggers in another connection.
      if(!shortNotice)await client.query("SET session_replication_role='replica'");
      const {rows:[booking]}=await client.query(`INSERT INTO bookings
        (id,tenant_id,location_id,service_id,customer_user_id,reference,customer_name,scheduled_start_at,scheduled_end_at,
          status,payment_status,checked_in_at,queue_ticket_id,reminder_eligible_at)
        VALUES(COALESCE($11::bigint,nextval('bookings_id_seq')),$1,$2,$3,$4,$5,'Reminder customer',clock_timestamp()+$6::interval-INTERVAL '2 minutes',
          clock_timestamp()+$6::interval+INTERVAL '28 minutes',$7,$8,
          CASE WHEN $9 THEN clock_timestamp() ELSE NULL END,CASE WHEN $10 THEN 900000 ELSE NULL END,
          clock_timestamp()-INTERVAL '1 day') RETURNING *`,
      [tenant.id,location.id,vendorService.id,user.id,'REM-'+suffix,stage==='24h'?'24 hours':'1 hour',status,payment,arrived,linked,largeIds?'9007199254741103':null]);
      return {userId:String(user.id),bookingId:String(booking.id),booking};
    } finally {await client.query("SET session_replication_role='origin'");client.release();}
  }
  async function cleanup(){
    await db.pool.query('DELETE FROM bookings WHERE customer_user_id=ANY($1::bigint[])',[fixtures]);
    await db.pool.query('DELETE FROM users WHERE id=ANY($1::bigint[])',[fixtures]);fixtures.length=0;
  }
  async function scenario(name,run){await t.test(name,async()=>{try{await run();}finally{await cleanup();}});}
  async function claim(worker='reminder-test') {return (await outbox.claimBatch(worker,10))[0];}
  const inboxRows=user=>db.pool.query('SELECT * FROM customer_notification_inbox WHERE user_id=$1',[user]);
  try {
    await scenario('two schedulers create exactly one intent per schedule and stage',async()=>{
      const f=await fixture();const scheduler=createBookingReminderService();
      const results=await Promise.all([scheduler.enqueueDue(),scheduler.enqueueDue(),scheduler.enqueueDue()]);
      assert.equal(results.reduce((a,b)=>a+b,0),1);
      const intent=await claim();assert.equal(String(intent.booking_id),f.bookingId);assert.equal(intent.booking_reminder_stage,'24h');
      assert.equal(await scheduler.enqueueDue(),0);
    });
    await scenario('ordinary queue notifications are claimed before older reminder intents',async()=>{
      const f=await fixture();await createBookingReminderService().enqueueDue();
      const key='queue-priority-'+crypto.randomUUID();
      await outbox.enqueue({idempotencyKey:key,tenantId:tenant.id,recipientKey:'user:'+f.userId,channel:'fcm',templateName:'ticket_expired'});
      const [first]=await outbox.claimBatch('priority-worker',1);assert.equal(first.idempotency_key,key);assert.equal(first.booking_id,null);
      await outbox.markSent(first.id,'priority-worker');
    });
    await scenario('saturated ordinary traffic leaves reserved reminder slots and queue throughput on every run',async()=>{
      const customers=[];for(let i=0;i<10;i++)customers.push(await fixture());
      await createBookingReminderService().enqueueDue();
      const prefix='fairness-'+crypto.randomUUID();
      await db.pool.query(`INSERT INTO queue_notification_outbox(idempotency_key,tenant_id,recipient_key,channel,template_name)
        SELECT $1||':'||n,$2,'user:'||$3,'fcm','ticket_expired' FROM generate_series(1,60) n`,[prefix,tenant.id,customers[0].userId]);
      try {
        const delivered=[];
        const {createQueueNotificationOutboxDispatcher}=require('./testSupport.cjs').requireWithMocks('../src/services/queueNotificationOutboxDispatcher',{
          '../repositories/queueNotificationOutbox':outbox,
          '../repositories/tenants':{findTenantById:async()=>null},
          './bookingReminderService':{dispatch:async intent=>delivered.push(String(intent.booking_id))}
        });
        const dispatcher=createQueueNotificationOutboxDispatcher();
        for(let run=1;run<=2;run++){
          assert.equal(await dispatcher.runBatch(10),10);
          assert.equal(delivered.length,run*2);
          const {rows:[counts]}=await db.pool.query(`SELECT COUNT(*) FILTER(WHERE booking_id IS NULL AND status='sent')::int AS queue_sent,
            COUNT(*) FILTER(WHERE booking_id IS NOT NULL AND status='sent')::int AS reminder_sent FROM queue_notification_outbox WHERE
            idempotency_key LIKE $1 OR booking_id=ANY($2::bigint[])`,[prefix+':%',customers.map(f=>f.bookingId)]);
          assert.deepEqual(counts,{queue_sent:run*8,reminder_sent:run*2});
        }
        assert.equal(new Set(delivered).size,4);
      } finally {await db.pool.query('DELETE FROM queue_notification_outbox WHERE idempotency_key LIKE $1',[prefix+':%']);}
    });
    await scenario('reserved slots pick the earliest expiry while ordinary slots keep queue priority',async()=>{
      const first=await fixture(),urgent=await fixture();await createBookingReminderService().enqueueDue();
      await db.pool.query("UPDATE queue_notification_outbox SET expires_at=NOW()+INTERVAL '1 minute' WHERE booking_id=$1",[urgent.bookingId]);
      const key='expiry-priority-'+crypto.randomUUID();
      const queueId=await outbox.enqueue({idempotencyKey:key,tenantId:tenant.id,recipientKey:'user:'+first.userId,channel:'fcm',templateName:'ticket_expired'});
      try {
        const [reserved]=await outbox.claimBatch('expiry-worker',1,{preferBookingReminders:true});
        assert.equal(String(reserved.booking_id),urgent.bookingId);await outbox.markSent(reserved.id,'expiry-worker');
        const [ordinary]=await outbox.claimBatch('expiry-worker',1);assert.equal(String(ordinary.id),queueId);
        await outbox.markSent(ordinary.id,'expiry-worker');
      } finally {await db.pool.query('DELETE FROM queue_notification_outbox WHERE id=$1',[queueId]);}
    });
    await scenario('1-hour stage does not replay the missed 24-hour reminder',async()=>{
      const f=await fixture({stage:'1h'});const scheduler=createBookingReminderService();assert.equal(await scheduler.enqueueDue(),1);
      const intent=await claim();assert.equal(intent.booking_reminder_stage,'1h');assert.equal(String(intent.booking_id),f.bookingId);
    });
    await scenario('short-notice confirmation, terminal/payment states, check-in and preferences suppress scheduling',async()=>{
      for(const config of [{shortNotice:true},{status:'pending'},{status:'canceled'},{status:'completed'},{payment:'pending'},{payment:'failed'},{payment:'refunded'},{arrived:true},{linked:true},{alerts:false}])await fixture(config);
      assert.equal(await createBookingReminderService().enqueueDue(),0);
    });
    await scenario('missed windows are never caught up after downtime',async()=>{
      const f=await fixture();await db.pool.query("UPDATE bookings SET scheduled_start_at=scheduled_start_at-INTERVAL '20 minutes' WHERE id=$1",[f.bookingId]);
      assert.equal(await createBookingReminderService().enqueueDue(),0);
    });
    await scenario('no-device delivery persists one inbox entry with unchanged list contract',async()=>{
      const f=await fixture();const scheduler=createBookingReminderService();await scheduler.enqueueDue();const intent=await claim();
      assert.deepEqual(await scheduler.dispatch(intent,'reminder-test'),{attempted:0,sent:0});
      await outbox.markSent(intent.id,'reminder-test');assert.equal((await inboxRows(f.userId)).rowCount,1);assert.equal((await inboxRows(f.userId)).rows[0].kind,'booking');
      assert.equal(await scheduler.enqueueDue(),0);assert.equal((await outbox.claimBatch('other-worker',10)).length,0);
    });
    await scenario('reschedule A-to-B-to-A advances identity and invalidates the old claimed reminder',async()=>{
      const f=await fixture();const scheduler=createBookingReminderService();await scheduler.enqueueDue();const intent=await claim();
      await db.pool.query("UPDATE bookings SET scheduled_start_at=scheduled_start_at+INTERVAL '1 day',scheduled_end_at=scheduled_end_at+INTERVAL '1 day',status='rescheduled' WHERE id=$1",[f.bookingId]);
      await db.pool.query('UPDATE bookings SET scheduled_start_at=$2,scheduled_end_at=$3 WHERE id=$1',[f.bookingId,f.booking.scheduled_start_at,f.booking.scheduled_end_at]);
      const current=(await db.pool.query('SELECT reminder_schedule_revision,reminder_eligible_at FROM bookings WHERE id=$1',[f.bookingId])).rows[0];
      assert.equal(String(current.reminder_schedule_revision),'3');
      assert.deepEqual(await scheduler.dispatch(intent,'reminder-test'),{skipped:true});assert.equal((await inboxRows(f.userId)).rowCount,0);
      assert.equal(await scheduler.enqueueDue(),0,'missed due point is not replayed after reschedule');
    });
    await scenario('eligibility is reread after a concurrent reschedule lock wait',async()=>{
      const f=await fixture();const scheduler=createBookingReminderService();await scheduler.enqueueDue();const intent=await claim();
      const writer=await db.pool.connect();await writer.query('BEGIN');
      let reached;const waiting=new Promise(resolve=>{reached=resolve;});
      try {
        await writer.query("UPDATE bookings SET scheduled_start_at=scheduled_start_at+INTERVAL '1 day',scheduled_end_at=scheduled_end_at+INTERVAL '1 day' WHERE id=$1",[f.bookingId]);
        const dispatcher=createBookingReminderService({database:{...db,withTransaction:callback=>db.withTransaction(client=>callback({query:(sql,args)=>{if(sql.includes('FROM bookings WHERE id=$1 FOR SHARE'))reached();return client.query(sql,args);}}))}});
        const pending=dispatcher.dispatch(intent,'reminder-test');await waiting;await writer.query('COMMIT');
        assert.deepEqual(await pending,{skipped:true});assert.equal((await inboxRows(f.userId)).rowCount,0);
      }finally{await writer.query('ROLLBACK');writer.release();}
    });
    await scenario('preferences, check-in, cancellation and account deletion are revalidated at dispatch',async()=>{
      for(const change of ["UPDATE users SET notification_settings='{\"bookingAlerts\":false}' WHERE id=$1", "UPDATE users SET deletion_requested_at=NOW() WHERE id=$1", "UPDATE bookings SET checked_in_at=NOW() WHERE id=$1", "UPDATE bookings SET status='canceled' WHERE id=$1"]){
        const f=await fixture();const scheduler=createBookingReminderService();await scheduler.enqueueDue();const intent=await claim();
        await db.pool.query(change,[change.includes('UPDATE users')?f.userId:f.bookingId]);
        assert.deepEqual(await scheduler.dispatch(intent,'reminder-test'),{skipped:true});assert.equal((await inboxRows(f.userId)).rowCount,0);
      }
    });
    await scenario('partial device failures retry only failed installations and dedupe inbox content',async()=>{
      const f=await fixture({stage:'1h'});const first=await registrations.upsert({userId:f.userId,installationId:crypto.randomUUID(),token:'fixture-first',platform:'ios'});
      const second=await registrations.upsert({userId:f.userId,installationId:crypto.randomUUID(),token:'fixture-second',platform:'ios'});
      const batches=[];let attempt=0;
      const scheduler=createBookingReminderService({sender:{sendToRegistrations:async({registrations:pending,payload,timeoutMs})=>{
        batches.push(pending.map(r=>String(r.id)));assert.equal(payload.route,`/account/bookings/${f.bookingId}`);assert.equal(payload.eventType,'customer_booking_reminder_1h');assert.ok(timeoutMs<=10000);
        const outcomes=pending.map(r=>({registrationId:String(r.id),status:attempt===0&&String(r.id)===String(second.id)?'failed':'accepted',error:'transient'}));attempt++;
        return {configured:true,attempted:pending.length,sent:outcomes.filter(o=>o.status==='accepted').length,outcomes};
      }}});
      await scheduler.enqueueDue();let intent=await claim();await assert.rejects(scheduler.dispatch(intent,'reminder-test'),/transient device failures/);
      assert.equal((await inboxRows(f.userId)).rowCount,1);
      await outbox.markRetry(intent.id,'reminder-test','retry');await db.pool.query('UPDATE queue_notification_outbox SET available_at=NOW() WHERE id=$1',[intent.id]);intent=await claim();
      await scheduler.dispatch(intent,'reminder-test');await outbox.markSent(intent.id,'reminder-test');
      assert.equal((await inboxRows(f.userId)).rowCount,1);assert.equal(batches[0].length,2);assert.deepEqual(batches[1],[String(second.id)]);
      assert.ok(batches[0].includes(String(first.id)));
    });
    await scenario('provider-deactivated tokens become stale while active transient failures alone retry',async()=>{
      const f=await fixture();const stale=await registrations.upsert({userId:f.userId,installationId:crypto.randomUUID(),token:'stale-provider-fixture',platform:'ios'});
      const transient=await registrations.upsert({userId:f.userId,installationId:crypto.randomUUID(),token:'transient-provider-fixture',platform:'ios'});
      let attempts=0;const batches=[];
      const scheduler=createBookingReminderService({sender:{sendToRegistrations:async({registrations:pending})=>{
        batches.push(pending.map(r=>String(r.id)));attempts++;
        if(attempts===1)await registrations.deactivateByToken('stale-provider-fixture');
        return {configured:true,attempted:pending.length,sent:attempts===1?0:pending.length,
          outcomes:pending.map(r=>({registrationId:String(r.id),status:attempts===1?'failed':'accepted',error:'FCM delivery failed'}))};
      }}});
      await scheduler.enqueueDue();let intent=await claim();await assert.rejects(scheduler.dispatch(intent,'reminder-test'),/transient device failures/);
      const {rows}=await db.pool.query('SELECT registration_id::text,status FROM mobile_push_outbox_deliveries WHERE outbox_id=$1 ORDER BY registration_id',[intent.id]);
      assert.deepEqual(rows,[{registration_id:String(stale.id),status:'stale'},{registration_id:String(transient.id),status:'pending'}]);
      await outbox.markRetry(intent.id,'reminder-test','retry');await db.pool.query('UPDATE queue_notification_outbox SET available_at=NOW() WHERE id=$1',[intent.id]);intent=await claim();
      await scheduler.dispatch(intent,'reminder-test');await outbox.markSent(intent.id,'reminder-test');
      assert.deepEqual(batches[1],[String(transient.id)]);
      assert.equal((await inboxRows(f.userId)).rowCount,1);
    });
    await scenario('a previously pending token deactivated before retry is retired without a lease or provider call',async()=>{
      const f=await fixture();await registrations.upsert({userId:f.userId,installationId:crypto.randomUUID(),token:'inactive-retry-fixture',platform:'ios'});
      let calls=0;const scheduler=createBookingReminderService({sender:{sendToRegistrations:async({registrations:pending})=>{
        calls++;return {configured:true,attempted:1,sent:0,outcomes:[{registrationId:String(pending[0].id),status:'failed',error:'transient'}]};
      }}});
      await scheduler.enqueueDue();let intent=await claim();await assert.rejects(scheduler.dispatch(intent,'reminder-test'),/transient device failures/);
      await registrations.deactivateByToken('inactive-retry-fixture');await outbox.markRetry(intent.id,'reminder-test','retry');
      await db.pool.query('UPDATE queue_notification_outbox SET available_at=NOW() WHERE id=$1',[intent.id]);intent=await claim();
      assert.deepEqual(await scheduler.dispatch(intent,'reminder-test'),{attempted:0,sent:0});await outbox.markSent(intent.id,'reminder-test');
      assert.equal(calls,1);
      const {rows:[delivery]}=await db.pool.query('SELECT status,lease_owner,leased_until FROM mobile_push_outbox_deliveries WHERE outbox_id=$1',[intent.id]);
      assert.deepEqual(delivery,{status:'stale',lease_owner:null,leased_until:null});
    });
    await scenario('an invalid legacy location timezone still captures the reminder',async()=>{
      const f=await fixture();await db.pool.query("UPDATE store_locations SET timezone='Invalid/Legacy' WHERE id=$1",[location.id]);
      try {
        const scheduler=createBookingReminderService();await scheduler.enqueueDue();const intent=await claim();
        assert.deepEqual(await scheduler.dispatch(intent,'reminder-test'),{attempted:0,sent:0});
        const {rows:[row]}=await inboxRows(f.userId);assert.ok(row);assert.ok(row.body.includes(f.booking.scheduled_start_at.toISOString()));
      } finally {await db.pool.query("UPDATE store_locations SET timezone='Asia/Manila' WHERE id=$1",[location.id]);}
    });
    await scenario('accepted reminder precedes cancellation without holding a branch lock',async()=>{
      const f=await fixture();await registrations.upsert({userId:f.userId,installationId:crypto.randomUUID(),token:'fixture-race',platform:'ios'});
      let accepted,release;const atProvider=new Promise(resolve=>{accepted=resolve;});const providerWait=new Promise(resolve=>{release=resolve;});
      const scheduler=createBookingReminderService({sender:{sendToRegistrations:async({registrations:pending})=>{accepted();await providerWait;return{configured:true,attempted:pending.length,sent:pending.length,outcomes:pending.map(r=>({registrationId:r.id,status:'accepted'}))};}}});
      await scheduler.enqueueDue();const intent=await claim();
      const branch=await db.pool.connect();await branch.query('BEGIN');await branch.query('SELECT id FROM store_locations WHERE id=$1 FOR NO KEY UPDATE',[location.id]);
      try {
        const dispatch=scheduler.dispatch(intent,'reminder-test');await atProvider;
        await registrations.upsert({userId:f.userId,installationId:crypto.randomUUID(),token:'registration-during-dispatch',platform:'ios'});
        let cancelled=false;const cancellation=db.pool.query("UPDATE bookings SET status='canceled' WHERE id=$1",[f.bookingId]).then(()=>{cancelled=true;});
        await new Promise(resolve=>setTimeout(resolve,20));assert.equal(cancelled,false);
        release();await dispatch;await cancellation;assert.equal((await inboxRows(f.userId)).rowCount,1);
      }finally{release();await branch.query('ROLLBACK');branch.release();}
    });
    await scenario('large booking/account/outbox/registration IDs remain exact end to end',async()=>{
      const f=await fixture({largeIds:true,stage:'1h'});
      await db.pool.query(`INSERT INTO mobile_push_registrations(id,user_id,installation_id,token,platform)
        VALUES('9007199254741105',$1,$2,'large-id-fixture','ios')`,[f.userId,crypto.randomUUID()]);
      const scheduler=createBookingReminderService({sender:{sendToRegistrations:async({registrations:pending,payload})=>{
        assert.equal(pending[0].id,'9007199254741105');assert.equal(payload.route,'/account/bookings/9007199254741103');assert.match(payload.notificationId,/booking:9007199254741103:/);
        return{configured:true,attempted:1,sent:1,outcomes:[{registrationId:pending[0].id,status:'accepted'}]};
      }}});
      await scheduler.enqueueDue();await db.pool.query("UPDATE queue_notification_outbox SET id='9007199254741107' WHERE booking_id=$1",[f.bookingId]);
      const intent=await claim();await scheduler.dispatch(intent,'reminder-test');await outbox.markSent(intent.id,'reminder-test');
      assert.equal((await db.pool.query('SELECT status FROM queue_notification_outbox WHERE id=$1',[intent.id])).rows[0].status,'sent');
      assert.equal((await inboxRows(f.userId)).rowCount,1);
    });
    await scenario('provider failure and missing FCM configuration retain retryable devices and one inbox entry',async()=>{
      const f=await fixture();await registrations.upsert({userId:f.userId,installationId:crypto.randomUUID(),token:'retry-fixture',platform:'ios'});
      const scheduler=createBookingReminderService({sender:{sendToRegistrations:async()=>{throw new Error('provider timeout');}}});
      await scheduler.enqueueDue();let intent=await claim();await assert.rejects(scheduler.dispatch(intent,'reminder-test'),/delivery failed/);
      await outbox.markRetry(intent.id,'reminder-test','retry');await db.pool.query('UPDATE queue_notification_outbox SET available_at=NOW() WHERE id=$1',[intent.id]);intent=await claim();
      const unconfigured=createBookingReminderService({sender:{sendToRegistrations:async()=>({configured:false,outcomes:[]})}});
      await assert.rejects(unconfigured.dispatch(intent,'reminder-test'),/not configured/);
      assert.equal((await inboxRows(f.userId)).rowCount,1);
      const rows=(await db.pool.query('SELECT status,lease_owner FROM mobile_push_outbox_deliveries WHERE outbox_id=$1',[intent.id])).rows;
      assert.equal(rows[0].status,'pending');assert.equal(rows[0].lease_owner,null);
    });
    await scenario('expired reminders and stale worker leases do not emit',async()=>{
      const f=await fixture();const scheduler=createBookingReminderService();await scheduler.enqueueDue();const intent=await claim();
      await db.pool.query("UPDATE queue_notification_outbox SET leased_until=NOW()-INTERVAL '1 minute' WHERE id=$1",[intent.id]);
      assert.deepEqual(await scheduler.dispatch(intent,'reminder-test'),{skipped:true});
      const reclaimed=await claim('recovery-worker');await db.pool.query("UPDATE queue_notification_outbox SET expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",[intent.id]);
      assert.deepEqual(await scheduler.dispatch({...reclaimed,expires_at:new Date(Date.now()-60000)},'recovery-worker'),{skipped:true});
      assert.equal((await inboxRows(f.userId)).rowCount,0);
    });
    await scenario('committed history survives a crash after provider acceptance even when the intent later becomes obsolete',async()=>{
      const f=await fixture();await registrations.upsert({userId:f.userId,installationId:crypto.randomUUID(),token:'crash-fixture',platform:'ios'});
      let transaction=0,accepted=0,visibleAtProvider=0;
      const scheduler=createBookingReminderService({database:{...db,withTransaction:callback=>{
        transaction++;const current=transaction;
        return db.withTransaction(async client=>{const result=await callback(client);if(current===3)throw new Error('crash after provider acceptance');return result;});
      }},sender:{sendToRegistrations:async({registrations:pending})=>{
        visibleAtProvider=(await inboxRows(f.userId)).rowCount;accepted++;
        return {configured:true,attempted:pending.length,sent:pending.length,outcomes:pending.map(r=>({registrationId:r.id,status:'accepted'}))};
      }}});
      // Transaction 1 enqueues; transaction 2 captures; transaction 3 delivers.
      await scheduler.enqueueDue();const intent=await claim();
      await assert.rejects(scheduler.dispatch(intent,'reminder-test'),/crash after provider acceptance/);
      assert.equal(accepted,1);assert.equal(visibleAtProvider,1);assert.equal((await inboxRows(f.userId)).rowCount,1);
      await db.pool.query("UPDATE bookings SET status='canceled' WHERE id=$1",[f.bookingId]);
      assert.deepEqual(await createBookingReminderService().dispatch(intent,'reminder-test'),{skipped:true});
      assert.equal((await inboxRows(f.userId)).rowCount,1);
    });
    await scenario('rescheduling between capture and delivery suppresses the push',async()=>{
      const f=await fixture();let transaction=0,sent=false;
      const scheduler=createBookingReminderService({database:{...db,withTransaction:async callback=>{
        transaction++;const current=transaction;const result=await db.withTransaction(callback);
        if(current===2)await db.pool.query("UPDATE bookings SET scheduled_start_at=scheduled_start_at+INTERVAL '1 day',scheduled_end_at=scheduled_end_at+INTERVAL '1 day' WHERE id=$1",[f.bookingId]);
        return result;
      }},sender:{sendToRegistrations:async()=>{sent=true;throw new Error('Must not send');}}});
      await scheduler.enqueueDue();const intent=await claim();assert.deepEqual(await scheduler.dispatch(intent,'reminder-test'),{skipped:true});
      assert.equal(sent,false);assert.equal((await inboxRows(f.userId)).rowCount,1,'history was captured before rescheduling');
    });
    await scenario('disabled scheduler neither enqueues nor emits pending reminders',async()=>{
      const f=await fixture();await createBookingReminderService().enqueueDue();const intent=await claim();
      const disabled=createBookingReminderService({enabled:()=>false});assert.equal(await disabled.enqueueDue(),0);assert.deepEqual(await disabled.dispatch(intent,'reminder-test'),{skipped:true});assert.equal((await inboxRows(f.userId)).rowCount,0);
    });
  } finally {
    await cleanup();await db.pool.query('DELETE FROM vendor_services WHERE id=$1',[vendorService.id]);await db.pool.query('DELETE FROM store_locations WHERE id=$1',[location.id]);await db.pool.query('DELETE FROM tenants WHERE id=$1',[tenant.id]);await db.pool.end();
  }
});
