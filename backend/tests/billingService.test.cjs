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
      withTransaction: async (fn) => fn({ query: async () => ({ rows: [{ id: "tenant-1" }] }) })
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

test("billing service creates a QRPh-only checkout for manual subscription payments", async () => {
  let checkoutRequest;
  global.fetch = async (_url, options = {}) => {
    checkoutRequest = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        data: {
          id: "provider-qrph-checkout-1",
          attributes: { checkout_url: "https://checkout.example.test/qrph", client_key: "ck-qrph" }
        }
      })
    };
  };

  const service = buildService();
  const checkout = await service.createPayMongoCheckout({
    tenant: { _id: "tenant-1", slug: "demo", name: "Demo" },
    user: { _id: "user-1" },
    planSlug: "economical",
    billingInterval: "annual",
    billingMode: "manual",
    paymentMethod: "qrph",
    requestOrigin: "https://client.example.test"
  });

  assert.deepEqual(checkoutRequest.data.attributes.payment_method_types, ["qrph"]);
  assert.equal(checkoutRequest.data.attributes.metadata.billingMode, "manual");
  assert.equal(checkoutRequest.data.attributes.metadata.paymentMethod, "qrph");
  assert.equal(checkout.checkoutSession.billingMode, "manual");
  assert.equal(checkout.checkoutSession.paymentMethod, "qrph");
});

test("billing service rejects automatic recurring checkout until PayMongo subscriptions are enabled", async () => {
  const service = buildService();

  await assert.rejects(
    () => service.createPayMongoCheckout({
      tenant: { _id: "tenant-1", slug: "demo", name: "Demo" },
      user: { _id: "user-1" },
      planSlug: "economical",
      billingInterval: "monthly",
      billingMode: "automatic",
      paymentMethod: "card",
      requestOrigin: "https://client.example.test"
    }),
    { statusCode: 503, code: "PAYMONGO_SUBSCRIPTIONS_UNAVAILABLE" }
  );
});

test("manual QRPh checkout can renew the currently active plan", async () => {
  let checkoutRequest;
  global.fetch = async (_url, options = {}) => {
    checkoutRequest = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        data: {
          id: "provider-renewal-checkout-1",
          attributes: { checkout_url: "https://checkout.example.test/renewal" }
        }
      })
    };
  };

  const service = buildService({
    "../repositories/billing": {
      getActiveSubscriptionByTenantId: async () => ({ _id: "subscription-1", planSlug: "economical", status: "active" }),
      createCheckoutSession: async (data) => ({ _id: "checkout-renewal-1", status: "pending", ...data }),
      updateCheckoutSessionProviderData: async (_id, data) => ({ _id: "checkout-renewal-1", status: "pending", planSlug: "economical", amountCents: 1000, currency: "PHP", metadata: data.metadata, ...data })
    }
  });

  await service.createPayMongoCheckout({
    tenant: { _id: "tenant-1", slug: "demo", name: "Demo" },
    user: { _id: "user-1" },
    planSlug: "economical",
    billingInterval: "monthly",
    billingMode: "manual",
    paymentMethod: "qrph",
    requestOrigin: "https://client.example.test"
  });

  assert.deepEqual(checkoutRequest.data.attributes.payment_method_types, ["qrph"]);
});

test("review controls reject Free and inactive subscriptions and allow active paid plans", async () => {
  for (const subscription of [null, { planSlug: 'free', status: 'active' }, { planSlug: 'economical', status: 'past_due' }, { planSlug: 'economical', status: 'cancelled' }, { status: 'active' }]) {
    const service = buildService({ '../repositories/billing': { getActiveSubscriptionByTenantId: async () => subscription } });
    await assert.rejects(() => service.assertPaidReviewAccess('tenant-1'), { statusCode: 403, code: 'PAID_PLAN_REQUIRED' });
  }
  const service = buildService({ '../repositories/billing': { getActiveSubscriptionByTenantId: async () => ({ planSlug: 'economical', status: 'active' }) } });
  await service.assertPaidReviewAccess('tenant-1');
});


