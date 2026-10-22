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

export function buildQueueQrUrl(
  baseUrl: string,
  tenantSlug: string,
  locationSlug: string,
  queueJoinId: string
): string {
  const searchParams = new URLSearchParams({ source: "qr", id: queueJoinId });
  return `${buildJoinUrl(baseUrl, tenantSlug, locationSlug)}?${searchParams.toString()}`;
}

export function buildMonitorUrl(baseUrl: string, tenantSlug: string, locationSlug?: string): string {
  return buildAbsoluteUrl(baseUrl, buildMonitorPath(tenantSlug, locationSlug));
}
