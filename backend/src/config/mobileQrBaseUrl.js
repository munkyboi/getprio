/**
 * @param {NodeJS.ProcessEnv} [source]
 * @param {string} [fallbackAppBaseUrl]
 * @param {number} [fallbackFrontendPort]
 * @returns {string}
 */
function resolveMobileQrBaseUrl(
  source = process.env,
  fallbackAppBaseUrl = "http://localhost:5173",
  fallbackFrontendPort = 5173
) {
  const configured = String(source.MOBILE_QR_BASE_URL || "").trim();
  const fallback = source.NODE_ENV === "production"
    ? fallbackAppBaseUrl
    : `https://localhost:${fallbackFrontendPort}`;
  const candidate = configured || fallback;

  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      (url.pathname && url.pathname !== "/") ||
      url.search ||
      url.hash
    ) {
      throw new Error("invalid mobile QR origin");
    }
    return url.origin;
  } catch {
    throw new Error("MOBILE_QR_BASE_URL must be an HTTPS origin with no path, query, credentials, or fragment.");
  }
}

module.exports = { resolveMobileQrBaseUrl };
