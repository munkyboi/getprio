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

test("queue join payments repository normalizes timestamps and maps payment lookups", async () => {
  const calls = [];
  const client = {
    query: async (query, params) => {
      calls.push({ query: String(query), params });

      if (String(query).includes("INSERT INTO queue_join_payments")) {
        return {
          rows: [
            {
              id: 1,
              tenant_id: 2,
              otp_id: 3,
              plan_slug: "economical",
              provider: "paymongo",
              provider_checkout_session_id: null,
              provider_payment_id: null,
              status: "pending",
              amount_cents: 1000,
              currency: "PHP",
              checkout_url: null,
              payload: {},
              metadata: { source: "join" },
              ticket_id: null,
              ticket_lookup_code: null,
              paid_at: null,
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("UPDATE queue_join_payments\n      SET\n        provider_checkout_session_id = $2")) {
        return {
          rows: [
            {
              id: 1,
              tenant_id: 2,
              otp_id: 3,
              plan_slug: "economical",
              provider: "paymongo",
              provider_checkout_session_id: "cs_1",
              provider_payment_id: null,
              status: "pending",
              amount_cents: 1000,
              currency: "PHP",
              checkout_url: "https://checkout.test",
              payload: {},
              metadata: { source: "join", link: true },
              ticket_id: null,
              ticket_lookup_code: null,
              paid_at: null,
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z"),
              tenant_name: "Tenant One",
              tenant_slug: "tenant-one"
            }
          ]
        };
      }

      if (String(query).includes("UPDATE queue_join_payments\n      SET\n        status = 'failed'")) {
        return {
          rows: [
            {
              id: 1,
              tenant_id: 2,
              otp_id: 3,
              plan_slug: "economical",
              provider: "paymongo",
              provider_checkout_session_id: "cs_1",
              provider_payment_id: null,
              status: "failed",
              amount_cents: 1000,
              currency: "PHP",
              checkout_url: "https://checkout.test",
              payload: {},
              metadata: { source: "join", failure: true },
              ticket_id: null,
              ticket_lookup_code: null,
              paid_at: null,
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z"),
              tenant_name: "Tenant One",
              tenant_slug: "tenant-one"
            }
          ]
        };
      }

      if (String(query).includes("UPDATE queue_join_payments\n      SET\n        status = 'paid'")) {
        return {
          rows: [
            {
              id: 1,
              tenant_id: 2,
              otp_id: 3,
              plan_slug: "economical",
              provider: "paymongo",
              provider_checkout_session_id: "cs_1",
              provider_payment_id: "pay_1",
              status: "paid",
              amount_cents: 1000,
              currency: "PHP",
              checkout_url: "https://checkout.test",
              payload: {},
              metadata: { source: "join", payment: true },
              ticket_id: 5,
              ticket_lookup_code: "ABC12345",
              paid_at: new Date("2026-07-01T00:00:00.000Z"),
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("WHERE queue_join_payments.id = $1 LIMIT 1")) {
        return {
          rows: [
            {
              id: 1,
              tenant_id: 2,
              otp_id: 3,
              plan_slug: "economical",
              provider: "paymongo",
              provider_checkout_session_id: "cs_1",
              provider_payment_id: "pay_1",
              status: "paid",
              amount_cents: 1000,
              currency: "PHP",
              checkout_url: "https://checkout.test",
              payload: {},
              metadata: { source: "join" },
              ticket_id: 5,
              ticket_lookup_code: "ABC12345",
              paid_at: new Date("2026-07-01T00:00:00.000Z"),
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: 1,
              tenant_id: 2,
              otp_id: 3,
              plan_slug: "economical",
              provider: "paymongo",
              provider_checkout_session_id: "cs_1",
              provider_payment_id: "pay_1",
              status: "paid",
              amount_cents: 1000,
              currency: "PHP",
              checkout_url: "https://checkout.test",
              payload: {},
              metadata: { source: "join" },
              ticket_id: 5,
              ticket_lookup_code: "ABC12345",
              paid_at: new Date("2026-07-01T00:00:00.000Z"),
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("FROM queue_join_payments\n      WHERE provider_checkout_session_id = $1")) {
        return {
          rows: [
            {
              id: 1,
              tenant_id: 2,
              otp_id: 3,
              plan_slug: "economical",
              provider: "paymongo",
              provider_checkout_session_id: "cs_1",
              provider_payment_id: "pay_1",
              status: "paid",
              amount_cents: 1000,
              currency: "PHP",
              checkout_url: "https://checkout.test",
              payload: {},
              metadata: { source: "join" },
              ticket_id: 5,
              ticket_lookup_code: "ABC12345",
              paid_at: new Date("2026-07-01T00:00:00.000Z"),
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("ORDER BY queue_join_payments.created_at DESC")) {
        return {
          rows: [
            {
              id: 1,
              tenant_id: 2,
              otp_id: 3,
              plan_slug: "economical",
              provider: "paymongo",
              provider_checkout_session_id: "cs_1",
              provider_payment_id: "pay_1",
              status: "paid",
              amount_cents: 1000,
              currency: "PHP",
              checkout_url: "https://checkout.test",
              payload: {},
              metadata: { source: "join" },
              ticket_id: 5,
              ticket_lookup_code: "ABC12345",
              paid_at: new Date("2026-07-01T00:00:00.000Z"),
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z"),
              tenant_name: "Tenant One",
              tenant_slug: "tenant-one"
            }
          ]
        };
      }

      return { rows: [] };
    }
  };

  const repository = requireWithMocks("../src/repositories/queueJoinPayments.js", {
    "../config/db": { pool: client }
  });

  const created = await repository.createPayment({
    tenantId: 2,
    otpId: 3,
    planSlug: "economical",
    provider: "paymongo",
    amountCents: 1000,
    metadata: { source: "join" }
  }, { client });
  assert.equal(created._id, "1");

  const updated = await repository.updateProviderData(1, {
    providerCheckoutSessionId: "cs_1",
    checkoutUrl: "https://checkout.test",
    metadata: { link: true }
  }, { client });
  assert.equal(updated.providerCheckoutSessionId, "cs_1");

  const failed = await repository.markFailed(1, {
    providerCheckoutSessionId: "cs_1",
    checkoutUrl: "https://checkout.test",
    metadata: { failure: true }
  }, { client });
  assert.equal(failed.status, "failed");

  const byId = await repository.findPaymentById(1, { client });
  assert.equal(byId.ticketLookupCode, "ABC12345");

  const byIdForUpdate = await repository.findPaymentByIdForUpdate(1, { client });
  assert.equal(byIdForUpdate._id, "1");

  const byProvider = await repository.findPaymentByProviderId("cs_1", { client });
  assert.equal(byProvider.providerPaymentId, "pay_1");

  const byProviderForUpdate = await repository.findPaymentByProviderIdForUpdate("cs_1", { client });
  assert.equal(byProviderForUpdate._id, "1");

  const markedPaid = await repository.markPaidWithTicket(1, {
    providerPaymentId: "pay_1",
    paidAt: 1751328000,
    ticketId: 5,
    ticketLookupCode: "ABC12345",
    metadata: { payment: true }
  }, { client });
  assert.equal(markedPaid.status, "paid");

  const payments = await repository.listPayments({ client, status: "paid" });
  assert.equal(payments[0]._id, "1");
  assert.equal(payments[0].tenantName, "Tenant One");

  assert.equal(calls.length > 0, true);
});
