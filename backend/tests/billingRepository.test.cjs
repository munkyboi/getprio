const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();

  try {
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
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, originalEntry] of originals.entries()) {
      if (originalEntry) require.cache[resolvedDependency] = originalEntry;
      else delete require.cache[resolvedDependency];
    }
  }
}

test("billing repository normalizes metadata, maps defaults, and activates subscriptions", async () => {
  const calls = [];
  let billingEventAttempts = 0;
  const billingRepository = requireWithMocks("../src/repositories/billing.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query: String(query), params });

          if (String(query).includes("FROM tenant_subscriptions")) {
            return {
              rows: [
                {
                  id: 5,
                  tenant_id: 1,
                  plan_slug: "economical",
                  status: "active",
                  provider: "paymongo",
                  provider_customer_id: null,
                  provider_subscription_id: null,
                  provider_checkout_session_id: null,
                  billing_interval: "monthly",
                  current_period_start: new Date("2026-07-01T00:00:00.000Z"),
                  current_period_end: new Date("2026-08-01T00:00:00.000Z"),
                  entitlements: { staffSeats: 3 },
                  metadata: null,
                  created_at: new Date("2026-07-01T00:00:00.000Z"),
                  updated_at: new Date("2026-07-01T00:00:00.000Z")
                }
              ]
            };
          }

          if (String(query).includes("INSERT INTO billing_checkout_sessions")) {
            return {
              rows: [
                {
                  id: 9,
                  tenant_id: 1,
                  plan_slug: "economical",
                  provider: "paymongo",
                  provider_checkout_session_id: "provider-9",
                  status: "pending",
                  amount_cents: 1000,
                  currency: "PHP",
                  checkout_url: "https://checkout.example.test",
                  metadata: { paidAt: "2026-07-01T00:00:00.000Z", nested: true },
                  created_at: new Date("2026-07-01T00:00:00.000Z"),
                  updated_at: new Date("2026-07-01T00:00:00.000Z")
                }
              ]
            };
          }

          if (String(query).includes("UPDATE billing_checkout_sessions") && String(query).includes("metadata = metadata ||")) {
            return {
              rows: [
                {
                  id: 9,
                  tenant_id: 1,
                  plan_slug: "economical",
                  provider: "paymongo",
                  provider_checkout_session_id: "provider-9",
                  status: "pending",
                  amount_cents: 1000,
                  currency: "PHP",
                  checkout_url: "https://checkout.updated.test",
                  metadata: { paidAt: "2026-07-01T00:00:00.000Z", checkout: true },
                  created_at: new Date("2026-07-01T00:00:00.000Z"),
                  updated_at: new Date("2026-07-01T00:00:00.000Z")
                }
              ]
            };
          }

          if (String(query).includes("INSERT INTO billing_events")) {
            billingEventAttempts += 1;
            if (billingEventAttempts === 2) {
              return { rows: [] };
            }

            return { rows: [{ id: 12, provider: "paymongo", provider_event_id: "evt-1" }] };
          }

          if (String(query).includes("UPDATE tenant_subscriptions")) {
            return {
              rows: [
                {
                  id: 20,
                  tenant_id: 1,
                  plan_slug: "pro",
                  status: "active",
                  provider: "manual",
                  provider_customer_id: null,
                  provider_subscription_id: null,
                  provider_checkout_session_id: null,
                  billing_interval: "monthly",
                  current_period_start: new Date("2026-07-01T00:00:00.000Z"),
                  current_period_end: null,
                  entitlements: { locations: 3, staffSeats: 10 },
                  metadata: {},
                  created_at: new Date("2026-07-01T00:00:00.000Z"),
                  updated_at: new Date("2026-07-01T00:00:00.000Z")
                }
              ]
            };
          }

          if (String(query).includes("INSERT INTO tenant_subscriptions")) {
            return {
              rows: [
                {
                  id: 20,
                  tenant_id: 1,
                  plan_slug: "economical",
                  status: "active",
                  provider: "paymongo",
                  provider_customer_id: null,
                  provider_subscription_id: "sub-20",
                  provider_checkout_session_id: "provider-9",
                  billing_interval: "annual",
                  current_period_start: new Date("2026-07-01T00:00:00.000Z"),
                  current_period_end: new Date("2027-07-01T00:00:00.000Z"),
                  entitlements: { staffSeats: 5 },
                  metadata: { source: "manual" },
                  created_at: new Date("2026-07-01T00:00:00.000Z"),
                  updated_at: new Date("2026-07-01T00:00:00.000Z")
                }
              ]
            };
          }

          return { rows: [] };
        }
      }
    },
    "../services/subscriptionPlans": {
      findPlanBySlug: async (slug) =>
        slug === "pro"
          ? { slug: "pro", entitlements: { locations: 3, staffSeats: 10 } }
          : { slug, entitlements: { staffSeats: 5 } }
    }
  });

  const subscription = await billingRepository.getActiveSubscriptionByTenantId(1);
  assert.equal(subscription._id, "5");
  assert.deepEqual(subscription.metadata, {});

  const checkout = await billingRepository.createCheckoutSession({
    tenantId: 1,
    planSlug: "economical",
    provider: "paymongo",
    amountCents: 1000,
    metadata: { paidAt: 1751328000, nested: true }
  });
  assert.equal(checkout._id, "9");
  assert.deepEqual(checkout.metadata, { paidAt: "2026-07-01T00:00:00.000Z", nested: true });

  const updated = await billingRepository.updateCheckoutSessionProviderData(9, {
    providerCheckoutSessionId: "provider-9",
    checkoutUrl: "https://checkout.updated.test",
    metadata: { paidAt: "2026-07-01T00:00:00.000Z", checkout: true }
  });
  assert.equal(updated.checkoutUrl, "https://checkout.updated.test");

  const event = await billingRepository.recordBillingEvent({
    provider: "paymongo",
    providerEventId: "evt-1",
    eventType: "checkout_session.paid",
    tenantId: 1,
    payload: { checkoutId: 9 }
  });
  assert.equal(event.id, 12);

  const duplicateEvent = await billingRepository.recordBillingEvent({
    provider: "paymongo",
    providerEventId: "evt-2",
    eventType: "checkout_session.paid",
    tenantId: 1,
    payload: { checkoutId: 9 }
  });
  assert.equal(duplicateEvent, null);

  const activated = await billingRepository.activateTenantSubscription({
    tenantId: 1,
    planSlug: "economical",
    provider: "paymongo",
    providerCheckoutSessionId: "provider-9",
    billingInterval: "annual",
    currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2027-07-01T00:00:00.000Z"),
    entitlements: { staffSeats: 5 },
    metadata: { source: "manual" }
  });
  assert.equal(activated._id, "20");

  const updatedSubscription = await billingRepository.updateTenantSubscription(20, {
    planSlug: "pro",
    status: "active"
  });
  assert.equal(updatedSubscription.planSlug, "pro");
  assert.deepEqual(updatedSubscription.entitlements, { locations: 3, staffSeats: 10 });

  assert.equal(calls.length >= 6, true);
});
