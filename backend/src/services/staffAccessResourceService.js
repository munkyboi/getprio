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

function nextMembership(body, changes, before, actorRole) {
  if (changes.role && actorRole !== "owner") fail("Only tenant owners can change staff roles.", 403);
  const prospectiveRole = changes.role ? body.role : before.role;
  if (changes.locations && prospectiveRole !== "staff") fail("Location assignments apply only to Vendor Staff.");
  let role = before.role;
  if (changes.role) role = ["owner", "admin"].includes(body.role) ? body.role : "staff";
  if (role === "owner" && before.role !== "owner") fail("Only one tenant owner is allowed per vendor.");
  return { role, active: changes.status ? body.isActive !== false : before.is_active };
}

async function assertOwnerProtected({ client, tenantId, body, changes, before, next, userRepository }) {
  if (before.role !== "owner") return;
  if (changes.status && !next.active) fail("Tenant owners cannot be disabled from staff management.");
  if (!changes.role || body.role === "owner") return;
  const staff = await userRepository.listUsersByTenantId(tenantId, { client });
  const owners = staff.filter(user => user.tenantMemberships.some(m => String(m.tenantId) === tenantId && m.role === "owner"));
  if (owners.length <= 1) fail("At least one tenant owner is required.");
}

async function readLocationChange(client, { tenantId, body, changes, before, next }) {
  const granted = await client.query(`SELECT location_id::text FROM tenant_membership_locations
    WHERE tenant_membership_id=$1 ORDER BY location_id FOR UPDATE`, [before.id]);
  const previous = granted.rows.map(row => row.location_id);
  const requested = changes.locations ? [...new Set((body.assignedLocationIds || []).map(identifier))] : previous;
  // Retain grants when deactivated; matching active grants are still validated.
  const replace = changes.locations && next.active;
  if (replace && requested.length) {
    const valid = await client.query(`SELECT id FROM store_locations
      WHERE tenant_id=$1 AND is_active=TRUE AND id=ANY($2::bigint[])`, [tenantId, requested]);
    if (valid.rows.length !== requested.length) fail("One or more queue location assignments are invalid.");
  }
  const changed = replace && !sameSet(previous, requested);
  return { previous, next: changed ? requested : previous, changed };
}

function affectedBranches({ before, next, membershipChanged, grants, counterBranches, branchIds }) {
  if ([before.role, next.role].some(role => role === "owner" || role === "admin")) return branchIds;
  if (membershipChanged) return [...grants.previous, ...grants.next, ...counterBranches];
  return [...grants.previous.filter(id => !grants.next.includes(id)), ...grants.next.filter(id => !grants.previous.includes(id))];
}

async function applyAccessChange(client, { tenantId, targetId, actorUserId, before, next, grants,
  userRepository, locationRepository }) {
  const options = { client };
  if (next.role !== before.role) await userRepository.updateTenantMembershipRole(targetId, tenantId, next.role, options);
  if (next.active !== before.is_active) await userRepository.updateTenantMembershipStatus(targetId, tenantId, next.active, options);
  if (grants.changed) await locationRepository.replaceUserLocationAssignments({ userId: targetId,
    tenantId, locationIds: grants.next, assignedByUserId: actorUserId }, options);
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
      // Keep the same lock sequence: compatible user SHARE, mutable membership UPDATE.
      const target = await client.query(`SELECT m.id,m.role,m.is_active FROM users u JOIN tenant_memberships m
        ON m.user_id=u.id AND m.tenant_id=$2 WHERE u.id=$1 FOR SHARE OF u FOR UPDATE OF m`, [targetId, tenantId]);
      const before = target.rows[0];
      if (!before) fail("Staff member not found.", 404);
      const next = nextMembership(body, changes, before, actor.tenantMemberships[0].role);
      await assertOwnerProtected({ client, tenantId, body, changes, before, next, userRepository });
      const grants = await readLocationChange(client, { tenantId, body, changes, before, next });
      const membershipChanged = next.role !== before.role || next.active !== before.is_active;
      if (!grants.changed && !membershipChanged) return;
      const counters = await client.query(`SELECT DISTINCT c.location_id::text FROM service_counter_assignments a
        JOIN service_counters c ON c.id=a.counter_id WHERE a.user_id=$1 AND c.tenant_id=$2`, [targetId, tenantId]);
      const affected = affectedBranches({ before, next, membershipChanged, grants,
        counterBranches: counters.rows.map(row => row.location_id), branchIds });
      return emailService.change({ tenant, userId: targetId, actorId: actorUserId }, async () => {
        await applyAccessChange(client, { tenantId, targetId, actorUserId, before, next, grants, userRepository, locationRepository });
        await ledger.advanceBranchRevisions(client, tenantId, affected);
      }, { client });
    });
  }
  return { update };
}
module.exports = { ...createStaffAccessResourceService(), createStaffAccessResourceService };
