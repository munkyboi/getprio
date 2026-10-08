const resourceLedger = require("../repositories/resourceLedger");
const permissions = require("./permissions");
const assignments = require("../repositories/tenantMembershipLocations");

async function withVendorQueueTransaction({ pool, tenant, location, actorUserId }, callback) {
  let actorContext;
  return resourceLedger.withScopeTransaction({
    pool, tenantId: String(tenant._id), locationId: String(location._id), actorUserId: String(actorUserId),
    authorize: async (client, scope) => {
      const result = await client.query(`SELECT u.roles,m.role FROM users u JOIN tenant_memberships m
        ON m.user_id=u.id AND m.tenant_id=$2 AND m.is_active=TRUE
        WHERE u.id=$1 AND u.deletion_requested_at IS NULL AND u.platform_access_suspended_at IS NULL`,
      [scope.actorUserId, scope.tenantId]);
      const actor = result.rows[0];
      if (!actor) return false;
      const user = { roles: actor.roles, tenantMemberships: [{ tenantId: scope.tenantId, role: actor.role, isActive: true }] };
      if (!permissions.userHasPermission(user, "tenant.ticket.update_state", { tenantId: scope.tenantId })) return false;
      actorContext = user;
      return actor.role !== "staff" || assignments.userHasLocationAssignment(scope.actorUserId, scope.tenantId, scope.locationId, { client });
    }
  }, (client, ledger) => callback(client, ledger, actorContext));
}
module.exports = { withVendorQueueTransaction };
