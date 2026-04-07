function buildAbsoluteUrl(baseUrl, path) {
  return `${String(baseUrl || "").replace(/\/$/, "")}${path}`;
}

function buildJoinPath(tenantSlug) {
  return `/join/${tenantSlug}`;
}

function buildMonitorPath(tenantSlug) {
  return `/monitor/${tenantSlug}`;
}

function buildJoinUrl(baseUrl, tenantSlug) {
  return buildAbsoluteUrl(baseUrl, buildJoinPath(tenantSlug));
}

function buildMonitorUrl(baseUrl, tenantSlug) {
  return buildAbsoluteUrl(baseUrl, buildMonitorPath(tenantSlug));
}

module.exports = {
  buildJoinPath,
  buildMonitorPath,
  buildJoinUrl,
  buildMonitorUrl
};