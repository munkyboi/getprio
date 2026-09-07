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

test("enabled queue fee starts checkout without notification opt-ins and marks checkout failures", async () => {
  const createPaymentCalls = [];
  const updateProviderDataCalls = [];
  const markFailedCalls = [];
  let checkoutRequest;

  const queueJoinPaymentService = requireWithMocks("../src/services/queueJoinPaymentService.js", {
    "../config/env": {
      paymongoSecretKey: "secret",
      paymongoApiUrl: "https://api.paymongo.test/v1",
      paymongoPaymentMethodTypes: ["card"],
      clientUrl: "http://localhost:5173"
    },
    "../repositories/queueJoinPayments": {
      createPayment: async (data) => {
        createPaymentCalls.push(data);
        return {
          _id: "payment-1",
          tenantId: String(data.tenantId),
          otpId: String(data.otpId),
          planSlug: data.planSlug,
          provider: data.provider,
          amountCents: data.amountCents,
          currency: data.currency,
          status: "pending",
          checkoutUrl: null,
          providerCheckoutSessionId: null,
          payload: data.payload,
          metadata: data.metadata,
          ticketId: null,
          ticketLookupCode: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      },
      updateProviderData: async (paymentId, data) => {
        updateProviderDataCalls.push({ paymentId, data });
        return {
          _id: String(paymentId),
          tenantId: "tenant-1",
          otpId: "otp-1",
          planSlug: "economical",
          provider: "paymongo",
          amountCents: 1000,
          currency: "PHP",
          status: "pending",
          checkoutUrl: data.checkoutUrl,
          providerCheckoutSessionId: data.providerCheckoutSessionId,
          payload: {},
          metadata: data.metadata,
          ticketId: null,
          ticketLookupCode: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      },
      markFailed: async (paymentId, data) => {
        markFailedCalls.push({ paymentId, data });
        return null;
      }
    },
    "../repositories/storeLocations": {
      findLocationByTenantAndSlug: async () => ({
        _id: "location-1",
        slug: "main",
        queueLifecycleMode: "legacy"
      }),
      findPrimaryLocationByTenantId: async () => null
    },
    "../services/queueFeeService": {
      assertTenantCanAcceptCustomerJoins: async () => {},
      getQueueFeeForTenant: async () => ({
        enabled: true,
        amountCents: 1000,
        currency: "PHP",
        displayAmount: "PHP 10.00",
        planSlug: "economical"
      }),
      getActiveTenantSubscription: async () => null
    },
    "./queueService": {
      createTicketForTenantInTransaction: async () => {
        throw new Error("Not used in this test.");
      },
      maybeNotifyUpcomingTickets: async () => {},
      publishSnapshot: async () => {}
    }
  });

  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    checkoutRequest = JSON.parse(options.body);
    return {
      ok: false,
      json: async () => ({
        errors: [{ detail: "checkout failed" }]
      })
    };
  };

  try {
    await assert.rejects(
      () =>
        queueJoinPaymentService.handleVerifiedJoin({
          tenant: {
            _id: "tenant-1",
            slug: "demo",
            name: "Demo Tenant"
          },
          otpId: "otp-1",
          payload: {
            customerName: "Customer One",
            customerEmail: "customer@example.com",
            customerPhone: "09170000000",
            notifyByEmail: false,
            notifyBySms: false,
            joinChannel: "online",
            locationSlug: "main",
            mobileReturnUrl: "https://getprio.online/payment/return",
            notes: ""
          }
        }),
      (error) => error.statusCode === 502
    );

    assert.equal(createPaymentCalls.length, 1);
    assert.equal(updateProviderDataCalls.length, 0);
    assert.equal(markFailedCalls.length, 1);
    assert.equal(
      checkoutRequest.data.attributes.success_url,
      "https://getprio.online/payment/return?payment=payment-1&payment_status=success&tenantSlug=demo&locationSlug=main"
    );
    assert.match(markFailedCalls[0].data.metadata.failureReason, /checkout failed/i);
    assert.equal(markFailedCalls[0].data.metadata.failureStatusCode, 502);
  } finally {
    global.fetch = originalFetch;
  }
});

test("queue join checkout preserves provider identifiers when local linking fails", async () => {
  const createPaymentCalls = [];
  const updateProviderDataCalls = [];
  const markFailedCalls = [];

  const queueJoinPaymentService = requireWithMocks("../src/services/queueJoinPaymentService.js", {
    "../config/env": {
      paymongoSecretKey: "secret",
      paymongoApiUrl: "https://api.paymongo.test/v1",
      paymongoPaymentMethodTypes: ["card"],
      clientUrl: "http://localhost:5173"
    },
    "../repositories/queueJoinPayments": {
      createPayment: async (data) => {
        createPaymentCalls.push(data);
        return {
          _id: "payment-1",
          tenantId: String(data.tenantId),
          otpId: String(data.otpId),
          planSlug: data.planSlug,
          provider: data.provider,
          amountCents: data.amountCents,
          currency: data.currency,
          status: "pending",
          checkoutUrl: null,
          providerCheckoutSessionId: null,
          payload: data.payload,
          metadata: data.metadata,
          ticketId: null,
          ticketLookupCode: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      },
      updateProviderData: async (paymentId, data) => {
        updateProviderDataCalls.push({ paymentId, data });
        throw new Error("provider link failed");
      },
      markFailed: async (paymentId, data) => {
        markFailedCalls.push({ paymentId, data });
        return null;
      }
    },
    "../repositories/storeLocations": {
      findLocationByTenantAndSlug: async () => ({
        _id: "location-1",
        slug: "main",
        queueLifecycleMode: "legacy"
      }),
      findPrimaryLocationByTenantId: async () => null
    },
    "../services/queueFeeService": {
      assertTenantCanAcceptCustomerJoins: async () => {},
      getQueueFeeForTenant: async () => ({
        enabled: true,
        amountCents: 1000,
        currency: "PHP",
        displayAmount: "PHP 10.00",
        planSlug: "economical"
      }),
      getActiveTenantSubscription: async () => null
    },
    "./queueService": {
      createTicketForTenantInTransaction: async () => {
        throw new Error("Not used in this test.");
      },
      maybeNotifyUpcomingTickets: async () => {},
      publishSnapshot: async () => {}
    }
  });

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: {
        id: "checkout_123",
        attributes: {
          checkout_url: "https://paymongo.test/checkout_123",
          client_key: "client_123"
        }
      }
    })
  });

  try {
    await assert.rejects(
      () =>
        queueJoinPaymentService.handleVerifiedJoin({
          tenant: {
            _id: "tenant-1",
            slug: "demo",
            name: "Demo Tenant"
          },
          otpId: "otp-1",
          payload: {
            customerName: "Customer One",
            customerEmail: "customer@example.com",
            customerPhone: "09170000000",
            notifyByEmail: false,
            notifyBySms: true,
            joinChannel: "online",
            locationSlug: "main",
            notes: ""
          }
        }),
      (error) => /provider link failed/i.test(error.message)
    );

    assert.equal(createPaymentCalls.length, 1);
    assert.equal(updateProviderDataCalls.length, 1);
    assert.equal(markFailedCalls.length, 1);
    assert.equal(markFailedCalls[0].data.providerCheckoutSessionId, "checkout_123");
    assert.equal(markFailedCalls[0].data.checkoutUrl, "https://paymongo.test/checkout_123");
    assert.match(markFailedCalls[0].data.metadata.failureReason, /provider link failed/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("queue join payment sync returns the issued ticket lookup code for paid payments", async () => {
  const publishSnapshotCalls = [];

  const queueJoinPaymentService = requireWithMocks("../src/services/queueJoinPaymentService.js", {
    "../repositories/queueJoinPayments": {
      findPaymentById: async () => ({
        _id: "payment-1",
        tenantId: "tenant-1",
        payload: { locationSlug: "main" },
        providerCheckoutSessionId: "checkout_1",
        ticketId: "ticket-1",
        ticketLookupCode: "ABC12345",
        amountCents: 1000,
        currency: "PHP",
        status: "paid",
        createdAt: new Date(),
        updatedAt: new Date()
      })
    },
    "../repositories/tenants": {
      findTenantById: async () => ({
        _id: "tenant-1",
        slug: "demo",
        name: "Demo Tenant"
      })
    },
    "../repositories/storeLocations": {
      findLocationByTenantAndSlug: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        slug: "main",
        name: "Main",
        timezone: "Asia/Manila",
        isPrimary: true,
        isActive: true
      })
    },
    "../repositories/billing": {
      recordBillingEvent: async () => ({ id: "billing-event-1" })
    },
    "../services/queueFeeService": {
      assertTenantCanAcceptCustomerJoins: async () => {}
    },
    "./queueService": {
      maybeNotifyUpcomingTickets: async () => {},
      publishSnapshot: async (_tenant, options) => {
        publishSnapshotCalls.push(options);
        return {
          focusTicket: {
            id: "ticket-1",
            lookupCode: "ABC12345",
            ticketNumber: "DMO-001",
            customerName: "Customer One",
            status: "waiting"
          }
        };
      }
    }
  });

  const result = await queueJoinPaymentService.syncQueueJoinPayment({
    tenant: {
      _id: "tenant-1",
      slug: "demo",
      name: "Demo Tenant"
    },
    paymentId: "payment-1"
  });

  assert.equal(result.paid, true);
  assert.equal(result.ticket.lookupCode, "ABC12345");
  assert.equal(result.ticket.ticketNumber, "DMO-001");
  assert.equal(publishSnapshotCalls.length, 1);
  assert.equal(publishSnapshotCalls[0].lookupCode, "ABC12345");
  assert.equal(publishSnapshotCalls[0].locationSlug, "main");
});

