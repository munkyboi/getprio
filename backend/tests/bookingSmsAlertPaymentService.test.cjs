const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

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

test("booking SMS alert payment service handles no-fee, checkout, sync, and webhook branches", async () => {
  const createdPayments = [];
  const providerUpdates = [];
  const markedFailed = [];
  const markedPaid = [];
  const verifiedPayloads = [];
  const feeRequests = [];
  let currentFee = {
    enabled: false,
    amountCents: 0,
    currency: "PHP",
    displayAmount: "PHP 0.00",
    planSlug: "economical"
  };
  const smsService = requireWithMocks("../src/services/bookingSmsAlertPaymentService.js", {
    "../config/env": {
      clientUrl: "https://app.example.com",
      paymongoSecretKey: "secret",
      paymongoApiUrl: "https://api.paymongo.test/v1",
      paymongoPaymentMethodTypes: ["card"]
    },
    "../repositories/bookingSmsAlertPayments": {
      createPayment: async (data) => {
        createdPayments.push(data);
        return {
          _id: "payment-1",
          tenantId: String(data.tenantId),
          bookingOtpId: String(data.bookingOtpId),
          planSlug: data.planSlug,
          provider: data.provider,
          providerCheckoutSessionId: null,
          checkoutUrl: null,
          amountCents: data.amountCents,
          currency: data.currency,
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date()
        };
      },
      updateProviderData: async (paymentId, data) => {
        providerUpdates.push({ paymentId, data });
        return {
          _id: String(paymentId),
          tenantId: "tenant-1",
          bookingOtpId: "otp-1",
          planSlug: "economical",
          provider: "paymongo",
          providerCheckoutSessionId: data.providerCheckoutSessionId,
          checkoutUrl: data.checkoutUrl,
          amountCents: 1000,
          currency: "PHP",
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date()
        };
      },
      markFailed: async (paymentId, data) => {
        markedFailed.push({ paymentId, data });
      },
      findPaymentById: async (paymentId) =>
        paymentId === "payment-1"
          ? {
              _id: "payment-1",
              tenantId: "tenant-1",
              bookingOtpId: "otp-1",
              planSlug: "economical",
              provider: "paymongo",
              providerCheckoutSessionId: "checkout-1",
              checkoutUrl: "https://paymongo.test/checkout",
              amountCents: 1000,
              currency: "PHP",
              status: "pending"
            }
          : null,
      findPaymentByProviderId: async (providerId) =>
        providerId === "provider-payment-1"
          ? {
              _id: "payment-1",
              tenantId: "tenant-1",
              bookingOtpId: "otp-1",
              planSlug: "economical",
              provider: "paymongo",
              providerCheckoutSessionId: "checkout-1",
              checkoutUrl: "https://paymongo.test/checkout",
              amountCents: 1000,
              currency: "PHP",
              status: "pending"
            }
          : null,
      markPaid: async (paymentId, data) => {
        markedPaid.push({ paymentId, data });
        return {
          _id: String(paymentId),
          tenantId: "tenant-1",
          bookingOtpId: "otp-1",
          planSlug: "economical",
          provider: "paymongo",
          providerCheckoutSessionId: "checkout-1",
          checkoutUrl: "https://paymongo.test/checkout",
          amountCents: 1000,
          currency: "PHP",
          status: "paid"
        };
      }
    },
    "./bookingOtpService": {
      getVerifiedBookingPayload: async ({ token }) => {
        verifiedPayloads.push(token);
        return {
          otpId: "otp-1",
          payload: {
            notifyBySms: true,
            tenantSlug: "demo"
          }
        };
      }
    },
    "./queueFeeService": {
      getQueueFeeForTenant: async (tenantId) => {
        feeRequests.push(tenantId);
        return currentFee;
      }
    }
  });

  const originalFetch = global.fetch;
  const originalConsoleWarn = console.warn;
  console.warn = () => {};

  try {
    global.fetch = async (url, options) => {
      if (String(url).endsWith("/checkout_sessions")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              id: "checkout-1",
              attributes: {
                checkout_url: "https://paymongo.test/checkout/1",
                client_key: "client-key-1"
              }
            }
          })
        };
      }

      if (String(url).endsWith("/checkout_sessions/checkout-1")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              id: "provider-payment-1",
              attributes: {
                status: "paid",
                payments: [
                  {
                    data: {
                      id: "provider-payment-1",
                      attributes: {
                        paid_at: "2026-07-01T00:10:00.000Z",
                        amount: 1250,
                        currency: "PHP"
                      }
                    }
                  }
                ]
              }
            }
          })
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    assert.equal(smsService.shouldChargeBookingSmsFee({ enabled: true, amountCents: 1000 }, { notifyBySms: true }), true);
    assert.equal(smsService.shouldChargeBookingSmsFee({ enabled: false, amountCents: 1000 }, { notifyBySms: true }), false);

    const noFee = await smsService.createBookingSmsCheckout({
      tenant: { _id: "tenant-1", slug: "demo", name: "Demo Tenant" },
      bookingVerificationToken: "otp-token"
    });
    assert.equal(noFee.requiresPayment, false);

    currentFee = {
      enabled: true,
      amountCents: 1250,
      currency: "PHP",
      displayAmount: "PHP 12.50",
      planSlug: "pro"
    };

    const checkout = await smsService.createBookingSmsCheckout({
      tenant: { _id: "tenant-1", slug: "demo", name: "Demo Tenant" },
      bookingVerificationToken: "otp-token"
    });
    assert.equal(checkout.requiresPayment, true);
    assert.equal(checkout.checkoutSession.provider, "paymongo");

    assert.equal(verifiedPayloads[0], "otp-token");
    assert.equal(feeRequests.length >= 2, true);

    const paidCheckout = await smsService.createBookingSmsCheckout({
      tenant: { _id: "tenant-1", slug: "demo", name: "Demo Tenant" },
      bookingVerificationToken: "otp-token"
    });
    assert.equal(paidCheckout.requiresPayment, true);
    assert.equal(createdPayments.length > 0, true);
    assert.equal(providerUpdates.length > 0, true);

    const synced = await smsService.syncBookingSmsPayment({
      tenant: { _id: "tenant-1" },
      paymentId: "payment-1"
    });
    assert.equal(synced.synced, true);
    assert.equal(synced.paid, true);

    const webhook = await smsService.handlePayMongoPaidCheckout(
      {
        id: "provider-payment-1",
        attributes: {
          payments: [
            {
              data: {
                id: "provider-payment-1",
                attributes: { paid_at: "2026-07-01T00:10:00.000Z" }
              }
            }
          ]
        }
      },
      {},
      {}
    );
    assert.equal(webhook.handled, true);

    await assert.rejects(
      () => smsService.assertPaidBookingSmsPayment({ tenant: { _id: "tenant-1" }, paymentId: "payment-1", bookingOtpId: "otp-2" }),
      (error) => error.statusCode === 409
    );
  } finally {
    global.fetch = originalFetch;
    console.warn = originalConsoleWarn;
  }
});
