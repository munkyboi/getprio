const app = require("./app");
const { connectDb } = require("./config/db");
const env = require("./config/env");

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connectWithRetry({
  attempts = 20,
  delayMs = 3000
} = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await connectDb();
      return;
    } catch (error) {
      lastError = error;
      console.error(
        `Database connection attempt ${attempt}/${attempts} failed: ${error.message}`
      );

      if (attempt < attempts) {
        await wait(delayMs);
      }
    }
  }

  throw lastError;
}

async function start() {
  await connectWithRetry();
  app.listen(env.port, () => {
    console.log(`Prio server listening on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
