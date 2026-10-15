const test = require('node:test');
const assert = require('node:assert/strict');
const { customerQueueLifecycle } = require('../src/services/customerQueueLifecycle');

test('customer lifecycle preserves recovery and carry-over while reporting explicit service', () => {
  for (const [status, state] of [['waiting','waiting'],['called','called'],['skipped','recovery'],
    ['pending_carry_over','pending_carry_over'],['served','terminal'],['unserved','terminal'],
    ['cancelled','terminal'],['expired','terminal']]) {
    assert.deepEqual(customerQueueLifecycle({status}), {version:1,state,resourceWait:null});
  }
  assert.equal(customerQueueLifecycle({status:'unserved',serviceStartedAt:'2026-10-15',serviceEndedAt:null}).state,'in_service');
  assert.equal(customerQueueLifecycle({status:'unserved',serviceStartedAt:'2026-10-15',serviceEndedAt:'2026-10-16'}).state,'terminal');
});

test('unknown status and developer tickets do not claim the customer queue contract', () => {
  assert.equal(customerQueueLifecycle({status:'new_status'}),null);
  assert.equal(customerQueueLifecycle({status:'called',developerProjectId:'1'}),null);
  assert.equal(customerQueueLifecycle({status:'called',isDeveloperApiTicket:true}),null);
});
