require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {linearQueueRecovery}=require('../src/vendor/linearQueueErrors.ts');
test('known reservation and plan errors provide recovery without backend diagnostics',()=>{
 for(const code of ['RESOURCE_CAPACITY_UNAVAILABLE','SERVICE_PLAN_REQUIRED','SERVICE_PLAN_STALE','TICKET_RESERVATION_STALE','TICKET_RESERVATION_CONFLICT']){
  const result=linearQueueRecovery(code,'internal diagnostic');
  assert.ok(result);assert.ok(!result.includes('internal diagnostic'));
 }
});
test('legacy capacity failure is recognized exactly without masking unrelated errors',()=>{
 assert.match(linearQueueRecovery(undefined,'Protected resource capacity is unavailable.'),/Resources are unavailable/);
assert.match(linearQueueRecovery('RESOURCE_CONFIGURATION_CHANGED','Resource configuration changed.'),/Amend request/);
assert.match(linearQueueRecovery('STALE_REVISION','stale'),/save the amendment/);
 assert.equal(linearQueueRecovery(undefined,'Forbidden'),null);
 assert.equal(linearQueueRecovery('OTHER','Service failed'),null);
});

test('known hours action failures use friendly recovery without changing unrelated errors',()=>{
 const {serviceHoursRecovery}=require('../src/vendor/linearQueueErrors.ts');
 assert.equal(linearQueueRecovery('SERVICE_DURATION_EXCEEDS_STORE_HOURS','internal policy diagnostic'),"This request can't finish before closing. Choose a shorter duration or try during opening hours.");
 assert.equal(linearQueueRecovery('STORE_HOURS_UNAVAILABLE','internal hours diagnostic'),"We couldn't check the opening hours. Refresh and try again.");
 assert.equal(serviceHoursRecovery('FORBIDDEN'),null);assert.equal(linearQueueRecovery('FORBIDDEN','Forbidden'),null);
});
