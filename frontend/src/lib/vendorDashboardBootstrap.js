export function shouldEnableVendorDashboardBootstrap(token, selectedTenantSlug, requiresMfaEnrollment = false) {
  return Boolean(token && selectedTenantSlug && !requiresMfaEnrollment);
}

export function getAllowedHistoryExportRanges(entitlements) {
  return Array.isArray(entitlements?.allowedHistoryExportRanges)
    ? entitlements.allowedHistoryExportRanges
    : [];
}
