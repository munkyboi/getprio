const DEFAULT_API_URL = "http://localhost:5001/api"
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase()
}

export function resolvePlatformApiBaseUrl(configuredUrl: string | undefined, pageHostname: string, isDevelopment: boolean) {
  const rawUrl = configuredUrl || DEFAULT_API_URL

  try {
    const apiUrl = new URL(rawUrl, "http://localhost")
    const apiHostname = normalizeHostname(apiUrl.hostname)
    const currentHostname = normalizeHostname(pageHostname)

    // localhost and 127.0.0.1 are different cookie sites. Keep local Platform
    // auth requests on the page's loopback host so SameSite=Lax session cookies
    // are sent on the first protected request after MFA succeeds.
    if (isDevelopment && LOOPBACK_HOSTS.has(apiHostname) && LOOPBACK_HOSTS.has(currentHostname)) {
      apiUrl.hostname = currentHostname
    }

    return apiUrl.toString().replace(/\/$/, "")
  } catch {
    return rawUrl.replace(/\/$/, "")
  }
}
