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

test("platform repository maps analytics, lists entities, and upserts settings", async () => {
  const calls = [];
  const client = {
    query: async (query, params) => {
      calls.push({ query: String(query), params });

      if (String(query).includes("SELECT\n        (SELECT COUNT(*)::int FROM tenants) AS tenants")) {
        return {
          rows: [{
            tenants: 2,
            users: 3,
            active_subscriptions: 1,
            queue_join_payments: 4,
            paid_queue_join_payments: 2,
            queue_join_revenue_cents: 5000,
            failed_queue_join_payments: 1
          }]
        };
      }

      if (String(query).includes("FROM queue_join_payments\n        WHERE created_at >= NOW() - INTERVAL '12 months'")) {
        return { rows: [{ period: "2026-06", amount_cents: 1500 }] };
      }

      if (String(query).includes("SELECT status, COUNT(*)::int AS count")) {
        return { rows: [{ status: "paid", count: 2 }] };
      }

      if (String(query).includes("FROM tenant_subscriptions\n        WHERE status = 'active'")) {
        return { rows: [{ plan_slug: "economical", count: 1 }] };
      }

      if (String(query).includes("FROM tenants\n        WHERE created_at >= NOW() - INTERVAL '12 months'")) {
        return { rows: [{ period: "2026-06", count: 2 }] };
      }

      if (String(query).includes("FROM users\n        WHERE created_at >= NOW() - INTERVAL '12 months'")) {
        return { rows: [{ period: "2026-06", count: 3 }] };
      }

      if (String(query).includes("FROM tenants\n      LEFT JOIN LATERAL")) {
        return {
          rows: [
            { id: 1, name: "Tenant One", slug: "tenant-one", is_active: true, created_at: new Date("2026-07-01T00:00:00.000Z"), plan_slug: "economical", ticket_count: 7 }
          ]
        };
      }

      if (String(query).includes("FROM users\n      ORDER BY created_at DESC")) {
        return { rows: [{ id: 2, name: "Admin", email: "admin@example.com", phone: "0917", roles: ["platform_admin"], created_at: new Date("2026-07-01T00:00:00.000Z"), updated_at: new Date("2026-07-01T00:00:00.000Z") }] };
      }

      if (String(query).includes("FROM tenant_subscriptions") && String(query).includes("tenant_name")) {
        return { rows: [{ id: 3, plan_slug: "economical", status: "active", provider: "paymongo", current_period_start: new Date("2026-07-01T00:00:00.000Z"), current_period_end: new Date("2026-08-01T00:00:00.000Z"), created_at: new Date("2026-07-01T00:00:00.000Z"), tenant_name: "Tenant One", tenant_slug: "tenant-one" }] };
      }

      if (String(query).includes("FROM billing_events")) {
        return { rows: [{ id: 4, provider: "paymongo", provider_event_id: "evt-1", event_type: "checkout_session.paid", provider_checkout_session_id: "cs_1", provider_payment_id: "pay_1", processed_at: new Date("2026-07-01T00:00:00.000Z"), tenant_name: "Tenant One", tenant_slug: "tenant-one" }] };
      }

      if (String(query).includes("FROM queue_join_payments") && String(query).includes("tenant_name")) {
        return { rows: [{ id: 5, tenant_id: 1, otp_id: 10, plan_slug: "economical", provider: "paymongo", provider_checkout_session_id: "cs_1", provider_payment_id: "pay_1", status: "paid", amount_cents: 1000, currency: "PHP", checkout_url: "https://checkout", payload: {}, metadata: {}, ticket_id: null, ticket_lookup_code: null, paid_at: new Date("2026-07-01T00:00:00.000Z"), created_at: new Date("2026-07-01T00:00:00.000Z"), updated_at: new Date("2026-07-01T00:00:00.000Z"), tenant_name: "Tenant One", tenant_slug: "tenant-one" }] };
      }

      if (String(query).includes("SELECT value FROM platform_settings WHERE key = $1 LIMIT 1")) {
        return { rows: [{ value: "ops@example.com" }] };
      }

      if (String(query).includes("INSERT INTO platform_settings")) {
        return { rows: [{ key: "enterprise_inquiry_email", value: "new@example.com", updated_at: new Date("2026-07-01T00:00:00.000Z") }] };
      }

      return { rows: [] };
    }
  };

  const platformRepository = requireWithMocks("../src/repositories/platform.js", {
    "../config/db": { pool: client },
    "./queueJoinPayments": {
      mapPayment: (row) => ({
        _id: String(row.id),
        tenantName: row.tenant_name,
        tenantSlug: row.tenant_slug,
        status: row.status
      })
    }
  });

  const totals = await platformRepository.getOverviewTotals({ client });
  assert.equal(totals.tenants, 2);
  assert.equal(totals.queueJoinRevenueCents, 5000);

  const analytics = await platformRepository.getOverviewAnalytics({ client });
  assert.equal(analytics.revenueTrend[0].period, "2026-06");
  assert.equal(analytics.paymentStatusMix[0].status, "paid");

  const tenants = await platformRepository.listTenants({ client });
  assert.equal(tenants[0].planSlug, "economical");

  const users = await platformRepository.listUsers({ client });
  assert.equal(users[0].roles[0], "platform_admin");

  const subscriptions = await platformRepository.listSubscriptions({ client });
  assert.equal(subscriptions[0].tenantSlug, "tenant-one");

  const events = await platformRepository.listBillingEvents({ client });
  assert.equal(events[0].providerEventId, "evt-1");

  const payments = await platformRepository.listRecentPayments({ client });
  assert.equal(payments[0]._id, "5");

  const settings = await platformRepository.getPlatformSettings({ client });
  assert.equal(settings.enterpriseInquiryEmail, "ops@example.com");

  const updated = await platformRepository.updatePlatformSettings({
    enterpriseInquiryEmail: "new@example.com",
    userId: 9
  }, { client });
  assert.equal(updated.enterpriseInquiryEmail, "ops@example.com");

  assert.equal(calls.length > 0, true);
});
