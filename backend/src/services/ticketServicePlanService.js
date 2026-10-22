const db = require('../config/db');
const { scheduleDurationMinutes } = require('./queueEstimationInputs');

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}
function validId(value) {
  return typeof value === 'string' && /^[1-9]\d{0,18}$/u.test(value)
    && BigInt(value) <= 9223372036854775807n;
}
async function requirements(client, scope, serviceIds) {
  const result = await client.query(`SELECT requirements.service_id::text, requirements.pool_id::text,
    requirements.units_required, requirements.revision, pools.name AS pool_name, pools.revision AS pool_revision, to_jsonb(pools)->>'archived_at' AS archived_at
    FROM service_resource_requirements AS requirements
    JOIN location_resource_pools AS pools ON pools.id = requirements.pool_id
      AND pools.tenant_id = requirements.tenant_id AND pools.location_id = requirements.location_id
    WHERE requirements.tenant_id = $1 AND requirements.location_id = $2 AND requirements.service_id = ANY($3::bigint[])`,
  [scope.tenantId, scope.locationId, serviceIds]);
  return new Map(result.rows.map(row => [row.service_id, row]));
}
function resourceSnapshot(requirement) {
  if (!requirement) return { known: false, reason: 'no_configured_requirement' };
  if (requirement.archived_at) throw Object.assign(new Error('This resource pool is archived. Select an active pool before assigning work.'), { statusCode: 409, code: 'RESOURCE_POOL_ARCHIVED' });
  return { known: true, poolId: requirement.pool_id, poolName: requirement.pool_name,
    unitsRequired: requirement.units_required, requirementRevision: requirement.revision,
    poolRevision: requirement.pool_revision };
}
async function insert(client, scope, ticketId, plan, actorUserId) {
  await client.query(`INSERT INTO ticket_service_plans
    (ticket_id, tenant_id, location_id, source, booking_id, execution_mode, items, created_by_user_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, [ticketId, scope.tenantId, scope.locationId,
    plan.source, plan.bookingId || null, plan.executionMode, JSON.stringify(plan.items), actorUserId || null]);
}
async function captureBookingPlan(client, { tenant, location, ticket, booking, actorUserId }) {
  const scope = { tenantId: tenant._id, locationId: location._id };
  const items = booking.bundleItems?.length ? booking.bundleItems : [{
    serviceId: booking.serviceId, serviceName: booking.serviceName,
    scheduledStartAt: booking.scheduledStartAt, scheduledEndAt: booking.scheduledEndAt
  }];
  const mappings = await requirements(client, scope, items.map(item => item.serviceId));
  await insert(client, scope, ticket._id, { source: 'booking', bookingId: booking._id,
    executionMode: booking.executionMode === 'sequential' ? 'sequential' : 'parallel',
    items: items.map(item => ({ serviceId: item.serviceId, serviceName: item.serviceName,
      bookingItemId: item.id || null, scheduledStartAt: item.scheduledStartAt,
      scheduledEndAt: item.scheduledEndAt, durationMinutes: scheduleDurationMinutes(item),
      resource: resourceSnapshot(mappings.get(item.serviceId)) })) }, actorUserId);
}
async function captureStaffPlan(client, { tenant, location, ticket, serviceId, actorUserId }) {
  if (!validId(serviceId)) fail('Select a valid service for this ticket.');
  const scope = { tenantId: tenant._id, locationId: location._id };
  const result = await client.query(`SELECT services.id::text, services.name, services.duration_minutes
    FROM vendor_services AS services JOIN location_services AS assignments
      ON assignments.service_id = services.id AND assignments.tenant_id = services.tenant_id
    WHERE services.tenant_id = $1 AND assignments.location_id = $2 AND services.id = $3
      AND services.is_active = TRUE AND assignments.is_active = TRUE FOR SHARE OF services, assignments`,
  [scope.tenantId, scope.locationId, serviceId]);
  const service = result.rows[0];
  if (!service) fail('Select an active service offered at this branch.');
  const mappings = await requirements(client, scope, [serviceId]);
  await insert(client, scope, ticket._id, { source: 'staff_selection', executionMode: 'parallel',
    items: [{ serviceId, serviceName: service.name, durationMinutes: Number(service.duration_minutes),
      resource: resourceSnapshot(mappings.get(serviceId)) }] }, actorUserId);
}
async function getTicketPlan(scope, ticketId) {
  if (!validId(ticketId)) fail('Ticket not found.', 404);
  const result = await db.pool.query(`SELECT tickets.status, tickets.service_started_at, tickets.service_ended_at,
    tickets.service_outcome, plans.source, plans.booking_id::text, plans.execution_mode,
    plans.items, plans.created_at, (to_jsonb(plans)->>'contract_version') AS contract_version FROM tickets LEFT JOIN ticket_service_plans AS plans ON plans.ticket_id = tickets.id
      AND plans.tenant_id = tickets.tenant_id AND plans.location_id = tickets.location_id
    WHERE tickets.tenant_id = $1 AND tickets.location_id = $2 AND tickets.id = $3`,
  [scope.tenantId, scope.locationId, ticketId]);
  if (!result.rows[0]) fail('Ticket not found.', 404);
  const row = result.rows[0];
  if (['2', '3', '4'].includes(row.contract_version)) {
    throw Object.assign(new Error('Use the queue plan details for this ticket.'), {
      statusCode: 409, code: 'USE_QUEUE_PLAN_COMMAND',
    });
  }
  let reservation = null;
  if (row.source === 'booking' && row.items?.length === 1 && row.items[0].bookingItemId) {
    const binding = await db.pool.query(`SELECT id::text,state,pool_id::text,units,starts_at,ends_at
      FROM resource_ledger_reservations WHERE tenant_id=$1 AND location_id=$2 AND booking_item_id=$3
      ORDER BY id DESC LIMIT 1`, [scope.tenantId, scope.locationId, row.items[0].bookingItemId]);
    if (binding.rows[0]) {
      const item = binding.rows[0];
      reservation = { id: item.id, state: item.state, poolId: item.pool_id, units: item.units,
        startsAt: item.starts_at, endsAt: item.ends_at };
    }
  }
  const reservationColumn = await db.pool.query(`SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
      AND table_name='resource_ledger_reservations' AND column_name='ticket_id'
  ) AS available`);
  if (!reservation && row.source === 'staff_selection' && reservationColumn.rows[0]?.available) {
    const binding = await db.pool.query(`SELECT id::text,state,pool_id::text,units,starts_at,ends_at
      FROM resource_ledger_reservations
      WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3
      ORDER BY id DESC LIMIT 1`, [scope.tenantId, scope.locationId, ticketId]);
    if (binding.rows[0]) {
      const item = binding.rows[0];
      reservation = { id: item.id, state: item.state, poolId: item.pool_id, units: item.units,
        startsAt: item.starts_at, endsAt: item.ends_at };
    }
  }
  const terminal = new Set(['served', 'skipped', 'cancelled', 'unserved', 'expired']).has(row.status);
  const lifecycleState = row.service_started_at && !row.service_ended_at ? 'in_service'
    : terminal ? 'terminal' : row.status === 'called' ? 'called' : row.status === 'waiting' ? 'waiting' : 'published';
  return { version: 1, source: row.source || 'unknown', executionMode: row.execution_mode || null,
    items: row.items || [], capturedAt: row.created_at || null, allocationEnabled: false, customerEstimateChanged: false,
    lifecycle: { state: lifecycleState, planState: row.source ? 'published' : 'unpublished', terminal }, reservation };
}
async function listServiceOptions(scope) {
  const result = await db.pool.query(`SELECT services.id::text, services.name, services.duration_minutes
    FROM vendor_services AS services JOIN location_services AS assignments
      ON assignments.service_id = services.id AND assignments.tenant_id = services.tenant_id
    WHERE services.tenant_id = $1 AND assignments.location_id = $2
      AND services.is_active = TRUE AND assignments.is_active = TRUE ORDER BY services.name, services.id`,
  [scope.tenantId, scope.locationId]);
  return result.rows.map(service => ({ id: service.id, name: service.name, durationMinutes: Number(service.duration_minutes) }));
}
module.exports = { captureBookingPlan, captureStaffPlan, getTicketPlan, listServiceOptions };