test("queue join payment formats payment payloads and resolves monitor urls", async () => {
  const queueJoinPaymentService = requireWithMocks("../src/services/queueJoinPaymentService.js", {
    "../repositories/tenants": {
      findTenantById: async () => ({ slug: "demo" })
    },
    "../repositories/queueJoinPayments": {},
    "../repositories/billing": {
      recordBillingEvent: async () => null
    },
    "../repositories/storeLocations": {},
    "../services/queueFeeService": {},
    "./queueService": {}
  });

  const formatted = queueJoinPaymentService.formatPayment({
    _id: "payment-1",
    tenantId: "tenant-1",
    tenantName: "Demo",
    tenantSlug: "demo",
    otpId: "otp-1",
    planSlug: "economical",
    provider: "paymongo",
    providerCheckoutSessionId: "checkout-1",
    checkoutUrl: "https://checkout.example.test",
    amountCents: 1000,
    currency: "PHP",
    status: "pending",
    ticketId: null,
    ticketLookupCode: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z"
  });
  assert.equal(formatted.id, "payment-1");

  const monitorUrl = await queueJoinPaymentService.getMonitorUrlForPayment({
    tenantId: "tenant-1",
    ticketLookupCode: "ABC123",
    payload: { locationSlug: "main" }
  });
  assert.match(monitorUrl, /ticket=ABC123/);
});

