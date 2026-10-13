const db = require("../config/db");
const ledger = require("../repositories/resourceLedger");
const users = require("../repositories/users");
const locations = require("../repositories/tenantMembershipLocations");
const emails = require("./staffAccessEmailService");
const { readAuthorizedVendorQueueActor } = require("./vendorQueueTransactionService");

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}
function identifier(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) fail("Invalid staff identifier.");
  const text = String(value ?? "");
  if (!/^[1-9]\d{0,18}$/u.test(text) || BigInt(text) > 9223372036854775807n) fail("Invalid staff identifier.");
  return text;
}
function sameSet(left, right) {
  return left.length === right.length && left.every(value => right.includes(value));
}

function createStaffAccessResourceService({ pool = db.pool, userRepository = users,
  locationRepository = locations, emailService = emails } = {}) {
  async function update({ tenant, userId, actorId, body }) {
    const tenantId = identifier(tenant._id), targetId = identifier(userId), actorUserId = identifier(actorId);
    if (targetId === actorUserId) fail("You cannot edit your own tenant staff account.");
    const changes = { role: Object.hasOwn(body, "role"), status: Object.hasOwn(body, "isActive"),
      locations: Object.hasOwn(body, "assignedLocationIds") };
    if (!changes.role && !changes.status && !changes.locations) fail("No staff updates were provided.");
    let actor;
    return ledger.withTenantCatalogTransaction({ pool, tenantId, actorUserId,
      authorize: async (client, scope) => {
        actor = await readAuthorizedVendorQueueActor(client, scope, "tenant.staff.manage", { forShare: true });
        return Boolean(actor);
      }
    }, async (client, branchIds) => {
      // Compatible user SHARE locks avoid reciprocal cross-vendor actor/target
      // cycles. The selected membership is mutable and is locked exclusively.
      const target = await client.query(`SELECT m.id,m.role,m.is_active FROM users u JOIN tenant_memberships m
        ON m.user_id=u.id AND m.tenant_id=$2 WHERE u.id=$1 FOR SHARE OF u FOR UPDATE OF m`, [targetId, tenantId]);
      const before = target.rows[0];
      if (!before) fail("Staff member not found.", 404);
      const actorRole = actor.tenantMemberships[0].role;
      if (changes.role && actorRole !== "owner") fail("Only tenant owners can change staff roles.", 403);
      const prospectiveRole = changes.role ? body.role : before.role;
      if (changes.locations && prospectiveRole !== "staff") fail("Location assignments apply only to Vendor Staff.");
      const nextRole = changes.role ? (["owner", "admin"].includes(body.role) ? body.role : "staff") : before.role;
      const nextActive = changes.status ? body.isActive !== false : before.is_active;
      if (before.role === "owner") {
        if (changes.status && !nextActive) fail("Tenant owners cannot be disabled from staff management.");
        if (changes.role && body.role !== "owner") {
          const staff = await userRepository.listUsersByTenantId(tenantId, { client });
          const owners = staff.filter(user => user.tenantMemberships.some(m => String(m.tenantId) === tenantId && m.role === "owner"));
          if (owners.length <= 1) fail("At least one tenant owner is required.");
        }
      }
      if (nextRole === "owner" && before.role !== "owner") fail("Only one tenant owner is allowed per vendor.");
      const granted = await client.query(`SELECT location_id::text FROM tenant_membership_locations
        WHERE tenant_membership_id=$1 ORDER BY location_id FOR UPDATE`, [before.id]);
      const previousLocations = granted.rows.map(row => row.location_id);
      const requestedLocations = changes.locations ? [...new Set((body.assignedLocationIds || []).map(identifier))] : previousLocations;
      // Existing inactive membership behavior: assignment replacement is a no-op
      // after deactivation; do not invent reactivation or remove retained grants.
      const replaceLocations = changes.locations && nextActive;
      if (replaceLocations && requestedLocations.length) {
        const valid = await client.query(`SELECT id FROM store_locations
          WHERE tenant_id=$1 AND is_active=TRUE AND id=ANY($2::bigint[])`, [tenantId, requestedLocations]);
        if (valid.rows.length !== requestedLocations.length) fail("One or more queue location assignments are invalid.");
      }
      const locationChanged = replaceLocations && !sameSet(previousLocations, requestedLocations);
      const membershipChanged = nextRole !== before.role || nextActive !== before.is_active;
      if (!locationChanged && !membershipChanged) return;
      const counters = await client.query(`SELECT DISTINCT c.location_id::text FROM service_counter_assignments a
        JOIN service_counters c ON c.id=a.counter_id WHERE a.user_id=$1 AND c.tenant_id=$2`, [targetId, tenantId]);
      const options = { client };
      return emailService.change({ tenant, userId: targetId, actorId: actorUserId }, async () => {
        if (nextRole !== before.role) await userRepository.updateTenantMembershipRole(targetId, tenantId, nextRole, options);
        if (nextActive !== before.is_active) await userRepository.updateTenantMembershipStatus(targetId, tenantId, nextActive, options);
        if (locationChanged) await locationRepository.replaceUserLocationAssignments({ userId: targetId,
          tenantId, locationIds: requestedLocations, assignedByUserId: actorUserId }, options);
        const nextLocations = locationChanged ? requestedLocations : previousLocations;
        const allBranchAccess = [before.role, nextRole].some(role => role === "owner" || role === "admin");
        const affected = allBranchAccess ? branchIds : membershipChanged
          ? [...previousLocations, ...nextLocations, ...counters.rows.map(row => row.location_id)]
          : [...previousLocations.filter(id => !nextLocations.includes(id)), ...nextLocations.filter(id => !previousLocations.includes(id))];
        await ledger.advanceBranchRevisions(client, tenantId, affected);
      }, options);
    });
  }
  return { update };
}
module.exports = { ...createStaffAccessResourceService(), createStaffAccessResourceService };
