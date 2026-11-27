const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function isLocalDevelopmentProfile(source = process.env) {
  if (!["development", "test"].includes(source.NODE_ENV)) return false;
  if (!["core", "sandbox"].includes(source.LOCAL_API_PROFILE)) return false;

  try {
    const origin = new URL(source.LOCAL_API_ORIGIN);
    return origin.protocol === "http:"
      && LOOPBACK_HOSTS.has(origin.hostname)
      && origin.pathname === "/"
      && !origin.search
      && !origin.hash
      && !origin.username
      && !origin.password;
  } catch {
    return false;
  }
}

function localRateLimit(defaultLimit, localLimit, source = process.env) {
  return isLocalDevelopmentProfile(source) ? localLimit : defaultLimit;
}

module.exports = { isLocalDevelopmentProfile, localRateLimit };
