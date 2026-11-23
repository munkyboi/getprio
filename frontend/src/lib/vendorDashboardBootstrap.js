export function shouldEnableVendorDashboardBootstrap(token, selectedTenantSlug, requiresMfaEnrollment = false) {
  return Boolean(token && selectedTenantSlug && !requiresMfaEnrollment);
}

export function getAllowedHistoryExportRanges(entitlements) {
  return Array.isArray(entitlements?.allowedHistoryExportRanges)
    ? entitlements.allowedHistoryExportRanges
    : [];
}

export function getPeriodTicketMetric(usage, requestFailed = false, now = Date.now()) {
  const resource = usage?.resources?.queueTickets;
  const start = Date.parse(usage?.period?.start);
  const end = Date.parse(usage?.period?.end);
  const observed = Date.parse(usage?.observedAt);
  if (requestFailed || usage?.usageAvailable !== true || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(observed) || start >= end || observed < start || observed >= end || now < start || now >= end || !Number.isFinite(resource?.used) || resource.used < 0 || !Number.isFinite(resource?.limit) || resource.limit < 0) {
    return { value: "Usage unavailable", detail: "Current billing period · Across all locations" };
  }
  return { value: `${resource.used.toLocaleString()}/${resource.limit.toLocaleString()}`, detail: "Current billing period · Across all locations" };
}

export function shouldLoadPeriodUsage({ isOwner, isAdmin, section, accountTab }) {
  return Boolean((isOwner || isAdmin) && (section === "reports" || (section === "account" && accountTab === "subscription")));
}
