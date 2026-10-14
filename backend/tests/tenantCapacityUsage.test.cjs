const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');

function capacityService({ usage = [], traffic = { queueTickets: { created: 7, unaccounted: 7 }, serviceBookings: { created: 3, unaccounted: 3 } }, hasPeriod = true } = {}) {
  const period = { start: '2026-10-01T00:00:00.000Z', end: '2026-11-01T00:00:00.000Z' };
  const policy = { lifecycle: { state: 'active', planSlug: 'pro', subscriptionId: '5' }, period: hasPeriod ? period : null,
    allowances: { queueTickets: { limit: 5000 }, serviceBookings: { limit: 1000 } } };
  const calls = [];
  const mocks = {
    '../config/db': { withTransaction: callback => callback({ query: async () => ({ rows: [] }) }) }, '../config/env': {}, '../config/releaseControls': {},
    '../repositories/usageCredits': { listLots: async () => [] },
    '../repositories/allowanceLedger': { getCapacity: async () => ({ usage, warnings: [] }) },
    './entitlementResolver': { resolveTenantPolicy: async () => policy },
    '../repositories/subscriptionUsage': { getCycleUsage: async (tenantId, window) => {
      calls.push({ tenantId, window });
      return traffic;
    } }
  };
  const service = loadModuleWithMocks(require.resolve('../src/services/usageCreditService'), mocks);
  return { service, calls, period };
}

test('capacity reports committed ticket and booking traffic even when allowance accounting was gated', async () => {
  const { service, calls, period } = capacityService();
  const capacity = await service.getTenantCapacity('5');
  assert.equal(capacity.resources.queueTickets.used, 7);
  assert.equal(capacity.resources.serviceBookings.used, 3);
  assert.deepEqual(calls, [{ tenantId: '5', window: period }]);
});

test('accounted traffic is not double charged and credit usage remains separate', async () => {
  const { service } = capacityService({ usage: [{ resource_key: 'queueTickets', base_used: 4, credit_used: 2 }],
    traffic: { queueTickets: { created: 8, unaccounted: 2 } } });
  const { resources } = await service.getTenantCapacity('5');
  assert.equal(resources.queueTickets.used, 6);
  assert.equal(resources.queueTickets.observedUsed, 8);
  assert.equal(resources.queueTickets.creditUsed, 2);
  assert.equal(resources.queueTickets.unaccountedUsed, 2);
});

test('missing subscription window reports unavailable usage instead of a fabricated zero', async () => {
  const { service, calls } = capacityService({ hasPeriod: false });
  const result = await service.getTenantCapacity('5');
  assert.equal(result.usageAvailable, false);
  assert.equal(result.period, null);
  assert.equal(result.resources.queueTickets.used, null);
  assert.equal(result.resources.serviceBookings.observedUsed, null);
  assert.equal(calls.length, 0);
});
