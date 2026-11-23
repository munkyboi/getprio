/* Control characters are intentionally rejected in return paths. */
/* eslint-disable no-control-regex */
/** Trusted configured destinations, never request Host/Origin-derived redirects. */
function origin(value) {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) throw new Error("Invalid browser application origin.");
  return url.origin;
}
function surfaceOrigins(env) {
  return {
    customer: origin(env.customerAppUrl || env.appBaseUrl || env.clientUrl),
    vendor: origin(env.vendorAppUrl || env.clientUrl || env.appBaseUrl),
    marketing: origin(env.marketingUrl || env.appBaseUrl || env.clientUrl),
    platform: origin(env.platformDashboardUrl || env.clientUrl || env.appBaseUrl),
    developers: origin(env.developerPortalUrl || env.clientUrl || env.appBaseUrl)
  };
}
function surfaceOriginSet(env, surface) {
  const canonical = surfaceOrigins(env)[surface];
  const result = new Set([canonical]); const url = new URL(canonical);
  if (env.nodeEnv !== "production" && url.port && ["localhost", "127.0.0.1"].includes(url.hostname)) {
    result.add(`${url.protocol}//localhost:${url.port}`); result.add(`${url.protocol}//127.0.0.1:${url.port}`);
  }
  return result;
}
function browserAllowedOrigins(env) {
  const values = [env.clientUrl, env.appBaseUrl, env.customerAppUrl, env.vendorAppUrl,
    env.platformDashboardUrl, env.developerPortalUrl].filter(Boolean);
  const result = new Set();
  for (const value of values) {
    const canonical = origin(value); result.add(canonical);
    const url = new URL(canonical);
    // Only actual loopback origins receive their paired local spelling.
    if (env.nodeEnv !== "production" && url.port && ["localhost", "127.0.0.1"].includes(url.hostname)) {
      result.add(`${url.protocol}//localhost:${url.port}`); result.add(`${url.protocol}//127.0.0.1:${url.port}`);
    }
  }
  return result;
}
function authSurface(value, intent) {
  if (value === "customer" || value === "vendor") return value;
  if (value !== undefined && value !== null && value !== "") { const error = new Error("Unknown authentication surface."); error.statusCode = 400; throw error; }
  return intent === "register_vendor" ? "vendor" : null;
}
function safeReturnPath(value, surface, { allowOnboarding = false } = {}) {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://return.invalid"); let decoded = url.pathname;
    for (let i = 0; i < 4; i++) { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next; }
    const routes = surface === "vendor" ? /^\/(?:dashboard|queue-board)(?:\/|$)/ : /^\/(?:account|vendors|join|ticket|payment)(?:\/|$)/;
    if (url.origin !== "https://return.invalid" || /[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.includes("//") || /(?:^|\/)\.\.?(?:\/|$)/.test(decoded) || (!routes.test(decoded) && !(surface === "vendor" && allowOnboarding && /^\/register(?:\/vendor)?$/.test(decoded)))) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
function publicMarketingRequestAllowed(path, method, requestedMethod) {
  const verb = String(method).toUpperCase() === "OPTIONS" ? String(requestedMethod || "").toUpperCase() : String(method).toUpperCase();
  const pathname = String(path || "").split("?")[0];
  return (verb === "GET" && ["/api/billing/plans", "/api/public/help-center", "/api/v1/billing/plans", "/api/v1/public/help-center"].includes(pathname)) ||
    (verb === "POST" && ["/api/public/enterprise-inquiries", "/api/v1/public/enterprise-inquiries"].includes(pathname));
}
const localMarketingAuthOrigins = new Set(["http://localhost:5190", "http://127.0.0.1:5190"]);
const localMarketingAuthPaths = new Set(["/api/auth/oauth/providers", "/api/auth/me"]);

function createLocalMarketingAuthCors(env, marketing, cors) {
  if (!["development", "test"].includes(env.nodeEnv) || env.localApiProfile !== "core" || !localMarketingAuthOrigins.has(marketing)) return null;
  return cors({
    origin(value, callback) { callback(null, localMarketingAuthOrigins.has(value) ? value : false); },
    credentials: true,
    methods: ["GET"],
    allowedHeaders: ["Content-Type"]
  });
}

function isLocalMarketingAuthRead(req) {
  const path = String(req.originalUrl || req.url || "").split("?")[0];
  return localMarketingAuthPaths.has(path) &&
    (req.method === "GET" || (req.method === "OPTIONS" && req.headers?.["access-control-request-method"] === "GET"));
}

function createBrowserCorsMiddleware(env, cors) {
  const allowed = browserAllowedOrigins(env);
  const marketing = env.marketingUrl ? origin(env.marketingUrl) : "";
  const normal = cors({ origin(value, callback) {
    const normalized = String(value || "").replace(/\/$/, "");
    if (!value || allowed.has(normalized)) callback(null, true);
    else callback(Object.assign(new Error("Origin not allowed by CORS."), { statusCode: 403 }));
  }, credentials: true, exposedHeaders: ["Retry-After", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"] });
  const appleCallbackCors = cors({ origin(value, callback) {
    callback(null, String(value || "").replace(/\/$/, "") === "https://appleid.apple.com");
  }, credentials: true, methods: ["POST", "OPTIONS"], allowedHeaders: ["Content-Type"] });
  const marketingOrigins = marketing ? surfaceOriginSet(env, "marketing") : new Set();
  const publicCors = marketing ? cors({ origin(value, callback) { callback(null, marketingOrigins.has(value) ? value : false); }, credentials: false, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type", "Idempotency-Key"] }) : null;
  const localMarketingAuthCors = createLocalMarketingAuthCors(env, marketing, cors);
  return (req, res, next) => {
    const requestPath = String(req.originalUrl || req.url || "").split("?")[0];
    if (/\/api\/auth\/oauth\/apple\/callback$/u.test(requestPath) && String(req.headers?.origin || "").replace(/\/$/, "") === "https://appleid.apple.com") {
      return appleCallbackCors(req, res, next);
    }
    if (marketing && !allowed.has(marketing) && marketingOrigins.has(String(req.headers?.origin || "").replace(/\/$/, ""))) {
      if (localMarketingAuthCors && isLocalMarketingAuthRead(req)) return localMarketingAuthCors(req, res, next);
      if (!publicMarketingRequestAllowed(req.originalUrl || req.url, req.method, req.headers?.["access-control-request-method"])) return next(Object.assign(new Error("Marketing origin cannot access private API routes."), { statusCode: 403 }));
      return publicCors(req, res, next);
    }
    return normal(req, res, next);
  };
}
module.exports = { origin, surfaceOrigins, browserAllowedOrigins, authSurface, safeReturnPath, publicMarketingRequestAllowed, createBrowserCorsMiddleware, surfaceOriginSet };
