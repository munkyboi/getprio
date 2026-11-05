const test=require('node:test');
const assert=require('node:assert/strict');
const {notificationKind}=require('../src/services/notificationKind');
test('trusted notification provenance identifies booking, queue and developer ticket events',()=>{
  for(const eventType of ['customer_booking_payment_rejected','customer_booking_reminder_24h','customer_booking_reminder_1h'])assert.equal(notificationKind({eventType}),'booking');
  for(const eventType of ['customer_queue_service_started','customer_queue_expired','developer_ticket_near_turn'])assert.equal(notificationKind({eventType}),'queue');
});
test('legacy namespaces identify kinds with exact BIGINT values and unknown/conflicting data stays general',()=>{
  assert.equal(notificationKind({notificationKey:'booking:9007199254741103:schedule:10:reminder:1h'}),'booking');
  for(const notificationKey of ['queue-event:100:ticket_expired','queue-intent:ticket:1:queue-day:2:expired'])assert.equal(notificationKind({notificationKey}),'queue');
  for(const notificationKey of ['booking:1','queue-event:0:fake','random-uuid',undefined])assert.equal(notificationKind({notificationKey,eventType:'unknown',title:'Booking queue'}),'general');
  assert.equal(notificationKind({notificationKey:'queue-event:1:called',eventType:'customer_booking_confirmed'}),'general');
});
