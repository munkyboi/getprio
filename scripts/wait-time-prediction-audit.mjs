#!/usr/bin/env node

import { createRequire } from "node:module";
import process from "node:process";
import console from "node:console";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { parseTicketContextOptions, readTicketContext } from "./wait-time-ticket-context.mjs";
import { readWaitTimeEvaluation } from "./wait-time-evaluation.mjs";

const require = createRequire(import.meta.url);
const env = require("../backend/src/config/env");
const db = require("../backend/src/config/db");

function parseOptions(args) {
  const options = { scope: "all", vendorSlug: null };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!["--scope", "--vendor-slug"].includes(name) || seen.has(name)) {
      throw new Error("Use --scope all|vendors|developer-sandbox and optional --vendor-slug <slug>. Unknown or duplicate option.");
    }
    seen.add(name);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}.`);
    if (name === "--scope") options.scope = value;
    else options.vendorSlug = value.trim();
  }
  if (!["all", "vendors", "developer-sandbox"].includes(options.scope)) {
    throw new Error("Scope must be all, vendors, or developer-sandbox.");
  }
  if (options.vendorSlug !== null && (!options.vendorSlug || options.vendorSlug.length > 200)) {
    throw new Error("Vendor slug must contain 1 to 200 characters.");
  }
  if (options.vendorSlug && options.scope === "developer-sandbox") {
    throw new Error("--vendor-slug applies only to vendor reports.");
  }
  return options;
}

function assertDatabaseTarget() {
  if (!String(process.env.DATABASE_URL || "").trim()) {
    throw new Error("DATABASE_URL is required. No database connection was opened.");
  }
  if (!["sandbox", "production"].includes(env.apiEnvironment)) {
    throw new Error("Configured API_ENVIRONMENT must be production or sandbox. No database connection was opened.");
  }

  const expectedHost = String(process.env.DATABASE_HOST || "").trim().toLowerCase();
  const expectedDatabase = String(process.env.DATABASE_NAME || "").trim();
  if (!expectedHost || !expectedDatabase) {
    throw new Error("Set DATABASE_HOST and DATABASE_NAME to the expected database target. No connection was opened.");
  }

  let configuredUrl;
  try {
    configuredUrl = new URL(env.databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL. No database connection was opened.");
  }
  const configuredDatabase = decodeURIComponent(configuredUrl.pathname.replace(/^\//, ""));
  if (
    configuredUrl.hostname.toLowerCase() !== expectedHost ||
    configuredDatabase !== expectedDatabase
  ) {
    throw new Error("DATABASE_URL does not match the expected database target. No database connection was opened.");
  }
  return { host: configuredUrl.hostname, port: Number(configuredUrl.port || 5432), database: configuredDatabase };
}

async function readVendorReport(client, vendorId) {
  const table = await client.query("SELECT to_regclass('public.wait_time_prediction_samples') AS table_name");
  if (!table.rows[0]?.table_name) {
    return {
      tableAvailable: false,
      summary: [],
      vendorCoverage: null,
      positionCoverage: [],
      message: "Apply the wait-time prediction migration before auditing vendor samples."
    };
  }

  const summary = await client.query(`
    SELECT
      predictor_version,
      COUNT(*)::int AS total_samples,
      COUNT(*) FILTER (WHERE outcome_type = 'called')::int AS completed_samples,
      COUNT(*) FILTER (WHERE outcome_type = 'censored')::int AS censored_samples,
      COUNT(*) FILTER (WHERE outcome_type IS NULL)::int AS pending_samples,
      COUNT(DISTINCT tenant_id) FILTER (WHERE outcome_type = 'called')::int AS vendors_with_completed_samples,
      COUNT(DISTINCT location_id) FILTER (WHERE outcome_type = 'called')::int AS locations_with_completed_samples,
      MIN(sampled_at) AS first_sample_at,
      MAX(sampled_at) AS latest_sample_at,
      ROUND(AVG(ABS(predicted_wait_minutes - outcome_wait_minutes))
        FILTER (WHERE outcome_type = 'called'), 2) AS mean_absolute_error_minutes,
      ROUND(AVG(outcome_wait_minutes - predicted_wait_minutes)
        FILTER (WHERE outcome_type = 'called'), 2) AS mean_signed_error_minutes,
      ROUND(100 * AVG((ABS(predicted_wait_minutes - outcome_wait_minutes) <= 5)::int)
        FILTER (WHERE outcome_type = 'called'), 1) AS within_five_minutes_percent
    FROM wait_time_prediction_samples
    WHERE ($1::bigint IS NULL OR tenant_id = $1)
    GROUP BY predictor_version
    ORDER BY predictor_version
  `, [vendorId]);

  const vendorCoverage = await client.query(`
    WITH eligible_vendors AS (
      SELECT id
      FROM tenants
      WHERE is_active = TRUE
        AND vendor_approval_status = 'approved'
        AND ($1::bigint IS NULL OR id = $1)
    ), per_vendor AS (
      SELECT vendors.id AS tenant_id, COUNT(samples.id)::int AS completed_samples
      FROM eligible_vendors AS vendors
      LEFT JOIN wait_time_prediction_samples AS samples
        ON samples.tenant_id = vendors.id
       AND samples.outcome_type = 'called'
      GROUP BY vendors.id
    )
    SELECT
      COUNT(*) FILTER (WHERE completed_samples > 0)::int AS vendors_with_completed_samples,
      COUNT(*) FILTER (WHERE completed_samples < 30)::int AS vendors_below_30_samples,
      COUNT(*) FILTER (WHERE completed_samples BETWEEN 30 AND 99)::int AS vendors_with_30_to_99_samples,
      COUNT(*) FILTER (WHERE completed_samples >= 100)::int AS vendors_with_at_least_100_samples,
      MIN(completed_samples)::int AS fewest_samples_for_a_vendor,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY completed_samples) AS median_samples_per_vendor
    FROM per_vendor
  `, [vendorId]);

  const positionCoverage = await client.query(`
    WITH labeled AS (
      SELECT
        CASE
          WHEN (features->>'position') ~ '^[0-9]+$'
            AND (features->>'position')::int <= 1 THEN 'position_1'
          WHEN (features->>'position') ~ '^[0-9]+$'
            AND (features->>'position')::int BETWEEN 2 AND 3 THEN 'position_2_to_3'
          WHEN (features->>'position') ~ '^[0-9]+$'
            AND (features->>'position')::int >= 4 THEN 'position_4_plus'
          ELSE 'position_unknown'
        END AS position_group,
        predicted_wait_minutes,
        outcome_wait_minutes
      FROM wait_time_prediction_samples
      WHERE outcome_type = 'called'
        AND ($1::bigint IS NULL OR tenant_id = $1)
    )
    SELECT
      position_group,
      COUNT(*)::int AS completed_samples,
      ROUND(AVG(ABS(predicted_wait_minutes - outcome_wait_minutes))::numeric, 2)
        AS mean_absolute_error_minutes
    FROM labeled
    GROUP BY position_group
    ORDER BY position_group
  `, [vendorId]);
  return {
    tableAvailable: true,
    summary: summary.rows,
    vendorCoverage: vendorCoverage.rows[0],
    positionCoverage: positionCoverage.rows,
    evaluation: await readWaitTimeEvaluation(client, "vendors", vendorId)
  };
}

async function readDeveloperSandboxReport(client) {
  const developerApiTable = await client.query(
    "SELECT to_regclass('public.developer_api_wait_time_prediction_samples') AS table_name"
  );
  let developerApiSandbox;
  if (!developerApiTable.rows[0]?.table_name) {
    developerApiSandbox = {
      tableAvailable: false,
      summary: [],
      queueCoverage: null,
      positionCoverage: [],
      message: "Apply the Developer API Sandbox wait-time prediction migration before auditing its samples."
    };
  } else {
    const developerApiSummary = await client.query(`
      SELECT
        predictor_version,
        COUNT(*)::int AS total_samples,
        COUNT(*) FILTER (WHERE outcome_type = 'called')::int AS completed_samples,
        COUNT(*) FILTER (WHERE outcome_type = 'censored')::int AS censored_samples,
        COUNT(*) FILTER (WHERE outcome_type IS NULL)::int AS pending_samples,
        COUNT(DISTINCT developer_project_id) FILTER (WHERE outcome_type = 'called')::int AS projects_with_completed_samples,
        COUNT(DISTINCT developer_api_queue_id) FILTER (WHERE outcome_type = 'called')::int AS queues_with_completed_samples,
        MIN(sampled_at) AS first_sample_at,
        MAX(sampled_at) AS latest_sample_at,
        ROUND(AVG(ABS(predicted_wait_minutes - outcome_wait_minutes))
          FILTER (WHERE outcome_type = 'called'), 2) AS mean_absolute_error_minutes,
        ROUND(AVG(outcome_wait_minutes - predicted_wait_minutes)
          FILTER (WHERE outcome_type = 'called'), 2) AS mean_signed_error_minutes,
        ROUND(100 * AVG((ABS(predicted_wait_minutes - outcome_wait_minutes) <= 5)::int)
          FILTER (WHERE outcome_type = 'called'), 1) AS within_five_minutes_percent
      FROM developer_api_wait_time_prediction_samples
      WHERE environment = 'sandbox'
      GROUP BY predictor_version
      ORDER BY predictor_version
    `);

    const developerApiQueueCoverage = await client.query(`
      WITH eligible_queues AS (
        SELECT queues.id
          FROM developer_api_queues AS queues
          INNER JOIN developer_api_profiles AS profiles
            ON profiles.id = queues.developer_api_profile_id
         WHERE profiles.environment = 'sandbox'
      ), per_queue AS (
        SELECT queues.id AS queue_id, COUNT(samples.id)::int AS completed_samples
          FROM eligible_queues AS queues
          LEFT JOIN developer_api_wait_time_prediction_samples AS samples
            ON samples.developer_api_queue_id = queues.id
           AND samples.environment = 'sandbox'
           AND samples.outcome_type = 'called'
         GROUP BY queues.id
      )
      SELECT
        COUNT(*) FILTER (WHERE completed_samples > 0)::int AS queues_with_completed_samples,
        COUNT(*) FILTER (WHERE completed_samples < 30)::int AS queues_below_30_samples,
        COUNT(*) FILTER (WHERE completed_samples BETWEEN 30 AND 99)::int AS queues_with_30_to_99_samples,
        COUNT(*) FILTER (WHERE completed_samples >= 100)::int AS queues_with_at_least_100_samples,
        MIN(completed_samples)::int AS fewest_samples_for_a_queue,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY completed_samples) AS median_samples_per_queue
      FROM per_queue
    `);

    const developerApiPositionCoverage = await client.query(`
      WITH labeled AS (
        SELECT
          CASE
            WHEN (features->>'position') ~ '^[0-9]+$'
              AND (features->>'position')::int <= 1 THEN 'position_1'
            WHEN (features->>'position') ~ '^[0-9]+$'
              AND (features->>'position')::int BETWEEN 2 AND 3 THEN 'position_2_to_3'
            WHEN (features->>'position') ~ '^[0-9]+$'
              AND (features->>'position')::int >= 4 THEN 'position_4_plus'
            ELSE 'position_unknown'
          END AS position_group,
          predicted_wait_minutes,
          outcome_wait_minutes
        FROM developer_api_wait_time_prediction_samples
        WHERE environment = 'sandbox' AND outcome_type = 'called'
      )
      SELECT
        position_group,
        COUNT(*)::int AS completed_samples,
        ROUND(AVG(ABS(predicted_wait_minutes - outcome_wait_minutes))::numeric, 2)
          AS mean_absolute_error_minutes
      FROM labeled
      GROUP BY position_group
      ORDER BY position_group
    `);

    developerApiSandbox = {
      tableAvailable: true,
      summary: developerApiSummary.rows,
      queueCoverage: developerApiQueueCoverage.rows[0],
      positionCoverage: developerApiPositionCoverage.rows,
      evaluation: await readWaitTimeEvaluation(client, "developer-sandbox"),
      note: "Sandbox Developer API results are separate from merchant queue samples. Review queue coverage and temporal holdout performance before model rollout."
    };
  }
  return developerApiSandbox;
}

async function runAudit() {
  const { reportArgs, ticketContext } = parseTicketContextOptions(process.argv.slice(2));
  const options = parseOptions(reportArgs);
  if (ticketContext && (options.scope !== "vendors" || !options.vendorSlug)) {
    throw new Error("Ticket context requires --scope vendors and --vendor-slug.");
  }
  const configuredTarget = assertDatabaseTarget();
  let client;
  let transactionOpen = false;

  try {
    client = await db.pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '5s'");

    const target = await client.query("SELECT current_database() AS database_name, inet_server_addr()::text AS server_address, inet_server_port() AS server_port");
    if (target.rows[0]?.database_name !== String(process.env.DATABASE_NAME).trim()) {
      throw new Error("Connected database does not match the expected target.");
    }
    const report = {
      database: target.rows[0].database_name,
      target: {
        ...configuredTarget,
        serverAddress: target.rows[0].server_address,
        serverPort: target.rows[0].server_port,
        auditHost: hostname(),
        checkoutDirectory: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
        cliApiEnvironment: env.apiEnvironment
      },
      reportScope: options.scope,
      captureEnabled: env.waitTimePredictionCaptureEnabled,
      captureStatusSource: "Audit CLI configuration; this does not verify the running API process configuration.",
      sampleScopes: {
        vendors: "Vendor Portal ticket samples in this database; these samples are not environment-tagged.",
        developerApiSandbox: "Developer API samples explicitly tagged sandbox; independent of the audit CLI environment."
      },
      note: "Read-only report. Configuration and database names do not prove isolation. Review temporal holdout performance and coverage before model rollout."
    };
    let vendorId = null;
    if (options.vendorSlug) {
      const vendor = await client.query("SELECT id, slug FROM tenants WHERE slug = $1", [options.vendorSlug]);
      if (!vendor.rows[0]) throw new Error("Vendor slug was not found in the expected database.");
      vendorId = String(vendor.rows[0].id);
      report.vendorFilter = { id: vendorId, slug: vendor.rows[0].slug, appliesTo: "vendors only" };
    } else report.vendorFilter = null;
    if (options.scope !== "developer-sandbox") {
      Object.assign(report, await readVendorReport(client, vendorId));
    }
    if (options.scope !== "vendors") {
      report.developerApiSandbox = await readDeveloperSandboxReport(client);
    }
    if (ticketContext) report.ticketContext = await readTicketContext(client, vendorId, ticketContext);

    console.log(JSON.stringify(report, null, 2));
  } finally {
    try {
      if (transactionOpen) await client.query("ROLLBACK");
    } finally {
      client?.release();
      await db.pool.end();
    }
  }
}

runAudit().catch((error) => {
  console.error("Wait-time prediction audit failed:", error.message);
  process.exitCode = 1;
});
