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

test("queue join checkout marks the payment failed when checkout creation fails", async () => {
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
    ok: false,
    json: async () => ({
      errors: [{ detail: "checkout failed" }]
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
      (error) => error.statusCode === 502
    );

    assert.equal(createPaymentCalls.length, 1);
    assert.equal(updateProviderDataCalls.length, 0);
    assert.equal(markFailedCalls.length, 1);
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
