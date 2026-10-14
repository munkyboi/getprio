const db = require("../config/db");
const ledger = require("../repositories/resourceLedger");
const users = require("../repositories/users");
const emails = require("./staffAccessEmailService");
const { userHasPermission } = require("./permissions");
const { readHeldTenantEntitlements } = require("./heldTenantEntitlements");

function fail(message, statusCode = 409, code = "STAFF_INVITATION_CHANGED") {
  throw Object.assign(new Error(message), { statusCode, code });
}
function identity(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) fail("Invalid staff identifier.", 400);
  const id = String(value ?? "");
  if (!/^[1-9]\d{0,18}$/u.test(id) || BigInt(id) > 9223372036854775807n) fail("Invalid staff identifier.", 400);
  return id;
}
async function hold(client, sql, values) {
  try { return await client.query(sql, values); }
  catch (error) {
    if (error.code === "55P03") fail("Staff access is being changed. Retry after that change completes.", 409, "STAFF_INVITATION_BUSY");
    throw error;
  }
}
async function membershipInventory(client, tenantId, locked = false) {
  const result = await hold(client, `SELECT id::text,user_id::text,role,is_active FROM tenant_memberships
    WHERE tenant_id=$1 ORDER BY id LIMIT 1001${locked ? " FOR SHARE NOWAIT" : ""}`, [tenantId]);
  if (result.rows.length > 1000) fail("Staff inventory exceeds the invitation bound.", 409, "STAFF_INVENTORY_LIMIT");
  return result.rows;
}
function restricted(user) { return !user || user.deletion_requested_at != null || user.platform_access_suspended_at != null; }

async function holdInvitationAuthority(client, { tenantId, actorId, targetId, email }) {
  const discovered = await membershipInventory(client, tenantId);
  const userIds = [...new Set([actorId, targetId, ...discovered.map(row => row.user_id)])]
    .sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
  const heldUsers = (await hold(client, `SELECT id::text,roles,email,email_verified,deletion_requested_at,platform_access_suspended_at
    FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE NOWAIT`, [userIds])).rows;
  const memberships = await membershipInventory(client, tenantId, true);
  if (JSON.stringify(discovered.map(row => [row.id, row.user_id])) !== JSON.stringify(memberships.map(row => [row.id, row.user_id]))) fail("Staff membership changed. Reload before inviting.");
  const actor = heldUsers.find(row => row.id === actorId);
  const membership = memberships.find(row => row.user_id === actorId && row.is_active !== false);
  if (restricted(actor) || !membership || !userHasPermission({ roles: actor.roles,
    tenantMemberships: [{ tenantId, role: membership.role, isActive: true }] }, "tenant.staff.invite", { tenantId })) fail("You do not have permission to invite staff.", 403);
  if (memberships.some(row => row.user_id === targetId)) fail("This account is already a member of this vendor. Manage their access from the staff list.");
  const target = heldUsers.find(row => row.id === targetId);
  if (restricted(target) || String(target.email || "").trim().toLowerCase() !== email) fail("The staff account changed or is unavailable. Reload before inviting.", 409, "STAFF_TARGET_CHANGED");
  // A new counter assignment has no row to hold. Its user FK must wait until
  // membership plus affected revisions commit. Upgrade only the new target,
  // nonblocking, so legacy FK-first holders cannot invert the tenant root.
  await hold(client, "SELECT id FROM users WHERE id=$1 FOR UPDATE NOWAIT", [targetId]);
  // Existing owner notices carry user FKs. Hold and validate their recipients
  // before membership/outbox writes rather than waiting behind deletion.
  for (const owner of memberships.filter(row => row.role === "owner" && row.is_active !== false && row.user_id !== actorId)) {
    const recipient = heldUsers.find(row => row.id === owner.user_id);
    if (recipient?.email && recipient.email_verified && restricted(recipient)) fail("An owner notification recipient requires reconciliation.", 409, "STAFF_NOTICE_RECIPIENT_UNAVAILABLE");
  }
  return { memberships, actorRole: membership.role };
}
function invitationRole(role, authority) {
  const next = ["owner", "admin", "staff"].includes(role) ? role : "staff";
  if (authority.actorRole === "admin" && next !== "staff") fail("Tenant admins can only invite staff members.", 403);
  if ((next === "admin" || next === "owner") && authority.actorRole !== "owner") fail("Only tenant owners can assign admin or owner roles.", 403);
  if (next === "owner" && authority.memberships.some(row => row.role === "owner" && row.is_active !== false)) fail("Only one tenant owner is allowed per vendor.", 400);
  return next;
}
async function staffBranches(client, tenantId, targetId, branchIds) {
  const counters = await hold(client, `SELECT c.location_id::text,c.is_active FROM service_counter_assignments a
    JOIN service_counters c ON c.id=a.counter_id WHERE a.user_id=$1 AND c.tenant_id=$2
    ORDER BY c.id LIMIT 1001 FOR SHARE OF a,c NOWAIT`, [targetId, tenantId]);
  if (counters.rows.length > 1000) fail("Staff counter inventory exceeds the invitation bound.", 409, "STAFF_COUNTER_INVENTORY_LIMIT");
  const branches = [...new Set(counters.rows.map(row => row.location_id))];
  if (branches.some(id => !branchIds.includes(id))) fail("Staff counter scope requires reconciliation.");
  return [...new Set(counters.rows.filter(row => row.is_active).map(row => row.location_id))];
}
function createStaffInvitationResourceService({ pool = db.pool, userRepository = users,
  emailService = emails, entitlementReader = readHeldTenantEntitlements } = {}) {
  async function invite({ tenant, actorId, userId, email, role }) {
    const tenantId = identity(tenant._id), actor = identity(actorId), target = identity(userId);
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) fail("email is required.", 400);
    let authority;
    return ledger.withTenantCatalogTransaction({ pool, tenantId, actorUserId: actor,
      authorize: async client => {
        authority = await holdInvitationAuthority(client, { tenantId, actorId: actor, targetId: target, email: normalizedEmail });
        return true;
      }
    }, async (client, branchIds) => {
      const entitlements = await entitlementReader(tenantId, { client });
      const seats = Number(entitlements.staffSeats || 0);
      if (!Number.isSafeInteger(seats) || seats < 0) fail("Staff seat policy is unavailable.", 409, "STAFF_SEAT_POLICY_UNAVAILABLE");
      if (authority.memberships.length >= seats) fail("Staff seat limit exceeded for this subscription plan.", 403);
      const nextRole = invitationRole(role, authority);
      const affected = nextRole === "staff" ? await staffBranches(client, tenantId, target, branchIds) : branchIds;
      await emailService.change({ tenant, userId: target, actorId: actor }, async () => {
        await userRepository.addTenantMembership(target, tenantId, nextRole, { client });
        await ledger.advanceBranchRevisions(client, tenantId, affected);
      }, { client });
    });
  }
  return { invite };
}
module.exports = { ...createStaffInvitationResourceService(), createStaffInvitationResourceService };
