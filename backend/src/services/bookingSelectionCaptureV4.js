const contract = require('./bookingSelectionContractV4');
const policy = require('./queueServicePolicyV4');
const { resolveEffectiveStoreInterval, getZonedParts, formatBusinessDate, DAY_MS } = require('./queueDayTime');
const { isValidTimeZone } = require('../utils/timezones');
const { fail } = contract;
function freeze(value) {
  for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item);
  return Object.freeze(value);
}
function hoursFit(start, end, timezone, hours) {
  if (!timezone || !isValidTimeZone(timezone) || !Array.isArray(hours))
    fail('BOOKING_HOURS_UNAVAILABLE', 'The scheduled operating hours need verification.', 409);
  let interval;
  try { interval = resolveEffectiveStoreInterval({ now: start, timezone, hours }); }
  catch { fail('BOOKING_HOURS_UNAVAILABLE', 'The scheduled operating hours need verification.', 409); }
  if (!interval || end > interval.closesAt)
    fail('BOOKING_DURATION_EXCEEDS_STORE_HOURS', 'Choose a time and duration that finish within operating hours.', 409);
  return interval;
}
async function captureBookingSelectionV4(client, scope, request, lineage) {
  const input = contract.validate(request);
  if (!contract.positiveId(scope?.tenantId) || !contract.positiveId(scope?.locationId)
      || !contract.positiveId(lineage?.bookingId) || !contract.positiveId(lineage?.bookingItemId))
    fail('INVALID_BOOKING_SCOPE', 'An authorized booking and location scope is required.');
  const root = input.selections[0], leaf = root.resources[0];
  // Read-only adapter to the SAME tables used by Queue V4. The caller supplies
  // an authorized transaction client; this function neither opens nor commits it.
  const rows = (await client.query(`SELECT s.tenant_id::text, l.location_id::text, s.id::text AS service_id,
    s.name AS service_name, s.updated_at::text AS service_revision,
    p.id::text AS pool_id, p.revision AS pool_revision, p.capacity, p.tracking_enabled,
    p.archived_at AS pool_archived_at, r.revision AS requirement_revision, r.units_required,
    q.revision::text AS policy_revision, q.configuration,
    m.id::text AS member_id, m.name AS member_name, m.revision::text AS member_revision,
    m.is_active AS member_active, m.archived_at AS member_archived_at,
    loc.timezone, clock_timestamp() AS observed_at
    FROM vendor_services s
    JOIN location_services l ON (l.service_id,l.tenant_id)=(s.id,s.tenant_id)
    JOIN store_locations loc ON (loc.id,loc.tenant_id)=(l.location_id,l.tenant_id)
    JOIN service_resource_requirements r ON (r.service_id,r.tenant_id,r.location_id)=(s.id,s.tenant_id,l.location_id)
    JOIN location_resource_pools p ON (p.id,p.tenant_id,p.location_id)=(r.pool_id,r.tenant_id,r.location_id)
    JOIN queue_service_policies q ON (q.service_id,q.tenant_id,q.location_id)=(s.id,s.tenant_id,l.location_id)
    JOIN resource_pool_members m ON (m.pool_id,m.tenant_id,m.location_id)=(p.id,p.tenant_id,p.location_id)
    WHERE s.tenant_id=$1 AND l.location_id=$2 AND s.id=$3 AND m.id=$4
      AND s.is_active AND l.is_active AND loc.is_active`,
    [scope.tenantId,scope.locationId,root.serviceId,leaf.resourceMemberId])).rows;
  const row = rows[0];
  if (rows.length !== 1 || row.tenant_id !== scope.tenantId || row.location_id !== scope.locationId
      || row.service_id !== root.serviceId || row.member_id?.toLowerCase() !== leaf.resourceMemberId.toLowerCase()
      || !row.member_active || row.member_archived_at || row.pool_archived_at || !row.tracking_enabled)
    fail('BOOKING_RESOURCE_NOT_ELIGIBLE', 'The selected resource is not enabled for this location.', 409);
  const configuration = policy.configuration(row.configuration);
  if (configuration.assignment.mode !== 'named' || configuration.assignment.allocationIdentity !== 'named_member'
      || row.units_required !== 1 || !Number.isInteger(row.capacity) || row.capacity < 1
      || configuration.extras.some(extra => extra.selection === 'required'))
    fail('UNSUPPORTED_BOOKING_SELECTION', 'This booking foundation requires one named member with no required extras.');
  const duration = policy.duration(leaf.durationCount, leaf.durationPolicyRevision,
    { ...configuration, revision: row.policy_revision });
  const start = contract.instant(input.scheduledStartAt), observed = new Date(row.observed_at);
  if (!Number.isFinite(observed.getTime()) || start <= observed)
    fail('INVALID_BOOKING_START', 'Choose a future booking time.');
  const end = new Date(start.getTime() + duration.durationMinutes * 60000);
  if (!row.timezone || !isValidTimeZone(row.timezone))
    fail('BOOKING_HOURS_UNAVAILABLE', 'The location timezone needs verification.', 409);
  const parts = getZonedParts(start,row.timezone);
  const previous = new Date(Date.UTC(parts.year,parts.month-1,parts.day)-DAY_MS);
  const dates = [formatBusinessDate({year:previous.getUTCFullYear(),month:previous.getUTCMonth()+1,day:previous.getUTCDate()}),formatBusinessDate(parts),formatBusinessDate(getZonedParts(end,row.timezone))];
  const exceptions = (await client.query(`SELECT id FROM vendor_availability_exceptions
    WHERE tenant_id=$1 AND location_id=$2 AND (service_id IS NULL OR service_id=$3)
      AND exception_date=ANY($4::date[])`,[scope.tenantId,scope.locationId,root.serviceId,dates])).rows;
  const blocks = (await client.query(`SELECT id FROM vendor_availability_blocks
    WHERE tenant_id=$1 AND location_id=$2 AND (service_id IS NULL OR service_id=$3) AND is_active`,
    [scope.tenantId,scope.locationId,root.serviceId])).rows;
  if (exceptions.length || blocks.length)
    fail('UNSUPPORTED_BOOKING_AVAILABILITY', 'Booking schedule rules and exceptions require the reservation adapter.', 409);
  const hours = (await client.query(`SELECT weekday, opens_at::text AS "opensAt", closes_at::text AS "closesAt", is_closed AS "isClosed"
    FROM store_hours WHERE location_id=$1 ORDER BY weekday,opens_at,id`,[scope.locationId])).rows;
  const interval = hoursFit(start,end,row.timezone,hours);
  return freeze({ contractVersion: 4, reservationState: 'not_created',
    tenantId: scope.tenantId, locationId: scope.locationId, bookingId: lineage.bookingId, bookingItemId: lineage.bookingItemId,
    serviceSelectionId: root.serviceSelectionId, resourceSelectionId: leaf.resourceSelectionId,
    serviceId: row.service_id, serviceName: row.service_name, serviceRevision: row.service_revision,
    poolId: row.pool_id, poolRevision: String(row.pool_revision), requirementRevision: String(row.requirement_revision),
    policyRevision: row.policy_revision, resourceMemberId: row.member_id, resourceMemberName: row.member_name,
    resourceMemberRevision: row.member_revision, quantity: 1, unitsRequired: 1,
    ...duration, scheduledStartAt: start.toISOString(), scheduledEndAt: end.toISOString(),
    timezone: row.timezone, businessDate: interval.businessDate,
    hoursSnapshot: structuredClone(hours), capturedAt: observed.toISOString() });
}
function assessConfirmedHours(capture, { timezone, hours, exceptions = [], blocks = [] }) {
  // Inspection only. Neither elapsed time nor edited hours releases protection.
  try {
    if (exceptions.length || blocks.length) fail('UNSUPPORTED_BOOKING_AVAILABILITY', 'Schedule review required.',409);
    hoursFit(contract.instant(capture.scheduledStartAt), contract.instant(capture.scheduledEndAt), timezone, hours);
    return { status: 'fits', reasonCode: null, reservationDisposition: 'retain' };
  } catch (error) {
    return { status: 'needs_staff_resolution', reasonCode: error.code || 'BOOKING_HOURS_UNAVAILABLE', reservationDisposition: 'retain' };
  }
}
module.exports = { captureBookingSelectionV4, assessConfirmedHours };
