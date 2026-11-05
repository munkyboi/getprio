#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const env = require("../backend/src/config/env");
const db = require("../backend/src/config/db");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function verifyTarget() {
  let client;
  try {
    if (env.apiEnvironment !== "sandbox") {
      fail("Refusing Sandbox deployment: API_ENVIRONMENT must be sandbox.");
      return;
    }

    const expectedHost = String(process.env.DATABASE_HOST || "").trim().toLowerCase();
    const expectedDatabase = String(process.env.DATABASE_NAME || "").trim();
    if (!expectedHost || !expectedDatabase) {
      fail("Refusing Sandbox deployment: DATABASE_HOST and DATABASE_NAME must be configured.");
      return;
    }

    let configuredUrl;
    try {
      configuredUrl = new URL(env.databaseUrl);
    } catch {
      fail("Refusing Sandbox deployment: DATABASE_URL is not a valid URL.");
      return;
    }

    const configuredDatabase = decodeURIComponent(configuredUrl.pathname.replace(/^\//, ""));
    if (
      configuredUrl.hostname.toLowerCase() !== expectedHost ||
      configuredDatabase !== expectedDatabase
    ) {
      fail("Refusing Sandbox deployment: DATABASE_URL does not match the configured Sandbox target.");
      return;
    }

    client = await db.pool.connect();
    await client.query("BEGIN READ ONLY");
    const result = await client.query("SELECT current_database() AS database_name");
    if (result.rows[0]?.database_name !== expectedDatabase) {
      await client.query("ROLLBACK");
      fail("Refusing Sandbox deployment: connected database does not match the configured Sandbox target.");
      return;
    }
    await client.query("ROLLBACK");
    console.log("Sandbox API environment and database target verified.");
  } finally {
    client?.release();
    await db.pool.end();
  }
}

verifyTarget().catch(async (error) => {
  console.error("Sandbox database target verification failed.");
  try {
    await db.pool.end();
  } catch {
    // Ignore pool shutdown errors while reporting the original failure.
  }
  process.exitCode = 1;
});