test("entitlement reads preserve the caller client through the plan service wrapper", async () => {
  const client = { query: async () => { throw new Error("not used by this contract fixture"); } };
  const options = { client };
  const calls = [];
  const plans = requireWithMocks("../src/services/subscriptionPlans.js", {
    "../repositories/subscriptionPlans": {
      findPlanBySlug: async (slug, supplied) => {
        calls.push(["plan", slug, supplied]);
        return { entitlements: { staffSeats: 3, emailAlerts: true, monthlyTransactionalEmails: 99 } };
      }
    }
  });
  const service = buildService({
    "../repositories/billing": {
      getActiveSubscriptionByTenantId: async (tenantId, supplied) => {
        calls.push(["subscription", tenantId, supplied]);
        return { status: "active", planSlug: "pro", entitlements: { staffSeats: 5 } };
      }
    },
    "./subscriptionPlans": plans
  });
  const result = await service.getTenantEntitlements("9007199254740993", options);
  assert.equal(result.staffSeats, 5);
  assert.equal(result.emailAlerts, true);
  assert.equal(Object.hasOwn(result, "monthlyTransactionalEmails"), false);
  assert.deepEqual(calls.map(call => call.slice(0, 2)), [["subscription", "9007199254740993"], ["plan", "pro"]]);
  for (const call of calls) assert.equal(call[2], options);
});

test("entitlement client propagation retains inactive, missing-plan and error behavior", async () => {
  const options = { client: {} };
  let planCalls = 0;
  let subscription = { status: "suspended", planSlug: "pro" };
  const service = buildService({
    "../repositories/billing": { getActiveSubscriptionByTenantId: async (_id, supplied) => {
      assert.equal(supplied, options);
      return subscription;
    } },
    "./subscriptionPlans": { findPlanBySlug: async (_slug, supplied) => {
      assert.equal(supplied, options);
      planCalls++;
      return null;
    } }
  });
  assert.deepEqual(await service.getTenantEntitlements("1", options), {});
  subscription = null;
  assert.deepEqual(await service.getTenantEntitlements("1", options), {});
  assert.equal(planCalls, 0);
  subscription = { status: "active", planSlug: "pro", entitlements: { staffSeats: 2 } };
  assert.equal((await service.getTenantEntitlements("1", options)).staffSeats, 2);
  const failure = new Error("caller transaction failed");
  const plans = requireWithMocks("../src/services/subscriptionPlans.js", {
    "../repositories/subscriptionPlans": { findPlanBySlug: async (_slug, supplied) => {
      assert.equal(supplied, options);
      throw failure;
    } }
  });
  await assert.rejects(plans.findPlanBySlug("pro", options), error => error === failure);
});

test("entitlement services read caller-private PostgreSQL changes and preserve rollback", {
  skip: !process.env.RESOURCE_LEDGER_TEST_DATABASE_URL
}, async t => {
  const { Pool } = require("pg");
  const { randomUUID } = require("node:crypto");
  const pool = new Pool({ connectionString: process.env.RESOURCE_LEDGER_TEST_DATABASE_URL });
  const schema = `entitlement_client_${randomUUID().replaceAll("-", "")}`;
  const client = await pool.connect();
  t.after(async () => { await client.query("ROLLBACK"); client.release(); await pool.end(); });
  await client.query("BEGIN");
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}`);
  await client.query(`CREATE TABLE subscription_plans (slug TEXT, name TEXT, entitlements JSONB);
    CREATE TABLE tenant_subscriptions (id BIGINT,tenant_id BIGINT,plan_slug TEXT,status TEXT,entitlements JSONB,updated_at TIMESTAMPTZ)`);
  await client.query("INSERT INTO subscription_plans VALUES ('pro','Pro',$1)", [JSON.stringify({ staffSeats: 3 })]);
  await client.query("INSERT INTO tenant_subscriptions VALUES (1,9007199254740993,'pro','active',$1,NOW())", [JSON.stringify({ emailAlerts: true })]);
  const db = { pool: { query: async () => { throw new Error("default pool escape"); } } };
  const planRepository = requireWithMocks("../src/repositories/subscriptionPlans.js", { "../config/db": db });
  const plans = requireWithMocks("../src/services/subscriptionPlans.js", { "../repositories/subscriptionPlans": planRepository });
  const billing = requireWithMocks("../src/repositories/billing.js", { "../config/db": db, "../services/subscriptionPlans": plans });
  const service = buildService({ "../repositories/billing": billing, "./subscriptionPlans": plans });
  assert.equal((await service.getTenantEntitlements("9007199254740993", { client })).staffSeats, 3);
  await client.query("UPDATE subscription_plans SET entitlements=$1", [JSON.stringify({ staffSeats: 7 })]);
  const result = await service.getTenantEntitlements("9007199254740993", { client });
  assert.equal(result.staffSeats, 7);
  assert.equal(result.emailAlerts, true);
  await client.query("ROLLBACK");
  assert.equal((await client.query("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS exists", [schema])).rows[0].exists, false);
});
