const db = require("../config/db");
const ledger = require("../repositories/resourceLedger");
const counters = require("../repositories/serviceCounters");
const users = require("../repositories/users");
const emails = require("./staffAccessEmailService");
const locations = require("../repositories/tenantMembershipLocations");
const { readAuthorizedVendorQueueActor } = require("./vendorQueueTransactionService");

function fail(message, statusCode) {
  throw Object.assign(new Error(message), { statusCode });
}
function identifier(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) fail("Invalid staff identifier.", 400);
  const text = String(value ?? "");
  if (!/^[1-9]\d{0,18}$/u.test(text) || BigInt(text) > 9223372036854775807n) fail("Invalid staff identifier.", 400);
  return text;
}

function createStaffRemovalResourceService({ pool = db.pool, userRepository = users,
  counterRepository = counters, emailService = emails, locationRepository = locations } = {}) {
  async function remove({ tenant, userId, actorId }) {
    const targetId = identifier(userId);
    const actorUserId = identifier(actorId);
    const tenantId = identifier(tenant._id);
    if (targetId === actorUserId) fail("You cannot remove your own tenant staff account.", 400);
    return ledger.withTenantCatalogTransaction({ pool, tenantId, actorUserId,
      authorize: async (client, scope) => {
        const actor = await readAuthorizedVendorQueueActor(client, scope, "tenant.staff.manage", { forShare: true });
        return actor?.tenantMemberships[0]?.role === "owner";
      }
    }, async (client, branchIds) => {
      // Branches then tenant then grants: match counter administration. Target
      // cleanup remains allowed for inactive/suspended users, as before.
      const target = await client.query(`SELECT m.role FROM users u JOIN tenant_memberships m
        ON m.user_id=u.id AND m.tenant_id=$2 WHERE u.id=$1 FOR SHARE OF u FOR UPDATE OF m`, [targetId, tenantId]);
      if (!target.rows.length) fail("Staff member not found.", 404);
      if (target.rows[0].role === "owner") fail("Tenant owners cannot be removed from staff management.", 400);
      const options = { client };
      const granted = await locationRepository.listAssignedLocationIdsByUserIds(tenantId, [targetId], options);
      return emailService.change({ tenant, userId: targetId, actorId: actorUserId }, async () => {
        const removedBranches = await counterRepository.removeAssignmentsForUserAndTenant(targetId, tenantId, options);
        await userRepository.removeTenantMembership(targetId, tenantId, options);
        // Admin access is vendor-wide; staff access comes from explicit grants
        // or counters. Unrelated vendor memberships and scopes are untouched.
        const affected = target.rows[0].role === "admin" ? branchIds
          : [...new Set([...removedBranches, ...(granted.get(targetId) || [])])];
        await ledger.advanceBranchRevisions(client, tenantId, affected);
      }, options);
    });
  }
  return { remove };
}
module.exports = { ...createStaffRemovalResourceService(), createStaffRemovalResourceService };
