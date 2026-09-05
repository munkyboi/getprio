const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

require("tsx/cjs");

function resolveMockPath(requestPath, baseDir) {
  if (!requestPath.startsWith(".")) {
    return require.resolve(requestPath, { paths: [baseDir] });
  }

  const absoluteBase = path.resolve(baseDir, requestPath);
  const candidates = [
    absoluteBase,
    `${absoluteBase}.js`,
    `${absoluteBase}.ts`,
    path.join(absoluteBase, "index.js"),
    path.join(absoluteBase, "index.ts")
  ];

  for (const candidate of candidates) {
    try {
      return require.resolve(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`Unable to resolve mock path: ${requestPath}`);
}

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();

  try {
    for (const [requestPath, mockExports] of Object.entries(mocks)) {
      const resolvedDependency = resolveMockPath(requestPath, path.dirname(resolvedTarget));
      originals.set(resolvedDependency, require.cache[resolvedDependency]);
      require.cache[resolvedDependency] = {
        id: resolvedDependency,
        filename: resolvedDependency,
        loaded: true,
        exports: mockExports
      };
    }

    delete require.cache[resolvedTarget];
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, originalEntry] of originals.entries()) {
      if (originalEntry) {
        require.cache[resolvedDependency] = originalEntry;
      } else {
        delete require.cache[resolvedDependency];
      }
    }
  }
}

test("paid ticket sends joined push once after commit, even when payment is replayed", async () => {
  let committed = false;
  let issued = false;
  const pushes = [];
  const payment = { _id: '1', tenantId: '2', status: 'paid', amountCents: 100, currency: 'PHP', payload: { locationSlug: 'main' } };
  const service = requireWithMocks('../src/services/queueJoinPaymentService.js', {
    '../config/db': { withTransaction: async (fn) => { const result = await fn({}); committed = true; return result; } },
    '../repositories/queueJoinPayments': {
      findPaymentByProviderId: async () => payment,
      findPaymentByIdForUpdate: async () => issued ? { ...payment, ticketId: '3', ticketLookupCode: 'A001' } : payment,
      markPaidWithTicket: async () => { issued = true; return { ...payment, ticketId: '3', ticketLookupCode: 'A001' }; }
    },
    '../repositories/tenants': { findTenantById: async () => ({ _id: '2', slug: 'clinic', name: 'Clinic' }) },
    '../repositories/storeLocations': { findLocationByTenantAndSlug: async () => ({ _id: '4' }) },
    '../repositories/billing': { recordBillingEvent: async () => ({ id: 'event' }) },
    './queueFeeService': { assertTenantCanAcceptCustomerJoins: async () => {} },
    './queueService': {
      createTicketForTenantInTransaction: async () => ({ _id: '3', userId: 'customer', ticketNumber: 'A001', lookupCode: 'A001' }),
      maybeNotifyUpcomingTickets: async () => {}, publishSnapshot: async () => ({})
    },
    './pushNotificationService': { notifyCustomerQueueUpdate: async (input) => { assert.equal(committed, true); pushes.push(input); } }
  });
  await service.handlePayMongoPaidCheckout({ id: 'checkout', attributes: {} }, {});
  await service.handlePayMongoPaidCheckout({ id: 'checkout', attributes: {} }, {});
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].action, 'joined');
  assert.equal(pushes[0].ticket.userId, 'customer');
});

test("free ticket sends joined push after commit and push failure does not fail joining", async () => {
  let committed = false;
  const pushes = [];
  const location = { _id: '4' };
  const service = requireWithMocks('../src/services/queueService.js', {
    '../config/db': { withTransaction: async (fn) => { const result = await fn({}); committed = true; return result; } },
    '../repositories/queueDayClosures': { findActiveClosure: async () => null },
    '../repositories/queueDayPauses': { findActivePause: async () => null },
    '../repositories/queueEvents': { createQueueEvent: async () => {} },
    './queueSnapshotHelpers': { resolveLocation: async () => location, buildQueueSnapshot: async () => ({}) },
    './queueEvents': { publish: () => {} },
    './queueTicketPersistenceHelpers': {
      reserveNextSequence: async () => 1,
      createTicketRecord: async (_client, input) => ({ ...input, _id: '3', lookupCode: 'A001' })
    },
    './allowanceService': { consumeAllowance: async () => ({}) },
    './queueAutomationHelpers': { maybeNotifyUpcomingTickets: async () => {}, maybeAutoPauseQueueDay: async () => {} },
    './notificationService': { notifyJourneyLifecycle: async () => {} },
    './pushNotificationService': { notifyCustomerQueueUpdate: async (input) => {
      assert.equal(committed, true); pushes.push(input); throw new Error('Push unavailable');
    } }
  });
  const result = await service.createTicket({ tenant: { _id: '2', slug: 'clinic', queuePrefix: 'A', notificationSettings: { queueJoin: false } }, userId: 'customer' });
  assert.equal(result.ticket._id, '3');
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].action, 'joined');
});
