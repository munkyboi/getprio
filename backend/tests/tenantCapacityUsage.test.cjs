const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');

function capacityService({ usage = [], traffic = { queueTickets: { created: 7, unaccounted: 7 }, serviceBookings: { created: 3, unaccounted: 3 } }, hasPeriod = true, observedAt = '2026-10-14T00:00:00Z', limit = 5000, lots = [] } = {}) {
  const period = { start: '2026-10-01T00:00:00.000Z', end: '2026-11-01T00:00:00.000Z' };
  const policy = { lifecycle: { state: 'active', planSlug: 'pro', subscriptionId: '5' }, period: hasPeriod ? period : null,
    allowances: { queueTickets: { limit }, serviceBookings: { limit: 1000 } } };
  const calls = [];
  const mocks = {
    '../config/db': { withTransaction: callback => callback({ query: async sql => ({ rows: sql.includes('CURRENT_TIMESTAMP') ? [{ now: observedAt }] : [] }) }) }, '../config/env': {}, '../config/releaseControls': {},
    '../repositories/usageCredits': { listLots: async () => lots },
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


test('capacity accepts only windows containing the database observation time', async () => {
  for (const [observedAt, available] of [['2026-09-30T23:59:59Z', false], ['2026-10-01T00:00:00Z', true], ['2026-11-01T00:00:00Z', false]]) {
    const { service, calls } = capacityService({ observedAt });
    const result = await service.getTenantCapacity('5');
    assert.equal(result.usageAvailable, available);
    assert.equal(calls.length, available ? 1 : 0);
    if (!available) assert.equal(result.resources.queueTickets.used, null);
  }
});

test('unaccounted tickets reduce projected credit availability after unused base capacity', async () => {
  const lots = [{ id: '1', resource_key: 'queueTickets', status: 'active', granted_units: 10, revoked_units: 0, frozen_units: 0 }];
  const { service } = capacityService({ limit: 5, lots,
    usage: [{ resource_key: 'queueTickets', base_used: 4, credit_used: 0 }],
    traffic: { queueTickets: { created: 6, unaccounted: 2 } } });
  const result = await service.getTenantCapacity('5');
  assert.equal(result.resources.queueTickets.used, 5);
  assert.equal(result.resources.queueTickets.creditRemaining, 9);
  assert.equal(result.resources.queueTickets.unaccountedCreditUsed, 1);
  assert.equal(result.resources.queueTickets.creditUsed, 0);
  assert.equal(result.lots[0].remainingUnits, 10);
  assert.equal(lots[0].granted_units, 10);
});

test('projection excludes expired credits and retains uncovered usage without negative balances', async () => {
  const lots = [{ id: '1', resource_key: 'queueTickets', status: 'active', granted_units: 1, revoked_units: 0, frozen_units: 0 },
    { id: '2', resource_key: 'queueTickets', status: 'active', granted_units: 10, revoked_units: 0, frozen_units: 0, expires_at: '2026-10-13T00:00:00Z' }];
  const { service } = capacityService({ limit: 5, lots,
    usage: [{ resource_key: 'queueTickets', base_used: 4, credit_used: 0 }],
    traffic: { queueTickets: { created: 8, unaccounted: 4 } } });
  const result = await service.getTenantCapacity('5');
  assert.equal(result.resources.queueTickets.used, 7);
  assert.equal(result.resources.queueTickets.creditRemaining, 0);
  assert.equal(result.resources.queueTickets.unaccountedCreditUsed, 1);
});

test('monthly usage DTO retains canonical credit-adjusted usage and excludes commercial and ledger details', async () => {
  const { service, period } = capacityService({ limit: 5,
    lots: [{ id: '1', resource_key: 'queueTickets', status: 'active', granted_units: 10, revoked_units: 0, frozen_units: 0, reason: 'private commercial reason' }],
    usage: [{ resource_key: 'queueTickets', base_used: 4, credit_used: 0 }],
    traffic: { queueTickets: { created: 6, unaccounted: 2 }, serviceBookings: { created: 2, unaccounted: 2 } } });
  const result = await service.getTenantUsage('5');
  assert.deepEqual(result, {
    subscriptionId: '5', planSlug: 'pro', observedAt: '2026-10-14T00:00:00Z', period, usageAvailable: true,
    resources: {
      queueTickets: { limit: 5, used: 5, observedUsed: 6, accountingStatus: 'partial' },
      serviceBookings: { limit: 1000, used: 2, observedUsed: 2, accountingStatus: 'partial' }
    }
  });
});

test('monthly usage DTO preserves unknown usage and valid zero usage separately', async () => {
  for (const hasPeriod of [false, true]) {
    const { service, calls } = capacityService({ hasPeriod, traffic: {} });
    const result = await service.getTenantUsage('5');
    assert.equal(result.usageAvailable, hasPeriod);
    assert.equal(result.resources.queueTickets.used, hasPeriod ? 0 : null);
    assert.equal(result.resources.queueTickets.observedUsed, hasPeriod ? 0 : null);
    assert.equal(result.resources.queueTickets.accountingStatus, hasPeriod ? 'complete' : 'unavailable');
    assert.equal(calls.length, hasPeriod ? 1 : 0);
    if (!hasPeriod) assert.equal(result.period, null);
  }
});
