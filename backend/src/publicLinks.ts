function buildAbsoluteUrl(baseUrl: string, path: string): string {
  return `${String(baseUrl || "").replace(/\/$/, "")}${path}`;
}

export function buildJoinPath(tenantSlug: string, locationSlug?: string): string {
  return locationSlug ? `/join/${tenantSlug}/${locationSlug}` : `/join/${tenantSlug}`;
}

export function buildMonitorPath(tenantSlug: string, locationSlug?: string): string {
  return locationSlug ? `/monitor/${tenantSlug}/${locationSlug}` : `/monitor/${tenantSlug}`;
}

export function buildJoinUrl(baseUrl: string, tenantSlug: string, locationSlug?: string): string {
  return buildAbsoluteUrl(baseUrl, buildJoinPath(tenantSlug, locationSlug));
}

export function buildMonitorUrl(baseUrl: string, tenantSlug: string, locationSlug?: string): string {
  return buildAbsoluteUrl(baseUrl, buildMonitorPath(tenantSlug, locationSlug));
}
