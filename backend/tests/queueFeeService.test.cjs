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

test("queue fee service formats summaries and enforces subscription and input rules", async () => {
  const subscriptions = new Map([
    ["tenant-active", { status: "active", planSlug: "pro" }],
    ["tenant-paused", { status: "paused", planSlug: "enterprise" }]
  ]);
  const queueFeeUpserts = [];

  const queueFeeService = requireWithMocks("../src/services/queueFeeService.js", {
    "../repositories/billing": {
      getActiveSubscriptionByTenantId: async (tenantId) => subscriptions.get(String(tenantId)) || null
    },
    "../repositories/queueFees": {
      findQueueFeeByPlan: async (planSlug) => ({ enabled: true, amountCents: planSlug === "pro" ? 1250 : 0 }),
      listQueueFees: async () => [{ planSlug: "economical" }],
      upsertQueueFee: async (data) => {
        queueFeeUpserts.push(data);
        return data;
      }
    }
  });

  assert.equal(queueFeeService.formatPhp(1250), "PHP 12.50");
  assert.deepEqual(queueFeeService.buildFeeSummary({ enabled: true, amountCents: 2500 }, "pro"), {
    enabled: true,
    amountCents: 2500,
    currency: "PHP",
    displayAmount: "PHP 25.00",
    planSlug: "pro"
  });
  assert.deepEqual(queueFeeService.buildFeeSummary({ enabled: false, amountCents: 2500 }, "pro"), {
    enabled: false,
    amountCents: 0,
    currency: "PHP",
    displayAmount: "PHP 0.00",
    planSlug: "pro"
  });

  assert.equal((await queueFeeService.getActiveTenantSubscription("tenant-active")).planSlug, "pro");
  assert.equal(await queueFeeService.getActiveTenantSubscription("tenant-paused"), null);
  assert.equal((await queueFeeService.getTenantPlanSlug("tenant-active")), "pro");
  assert.equal((await queueFeeService.getTenantPlanSlug("tenant-paused")), "economical");
  assert.deepEqual(await queueFeeService.getQueueFeeForTenant("tenant-active"), {
    enabled: true,
    amountCents: 1250,
    currency: "PHP",
    displayAmount: "PHP 12.50",
    planSlug: "pro"
  });

  await assert.rejects(
    () => queueFeeService.assertTenantCanAcceptCustomerJoins("tenant-paused"),
    (error) => error.statusCode === 403
  );

  await assert.rejects(
    () => queueFeeService.updateQueueFees({ queueFees: "nope" }),
    (error) => error.statusCode === 400
  );

  await assert.rejects(
    () =>
      queueFeeService.updateQueueFees({
        queueFees: [{ planSlug: "unknown", enabled: true, amountCents: 100 }],
        user: { _id: "user-1" }
      }),
    (error) => error.statusCode === 400
  );

  await assert.rejects(
    () =>
      queueFeeService.updateQueueFees({
        queueFees: [{ planSlug: "pro", enabled: true, amountCents: -1 }],
        user: { _id: "user-1" }
      }),
    (error) => error.statusCode === 400
  );

  const updated = await queueFeeService.updateQueueFees({
    queueFees: [{ planSlug: "pro", enabled: true, amountCents: "1250" }],
    user: { _id: "user-1" }
  });

  assert.equal(queueFeeUpserts.length, 1);
  assert.deepEqual(queueFeeUpserts[0], {
    planSlug: "pro",
    enabled: true,
    amountCents: 1250,
    currency: "PHP",
    updatedByUserId: "user-1"
  });
  assert.deepEqual(updated, [{ planSlug: "economical" }]);
});
