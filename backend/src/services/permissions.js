const PLATFORM_PERMISSIONS = {
  platform_admin: new Set([
    "platform.tenants.read",
    "platform.users.read",
    "platform.settings.manage",
    "platform.plans.manage",
    "platform.queue_fees.manage",
    "platform.billing.read",
    "platform.billing.manage",
    "platform.queue_lifecycle.read",
    "platform.queue_lifecycle.reconcile",
    "platform.queue_notifications.requeue",
    "platform.queue_lifecycle.repair",
    "platform.plan_policy.read",
    "platform.plan_policy.manage",
    "platform.entitlement_overrides.manage",
    "platform.usage.read",
    "platform.capacity.read",
    "platform.credit_catalog.manage",
    "platform.credit_commerce.read",
    "platform.credit_grants.manage",
    "platform.credit_revocations.manage",
    "platform.credit_adjustments.manage",
    "platform.credit_disputes.manage",
    "platform.credit_reconcile",
    "platform.subscription_lifecycle.manage",
    "platform.security_audit.read",
    "platform.security_audit.export"
  ])
};

const TENANT_PERMISSIONS = {
  owner: new Set([
    "tenant.queue.read",
    "tenant.queue.operate",
    "tenant.queue.reopen",
    "tenant.ticket.read_limited",
    "tenant.ticket.update_state",
    "tenant.location.manage",
    "tenant.counter.manage",
    "tenant.staff.invite",
    "tenant.staff.read",
    "tenant.staff.manage",
    "tenant.settings.manage",
    "tenant.settings.manage_contact",
    "tenant.theme.manage",
    "tenant.service.manage",
    "tenant.availability.manage",
    "tenant.booking.manage",
    "tenant.billing.read",
    "tenant.billing.manage",
    "tenant.capacity.read_commercial",
    "tenant.credits.purchase",
    "tenant.credits.refund_request",
    "tenant.reports.read"
  ]),
  admin: new Set([
    "tenant.queue.read",
    "tenant.queue.operate",
    "tenant.queue.reopen",
    "tenant.ticket.read_limited",
    "tenant.ticket.update_state",
    "tenant.location.manage",
    "tenant.counter.manage",
    "tenant.staff.invite",
    "tenant.staff.read",
    "tenant.staff.manage",
    "tenant.settings.manage",
    "tenant.service.manage",
    "tenant.availability.manage",
    "tenant.booking.manage",
    "tenant.billing.read",
    "tenant.billing.manage",
    "tenant.capacity.read_commercial",
    "tenant.credits.purchase",
    "tenant.credits.refund_request",
    "tenant.reports.read"
  ]),
  staff: new Set([
    "tenant.queue.read",
    "tenant.queue.operate",
    "tenant.ticket.read_limited",
    "tenant.ticket.update_state",
    "tenant.staff.read",
    "tenant.capacity.read_operational",
    "tenant.reports.read"
  ])
};

function getGlobalPermissions(user) {
  const permissions = new Set([
    "account.read_self",
    "account.change_password"
  ]);

  for (const role of user?.roles || []) {
    const rolePermissions = PLATFORM_PERMISSIONS[role];
    if (!rolePermissions) {
      continue;
    }

    for (const permission of rolePermissions) {
      permissions.add(permission);
    }
  }

  return permissions;
}

function getTenantRole(user, tenantId) {
  return (user?.tenantMemberships || []).find(
    (membership) => String(membership.tenantId) === String(tenantId)
      && membership.isActive !== false
  )?.role || null;
}

function getTenantPermissions(user, tenantId) {
  const permissions = new Set();
  const role = getTenantRole(user, tenantId);
  const rolePermissions = role ? TENANT_PERMISSIONS[role] : null;

  if (!rolePermissions) {
    return permissions;
  }

  for (const permission of rolePermissions) {
    permissions.add(permission);
  }

  return permissions;
}

function userHasPermission(user, permission, context = {}) {
  const globalPermissions = getGlobalPermissions(user);
  if (globalPermissions.has(permission)) {
    return true;
  }

  if (context.tenantId) {
    return getTenantPermissions(user, context.tenantId).has(permission);
  }

  return false;
}

function assertPermission(user, permission, context = {}) {
  if (userHasPermission(user, permission, context)) {
    return;
  }

  const error = new Error("You do not have permission to perform that action.");
  error.statusCode = 403;
  throw error;
}

module.exports = {
  assertPermission,
  getGlobalPermissions,
  getTenantPermissions,
  getTenantRole,
  userHasPermission
};
