function localBrowserCookiePrefix(source = process.env) {
  const prefix = source.LOCAL_BROWSER_COOKIE_PREFIX || "";
  if (!prefix) return "";
  let localOrigin = false;
  try { const url = new URL(source.LOCAL_API_ORIGIN); localOrigin = url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) && Boolean(url.port) && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password; } catch { /* Fail closed below. */ }
  if (!["development", "test"].includes(source.NODE_ENV) || source.LOCAL_API_PROFILE !== "core" || source.AUTH_COOKIE_SECURE !== "false" || !localOrigin || !/^[a-z][a-z0-9_]{2,31}$/.test(prefix)) throw new Error("Local cookie namespace requires an explicit guarded loopback core profile.");
  return prefix + "_";
}
module.exports = { localBrowserCookiePrefix };
