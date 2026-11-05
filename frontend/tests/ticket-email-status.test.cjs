require("tsx/cjs");
const test=require('node:test');
const assert=require('node:assert/strict');
const {getBookingEmailStatus,needsEmailDeliveryFallback}=require('../src/utils/ticketEmailStatus.ts');
test('legacy quota exhaustion never advertises enabled delivery without backend retirement',()=>{
 const ticket={notifyByEmail:true,emailJourneyMode:'journey_exhausted'};
 assert.equal(needsEmailDeliveryFallback(ticket),true);
 for(const policy of [null,"metered","true"])assert.equal(needsEmailDeliveryFallback(ticket,policy),true);
 assert.match(getBookingEmailStatus(ticket),/not confirmed/);
 assert.equal(needsEmailDeliveryFallback(ticket,"unmetered"),false);
 assert.match(getBookingEmailStatus(ticket,"unmetered"),/^Enabled/);
});
test('disabled and unknown preferences remain distinct from enabled email updates',()=>{
 assert.equal(needsEmailDeliveryFallback({notifyByEmail:false,emailJourneyMode:'journey_exhausted'}),false);
 assert.match(getBookingEmailStatus({notifyByEmail:false}),/Not enabled/);
 assert.match(getBookingEmailStatus(null),/unavailable/);
 assert.match(getBookingEmailStatus({notifyByEmail:true,emailJourneyMode:'metered'}),/^Enabled/);
});
