import app from "./app";
import { connectDb } from "./config/db";
import env from "./config/env";
import organizerCampaignService from "./services/organizerCampaignService";
import queueLifecycleWorkerModule from "./services/queueLifecycleWorker";
import allowanceWarningService from "./services/allowanceWarningService";

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
  server.on("close", () => {
    clearInterval(campaignLifecycleTimer);
    clearInterval(allowanceWarningTimer);
    queueLifecycleWorker.stop();
  });
}

start().catch((error: unknown) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
