const test=require('node:test');
const assert=require('node:assert/strict');
const {reminderPayload}=require('../src/services/bookingReminderService');
test('booking reminder preserves exact route and shows the scheduled date in branch timezone',()=>{
  const payload=reminderPayload({id:'9007199254741103',reference:'BKG-TEST',tenant_name:'Vendor',timezone:'Asia/Manila',scheduled_start_at:'2026-10-13T16:30:00Z'},
    {booking_reminder_stage:'24h',idempotency_key:'booking:9007199254741103:schedule:7:reminder:24h'});
  assert.equal(payload.route,'/account/bookings/9007199254741103');
  assert.equal(payload.eventType,'customer_booking_reminder_24h');
  assert.match(payload.body,/Oct 14, 2026/);assert.match(payload.body,/12:30 AM/);
  assert.equal(payload.notificationId,payload.tag);
});
