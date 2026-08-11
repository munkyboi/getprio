const {
  CSRF_COOKIE,
  getAccessCookie,
  getRefreshCookie,
  parseCookies,
  verifyCsrfToken
} = require("../services/browserSessionService");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_CONTENT_TYPES = [
  "application/json",
  "application/x-www-form-urlencoded",
  "multipart/form-data"
];

function csrfError(message) {
  const error = new Error(message || "We could not verify this request. Please refresh and try again.");
  error.statusCode = 403;
  error.code = "CSRF_VALIDATION_FAILED";
  return error;
}

function requestOrigin(req) {
  if (req.headers?.origin) return String(req.headers.origin).replace(/\/$/, "");
  if (!req.headers?.referer) return "";
  try {
    return new URL(String(req.headers.referer)).origin;
  } catch {
    return "";
  }
}

function isLoginRequest(req) {
  const path = String(req.originalUrl || req.url || "")
    .split("?")[0]
    .replace(/^\/api(?=\/)/, "");
  return String(req.method || "GET").toUpperCase() === "POST" && path === "/auth/login";
}

function createCsrfProtection({ allowedOrigins, csrfSecret, authCookieSecure = true }) {
  const origins = allowedOrigins instanceof Set ? allowedOrigins : new Set(allowedOrigins || []);

  return function csrfProtection(req, _res, next) {
    if (SAFE_METHODS.has(String(req.method || "GET").toUpperCase())) {
      next();
      return;
    }

    const cookies = parseCookies(req.headers?.cookie);
    const usesCookieSession = Boolean(
      getAccessCookie(cookies, authCookieSecure) || getRefreshCookie(cookies, authCookieSecure)
    );
    if (!usesCookieSession) {
      next();
      return;
    }

    const origin = requestOrigin(req);
    const fetchSite = String(req.headers?.["sec-fetch-site"] || "").toLowerCase();
    const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
    const headerToken = String(req.headers?.["x-csrf-token"] || "");
    const cookieToken = String(cookies[CSRF_COOKIE] || "");

    if (!origin || !origins.has(origin)) {
      next(csrfError());
      return;
    }
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
      next(csrfError());
      return;
    }
    if (!ALLOWED_CONTENT_TYPES.some((allowed) => contentType.startsWith(allowed))) {
      next(csrfError("This request format is not supported. Please refresh and try again."));
      return;
    }
    if (isLoginRequest(req)) {
      next();
      return;
    }
    if (!headerToken || headerToken !== cookieToken || !verifyCsrfToken(headerToken, csrfSecret)) {
      next(csrfError());
      return;
    }

    next();
  };
}

module.exports = {
  createCsrfProtection,
  requestOrigin
};
