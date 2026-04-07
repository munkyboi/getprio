export const MONITOR_ROUTE_PATH = "/monitor/:tenantSlug";
export const LEGACY_MONITOR_ROUTE_PATH = "/t/:tenantSlug";

export function buildJoinPath(tenantSlug) {
  return `/join/${tenantSlug}`;
}

export function buildMonitorPath(tenantSlug) {
  return `/monitor/${tenantSlug}`;
}

export function buildMonitorPathWithTicket(tenantSlug, lookupCode) {
  const monitorPath = buildMonitorPath(tenantSlug);
  if (!lookupCode) {
    return monitorPath;
  }

  const searchParams = new URLSearchParams({ ticket: lookupCode });
  return `${monitorPath}?${searchParams.toString()}`;
}

export function buildJoinUrl(origin, tenantSlug) {
  return `${origin}${buildJoinPath(tenantSlug)}`;
}

export function buildMonitorUrl(origin, tenantSlug) {
  return `${origin}${buildMonitorPath(tenantSlug)}`;
}