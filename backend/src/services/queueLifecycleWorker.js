const queueDayLifecycleService = require("./queueDayLifecycleService");
const {
  createQueueNotificationOutboxDispatcher
} = require("./queueNotificationOutboxDispatcher");

function createQueueLifecycleUpdatePublisher(options = {}) {
  const tenantRepository = options.tenantRepository || require("../repositories/tenants");
  const queueEventBus = options.queueEventBus || require("./queueEvents");
  return async function publishLifecycleUpdate(scope) {
    const tenant = await tenantRepository.findTenantById(scope.tenantId);
    if (!tenant?.slug) {
      return false;
    }
    queueEventBus.publish(tenant.slug, null, { locationId: String(scope.locationId) });
    return true;
  };
}

function createQueueLifecycleWorker(options = {}) {
  const intervalMs = Math.max(15_000, Number(options.intervalMs || 60_000));
  let timer = null;
  let running = false;
  let stopped = false;
  const outboxDispatcher = options.outboxDispatcher || createQueueNotificationOutboxDispatcher();
  const publishLifecycleUpdate = options.publishLifecycleUpdate || createQueueLifecycleUpdatePublisher();
  const onTransition = async (scope) => {
    try {
      await publishLifecycleUpdate(scope);
    } catch (error) {
      console.error("Queue lifecycle live update failed", error);
    }
  };

  async function runOnce() {
    if (running || stopped) {
      return { skipped: true };
    }
    running = true;
    try {
      const warningCount = await queueDayLifecycleService.emitDueWarnings({ onTransition });
      const reconciledCount = await queueDayLifecycleService.reconcileDueQueueDays(50, { onTransition });
      const expiredCount = await queueDayLifecycleService.expirePendingCarryOvers();
      const dispatchedCount = await outboxDispatcher.runBatch();
      return { skipped: false, warningCount, reconciledCount, expiredCount, dispatchedCount };
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer || stopped) {
      return;
    }
    runOnce().catch((error) => {
      console.error("Queue lifecycle startup reconciliation failed", error);
    });
    timer = setInterval(() => {
      runOnce().catch((error) => {
        console.error("Queue lifecycle periodic reconciliation failed", error);
      });
    }, intervalMs);
    timer.unref();
  }

  function stop() {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { runOnce, start, stop };
}

module.exports = {
  createQueueLifecycleUpdatePublisher,
  createQueueLifecycleWorker
};
