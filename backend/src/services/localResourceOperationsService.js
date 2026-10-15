const { readLocalPoolDemoScope, localPoolDemoConfiguration } = require('./localPoolDemoScope');
const { readAuthorizedVendorQueueActor } = require('./vendorQueueTransactionService');
const { buildCounterDispatch } = require('./counterDispatchService');
const permissions = require('./permissions');
const { getDateKey } = require('./queueHelpers');
const { waitingPriorityOrder, bookingCallNotReady } = require('./queueDispatchRules');

function fail(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}
function bounded(rows, limit) {
  if (rows.length > limit) fail('Local resource inventory exceeds its bounded read. No partial snapshot returned.', 409);
  return rows;
}
const iso = column => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

async function authorize(client, scope) {
  if (!await readLocalPoolDemoScope(client, scope)) fail('Local resource demo not found.', 404);
  const actor = await readAuthorizedVendorQueueActor(client, scope, 'tenant.queue.read');
  if (!actor) fail('Resource operation is not authorized.', 403);
  return actor;
}

async function readInventory(client, scope, location, actor) {
  const values = [scope.tenantId, scope.locationId];
  const observation = (await client.query(`SELECT ${iso('transaction_timestamp()')} AS as_of,
    revision::text FROM resource_ledger_scopes WHERE tenant_id=$1 AND location_id=$2`, values)).rows[0];
  if (!observation) fail('Resource ledger scope is unavailable.', 409);
  const pools = bounded((await client.query(`SELECT id::text,name,capacity,tracking_enabled,revision
    FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2 ORDER BY id LIMIT 51`, values)).rows, 50);
  const allocations = bounded((await client.query(`SELECT a.id::text,a.pool_id::text,a.ticket_id::text,a.units,
    ${iso('a.started_at')} AS started_at, ${iso('a.expected_end_at')} AS expected_end_at,
    a.expected_end_at <= transaction_timestamp() AS overdue,w.ticket_number,w.status,
    w.service_started_at IS NOT NULL AND w.service_ended_at IS NULL AS timing_active
    FROM resource_allocations a LEFT JOIN tickets w ON (w.id,w.tenant_id,w.location_id)=(a.ticket_id,a.tenant_id,a.location_id)
    WHERE a.tenant_id=$1 AND a.location_id=$2 AND a.released_at IS NULL ORDER BY a.id LIMIT 1001`, values)).rows, 1000);
  const reservations = bounded((await client.query(`SELECT id::text,pool_id::text,units,
    starts_at <= transaction_timestamp() AND ends_at > transaction_timestamp() AS protects_now
    FROM resource_ledger_reservations WHERE tenant_id=$1 AND location_id=$2 AND state='protected'
    ORDER BY id LIMIT 1001`, values)).rows, 1000);
  const tickets = bounded((await client.query(`SELECT w.id::text,w.ticket_number,w.status,w.current_queue_day_id::text,w.service_counter_id::text,
    w.queue_date_key,w.pending_carry_over_since IS NOT NULL AS pending_carry_over,
    ${iso('w.service_started_at')} AS service_started_at,${iso('w.service_ended_at')} AS service_ended_at,
    p.source AS plan_source,p.items->0->>'serviceId' AS service_id,p.items->0->>'serviceName' AS service_name,
    p.items->0->>'durationMinutes' AS duration_minutes,
    p.items->0->'resource'->>'poolId' AS captured_pool_id,
    p.items->0->'resource'->>'unitsRequired' AS captured_units,
    p.items->0->'resource'->>'known' AS resource_known,
    jsonb_array_length(p.items) AS plan_item_count
    FROM tickets w LEFT JOIN ticket_service_plans p ON (p.ticket_id,p.tenant_id,p.location_id)=(w.id,w.tenant_id,w.location_id)
    WHERE w.tenant_id=$1 AND w.location_id=$2 AND (w.status IN ('waiting','called')
      OR (w.service_started_at IS NOT NULL AND w.service_ended_at IS NULL))
    ORDER BY ${waitingPriorityOrder('w.')},w.id LIMIT 1001`, values)).rows, 1000);
  const poolIds = new Set(pools.map(pool => pool.id));
  const allocatedTickets = new Set(allocations.map(allocation => allocation.ticket_id));
  const issues = [];
  for (const allocation of allocations) {
    if (!poolIds.has(allocation.pool_id) || !allocation.ticket_number || !allocation.timing_active) {
      issues.push({ code: 'allocation_requires_reconciliation', allocationId: allocation.id });
    }
  }
  for (const reservation of reservations) {
    if (!poolIds.has(reservation.pool_id)) issues.push({ code: 'reservation_requires_reconciliation', reservationId: reservation.id });
  }
  const poolRows = pools.map(pool => {
    const held = allocations.filter(row => row.pool_id === pool.id);
    const allocatedUnits = held.reduce((sum, row) => sum + row.units, 0);
    const protectedUnitsNow = reservations.filter(row => row.pool_id === pool.id && row.protects_now).reduce((sum, row) => sum + row.units, 0);
    const overCapacity = allocatedUnits + protectedUnitsNow > pool.capacity;
    if (overCapacity) issues.push({ code: 'pool_over_capacity', poolId: pool.id });
    return { id: pool.id, name: pool.name, capacity: pool.capacity, revision: String(pool.revision),
      trackingEnabled: pool.tracking_enabled, allocatedUnits, protectedUnitsNow,
      availableUnits: Math.max(0, pool.capacity - allocatedUnits - protectedUnitsNow),
      overdueUnits: held.filter(row => row.overdue).reduce((sum, row) => sum + row.units, 0), overCapacity };
  });
  const work = tickets.map(row => {
    const timingActive = row.service_started_at !== null && row.service_ended_at === null;
    if (timingActive && !allocatedTickets.has(row.id)) issues.push({ code: 'active_timing_without_allocation', ticketId: row.id });
    return { id: row.id, ticketNumber: row.ticket_number, status: row.status,
      serviceCounterId: row.service_counter_id, queueDayId: row.current_queue_day_id, queueDateKey: row.queue_date_key, pendingCarryOver: row.pending_carry_over,
      timingActive, serviceStartedAt: row.service_started_at,
      plan: row.plan_source ? { source: row.plan_source, itemCount: row.plan_item_count,
        serviceId: row.service_id, serviceName: row.service_name,
        durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
        poolId: row.captured_pool_id, unitsRequired: row.captured_units === null ? null : Number(row.captured_units),
        resourceKnown: row.resource_known === 'true' } : null };
  });
  const called = work.filter(row => row.status === 'called' && !allocatedTickets.has(row.id));
  const day = (await client.query(`SELECT id::text,business_date::text,version::text,
    current_closes_at > transaction_timestamp() AS before_deadline
    FROM queue_days WHERE tenant_id=$1 AND location_id=$2 AND state='open'
    ORDER BY business_date DESC,id DESC LIMIT 1`, values)).rows[0];
  const dateKey = location.queue_lifecycle_mode === 'enforced' && day
    ? day.business_date.replaceAll('-', '') : getDateKey(new Date(observation.as_of), location.timezone || 'Asia/Manila');
  const closure = (await client.query(`SELECT EXISTS(SELECT 1 FROM queue_day_closures
    WHERE tenant_id=$1 AND location_id=$2 AND queue_date_key=$3 AND reopened_at IS NULL) AS closed`, [...values,dateKey])).rows[0].closed;
  const queueOpen = !closure && (location.queue_lifecycle_mode !== 'enforced' || Boolean(day?.before_deadline));
  const readyWaitingCount = (await client.query(`SELECT count(*)::int AS count FROM tickets w
    WHERE w.tenant_id=$1 AND w.location_id=$2 AND w.status='waiting' AND w.date_key=$3
      AND NOT ${bookingCallNotReady('w', true)}`, [...values,dateKey])).rows[0].count;
  const counters = bounded((await client.query(`SELECT id::text AS "_id",slug,name,is_active AS "isActive"
    FROM service_counters WHERE tenant_id=$1 AND location_id=$2 ORDER BY id LIMIT 101`, values)).rows,100);
  const canOperate = permissions.userHasPermission(actor, 'tenant.queue.operate', {tenantId:scope.tenantId});
  const counterDispatch = buildCounterDispatch(counters,called,readyWaitingCount,queueOpen).map(lane => {
    if (!canOperate || issues.length) return {...lane,canCallNext:false,blockReason:canOperate?'RESOURCE_RECONCILIATION_REQUIRED':'QUEUE_OPERATION_NOT_AUTHORIZED'};
    return lane;
  });
  const result = { contractVersion: 'local-resource-operations-v1', localDemo: true,
    scope: { tenantId: scope.tenantId, locationId: scope.locationId }, asOf: observation.as_of,
    ledgerRevision: observation.revision, forecastReadiness: 'not_evaluated',
    // Point-in-time free units are NOT admission permission over a service duration.
    availabilityMeaning: 'observed_now_only_start_command_is_authoritative',
    queueDay: {id:day?.id || null,version:day?.version || null,dateKey,open:queueOpen},
    readyWaitingCount,counterDispatch, dispatchAdviceOnly:true,
    pools: poolRows, waiting: work.filter(row => row.status === 'waiting' && !row.timingActive),
    called,
    activeSessions: allocations.map(row => ({ id: row.id, ticketId: row.ticket_id, ticketNumber: row.ticket_number,
      poolId: row.pool_id, units: row.units, startedAt: row.started_at, expectedEndAt: row.expected_end_at, overdue: row.overdue })),
    reconciliation: { required: issues.length > 0, issues } };
  if (Buffer.byteLength(JSON.stringify(result)) > 512 * 1024) fail('Local resource snapshot exceeds its byte bound.', 409);
  return result;
}

