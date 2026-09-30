async function buildBaseAuthUserPayload(user, tenantRepository) {
  const memberships = user.tenantMemberships || [];
  const tenants = await tenantRepository.findTenantsByIds(memberships.map((membership) => membership.tenantId));
  const tenantsById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));

  return {
    id: String(user._id),
    name: user.name,
    displayName: user.displayName || "",
    avatarUrl: user.avatarUrl || "",
    username: user.username,
    email: user.email,
    phone: user.phone,
    roles: user.roles,
    emailVerified: Boolean(user.emailVerified),
    hasPassword: Boolean(user.passwordHash),
    mfaEnabled: Boolean(user.mfaEnabled),
    oauthProviders: [...new Set((user.oauthAccounts || []).map((account) => account.provider))],
    tenants: memberships.map((membership) => {
      const tenant = tenantsById.get(String(membership.tenantId));
      return tenant ? { id: String(tenant._id), name: tenant.name, slug: tenant.slug, role: membership.role, isActive: membership.isActive !== false } : null;
    }).filter(Boolean)
  };
}

module.exports = { buildBaseAuthUserPayload };
