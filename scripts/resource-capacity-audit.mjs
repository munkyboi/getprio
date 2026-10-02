#!/usr/bin/env node
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { URL } from "node:url";
import process from "node:process";
import console from "node:console";

const require = createRequire(import.meta.url);
const env = require("../backend/src/config/env");
const db = require("../backend/src/config/db");
const repository = require("../backend/src/repositories/resourceCapacity");
const { projectReservationCapacity } = require("../backend/src/services/resourceCapacityProjection");

function parseOptions(args) {
  const names = new Map([
    ["--vendor-slug", "vendorSlug"], ["--location-slug", "locationSlug"],
    ["--from", "from"], ["--to", "to"], ["--service-id", "serviceId"],
    ["--duration-minutes", "durationMinutes"]
  ]);
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = names.get(args[index]);
    const value = args[++index];
    if (!key || options[key] !== undefined || !value || value.startsWith("--") || value.length > 200) {
      throw new Error("Unknown, duplicate or missing option. Required: --vendor-slug --location-slug --from --to. Optional: --service-id --duration-minutes.");
    }
    options[key] = value.trim();
  }
  if (!options.vendorSlug || !options.locationSlug) throw new Error("Vendor and location slugs are required.");
  validateWindow(options);
  validateCandidateOptions(options);
  return options;
}

function validateWindow(options) {
  for (const key of ["from", "to"]) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(options[key] || "")) {
      throw new Error("Use UTC timestamps for --from and --to, such as 2026-10-03T00:00:00Z.");
    }
    const time = new Date(options[key]);
    if (!Number.isFinite(time.getTime()) || time.toISOString().replace(".000Z", "Z") !== options[key].replace(".000Z", "Z")) {
      throw new Error("Invalid calendar timestamp.");
    }
    options[key] = time.toISOString();
  }
  const span = new Date(options.to) - new Date(options.from);
  if (span <= 0 || span > 7 * 86400000) throw new Error("Report window must be positive and no longer than seven days.");
}

function validateCandidateOptions(options) {
  if (options.serviceId && !/^[1-9]\d{0,17}$/u.test(options.serviceId)) throw new Error("Service ID must be a positive database ID.");
  if (options.durationMinutes !== undefined) {
    if (!options.serviceId || !/^\d{1,4}$/u.test(options.durationMinutes) || Number(options.durationMinutes) < 1 || Number(options.durationMinutes) > 1440) {
      throw new Error("Duration requires a service ID and an integer from 1 to 1440 minutes.");
    }
    options.durationMinutes = Number(options.durationMinutes);
  }
}

function expectedTarget() {
  const host = String(process.env.DATABASE_HOST || "").trim().toLowerCase();
  const database = String(process.env.DATABASE_NAME || "").trim();
  if (!host || !database || !String(process.env.DATABASE_URL || "").trim()) {
    throw new Error("Set DATABASE_HOST, DATABASE_NAME and DATABASE_URL before opening a connection.");
  }
  const url = new URL(env.databaseUrl);
  if (url.hostname.toLowerCase() !== host || decodeURIComponent(url.pathname.slice(1)) !== database) {
    throw new Error("Configured database does not match the expected host and database.");
  }
  return { host, database, port: Number(url.port || 5432) };
}

async function readCandidate(client, scope, options, requirements) {
  if (!options.serviceId) return null;
  const result = await client.query(`
    SELECT services.duration_minutes FROM vendor_services AS services
    INNER JOIN location_services AS assigned ON assigned.service_id = services.id AND assigned.tenant_id = services.tenant_id
    WHERE services.tenant_id = $1 AND assigned.location_id = $2 AND services.id = $3
      AND assigned.is_active = TRUE AND services.is_active = TRUE
  `, [scope.tenantId, scope.locationId, options.serviceId]);
  if (result.rows.length !== 1) throw new Error("Selected service must be assigned and active at the selected vendor location.");
  const duration = options.durationMinutes ?? Number(result.rows[0].duration_minutes);
  if (!Number.isFinite(duration) || duration < 1 || duration > 1440) throw new Error("Selected service needs a valid duration or --duration-minutes.");
  const requirement = requirements.find((item) => item.service_id === options.serviceId);
  return requirement ? { ...requirement, durationMinutes: duration } : { service_id: options.serviceId, durationMinutes: duration };
}

