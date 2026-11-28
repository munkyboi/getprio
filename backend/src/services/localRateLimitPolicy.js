const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function isLocalDevelopmentProfile(source = process.env) {
  const nodeEnv = source.NODE_ENV ?? source.nodeEnv;
  const profile = source.LOCAL_API_PROFILE ?? source.localApiProfile;
  const originValue = source.LOCAL_API_ORIGIN ?? source.localApiOrigin;
  if (!["development", "test"].includes(nodeEnv)) return false;
  if (!["core", "sandbox"].includes(profile)) return false;

  try {
    const origin = new URL(originValue);
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
