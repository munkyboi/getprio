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
    "platform.billing.read",
    "platform.plans.manage",
    "platform.queue_fees.manage",
    "platform.settings.manage",
    "platform.tenants.read",
    "platform.users.read"
  ]);
  assert.equal(permissions.getTenantRole(user, "tenant-1"), "staff");
  assert.equal(permissions.getTenantRole(user, "tenant-2"), null);
  assert.equal(permissions.getTenantRole(user, "tenant-3"), "owner");
  assert.equal(permissions.userHasPermission(user, "tenant.queue.operate", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(user, "tenant.service.manage", { tenantId: "tenant-1" }), false);
  assert.equal(permissions.userHasPermission(user, "platform.users.read"), true);

  assert.throws(
    () => permissions.assertPermission(user, "tenant.settings.manage", { tenantId: "tenant-1" }),
    (error) => error.statusCode === 403 && /permission/i.test(error.message)
  );
});
