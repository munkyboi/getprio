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
      require.cache[resolvedDependency] = { id: resolvedDependency, filename: resolvedDependency, loaded: true, exports: mockExports };
    }
    delete require.cache[resolvedTarget];
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, originalEntry] of originals) {
      if (originalEntry) require.cache[resolvedDependency] = originalEntry;
      else delete require.cache[resolvedDependency];
    }
  }
}

test("approved vendors receive Free once and retries preserve subscription history", async () => {
  let hasHistory = false;
  let transitionsCreated = 0;
  const client = {
    query: async (query) => {
      if (String(query).includes("FROM tenants")) return { rows: [{ id: 7, vendor_approval_status: "approved" }] };
      if (String(query).includes("FROM tenant_subscriptions")) return { rows: hasHistory ? [{ id: 11 }] : [] };
      throw new Error(`Unexpected query: ${query}`);
    }
  };
  const repository = {
    createTransition: async (input, options) => {
      assert.equal(options.client, client);
      assert.equal(input.transitionType, "free_assignment");
      assert.equal(input.toPlanSlug, "free");
      transitionsCreated += 1;
      return { id: 9 };
    },
    executeTransition: async (_transitionId, options) => {
      assert.equal(options.client, client);
      hasHistory = true;
      return { id: 9, status: "effective" };
    }
  };
  const service = requireWithMocks("../src/services/subscriptionLifecycleService.js", {
    "../config/db": { pool: {}, withTransaction: async (callback) => callback(client) },
    "../config/releaseControls": {},
    "../repositories/subscriptionLifecycle": repository,
    "../repositories/subscriptionPlans": {}
  });

  assert.deepEqual(await service.assignFreeToApprovedTenant(7), {
    assigned: true,
    transition: { id: 9, status: "effective" }
  });
  assert.deepEqual(await service.assignFreeToApprovedTenant(7), {
    assigned: false,
    reason: "subscription_history_exists"
  });
  assert.equal(transitionsCreated, 1);
});

test("automatic Free assignment excludes unapproved vendors", async () => {
  const client = { query: async () => ({ rows: [{ id: 7, vendor_approval_status: "pending" }] }) };
  const enabled = requireWithMocks("../src/services/subscriptionLifecycleService.js", {
    "../config/db": { pool: {}, withTransaction: async (callback) => callback(client) },
    "../config/releaseControls": {},
    "../repositories/subscriptionLifecycle": {},
    "../repositories/subscriptionPlans": {}
  });
  assert.deepEqual(await enabled.assignFreeToApprovedTenant(7), { assigned: false, reason: "vendor_not_approved" });
});

test("manual Platform Admin paid upgrades cannot bypass provider-confirmed checkout", async () => {
  const current = { id: 3, plan_slug: "free", status: "active", current_period_end: new Date(Date.now() + 86_400_000) };
  const service = requireWithMocks("../src/services/subscriptionLifecycleService.js", {
    "../config/db": { pool: {}, withTransaction: async (callback) => callback({}) },
    "../config/releaseControls": {},
    "../repositories/subscriptionLifecycle": {
      lockCurrent: async () => current,
      createTransition: async () => assert.fail("unpaid upgrade created a transition")
    },
    "../repositories/subscriptionPlans": { findPlanBySlug: async () => ({ slug: "pro" }) }
  });

  await assert.rejects(
    () => service.requestTransition({ tenantId: 7, toPlanSlug: "pro", reason: "Manual paid upgrade", metadata: {} }),
    (error) => error.statusCode === 409 && error.code === "PAID_CHECKOUT_REQUIRED"
  );
});
