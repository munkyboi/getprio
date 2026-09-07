const test = require("node:test");
const assert = require("node:assert/strict");

function requireWithMocks({ warnings, sendEmail }) {
  const target = require.resolve("../src/services/allowanceWarningService.js");
  const releaseDependency = require.resolve("../src/config/releaseControls.js");
  const ledgerDependency = require.resolve("../src/repositories/allowanceLedger.js");
  const notificationDependency = require.resolve("../src/services/notificationService.js");
  const previous = new Map([
    [releaseDependency, require.cache[releaseDependency]],
    [ledgerDependency, require.cache[ledgerDependency]],
    [notificationDependency, require.cache[notificationDependency]]
  ]);
  const completions = [];
  require.cache[releaseDependency] = { id: releaseDependency, filename: releaseDependency, loaded: true, exports: { allowanceObserve: true } };
  require.cache[ledgerDependency] = { id: ledgerDependency, filename: ledgerDependency, loaded: true, exports: {
    claimWarningDeliveries: async () => warnings,
    completeWarningDelivery: async (id, error) => completions.push({ id, error })
  } };
  require.cache[notificationDependency] = { id: notificationDependency, filename: notificationDependency, loaded: true, exports: { sendEmail } };
  delete require.cache[target];
  const service = require(target);
  return {
    service,
    completions,
    restore() {
      delete require.cache[target];
      for (const [dependency, cached] of previous) {
        if (cached) require.cache[dependency] = cached;
        else delete require.cache[dependency];
      }
    }
  };
}

test("allowance warning delivery emails every privileged recipient and records success", async () => {
  const emails = [];
  const harness = requireWithMocks({
    warnings: [{ id: "warning-1", resource_key: "queueTickets", tenant_id: "tenant-1", tenant_name: "Demo", threshold_percent: 90, period_end: "2026-09-01T00:00:00.000Z", recipients: ["owner@example.test", "admin@example.test"] }],
    sendEmail: async (message) => emails.push(message)
  });
  try {
    assert.equal(await harness.service.dispatchPendingWarnings(), 1);
    assert.equal(emails.length, 2);
    assert.deepEqual(harness.completions, [{ id: "warning-1", error: null }]);
  } finally {
    harness.restore();
  }
});

test("allowance warning delivery remains retryable when no recipient exists", async () => {
  const harness = requireWithMocks({
    warnings: [{ id: "warning-2", resource_key: "queueTickets", tenant_id: "tenant-1", tenant_name: "Demo", threshold_percent: 100, period_end: "2026-09-01T00:00:00.000Z", recipients: [] }],
    sendEmail: async () => {}
  });
  try {
    assert.equal(await harness.service.dispatchPendingWarnings(), 1);
    assert.equal(harness.completions.length, 1);
    assert.equal(harness.completions[0].id, "warning-2");
    assert.match(harness.completions[0].error.message, /No active tenant owner/);
  } finally {
    harness.restore();
  }
});
