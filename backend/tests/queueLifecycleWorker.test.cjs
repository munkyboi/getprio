const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadWorker(lifecycleMock) {
  const workerPath = require.resolve("../src/services/queueLifecycleWorker");
  const dependencyPath = require.resolve("../src/services/queueDayLifecycleService");
  const original = require.cache[dependencyPath];
  require.cache[dependencyPath] = {
    id: dependencyPath,
    filename: dependencyPath,
    loaded: true,
    exports: lifecycleMock
  };
  delete require.cache[workerPath];
  const loaded = require(workerPath);
  delete require.cache[workerPath];
  if (original) {
    require.cache[dependencyPath] = original;
  } else {
    delete require.cache[dependencyPath];
  }
  return loaded;
}

test("worker runs warnings, reconciliation, and expiry in recovery order", async () => {
  const calls = [];
  const { createQueueLifecycleWorker } = loadWorker({
    emitDueWarnings: async () => { calls.push("warnings"); return 2; },
    reconcileDueQueueDays: async () => { calls.push("reconcile"); return 1; },
    expirePendingCarryOvers: async () => { calls.push("expiry"); return 3; }
  });
  const worker = createQueueLifecycleWorker({
    outboxDispatcher: {
      runBatch: async () => { calls.push("outbox"); return 4; }
    }
  });
  const result = await worker.runOnce();
  worker.stop();
  assert.deepEqual(calls, ["warnings", "reconcile", "expiry", "outbox"]);
  assert.deepEqual(result, {
    skipped: false,
    warningCount: 2,
    reconciledCount: 1,
    expiredCount: 3,
    dispatchedCount: 4
  });
});

test("worker skips overlapping runs so multiple intervals cannot duplicate work locally", async () => {
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const { createQueueLifecycleWorker } = loadWorker({
    emitDueWarnings: async () => blocker,
    reconcileDueQueueDays: async () => 0,
    expirePendingCarryOvers: async () => 0
  });
  const worker = createQueueLifecycleWorker({
    outboxDispatcher: { runBatch: async () => 0 }
  });
  const first = worker.runOnce();
  const second = await worker.runOnce();
  assert.deepEqual(second, { skipped: true });
  release(0);
  await first;
  worker.stop();
});

test("worker releases its local lease after a failed scan so the next run can recover", async () => {
  let warningAttempts = 0;
  const { createQueueLifecycleWorker } = loadWorker({
    emitDueWarnings: async () => {
      warningAttempts += 1;
      if (warningAttempts === 1) {
        throw new Error("synthetic database outage");
      }
      return 1;
    },
    reconcileDueQueueDays: async () => 0,
    expirePendingCarryOvers: async () => 0
  });
  const worker = createQueueLifecycleWorker({
    outboxDispatcher: { runBatch: async () => 0 }
  });
  await assert.rejects(worker.runOnce(), /synthetic database outage/);
  const recovered = await worker.runOnce();
  worker.stop();
  assert.equal(recovered.skipped, false);
  assert.equal(recovered.warningCount, 1);
});
