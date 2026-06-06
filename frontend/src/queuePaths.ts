export const MONITOR_ROUTE_PATH = "/monitor/:tenantSlug/:locationSlug?";
export const LEGACY_MONITOR_ROUTE_PATH = "/t/:tenantSlug";
export const JOINED_QUEUE_ROUTE_PATH = "/ticket/:tenantSlug/:locationSlug?";

export function buildJoinPath(tenantSlug: string, locationSlug?: string): string {
  return locationSlug ? `/join/${tenantSlug}/${locationSlug}` : `/join/${tenantSlug}`;
}

export function buildMonitorPath(tenantSlug: string, locationSlug?: string): string {
  return locationSlug ? `/monitor/${tenantSlug}/${locationSlug}` : `/monitor/${tenantSlug}`;
}

export function buildJoinedQueuePath(tenantSlug: string, locationSlug?: string): string {
  return locationSlug ? `/ticket/${tenantSlug}/${locationSlug}` : `/ticket/${tenantSlug}`;
}

export function buildMonitorPathWithTicket(
  tenantSlug: string,
  lookupCode?: string,
  locationSlug?: string
): string {
  const monitorPath = buildMonitorPath(tenantSlug, locationSlug);
  if (!lookupCode) {
    return monitorPath;
  }

  const searchParams = new URLSearchParams({ ticket: lookupCode });
  return `${monitorPath}?${searchParams.toString()}`;
}

export function buildJoinedQueuePathWithTicket(
  tenantSlug: string,
  lookupCode?: string,
  locationSlug?: string
): string {
  const ticketPath = buildJoinedQueuePath(tenantSlug, locationSlug);
  if (!lookupCode) {
    return ticketPath;
  }

  const searchParams = new URLSearchParams({ ticket: lookupCode });
  return `${ticketPath}?${searchParams.toString()}`;
}

export function buildJoinUrl(origin: string, tenantSlug: string, locationSlug?: string): string {
  return `${origin}${buildJoinPath(tenantSlug, locationSlug)}`;
}

export function buildMonitorUrl(origin: string, tenantSlug: string, locationSlug?: string): string {
  return `${origin}${buildMonitorPath(tenantSlug, locationSlug)}`;
}