async function readReport(client, options, target) {
  const identity = await client.query(`
    SELECT current_database() AS database, inet_server_addr()::text AS server_address,
      transaction_timestamp() AS observed_at
  `);
  if (identity.rows[0].database !== target.database) throw new Error("Connected database differs from the expected target.");
  const location = await client.query(`
    SELECT locations.id::text, locations.tenant_id::text, locations.timezone, tenants.average_service_minutes
    FROM store_locations AS locations INNER JOIN tenants ON tenants.id = locations.tenant_id
    WHERE tenants.slug = $1 AND locations.slug = $2
  `, [options.vendorSlug, options.locationSlug]);
  if (location.rows.length !== 1) throw new Error("Vendor location was not found uniquely in the selected database.");
  const row = location.rows[0];
  const scope = { tenantId: row.tenant_id, locationId: row.id };
  const tables = await client.query("SELECT to_regclass('public.location_resource_pools') AS pools, to_regclass('public.service_resource_requirements') AS requirements");
  const base = {
    target: { ...target, serverAddress: identity.rows[0].server_address, auditHost: hostname(), cliApiEnvironment: env.apiEnvironment },
    vendorSlug: options.vendorSlug, locationSlug: options.locationSlug,
    window: { from: options.from, to: options.to }, observedAt: identity.rows[0].observed_at,
    reportVersion: "reservation-capacity-v1", readOnly: true, trackingAvailable: false,
    actualOccupancy: "unknown", customerEstimateChanged: false,
    note: "Draft reservation projection only. It excludes actual occupancy and waiting-ticket service plans; it is not a live wait estimate. Database names and CLI environment do not prove isolation."
  };
  if (!tables.rows[0].pools || !tables.rows[0].requirements) {
    return { ...base, tableAvailable: false, message: "Apply 20261003_add_resource_capacity_foundation.sql before auditing resource capacity." };
  }
  const configuration = await repository.listDraftConfiguration(scope, { client });
  const window = { ...options, observedAt: identity.rows[0].observed_at };
  const reservations = await repository.readReservationLedger(scope, window, { client });
  const missingBookingItems = await repository.countMissingBookingItems(scope, window, { client });
  const candidate = await readCandidate(client, scope, options, configuration.requirements);
  const projection = projectReservationCapacity({ ...configuration, reservations, ...options, candidate: missingBookingItems ? null : candidate });
  const waiting = await client.query(`
    SELECT COUNT(*)::int AS count FROM tickets WHERE tenant_id = $1 AND location_id = $2 AND status = 'waiting'
      AND date_key = to_char($3::timestamptz AT TIME ZONE $4, 'YYYYMMDD')
  `, [scope.tenantId, scope.locationId, options.from, row.timezone]);
  return formatProjectionReport({ base, configuration, reservations, missingBookingItems, candidate, projection, waitingCount: waiting.rows[0].count, averageServiceMinutes: Number(row.average_service_minutes) });
}

function candidateReason(incomplete, pool) {
  if (incomplete) return "incomplete_reservation_mapping";
  if (!pool) return "service_not_mapped";
  return pool.candidateScheduleStart ? "reservation_only" : "no_capacity_within_window";
}

function formatProjectionReport({ base, configuration, reservations, missingBookingItems, candidate, projection, waitingCount, averageServiceMinutes }) {
  const warnings = [];
  if (!configuration.pools.length) warnings.push("No draft pools configured.");
  if (missingBookingItems) warnings.push("Active bookings without service items prevent a complete projection.");
  if (projection.unmappedReservationItems) warnings.push("Unmapped reservations may compete for mapped capacity; the projection is incomplete.");
  if (projection.expiredPendingItems) warnings.push("Expired unpaid pending holds were excluded without modifying stored booking statuses.");
  if (projection.invalidRequirements.length) warnings.push("Some service requirements exceed configured capacity.");
  if (projection.invalidReservationItems) warnings.push("Some reservation intervals are invalid; the projection is incomplete.");
  const incomplete = missingBookingItems > 0 || projection.unmappedReservationItems > 0 || projection.invalidRequirements.length > 0 || projection.invalidReservationItems > 0;
  const pool = candidate && projection.pools.find((item) => item.poolId === candidate.pool_id);
  return {
    ...base, tableAvailable: true, mappingCount: configuration.requirements.length,
    reservationItemCount: reservations.length, missingBookingItems, projection, warnings,
    baselineReference: {
      source: "baseline-v1", waitingCount,
      averageServiceMinutes,
      dashboardWaitingMinutes: waitingCount * averageServiceMinutes,
      note: "Existing count-times-average formula for the selected queue date. Not directly comparable to a reservation-only hypothetical start."
    },
    candidate: candidate ? {
      serviceId: candidate.service_id, durationMinutes: candidate.durationMinutes,
      unitsRequired: candidate.units_required ?? null, poolId: candidate.pool_id ?? null,
      scheduleOnlyStart: incomplete ? null : pool?.candidateScheduleStart ?? null,
      reason: candidateReason(incomplete, pool),
      note: "Hypothetical service ready at window start, with no queue ahead and unknown actual occupancy."
    } : null
  };
}

async function main() {
  let client;
  let open = false;
  try {
    const options = parseOptions(process.argv.slice(2));
    const target = expectedTarget();
    client = await db.pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    open = true;
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    console.log(JSON.stringify(await readReport(client, options, target), null, 2));
  } finally {
    try { if (open) await client.query("ROLLBACK"); }
    finally { client?.release(); await db.pool.end(); }
  }
}

main().catch((error) => {
  console.error("Resource capacity audit failed:", error.message);
  process.exitCode = 1;
});
