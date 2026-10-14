const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');

test('obsolete email allowance switches cannot charge or reserve email credits', async () => {
  const calls = [];
  const service = loadModuleWithMocks(require.resolve('../src/services/allowanceService'), {
    '../repositories/allowanceLedger': { consumeBase: async input => { calls.push(input); return { consumed: false }; },
      reserve: async input => { calls.push(input); return { reserved: false }; } },
    './entitlementResolver': { resolveTenantPolicy: async () => ({ lifecycle: { state: 'active', subscriptionId: '5' },
      authority: { served: 'new' }, allowances: { queueEmailJourneys: { limit: 0 } } }) }
  });
  const input = { tenantId: '5', resourceKey: 'queueEmailJourneys', units: 1 };
  const options = { controls: { allowanceQueueEmailJourneys: true } };
  assert.equal((await service.consumeAllowance(input, options)).bypassed, 'retired_resource');
  assert.equal((await service.reserveAllowance(input, options)).bypassed, 'retired_resource');
  assert.deepEqual(calls, []);
});

test('all active plan policies omit the retired email quota even with historical overrides', () => {
  const resolver = require('../src/services/entitlementResolver');
  const fixtures = require('../src/domain/planPolicyFixtures').PLAN_POLICY_FIXTURES;
  for (const [slug, fixture] of Object.entries(fixtures)) {
    assert.equal(Object.hasOwn(fixture.allowances, 'queueEmailJourneys'), false, slug);
    const values = resolver.buildNewValues({ ...fixture,
      overrides: [{ policyKey: 'allowance.queueEmailJourneys', value: 1 }] }, new Date());
    assert.equal(Object.hasOwn(values.allowances, 'queueEmailJourneys'), false, slug);
  }
});

test('ticket and booking exhaustion still rejects admission after email retirement', async () => {
  const charged = [];
  const service = loadModuleWithMocks(require.resolve('../src/services/allowanceService'), {
    '../repositories/allowanceLedger': { consumeBase: async input => { charged.push(input.resourceKey); return { consumed: false, available: 0 }; } },
    './entitlementResolver': { resolveTenantPolicy: async () => ({ lifecycle: { state: 'active', subscriptionId: '5' },
      authority: { served: 'new' }, period: { start: '2026-10-01', end: '2026-11-01' },
      allowances: { queueTickets: { limit: 1 }, serviceBookings: { limit: 1 } } }) }
  });
  for (const resourceKey of ['queueTickets', 'serviceBookings']) {
    await assert.rejects(service.consumeAllowance({ tenantId: '5', resourceKey, units: 1 }, {
      controls: { allowanceQueueTickets: true, allowanceServiceBookings: true }
    }), error => error.statusCode === 409 && error.code.endsWith('_EXHAUSTED'));
  }
  assert.deepEqual(charged, ['queueTickets', 'serviceBookings']);
});

test('new journey credit grants and catalog revisions are rejected without writes', async () => {
  let writes = 0;
  const service = loadModuleWithMocks(require.resolve('../src/services/usageCreditService'), {
    '../config/releaseControls': { usageCreditGrants: true, usageCreditCatalog: true },
    '../config/db': { withTransaction: () => { writes++; throw new Error('unexpected transaction'); } }
  });
  await assert.rejects(service.grant({ ticketUnits: 1, journeyUnits: 1, reason: 'test grant' }, '1'), { code: 'EMAIL_CREDITS_RETIRED' });
  await assert.rejects(service.publishPack('P100', { ticketUnits: 100, journeyUnits: 1 }, '1'), { code: 'EMAIL_CREDITS_RETIRED' });
  assert.equal(writes, 0);
});

test('retrying a pre-retirement purchase uses its immutable ticket and monetary snapshot', async () => {
  const purchase = { id: '12', pack_id: '1', pack_revision_id: '7', ticket_units: 100,
    journey_units: 100, amount_cents: 9900, currency: 'PHP' };
  let request;
  const service = loadModuleWithMocks(require.resolve('../src/services/usageCreditService'), {
    '../config/releaseControls': { usageCreditCheckout: true },
    '../config/env': { paymongoSecretKey: 'fixture', paymongoApiUrl: 'https://example.invalid',
      clientUrl: 'https://example.invalid', paymongoPaymentMethodTypes: ['qrph'] },
    './entitlementResolver': { resolveTenantPolicy: async () => ({ lifecycle: { state: 'active' } }) },
    '../repositories/usageCredits': { findPack: async () => ({ id: '1', revision_id: '8', current_revision: 2,
      code: 'P100', name: 'P100', state: 'enabled', ticket_units: 200, journey_units: 0, price_cents: 20000, currency: 'PHP' }),
      createPurchase: async () => purchase, attachProviderCheckout: async () => {} }
  });
  const original = global.fetch;
  global.fetch = async (_url, options) => {
    request = JSON.parse(options.body).data.attributes;
    return { ok: true, json: async () => ({ data: { id: 'checkout', attributes: { checkout_url: 'https://example.invalid/pay' } } }) };
  };
  try {
    await service.createCheckout({ tenant: { _id: '5', name: 'Vendor' }, user: { _id: '1' }, packCode: 'P100', purchaseKey: 'same-key' });
    assert.equal(request.line_items[0].amount, 9900);
    assert.equal(request.line_items[0].description, '100 Queue Tickets');
    assert.equal(request.metadata.packRevisionId, '7');
    assert.equal(purchase.journey_units, 100);
  } finally { global.fetch = original; }
});
