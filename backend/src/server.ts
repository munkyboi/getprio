import app from "./app";
import { connectDb } from "./config/db";
import env from "./config/env";

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
  app.listen(env.port, () => {
    console.log(`Prio server listening on port ${env.port}`);
  });
}

start().catch((error: unknown) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
