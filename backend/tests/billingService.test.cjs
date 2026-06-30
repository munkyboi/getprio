const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();
  for (const [requestPath, mockExports] of Object.entries(mocks)) {
    const resolvedDependency = require.resolve(requestPath, { paths: [path.dirname(resolvedTarget)] });
    originals.set(resolvedDependency, require.cache[resolvedDependency]);
    require.cache[resolvedDependency] = {
      id: resolvedDependency,
      filename: resolvedDependency,
      loaded: true,
      exports: mockExports
    };
  }
  delete require.cache[resolvedTarget];
  try {
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, originalEntry] of originals.entries()) {
      if (originalEntry) require.cache[resolvedDependency] = originalEntry;
      else delete require.cache[resolvedDependency];
    }
  }
}

function buildService(overrides = {}) {
  return requireWithMocks("../src/services/billingService.js", {
    "../config/db": {
      withTransaction: async (fn) => fn({})
    },
    "../config/env": {
      clientUrl: "https://client.example.test",
      appBaseUrl: "https://app.example.test",
      platformDashboardUrl: "https://dashboard.example.test",
      paymongoSecretKey: "secret",
      paymongoApiUrl: "https://api.paymongo.test",
      paymongoWebhookSecret: "webhook-secret",
      paymongoPaymentMethodTypes: ["card"]
    },
    "../repositories/billing": {
      getActiveSubscriptionByTenantId: async () => null,
      createCheckoutSession: async (data) => ({ _id: "checkout-1", status: "pending", ...data }),
      updateCheckoutSessionProviderData: async (_id, data) => ({ _id: "checkout-1", status: "pending", planSlug: "economical", amountCents: 1000, currency: "PHP", ...data }),
      findCheckoutSessionById: async () => ({ _id: "checkout-1", tenantId: "tenant-1", status: "pending", planSlug: "economical", amountCents: 1000, currency: "PHP", providerCheckoutSessionId: "provider-checkout-1" }),
      findCheckoutSessionByProviderId: async () => ({ _id: "checkout-1", tenantId: "tenant-1", status: "pending", planSlug: "economical", amountCents: 1000, currency: "PHP", providerCheckoutSessionId: "provider-checkout-1" }),
      markCheckoutSessionPaid: async () => {},
      activateTenantSubscription: async (data) => ({ _id: "subscription-1", ...data }),
      recordBillingEvent: async () => ({ _id: "event-1" })
    },
    "./subscriptionPlans": {
      findPlanBySlug: async (slug) => ({
        slug,
        name: "Economical",
        checkoutEnabled: true,
        price: { monthlyAmountCents: 1000, annualAmountCents: 10000, currency: "PHP" },
        included: ["queue"],
        entitlements: { staffSeats: 3 }
      }),
      getPlanEntitlements: () => ({ staffSeats: 1 }),
      listAddOns: () => [],
      listPlans: async () => []
    },
    "./queueJoinPaymentService": {
      handlePayMongoPaidCheckout: async () => ({ handled: false })
    },
    "./bookingSmsAlertPaymentService": {
      handlePayMongoPaidCheckout: async () => ({ handled: false })
    },
    ...overrides
  });
}

test("billing service resolves entitlements and billing overview", async () => {
  const service = buildService({
    "../repositories/billing": {
      getActiveSubscriptionByTenantId: async () => ({ _id: "subscription-1", planSlug: "economical", status: "active", provider: "paymongo", billingInterval: "monthly", entitlements: { staffSeats: 5 } })
    },
    "./subscriptionPlans": {
      findPlanBySlug: async () => ({ name: "Economical", entitlements: { staffSeats: 3 } }),
      getPlanEntitlements: () => ({ staffSeats: 1 }),
      listAddOns: () => ["addon"],
      listPlans: async () => [{ slug: "economical", name: "Economical", price: {}, bestFor: [], checkoutEnabled: true, entitlements: {}, included: [] }]
    }
  });

  const overview = await service.getBillingOverview("tenant-1");
  assert.equal(overview.plans[0].slug, "economical");
  assert.equal(overview.subscription.entitlements.staffSeats, 5);
  assert.equal((await service.getTenantEntitlements("tenant-1")).staffSeats, 5);
});

test("billing service creates checkout, syncs payment, and handles non-subscription webhooks", async () => {
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push([url, options.method]);
    if (String(options.method) === "GET") {
      return {
        ok: true,
        json: async () => ({
          data: {
            id: "provider-checkout-1",
            attributes: {
              status: "paid",
              payments: [{ data: { id: "payment-1", attributes: { paid_at: "2026-07-01T00:00:00Z", amount: 1000, currency: "PHP" } } }]
            }
          }
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        data: {
          id: "provider-checkout-1",
          attributes: { checkout_url: "https://checkout.example.test", client_key: "ck" }
        }
      })
    };
  };
  const service = buildService({
    "../config/env": {
      clientUrl: "https://client.example.test",
      appBaseUrl: "https://app.example.test",
      platformDashboardUrl: "https://dashboard.example.test",
      paymongoSecretKey: "secret",
      paymongoApiUrl: "https://api.paymongo.test",
      paymongoWebhookSecret: "",
      paymongoPaymentMethodTypes: ["card"]
    }
  });

  const checkout = await service.createPayMongoCheckout({
    tenant: { _id: "tenant-1", slug: "demo", name: "Demo" },
    user: { _id: "user-1" },
    planSlug: "economical",
    billingInterval: "monthly",
    requestOrigin: "https://client.example.test"
  });
  assert.equal(checkout.checkoutSession.checkoutUrl, "https://checkout.example.test");

  const sync = await service.syncPayMongoCheckout({ tenant: { _id: "tenant-1" }, checkoutId: "checkout-1" });
  assert.equal(sync.synced, true);

  const webhook = await service.handlePayMongoWebhook(
    Buffer.from(JSON.stringify({ data: { id: "event-1", attributes: { type: "checkout_session.failed", livemode: false, data: { id: "provider-checkout-1" } } } })),
    "t=1,te=abcd"
  );
  assert.equal(webhook.ignored, true);
  assert.equal(fetchCalls.length >= 1, true);
});
