const resourceLedger = require("../repositories/resourceLedger");
const permissions = require("./permissions");
const assignments = require("../repositories/tenantMembershipLocations");

async function readAuthorizedVendorQueueActor(client, scope, permission, options = {}) {
  const result = await client.query(`SELECT u.roles,m.role FROM users u JOIN tenant_memberships m
    ON m.user_id=u.id AND m.tenant_id=$2 AND m.is_active=TRUE
    WHERE u.id=$1 AND u.deletion_requested_at IS NULL AND u.platform_access_suspended_at IS NULL
    ${options.forShare ? "FOR SHARE OF u,m" : ""}`,
  [scope.actorUserId, scope.tenantId]);
  const actor = result.rows[0];
  if (!actor) return null;
  const user = { roles: actor.roles, tenantMemberships: [{ tenantId: scope.tenantId, role: actor.role, isActive: true }] };
  if (!permissions.userHasPermission(user, permission, { tenantId: scope.tenantId })) return null;
  if (actor.role === "staff" && !await assignments.userHasLocationAssignment(scope.actorUserId, scope.tenantId, scope.locationId, { client, forShare: options.forShare })) return null;
  return user;
}

async function withVendorQueueTransaction({ pool, tenant, location, actorUserId, permission = "tenant.ticket.update_state", lockTenantActivity = false }, callback) {
  let actorContext;
  return resourceLedger.withScopeTransaction({
    pool, tenantId: String(tenant._id), locationId: String(location._id), actorUserId: String(actorUserId),
    authorize: async (client, scope) => {
      // Staff access changes take tenant before membership; use the same order.
      if (lockTenantActivity) await client.query("SELECT id FROM tenants WHERE id=$1 FOR SHARE", [scope.tenantId]);
      // Keep accepted access grants stable until the queue transaction commits.
      actorContext = await readAuthorizedVendorQueueActor(client, scope, permission, { forShare: true });
      return Boolean(actorContext);
    }
  }, (client, ledger) => callback(client, ledger, actorContext));
}
module.exports = { withVendorQueueTransaction, readAuthorizedVendorQueueActor };
