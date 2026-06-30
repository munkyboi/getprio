export function shouldEnableVendorDashboardBootstrap(token, selectedTenantSlug) {
  return Boolean(token && selectedTenantSlug);
}
