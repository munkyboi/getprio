#!/usr/bin/env node
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { URL } from "node:url";
import { Buffer } from "node:buffer";
import process from "node:process";
import console from "node:console";

const require = createRequire(import.meta.url);
const env = require("../backend/src/config/env");
const { Pool } = require("pg");
const { createDatabasePoolConfig } = require("../backend/src/config/databaseSsl");
const { createResourceOperationalSnapshotProducer } = require("../backend/src/services/resourceOperationalSnapshotProducer");
const { createResourceShadowInference } = require("../backend/src/services/resourceShadowInference");
const { MAX_SNAPSHOT_BYTES } = require("../backend/src/services/resourceOperationalSnapshot");
const SOURCE_BINDING = "resource-shadow-readiness-audit-v1";

function optionsFrom(args) {
  const keys = new Map([["--vendor-slug", "vendorSlug"], ["--location-slug", "locationSlug"]]);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = keys.get(args[index]);
    const value = args[index + 1];
    if (!key || Object.hasOwn(options, key) || typeof value !== "string" || !value.trim()
        || value.startsWith("--") || value.length > 160) {
      throw new Error("Use --vendor-slug and --location-slug exactly once each.");
    }
    options[key] = value.trim();
  }
  if (!options.vendorSlug || !options.locationSlug) throw new Error("Vendor and location slugs are required.");
  return options;
}

function databaseTarget() {
  const host = String(process.env.DATABASE_HOST || "").trim().toLowerCase();
  const database = String(process.env.DATABASE_NAME || "").trim();
  if (!host || !database || !process.env.DATABASE_URL) throw new Error("Expected database host, name and configured URL are required.");
  const url = new URL(env.databaseUrl);
  if (url.hostname.toLowerCase() !== host || decodeURIComponent(url.pathname.slice(1)) !== database) {
    throw new Error("Configured database differs from the expected target.");
  }
  return { host, database, port: Number(url.port || 5432) };
}

async function resolveScope(pool, options, target) {
  const result = await pool.query(`SELECT current_database() AS database,
    inet_server_addr()::text AS server_address, locations.id::text AS location_id,
    locations.tenant_id::text AS tenant_id
    FROM store_locations AS locations INNER JOIN tenants ON tenants.id = locations.tenant_id
    WHERE tenants.slug=$1 AND locations.slug=$2`, [options.vendorSlug, options.locationSlug]);
  if (result.rows.length !== 1 || result.rows[0].database !== target.database) {
    throw new Error("Vendor location was not found uniquely in the expected database.");
  }
  const row = result.rows[0];
  return { scope: { tenantId: row.tenant_id, locationId: row.location_id,
    queueKind: "location", sourceBinding: SOURCE_BINDING }, serverAddress: row.server_address };
}

function abortablePool(pool, signal) {
  return { connect: async () => {
    if (signal.aborted) throw new Error("Read aborted.");
    const client = await pool.connect();
    let released = false;
    const release = (destroy = false) => {
      if (released) return;
      released = true;
      signal.removeEventListener("abort", abort);
      client.release(destroy);
    };
    const abort = () => release(true);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { release(true); throw new Error("Read aborted."); }
    return { query: (...args) => client.query(...args), release };
  } };
}

async function run() {
  const options = optionsFrom(process.argv.slice(2));
  const target = databaseTarget();
  // A dedicated pool prevents audit timeouts/read-only settings touching the API.
  const pool = new Pool({ ...createDatabasePoolConfig({ connectionString: env.databaseUrl,
    enabled: env.databaseSsl, ca: env.databaseSslCa, caFile: env.databaseSslCaFile }),
  max: 1, connectionTimeoutMillis: 1000, query_timeout: 1500,
  options: "-c default_transaction_read_only=on -c statement_timeout=1000 -c lock_timeout=500 -c idle_in_transaction_session_timeout=1500" });
  try {
    const { scope, serverAddress } = await resolveScope(pool, options, target);
    let diagnostic;
    const infer = createResourceShadowInference({ enabled: true, expectedScope: scope, timeoutMs: 1000,
      readSnapshot: async ({ signal }) => {
        const reader = createResourceOperationalSnapshotProducer({ pool: abortablePool(pool, signal), sourceBinding: SOURCE_BINDING,
          authorize: async (client, authorizedScope) => {
            const result = await client.query(`SELECT 1 FROM store_locations AS locations
              INNER JOIN tenants ON tenants.id=locations.tenant_id
              WHERE locations.tenant_id=$1 AND locations.id=$2 AND tenants.slug=$3 AND locations.slug=$4
              AND current_database()=$5`, [authorizedScope.tenantId, authorizedScope.locationId,
            options.vendorSlug, options.locationSlug, target.database]);
            return result.rows.length === 1;
          } });
        const envelope = await reader(scope);
        // This command is a readiness preflight, never a forecast endpoint. A
        // future ready producer requires a separately reviewed target adapter.
        if (envelope.readiness !== "not_ready") throw new Error("Ready inventory requires a target adapter.");
        const bytes = Buffer.from(JSON.stringify(envelope));
        if (bytes.length > MAX_SNAPSHOT_BYTES) throw new Error("Snapshot exceeds byte limit.");
        diagnostic = envelope;
        return bytes;
      } });
    const shadow = await infer({ targetWorkRef: "readiness-audit-probe" });
    console.log(JSON.stringify({ reportVersion: "resource-shadow-audit-v1", readOnly: true,
      target: { ...target, serverAddress, auditHost: hostname(), cliApiEnvironment: env.apiEnvironment },
      vendorSlug: options.vendorSlug, locationSlug: options.locationSlug,
      producerReadiness: diagnostic?.readiness ?? "unavailable", shadow,
      samplesWritten: 0, customerEstimateChanged: false, rolloutApproved: false,
      note: "One CLI readiness preflight, not a running API configuration check or service-start forecast. Operator database access supplies authority. Database names and CLI environment do not prove isolation." }, null, 2));
  } finally {
    await pool.end();
  }
}

run().catch(() => {
  console.error("Resource shadow audit failed. Check the options, expected database target, access and connectivity.");
  process.exitCode = 1;
});
