import staffAccessEmailWorker from "./services/staffAccessEmailWorker";
import accountDeletionWorker from "./services/accountDeletionWorker";
import app from "./app";
import { connectDb } from "./config/db";
import env from "./config/env";
import organizerCampaignService from "./services/organizerCampaignService";
import queueLifecycleWorkerModule from "./services/queueLifecycleWorker";
import allowanceWarningService from "./services/allowanceWarningService";
import developerWebhookDispatcherModule from "./services/developerWebhookDispatcher";
import developerWebhookDeliveries from "./repositories/developerWebhookDeliveries";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connectWithRetry({
  attempts = 20,
  delayMs = 3000
}: {
  attempts?: number;
  delayMs?: number;
} = {}): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await connectDb();
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Database connection failed.");
      console.error(
        `Database connection attempt ${attempt}/${attempts} failed: ${lastError.message}`
      );

      if (attempt < attempts) {
        await wait(delayMs);
      }
    }
  }

  throw lastError ?? new Error("Database connection failed.");
}

async function start(): Promise<void> {
  await connectWithRetry();
  const server = app.listen(env.port, () => {
    console.log(`Prio server listening on port ${env.port}`);
  });
  const deletionTimer = setInterval(() => {
    accountDeletionWorker.runOnce().catch(() => console.error("[account-deletion-worker] processing failed"));
  }, 60_000);
  deletionTimer.unref();
  const queueLifecycleWorker = queueLifecycleWorkerModule.createQueueLifecycleWorker();
  queueLifecycleWorker.start();
  const campaignLifecycleTimer = setInterval(() => {
    organizerCampaignService.expireDueCampaigns().catch((error: Error) => console.error("Organizer campaign lifecycle scan failed", error));
  }, 60_000);
  campaignLifecycleTimer.unref();
  const allowanceWarningTimer = setInterval(() => {
    allowanceWarningService.dispatchPendingWarnings().catch((error: Error) => console.error("Allowance warning dispatch failed", error));
  }, 60_000);
  allowanceWarningTimer.unref();
  const staffAccessEmailTimer = setInterval(() => {
    staffAccessEmailWorker.runOnce().catch(() => console.error("[staff-access-email] dispatch failed"));
  }, 60_000);
  staffAccessEmailTimer.unref();
  const developerWebhookDispatcher = env.developerWebhookDispatchEnabled
    ? developerWebhookDispatcherModule.createDeveloperWebhookDispatcher({
      cleanupExpired: () => developerWebhookDeliveries.purgeExpiredPayloads()
    })
    : null;
  developerWebhookDispatcher?.start();
  let workerStopPromise: Promise<void> | undefined;
  const stopWorkers = (): Promise<void> => {
    if (workerStopPromise) return workerStopPromise;
    workerStopPromise = (async () => {
      clearInterval(staffAccessEmailTimer);
      clearInterval(deletionTimer);
      clearInterval(campaignLifecycleTimer);
      clearInterval(allowanceWarningTimer);
      queueLifecycleWorker.stop();
      await developerWebhookDispatcher?.stop();
    })();
    return workerStopPromise;
  };
  server.on("close", () => {
    stopWorkers().catch((error: Error) => {
      console.error("[worker-shutdown] failed", error);
    });
  });
  const shutdown = (signal: string) => {
    server.close(() => {
      stopWorkers().catch((error: Error) => {
        console.error(`[worker-shutdown:${signal}] failed`, error);
      });
    });
    stopWorkers().catch((error: Error) => {
      console.error(`[worker-shutdown:${signal}] failed`, error);
    });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

start().catch((error: unknown) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
