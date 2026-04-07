export const MONITOR_ROUTE_PATH = "/monitor/:tenantSlug";
export const LEGACY_MONITOR_ROUTE_PATH = "/t/:tenantSlug";

export function buildJoinPath(tenantSlug: string): string {
  return `/join/${tenantSlug}`;
}

export function buildMonitorPath(tenantSlug: string): string {
  return `/monitor/${tenantSlug}`;
}

export function buildMonitorPathWithTicket(tenantSlug: string, lookupCode?: string): string {
  const monitorPath = buildMonitorPath(tenantSlug);
  if (!lookupCode) {
    return monitorPath;
  }

  const searchParams = new URLSearchParams({ ticket: lookupCode });
  return `${monitorPath}?${searchParams.toString()}`;
}

export function buildJoinUrl(origin: string, tenantSlug: string): string {
  return `${origin}${buildJoinPath(tenantSlug)}`;
}

export function buildMonitorUrl(origin: string, tenantSlug: string): string {
  return `${origin}${buildMonitorPath(tenantSlug)}`;
}
