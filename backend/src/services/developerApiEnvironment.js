const env = require("../config/env");
const productionHosts = { production: "api.getprio.online", sandbox: "sandbox-api.getprio.online" };
function resolveDeveloperApiEnvironment(req, config = env) {
  const authority = String(req.headers?.host || "").trim().toLowerCase();
  if (!authority || /[\s/@\\]/.test(authority)) return "unknown";
  if (config.localApiProfile) {
    if (config.nodeEnv === "production" || !["core", "sandbox"].includes(config.localApiProfile)) return "unknown";
    try {
      const url = new URL(config.localApiOrigin);
      if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || !url.port || url.pathname !== "/" || url.search || url.hash || url.username || url.password) return "unknown";
      if (![`${url.hostname}:${url.port}`, `${url.hostname === "localhost" ? "127.0.0.1" : "localhost"}:${url.port}`].includes(authority)) return "unknown";
      const environment = config.localApiProfile === "sandbox" ? "sandbox" : "production";
      return config.apiEnvironment === environment ? environment : "unknown";
    } catch { return "unknown"; }
  }
  const environment = Object.entries(productionHosts).find(([, host]) => authority === host)?.[0];
  return environment && environment === config.apiEnvironment ? environment : "unknown";
}
function localApiRequestGuard(config = env) {
  return (req, res, next) => {
    if (!config.localApiProfile) return next();
    if (resolveDeveloperApiEnvironment(req, config) === "unknown") return res.status(421).json({ code: "API_ENVIRONMENT_HOST_MISMATCH", message: "API host does not match this local environment." });
    // Local sandbox is API-key only: never issue first-party browser cookies.
    const path = (req.originalUrl || req.url).split("?")[0];
    if (config.localApiProfile === "sandbox" && path !== "/api/health" && !/^\/v1(?:\/|$)/.test(path)) return res.status(404).json({ message: "Not found." });
    return next();
  };
}
module.exports = { resolveDeveloperApiEnvironment, localApiRequestGuard };
