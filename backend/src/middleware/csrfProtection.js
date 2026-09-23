const {
  CSRF_COOKIE,
  DEVELOPER_CSRF_COOKIE,
  getAccessCookie,
  getRefreshCookie,
  parseCookies,
  verifyCsrfToken
} = require("../services/browserSessionService");
const { normalizeApiPath } = require("./apiPath");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_CONTENT_TYPES = [
  "application/json",
  "application/pdf",
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "image/jpeg",
  "image/png",
  "image/webp"
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

function isAuthRecoveryRequest(req) {
  const path = normalizeApiPath(req.originalUrl || req.url);
  // These routes establish a new identity from their own credentials/input;
  // unrelated cookies must not require an old session's CSRF token. Keep
  // /register/vendor/complete protected: it uses the signed-in user's identity.
  return String(req.method || "GET").toUpperCase() === "POST" &&
    [
      "/auth/login",
      "/auth/mfa/verify",
      "/developer/mfa/email/send",
      "/developer/mfa/verify",
      "/developer/refresh",
      "/auth/register/vendor",
      "/developer/login",
      "/developer/register/otp",
      "/developer/register/otp/verify",
      "/developer/register/otp/resend"
    ].includes(path);
}

function isDeveloperRequest(req) {
  const path = normalizeApiPath(req.originalUrl || req.url);
  return path === "/developer" || path.startsWith("/developer/");
}

function createCsrfProtection({ allowedOrigins, csrfSecret, authCookieSecure = true }) {
  const origins = allowedOrigins instanceof Set ? allowedOrigins : new Set(allowedOrigins || []);

  return function csrfProtection(req, _res, next) {
    if (SAFE_METHODS.has(String(req.method || "GET").toUpperCase())) {
      next();
      return;
    }

    const cookies = parseCookies(req.headers?.cookie);
    const appCookieSession = Boolean(getAccessCookie(cookies, authCookieSecure));
    const developerCookieSession = Boolean(getAccessCookie(cookies, authCookieSecure, "developer"));
    const usesCookieSession = Boolean(
      appCookieSession || getRefreshCookie(cookies, authCookieSecure) || developerCookieSession || getRefreshCookie(cookies, authCookieSecure, "developer")
    );
    if (!usesCookieSession) {
      next();
      return;
    }

    const origin = requestOrigin(req);
    const fetchSite = String(req.headers?.["sec-fetch-site"] || "").toLowerCase();
    const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
    const headerToken = String(req.headers?.["x-csrf-token"] || "");
    // A browser may hold both an app session and a Developer Portal session.
    // Select the CSRF cookie from the API surface being called; otherwise a
    // vendor mutation can be checked against the unrelated developer token.
    const csrfCookieName = isDeveloperRequest(req)
      ? DEVELOPER_CSRF_COOKIE
      : CSRF_COOKIE;
    const cookieToken = String(cookies[csrfCookieName] || "");

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
    if (isAuthRecoveryRequest(req)) {
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
