function buildAbsoluteUrl(baseUrl: string, path: string): string {
  return `${String(baseUrl || "").replace(/\/$/, "")}${path}`;
}

export function buildJoinPath(tenantSlug: string): string {
  return `/join/${tenantSlug}`;
}

export function buildMonitorPath(tenantSlug: string): string {
  return `/monitor/${tenantSlug}`;
}

export function buildJoinUrl(baseUrl: string, tenantSlug: string): string {
  return buildAbsoluteUrl(baseUrl, buildJoinPath(tenantSlug));
}

export function buildMonitorUrl(baseUrl: string, tenantSlug: string): string {
  return buildAbsoluteUrl(baseUrl, buildMonitorPath(tenantSlug));
}