test("queue join payment ignores duplicate paid-webhook events and missing payments", async () => {
  const recordBillingEventCalls = [];
  const queueJoinPaymentService = requireWithMocks("../src/services/queueJoinPaymentService.js", {
    "../repositories/queueJoinPayments": {
      findPaymentByProviderId: async (providerCheckoutSessionId) =>
        providerCheckoutSessionId === "checkout-1"
          ? {
              _id: "payment-1",
              tenantId: "tenant-1",
              status: "pending"
            }
          : null,
      updateProviderData: async () => ({
        _id: "payment-1",
        tenantId: "tenant-1",
        status: "paid",
        payload: {},
        amountCents: 1000,
        currency: "PHP"
      }),
      markFailed: async () => {}
    },
    "../repositories/billing": {
      recordBillingEvent: async (...args) => {
        recordBillingEventCalls.push(args);
        return null;
      }
    },
    "../repositories/tenants": { findTenantById: async () => ({ slug: "demo" }) },
    "../repositories/storeLocations": {},
    "../services/queueFeeService": {},
    "./queueService": {
      createTicketForTenantInTransaction: async () => ({
        ticket: { _id: "ticket-1", lookupCode: "ABC123" },
        snapshot: { focusTicket: { id: "ticket-1", lookupCode: "ABC123", ticketNumber: "Q001", customerName: "Jane", status: "waiting" } }
      }),
      maybeNotifyUpcomingTickets: async () => {},
      publishSnapshot: async () => ({})
    }
  });

  const duplicate = await queueJoinPaymentService.handlePayMongoPaidCheckout(
    { id: "checkout-1", attributes: { payments: [{ id: "payment-1", attributes: { paid_at: "2026-07-01T00:00:00Z" } }] } },
    { data: { id: "event-1", attributes: { type: "checkout_session.payment.paid" } } }
  );
  assert.equal(duplicate.handled, true);

  const missing = await queueJoinPaymentService.handlePayMongoPaidCheckout(
    { id: "checkout-missing", attributes: { payments: [{ id: "payment-1", attributes: { paid_at: "2026-07-01T00:00:00Z" } }] } },
    { data: { id: "event-2", attributes: { type: "checkout_session.payment.paid" } } }
  );
  assert.equal(missing.handled, false);
  assert.equal(recordBillingEventCalls.length >= 1, true);
});

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

for (const pending of [false, true]) {
test(`free ticket completes after commit when joined push ${pending ? "stays pending" : "fails"}`, { timeout: 1000 }, async () => {
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
      assert.equal(committed, true); pushes.push(input);
      if (pending) return new Promise(() => {});
      throw new Error('Push unavailable');
    } }
  });
  const result = await service.createTicket({ tenant: { _id: '2', slug: 'clinic', queuePrefix: 'A', notificationSettings: { queueJoin: false } }, userId: 'customer' });
  assert.equal(result.ticket._id, '3');
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].action, 'joined');
});

}
