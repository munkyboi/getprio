#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

import envModule from "../backend/src/config/env.js";
import dbModule from "../backend/src/config/db.js";
import mobilePushModule from "../backend/mobile/fcmRegistrationService.js";
import registrationRepositoryModule from "../backend/mobile/pushRegistrationRepository.js";

const env = envModule.default || envModule;
const db = dbModule.default || dbModule;
const mobilePushService = mobilePushModule.default || mobilePushModule;
const registrationRepository =
  registrationRepositoryModule.default || registrationRepositoryModule;

const DEFAULT_TITLE = "GetPrio push test";
const DEFAULT_BODY = "This is a direct push notification test.";

export function usage() {
  return `Usage:
  node scripts/push-test.mjs --user-id <id> [options]

Options:
  --user-id <id>             Authenticated GetPrio user ID to target.
  --installation-id <id>    Limit the test to one registered installation.
  --title <text>             Notification title (default: ${DEFAULT_TITLE}).
  --body <text>              Notification body (default: ${DEFAULT_BODY}).
  --send                     Actually send the notification. Without this, dry-run only.
  --allow-non-production     Permit sending when NODE_ENV is not production.
  --help                     Show this help.

Safety:
  Tokens are never printed. Sending requires --send. Local/development sends also
  require --allow-non-production. Run this from the production app directory to
  test production registrations and credentials.`;
}

function readOptionValue(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function normalizeText(value, option, maxLength) {
  const text = String(value).trim();
  if (!text || text.length > maxLength) {
    throw new Error(`${option} must be between 1 and ${maxLength} characters.`);
  }
  return text;
}

export function parseArgs(args) {
  const options = {
    userId: null,
    installationId: null,
    title: DEFAULT_TITLE,
    body: DEFAULT_BODY,
    send: false,
    allowNonProduction: false,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--send":
        options.send = true;
        break;
      case "--allow-non-production":
        options.allowNonProduction = true;
        break;
      case "--user-id":
        options.userId = readOptionValue(args, index, argument);
        index += 1;
        break;
      case "--installation-id":
        options.installationId = readOptionValue(args, index, argument);
        index += 1;
        break;
      case "--title":
        options.title = readOptionValue(args, index, argument);
        index += 1;
        break;
      case "--body":
        options.body = readOptionValue(args, index, argument);
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (options.help) return options;

  if (!options.userId || !/^\d+$/.test(options.userId) || Number(options.userId) < 1) {
    throw new Error("--user-id must be a positive numeric GetPrio user ID.");
  }
  if (options.installationId) {
    options.installationId = normalizeText(
      options.installationId,
      "--installation-id",
      128
    );
  }
  options.title = normalizeText(options.title, "--title", 120);
  options.body = normalizeText(options.body, "--body", 500);

  return options;
}

function printRegistrationSummary(registrations) {
  if (registrations.length === 0) {
    console.log("Active mobile registrations: 0");
    return;
  }

  console.log(`Active mobile registrations: ${registrations.length}`);
  for (const registration of registrations) {
    console.log(
      `- ${registration.platform || "unknown"} installation ${registration.installationId} ` +
        `(registration ${registration.id})`
    );
  }
}

export async function run(options) {
  const nodeEnv = String(env.nodeEnv || "development").toLowerCase();
  console.log(`Environment: ${nodeEnv}`);
  console.log(`User ID: ${options.userId}`);
  console.log(`FCM configured: ${mobilePushService.isConfigured() ? "yes" : "no"}`);

  const registrations = (await registrationRepository.listActiveByUserId(options.userId))
    .filter((registration) =>
      !options.installationId || registration.installationId === options.installationId
    );
  printRegistrationSummary(registrations);

  if (!options.send) {
    console.log("Dry run only; no notification was sent. Add --send to send one.");
    return 0;
  }

  if (nodeEnv !== "production" && !options.allowNonProduction) {
    throw new Error(
      "Refusing to send outside production. Add --allow-non-production if this is intentional."
    );
  }
  if (!mobilePushService.isConfigured()) {
    throw new Error("FCM is not configured in the current environment.");
  }
  if (registrations.length === 0) {
    throw new Error("No active mobile registration matched the requested user.");
  }

  const result = await mobilePushService.sendToRegistrations({
    registrations,
    payload: {
      title: options.title,
      body: options.body,
      url: "/account",
      tag: `diagnostic-push-${Date.now()}`,
      eventType: "diagnostic_push",
      notificationId: mobilePushService.newNotificationId()
    }
  });

  console.log(`FCM accepted: ${result.sent}/${result.attempted}`);
  for (const outcome of result.outcomes || []) {
    const suffix = outcome.statusCode ? ` (${outcome.statusCode})` : "";
    console.log(
      `- ${outcome.platform || "unknown"} installation ${outcome.installationId}: ` +
        `${outcome.status}${suffix}`
    );
    if (outcome.error) console.log(`  ${outcome.error}`);
  }

  return result.sent === result.attempted ? 0 : 2;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return 0;
    }
    return await run(options);
  } finally {
    await db.pool.end();
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`Push test failed: ${error.message}`);
      process.exitCode = 1;
    });
}
