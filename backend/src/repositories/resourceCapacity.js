const db = require("../config/db");

const MAX_RESERVATIONS = 20000;

function queryClient(options) {
  return options.client || db.pool;
}

function assertScope(scope) {
  for (const field of ["tenantId", "locationId"]) {
    if (!/^[1-9]\d*$/u.test(String(scope[field] || ""))) throw new Error(`Invalid resource scope: ${field}.`);
  }
}

async function listDraftConfiguration(scope, options = {}) {
  assertScope(scope);
  const values = [scope.tenantId, scope.locationId];
  const client = queryClient(options);
  const pools = await client.query(`
    SELECT id::text, name, capacity, tracking_enabled, revision
    FROM location_resource_pools WHERE tenant_id = $1 AND location_id = $2 ORDER BY id
  `, values);
  const requirements = await client.query(`
    SELECT service_id::text, pool_id::text, units_required, revision
    FROM service_resource_requirements WHERE tenant_id = $1 AND location_id = $2 ORDER BY service_id
  `, values);
  return { pools: pools.rows, requirements: requirements.rows };
}

async function readReservationLedger(scope, window, options = {}) {
  assertScope(scope);
  const result = await queryClient(options).query(`
    SELECT items.id::text AS item_id, items.service_id::text,
      items.scheduled_start_at AS starts_at, items.scheduled_end_at AS ends_at,
      requirements.pool_id::text, requirements.units_required,
      (bookings.status = 'pending' AND bookings.payment_proof_object_key IS NULL
        AND bookings.pending_expires_at <= $5::timestamptz) AS expired_pending
    FROM booking_bundle_items AS items
    INNER JOIN bookings ON bookings.id = items.booking_id
      AND bookings.tenant_id = items.tenant_id AND bookings.location_id = items.location_id
    LEFT JOIN service_resource_requirements AS requirements
      ON requirements.tenant_id = items.tenant_id AND requirements.location_id = items.location_id
      AND requirements.service_id = items.service_id
    WHERE items.tenant_id = $1 AND items.location_id = $2
      AND bookings.status = ANY(ARRAY['pending', 'confirmed', 'rescheduled']::text[])
      AND ((items.scheduled_start_at < $4::timestamptz AND items.scheduled_end_at > $3::timestamptz)
        OR (items.scheduled_start_at >= items.scheduled_end_at
          AND bookings.scheduled_start_at < $4::timestamptz AND bookings.scheduled_end_at > $3::timestamptz))
    ORDER BY items.scheduled_start_at, items.id LIMIT ${MAX_RESERVATIONS + 1}
  `, [scope.tenantId, scope.locationId, window.from, window.to, window.observedAt]);
  if (result.rows.length > MAX_RESERVATIONS) throw new Error("Reservation report exceeds 20,000 items. Use a shorter window.");
  // Expired holds are excluded from the hypothetical projection without writing
  // their status. Report them because stored booking availability can still differ.
  return result.rows;
}

async function countMissingBookingItems(scope, window, options = {}) {
  assertScope(scope);
  const result = await queryClient(options).query(`
    SELECT COUNT(*)::int AS count FROM bookings
    WHERE tenant_id = $1 AND location_id = $2
      AND status = ANY(ARRAY['pending', 'confirmed', 'rescheduled']::text[])
      AND scheduled_start_at < $4::timestamptz AND scheduled_end_at > $3::timestamptz
      AND NOT EXISTS (SELECT 1 FROM booking_bundle_items AS items
        WHERE items.booking_id = bookings.id AND items.tenant_id = bookings.tenant_id
          AND items.location_id = bookings.location_id)
  `, [scope.tenantId, scope.locationId, window.from, window.to]);
  return result.rows[0].count;
}

// Internal draft writers: callers must supply their transaction client and
// enforce admin authorization before exposing these through any future API.
function draftClient(options) {
  if (!options.client) throw new Error("Draft configuration requires an explicit transaction client.");
  return options.client;
}

async function createDraftPool(scope, data, options = {}) {
  assertScope(scope);
  const name = String(data.name || "").trim();
  if (!name || name.length > 120 || !Number.isInteger(data.capacity) || data.capacity < 1 || data.capacity > 100) {
    throw new Error("Pool requires a name up to 120 characters and capacity from 1 to 100.");
  }
  const result = await draftClient(options).query(`
    INSERT INTO location_resource_pools (tenant_id, location_id, name, capacity)
    VALUES ($1, $2, $3, $4) RETURNING id::text, name, capacity, tracking_enabled, revision
  `, [scope.tenantId, scope.locationId, name, data.capacity]);
  return result.rows[0];
}

async function setDraftRequirement(scope, data, options = {}) {
  assertScope(scope);
  for (const field of ["poolId", "serviceId"]) {
    if (!/^[1-9]\d*$/u.test(String(data[field] || ""))) throw new Error(`Invalid ${field}.`);
  }
  if (!Number.isInteger(data.unitsRequired) || data.unitsRequired < 1 || data.unitsRequired > 100) {
    throw new Error("Required units must be an integer from 1 to 100.");
  }
  const client = draftClient(options);
  const pool = await client.query(`
    SELECT capacity FROM location_resource_pools
    WHERE tenant_id = $1 AND location_id = $2 AND id = $3 AND tracking_enabled = FALSE FOR UPDATE
  `, [scope.tenantId, scope.locationId, data.poolId]);
  if (!pool.rows[0] || data.unitsRequired > pool.rows[0].capacity) throw new Error("Draft pool is missing or demand exceeds capacity.");
  const result = await client.query(`
    INSERT INTO service_resource_requirements (tenant_id, location_id, service_id, pool_id, units_required)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tenant_id, location_id, service_id) DO UPDATE
      SET pool_id = EXCLUDED.pool_id, units_required = EXCLUDED.units_required,
        revision = service_resource_requirements.revision + 1
    RETURNING service_id::text, pool_id::text, units_required, revision
  `, [scope.tenantId, scope.locationId, data.serviceId, data.poolId, data.unitsRequired]);
  return result.rows[0];
}

module.exports = {
  listDraftConfiguration, readReservationLedger, countMissingBookingItems,
  createDraftPool, setDraftRequirement
};
