function resolvePublicUrl(configured, isAllowed, errorMessage) {
  if (!configured) return "";
  try {
    const url = new URL(configured);
    if (!isAllowed(url)) {
      throw new TypeError("invalid TestFlight public URL");
    }
    return url.toString();
  } catch {
    throw new TypeError(errorMessage);
  }
}

function resolveSandboxTestFlightPublicUrl(source = process.env) {
  return resolvePublicUrl(
    String(source.SANDBOX_TESTFLIGHT_PUBLIC_URL || "").trim(),
    (url) => url.protocol === "https:" && url.hostname === "testflight.apple.com" && !url.port &&
      !url.username && !url.password && /^\/join\/[^/]+$/.test(url.pathname) && !url.search && !url.hash,
    "SANDBOX_TESTFLIGHT_PUBLIC_URL must be an HTTPS testflight.apple.com /join/ URL."
  );
}

module.exports = {
  resolveSandboxTestFlightPublicUrl
};
