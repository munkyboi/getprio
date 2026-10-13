const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const url = process.env.NOTIFICATION_INBOX_TEST_DATABASE_URL;

test('account-synchronized notification inbox on disposable PostgreSQL', { skip: !url }, async t => {
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/getprio_inbox_test');
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname));
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = 'false';
  const db = require('../src/config/db');
  const inboxModule = require('../src/services/customerNotificationInbox');
  const inbox = inboxModule.createInbox();
  const ids = [];
  async function fixture() {
    const suffix = crypto.randomUUID();
    const {rows: [user]} = await db.pool.query('INSERT INTO users(name,username,email) VALUES($1,$2,$3) RETURNING id',
      ['Inbox test',suffix,suffix+'@example.invalid']);
    ids.push(user.id);
    return String(user.id);
  }
  const send = (userId, notificationId = crypto.randomUUID()) => inbox.record({userId,notificationId,title:'Queue update',body:'Your ticket is ready.'});
  try {
    await db.pool.query('DROP TABLE IF EXISTS customer_notification_inbox,customer_notification_inbox_policy');
    await db.pool.query(fs.readFileSync(require('node:path').resolve(__dirname,'../../database/migrations/20261013_01_add_customer_notification_inbox.sql'),'utf8'));
    await t.test('records without device delivery, stable retry IDs, silent exclusion and no backfill', async () => {
      const user = await fixture();
      const id = await send(user,'stable-event');
      assert.ok(id);
      assert.equal(await send(user,'stable-event'),null);
      assert.equal(await inbox.record({userId:user,notificationId:'silent',silent:true}),null);
      assert.equal(await inbox.record({userId:user,notificationId:'old-outbox',title:'Old',body:'Old',occurredAt:'2000-01-01T00:00:00Z'}),null);
      const page = await inbox.list(user);
      assert.equal(page.unreadCount,1);
      assert.deepEqual(Object.keys(page.notifications[0]),['id','title','body','createdAt','readAt']);
    });
    await t.test('ownership, signed cutoffs, idempotent reads and new-arrival bulk protection', async () => {
      const user = await fixture(), other = await fixture();
      const first = await send(user), foreign = await send(other);
      const page = await inbox.list(user);
      await assert.rejects(inbox.clear(other,page.snapshotCutoff),{statusCode:400});
      await assert.rejects(inbox.clear(user,page.snapshotCutoff+'x'),{statusCode:400});
      await assert.rejects(inbox.markAllRead(user,undefined),{statusCode:400});
      assert.equal((await inbox.markRead(user,foreign)).unreadCount,1);
      assert.equal((await inbox.list(other)).unreadCount,1);
      assert.equal((await inbox.markRead(user,first)).unreadCount,0);
      assert.equal((await inbox.markRead(user,first)).unreadCount,0);
      const second = await send(user);
      assert.equal((await inbox.markAllRead(user,page.snapshotCutoff)).unreadCount,1);
      await inbox.clear(user,page.snapshotCutoff);
      assert.deepEqual((await inbox.list(user)).notifications.map(n=>n.id),[second]);
      const tombstone = (await db.pool.query('SELECT title,body,cleared_at FROM customer_notification_inbox WHERE id=$1',[first])).rows[0];
      assert.equal(tombstone.title,null); assert.equal(tombstone.body,null); assert.ok(tombstone.cleared_at);
      assert.equal((await inbox.list(other)).notifications.length,1);
    });
    await t.test('cleared events cannot reappear on retry and retention expires both content and dedupe tombstones', async () => {
      const user = await fixture();
      const id = await send(user,'clear-retry');
      await inbox.clear(user,(await inbox.list(user)).snapshotCutoff);
      assert.equal(await send(user,'clear-retry'),null);
      await db.pool.query("UPDATE customer_notification_inbox SET created_at=NOW()-INTERVAL '91 days' WHERE id=$1",[id]);
      const expired = await send(user,'expired');
      await db.pool.query("UPDATE customer_notification_inbox SET created_at=NOW()-INTERVAL '91 days' WHERE id=$1",[expired]);
      assert.equal((await inbox.list(user)).unreadCount,0);
      assert.equal(await inbox.pruneExpired(),2);
      assert.equal((await db.pool.query('SELECT id FROM customer_notification_inbox WHERE user_id=$1',[user])).rowCount,0);
    });
    await t.test('pagination freezes the original boundary and does not include later arrivals', async () => {
      const user = await fixture();
      for(let i=0;i<55;i++) await send(user);
      const first = await inbox.list(user);
      assert.equal(first.notifications.length,50); assert.ok(first.nextCursor);
      const newer = await send(user);
      const second = await inbox.list(user,first.nextCursor);
      assert.equal(second.notifications.length,5); assert.equal(second.nextCursor,null);
      assert.equal(second.snapshotCutoff,first.snapshotCutoff);
      assert.equal(new Set([...first.notifications,...second.notifications].map(n=>n.id)).size,55);
      assert.equal([...first.notifications,...second.notifications].some(n=>n.id===newer),false);
      assert.equal((await inbox.markAllRead(user,second.snapshotCutoff)).unreadCount,1);
    });
    await t.test('a concurrent insert waits until the snapshot boundary is established', async () => {
      const user = await fixture(); await send(user);
      let reached, release;
      const reachedPromise = new Promise(resolve=>{reached=resolve;});
      const releasePromise = new Promise(resolve=>{release=resolve;});
      const paused = inboxModule.createInbox({transaction: callback=>db.withTransaction(client=>callback({
        query:async(...args)=>{const result=await client.query(...args); if(args[0].includes('COALESCE(MAX(id)')) {reached(); await releasePromise;} return result;}
      }))});
      const snapshot = paused.list(user);
      await reachedPromise;
      const insert = send(user);
      release();
      const page = await snapshot, newer = await insert;
      await inbox.clear(user,page.snapshotCutoff);
      assert.deepEqual((await inbox.list(user)).notifications.map(n=>n.id),[newer]);
    });
    await t.test('authenticated HTTP contract and cross-device read state', async () => {
      const express = require('express');
      const users = require('../src/repositories/users');
      const sessions = require('../src/services/sessionService');
      const user = await fixture(), other = await fixture();
      const session = await sessions.createAuthSession({user:await users.findUserById(user),authMethod:'password'});
      const app=express(); app.use(express.json()); app.use('/api/account',require('../src/routes/accountRoutes'));
      app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({message:error.message}));
      const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
      const base='http://127.0.0.1:'+server.address().port+'/api/account/notifications';
      const headers={authorization:'Bearer '+session.accessToken,'content-type':'application/json'};
      try {
        assert.equal((await fetch(base)).status,401);
        const id=await send(user), foreign=await send(other);
        const response=await fetch(base,{headers}); assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
        const page=await response.json(); assert.equal(page.unreadCount,1);
        const mutation=await fetch(base+'/'+foreign+'/read',{headers,method:'POST'}); assert.equal((await mutation.json()).unreadCount,1);
        await fetch(base+'/'+id+'/read',{headers,method:'POST'});
        assert.equal((await (await fetch(base,{headers})).json()).notifications[0].readAt!==null,true);
        assert.equal((await fetch(base+'/read-all',{headers,method:'POST',body:'{}'})).status,400);
        assert.equal((await fetch(base+'?cursor=bad',{headers})).status,400);
        const clear=await fetch(base+'/clear',{headers,method:'POST',body:JSON.stringify({before:page.snapshotCutoff})}); assert.equal(clear.status,200);
        assert.equal((await (await fetch(base,{headers})).json()).notifications.length,0);
      } finally {await new Promise(resolve=>server.close(resolve));}
    });
    await t.test('account deletion clears inbox and suppresses racing future notifications', async () => {
      const user=await fixture(); await send(user);
      const deletion=require('../src/services/accountDeletionService').createAccountDeletionService({refreshQueues:async()=>{}});
      await deletion.requestDeletion({userId:user,session:{authMethod:'google',primaryAuthenticatedAt:new Date()}});
      assert.equal((await db.pool.query('SELECT id FROM customer_notification_inbox WHERE user_id=$1',[user])).rowCount,0);
      assert.equal(await send(user),null);
    });
  } finally {
    await db.pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::bigint[])',[ids]);
    await db.pool.query('DELETE FROM users WHERE id=ANY($1::bigint[])',[ids]);
    await db.pool.end();
  }
});
