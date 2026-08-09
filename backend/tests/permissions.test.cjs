const test = require("node:test");
const assert = require("node:assert/strict");

const permissions = require("../src/services/permissions");

test("permissions helpers resolve tenant roles, ignore inactive memberships, and enforce denials", () => {
  const user = {
    roles: ["platform_admin"],
    tenantMemberships: [
      { tenantId: "tenant-1", role: "staff" },
      { tenantId: "tenant-2", role: "admin", isActive: false },
      { tenantId: "tenant-3", role: "owner" }
    ]
  };

  assert.deepEqual(Array.from(permissions.getGlobalPermissions(user)).sort(), [
    "account.change_password",
    "account.read_self",
    "platform.billing.manage",
    "platform.billing.read",
    "platform.capacity.read",
    "platform.credit_adjustments.manage",
    "platform.credit_catalog.manage",
    "platform.credit_commerce.read",
    "platform.credit_disputes.manage",
    "platform.credit_grants.manage",
    "platform.credit_reconcile",
    "platform.credit_revocations.manage",
    "platform.entitlement_overrides.manage",
    "platform.plan_policy.manage",
    "platform.plan_policy.read",
    "platform.plans.manage",
    "platform.queue_fees.manage",
    "platform.queue_lifecycle.read",
    "platform.queue_lifecycle.reconcile",
    "platform.queue_lifecycle.repair",
    "platform.queue_notifications.requeue",
    "platform.security_audit.export",
    "platform.security_audit.read",
    "platform.settings.manage",
    "platform.subscription_lifecycle.manage",
    "platform.tenants.read",
    "platform.usage.read",
    "platform.users.read"
  ]);
  assert.equal(permissions.getTenantRole(user, "tenant-1"), "staff");
  assert.equal(permissions.getTenantRole(user, "tenant-2"), null);
  assert.equal(permissions.getTenantRole(user, "tenant-3"), "owner");
  assert.equal(permissions.userHasPermission(user, "tenant.queue.operate", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(user, "tenant.service.manage", { tenantId: "tenant-1" }), false);
  assert.equal(permissions.userHasPermission(user, "tenant.billing.read", { tenantId: "tenant-1" }), false);
  assert.equal(permissions.userHasPermission(user, "tenant.capacity.read_operational", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(user, "platform.users.read"), true);

  assert.throws(
    () => permissions.assertPermission(user, "tenant.settings.manage", { tenantId: "tenant-1" }),
    (error) => error.statusCode === 403 && /permission/i.test(error.message)
  );
});
