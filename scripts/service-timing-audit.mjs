#!/usr/bin/env node
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { URL } from "node:url";
import process from "node:process";
import console from "node:console";
const require = createRequire(import.meta.url);
const env = require("../backend/src/config/env");
const db = require("../backend/src/config/db");

function parseOptions(args) {
  const options = {};
  const names = new Map([["--vendor-slug", "vendorSlug"], ["--location-slug", "locationSlug"], ["--from", "from"], ["--to", "to"]]);
  for (let index = 0; index < args.length; index += 1) {
    const key = names.get(args[index]);
    const value = args[++index];
    if (!key || options[key] || !value || value.startsWith("--") || value.length > 200) throw new Error("Unknown, duplicate or missing option.");
    options[key] = value;
  }
  if (!options.vendorSlug || !options.locationSlug) throw new Error("--vendor-slug and --location-slug are required.");
  for (const key of ["from", "to"]) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(options[key] || "")
      || !Number.isFinite(Date.parse(options[key])) || new Date(options[key]).toISOString().replace(".000Z", "Z") !== options[key]) {
      throw new Error("--from and --to must be valid UTC timestamps, e.g. 2026-10-03T00:00:00Z.");
    }
  }
  const span = Date.parse(options.to) - Date.parse(options.from);
  if (span <= 0 || span > 7 * 86400000) throw new Error("Use a positive window no longer than seven days.");
  return options;
}

async function main() {
  let client;
  try {
    const options = parseOptions(process.argv.slice(2));
    const url = new URL(env.databaseUrl);
    if (!process.env.DATABASE_HOST || !process.env.DATABASE_NAME
      || url.hostname.toLowerCase() !== process.env.DATABASE_HOST.toLowerCase()
      || decodeURIComponent(url.pathname.slice(1)) !== process.env.DATABASE_NAME) {
      throw new Error("Set DATABASE_HOST and DATABASE_NAME to match the configured connection before running the audit.");
    }
    client = await db.pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const scope = await client.query(`SELECT l.id, l.tenant_id, l.service_timing_enabled
      FROM store_locations l JOIN tenants t ON t.id = l.tenant_id
      WHERE t.slug = $1 AND l.slug = $2`, [options.vendorSlug, options.locationSlug]);
    if (scope.rows.length !== 1) throw new Error("Vendor location not found.");
    const branch = scope.rows[0];
    const summary = await client.query(`SELECT
      COUNT(*)::int AS started_records,
      COUNT(*) FILTER (WHERE service_outcome = 'completed')::int AS completed_records,
      COUNT(*) FILTER (WHERE service_outcome = 'interrupted')::int AS interrupted_records,
      COUNT(*) FILTER (WHERE service_ended_at IS NULL)::int AS unfinished_records,
      ROUND((AVG(EXTRACT(EPOCH FROM (service_ended_at - service_started_at)) / 60)
        FILTER (WHERE service_outcome = 'completed'))::numeric, 2) AS mean_completed_service_minutes,
      ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (service_ended_at - service_started_at)) / 60)
        FILTER (WHERE service_outcome = 'completed'))::numeric, 2) AS median_completed_service_minutes,
      COUNT(*) FILTER (WHERE service_outcome = 'completed' AND status <> 'served')::int AS completed_timing_with_other_queue_outcome
      FROM tickets WHERE tenant_id = $1 AND location_id = $2
        AND service_started_at >= $3::timestamptz AND service_started_at < $4::timestamptz`,
    [branch.tenant_id, branch.id, options.from, options.to]);
    const identity = await client.query("SELECT inet_server_addr()::text AS server_address, current_database() AS database");
    console.log(JSON.stringify({
      target: { host: url.hostname, database: identity.rows[0].database, serverAddress: identity.rows[0].server_address,
        auditHost: hostname(), cliApiEnvironment: env.apiEnvironment },
      reportVersion: "service-timing-v1", readOnly: true, ...options,
      trackingEnabled: branch.service_timing_enabled, summary: summary.rows[0],
      customerEstimateChanged: false, actualResourceOccupancy: "unknown",
      note: "Explicit staff observations only. Window selects service starts; interrupted and unfinished records are excluded from completed durations. Queue outcomes and actual service outcomes are separate. No legacy called/served timestamps are inferred; no resource allocation is performed. Database names and CLI environment do not prove isolation."
    }, null, 2));
  } finally {
    try { if (client) await client.query("ROLLBACK"); }
    finally { client?.release(); await db.pool.end(); }
  }
}
main().catch((error) => { console.error("Service timing audit failed:", error.message); process.exitCode = 1; });