function createLocalResourceOperationsReader({ pool }) {
  return async function read({ tenantSlug, locationSlug, actorUserId }) {
    if (!localPoolDemoConfiguration()) fail('Local resource demo not found.', 404);
    if (typeof tenantSlug !== 'string' || tenantSlug.length > 160 || typeof locationSlug !== 'string'
      || locationSlug.length > 160 || !/^[1-9]\d{0,18}$/u.test(String(actorUserId))) fail('Invalid local resource scope.', 400);
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='2000ms'; SET LOCAL search_path=public,pg_catalog");
      const identity = (await client.query('SELECT current_database() AS name,host(inet_server_addr()) AS address')).rows[0];
      if (identity.name !== localPoolDemoConfiguration()?.databaseName || !['127.0.0.1','::1'].includes(identity.address)) fail('Local resource demo not found.',404);
      const location = (await client.query(`SELECT l.id::text AS location_id,t.id::text AS tenant_id,l.queue_lifecycle_mode,l.timezone
        FROM store_locations l JOIN tenants t ON t.id=l.tenant_id WHERE t.slug=$1 AND l.slug=$2`, [tenantSlug, locationSlug])).rows[0];
      if (!location) fail('Location not found.', 404);
      const scope = { tenantId: location.tenant_id, locationId: location.location_id, actorUserId: String(actorUserId) };
      const actor = await authorize(client, scope);
      const result = await readInventory(client, scope, location, actor);
      await client.query('COMMIT');
      // A fresh snapshot catches access/fixture revocation during the bounded read.
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout='2000ms'; SET LOCAL search_path=public,pg_catalog");
      await authorize(client, scope);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  };
}
module.exports = { createLocalResourceOperationsReader };
