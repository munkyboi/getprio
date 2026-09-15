const crypto = require("node:crypto");

const ACCESS_COOKIE = "__Host-prio_access";
const REFRESH_COOKIE = "__Host-prio_refresh";
const DEVELOPER_ACCESS_COOKIE = "__Host-prio_developer_access";
const DEVELOPER_REFRESH_COOKIE = "__Host-prio_developer_refresh";
const LOCAL_ACCESS_COOKIE = "prio_access";
const LOCAL_REFRESH_COOKIE = "prio_refresh";
const LOCAL_DEVELOPER_ACCESS_COOKIE = "prio_developer_access";
const LOCAL_DEVELOPER_REFRESH_COOKIE = "prio_developer_refresh";
const CSRF_COOKIE = "prio_csrf";
const DEVELOPER_CSRF_COOKIE = "prio_developer_csrf";

function getSessionCookieNames(secure, surface = "app") {
  const developer = surface === "developer";
  return secure
    ? { access: developer ? DEVELOPER_ACCESS_COOKIE : ACCESS_COOKIE, refresh: developer ? DEVELOPER_REFRESH_COOKIE : REFRESH_COOKIE }
    : { access: developer ? LOCAL_DEVELOPER_ACCESS_COOKIE : LOCAL_ACCESS_COOKIE, refresh: developer ? LOCAL_DEVELOPER_REFRESH_COOKIE : LOCAL_REFRESH_COOKIE };
}

function getAccessCookie(cookies, secure = true, surface = "app") {
  return cookies?.[getSessionCookieNames(secure, surface).access] || null;
}

function getRefreshCookie(cookies, secure = true, surface = "app") {
  return cookies?.[getSessionCookieNames(secure, surface).refresh] || null;
}

function base64Url(value) {
  return Buffer.from(String(value)).toString("base64url");
}

function signCsrfToken(sessionId, secret, nonce = crypto.randomBytes(24).toString("base64url")) {
  const payload = `${base64Url(sessionId)}.${nonce}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyCsrfToken(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return false;
  }

  const payload = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(parts[2], "base64url");
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function serializeCookie(name, value, options = {}) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `SameSite=${options.sameSite || "Lax"}`
  ];
  if (options.httpOnly) attributes.push("HttpOnly");
  if (options.secure) attributes.push("Secure");
  if (Number.isFinite(options.maxAge)) attributes.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return attributes.join("; ");
}

function appendCookie(res, value) {
  if (typeof res.append === "function") {
    res.append("Set-Cookie", value);
    return;
  }
  if (typeof res.setHeader === "function") {
    res.setHeader("Set-Cookie", value);
    return;
  }
  throw new Error("The response does not support secure cookie headers.");
}

function issueBrowserSession(res, sessionResult, options = {}) {
  const secure = options.secure !== false;
  const cookieNames = getSessionCookieNames(secure, options.surface);
  const csrfSecret = String(options.csrfSecret || "");
  if (!csrfSecret) {
    throw new Error("CSRF signing secret is required.");
  }

  const sessionId = String(sessionResult.session._id);
  const sessionExpiresAt = new Date(sessionResult.session.expiresAt).getTime();
  const refreshMaxAge = Math.max(0, Math.floor((sessionExpiresAt - Date.now()) / 1000));
  const accessMaxAge = Math.min(refreshMaxAge, Math.max(60, Number(options.accessMaxAgeSeconds || 900)));
  const csrfToken = signCsrfToken(sessionId, csrfSecret);
  const csrfCookie = options.surface === "developer" ? DEVELOPER_CSRF_COOKIE : CSRF_COOKIE;

  appendCookie(res, serializeCookie(cookieNames.access, sessionResult.accessToken, {
    httpOnly: true,
    secure,
    maxAge: accessMaxAge
  }));
  appendCookie(res, serializeCookie(cookieNames.refresh, sessionResult.refreshToken, {
    httpOnly: true,
    secure,
    maxAge: refreshMaxAge
  }));
  appendCookie(res, serializeCookie(csrfCookie, csrfToken, {
    secure,
    maxAge: refreshMaxAge
  }));

  return { csrfToken };
}

function restoreBrowserCsrf(req, res, options = {}) {
  if (req.auth?.transport !== "cookie" || !req.auth.session) return undefined;
  const secret = String(options.csrfSecret || "");
  if (!secret) throw new Error("CSRF signing secret is required.");
  const sessionId = String(req.auth.session._id);
  const csrfCookie = options.surface === "developer" ? DEVELOPER_CSRF_COOKIE : CSRF_COOKIE;
  const existing = parseCookies(req.headers?.cookie)[csrfCookie];
  // Reuse the current signed token so loading another tab does not invalidate it.
  if (existing && verifyCsrfToken(existing, secret) && existing.split(".")[0] === base64Url(sessionId)) {
    return existing;
  }
  const token = signCsrfToken(sessionId, secret);
  const maxAge = Math.max(0, Math.floor((new Date(req.auth.session.expiresAt).getTime() - Date.now()) / 1000));
  appendCookie(res, serializeCookie(csrfCookie, token, {
    secure: options.secure !== false,
    maxAge
  }));
  return token;
}

function clearBrowserSession(res, options = {}) {
  const secure = options.secure !== false;
  const cookieNames = getSessionCookieNames(secure, options.surface);
  const csrfCookie = options.surface === "developer" ? DEVELOPER_CSRF_COOKIE : CSRF_COOKIE;
  appendCookie(res, serializeCookie(cookieNames.access, "", { httpOnly: true, secure, maxAge: 0 }));
  appendCookie(res, serializeCookie(cookieNames.refresh, "", { httpOnly: true, secure, maxAge: 0 }));
  appendCookie(res, serializeCookie(csrfCookie, "", { secure, maxAge: 0 }));
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 1) return cookies;
      const name = part.slice(0, separator);
      try {
        cookies[name] = decodeURIComponent(part.slice(separator + 1));
      } catch {
        cookies[name] = "";
      }
      return cookies;
    }, {});
}

module.exports = {
  ACCESS_COOKIE,
  DEVELOPER_ACCESS_COOKIE,
  DEVELOPER_REFRESH_COOKIE,
  CSRF_COOKIE,
  DEVELOPER_CSRF_COOKIE,
  LOCAL_ACCESS_COOKIE,
  LOCAL_DEVELOPER_ACCESS_COOKIE,
  LOCAL_DEVELOPER_REFRESH_COOKIE,
  LOCAL_REFRESH_COOKIE,
  REFRESH_COOKIE,
  clearBrowserSession,
  getAccessCookie,
  getRefreshCookie,
  getSessionCookieNames,
  issueBrowserSession,
  restoreBrowserCsrf,
  parseCookies,
  serializeCookie,
  signCsrfToken,
  verifyCsrfToken
};
