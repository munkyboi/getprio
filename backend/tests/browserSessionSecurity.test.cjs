const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  clearBrowserSession,
  getAccessCookie,
  getRefreshCookie,
  issueBrowserSession
} = require("../src/services/browserSessionService");
const { createCsrfProtection } = require("../src/middleware/csrfProtection");

function buildResponse() {
  const headers = [];
  return {
    headers,
    append(name, value) {
      headers.push([name, value]);
    },
    setHeader(name, value) {
      headers.push([name, value]);
    }
  };
}

test("browser session puts access and refresh secrets only in HttpOnly host cookies", () => {
  const response = buildResponse();
  const result = issueBrowserSession(response, {
    accessToken: "access-secret",
    refreshToken: "refresh-secret",
    session: { _id: "42", expiresAt: "2026-09-01T00:00:00.000Z" }
  }, {
    secure: true,
    csrfSecret: "test-csrf-secret"
  });

  const cookies = response.headers.filter(([name]) => name === "Set-Cookie").map(([, value]) => value);
  assert.equal(cookies.length, 3);
  for (const cookieName of [ACCESS_COOKIE, REFRESH_COOKIE]) {
    const cookie = cookies.find((value) => value.startsWith(`${cookieName}=`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
  }
  assert.doesNotMatch(cookies.find((value) => value.startsWith(`${CSRF_COOKIE}=`)), /HttpOnly/);
  assert.equal(result.csrfToken.includes("access-secret"), false);
  assert.equal(cookies.some((value) => /Domain=/i.test(value)), false);
});

test("insecure local sessions use browser-valid non-Host cookie names", () => {
  const response = buildResponse();
  issueBrowserSession(response, {
    accessToken: "local-access-secret",
    refreshToken: "local-refresh-secret",
    session: { _id: "42", expiresAt: "2026-09-01T00:00:00.000Z" }
  }, {
    secure: false,
    csrfSecret: "test-csrf-secret"
  });

  const cookies = response.headers.filter(([name]) => name === "Set-Cookie").map(([, value]) => value);
  assert.equal(cookies.some((value) => value.startsWith("prio_access=")), true);
  assert.equal(cookies.some((value) => value.startsWith("prio_refresh=")), true);
  assert.equal(cookies.some((value) => value.startsWith("__Host-")), false);
  assert.equal(getAccessCookie({ prio_access: "local-access-secret" }, false), "local-access-secret");
  assert.equal(getRefreshCookie({ prio_refresh: "local-refresh-secret" }, false), "local-refresh-secret");
  assert.equal(getAccessCookie({ prio_access: "untrusted-production-cookie" }, true), null);
});

test("browser session clearing expires all session cookies", () => {
  const response = buildResponse();
  clearBrowserSession(response, { secure: false });
  const cookies = response.headers.filter(([name]) => name === "Set-Cookie").map(([, value]) => value);
  assert.equal(cookies.length, 3);
  assert.equal(cookies.every((value) => /Max-Age=0/.test(value)), true);
});

test("cookie-authenticated mutation requires same-origin session-bound CSRF", async () => {
  const protect = createCsrfProtection({
    allowedOrigins: new Set(["https://app.getprio.test"]),
    csrfSecret: "test-csrf-secret"
  });
  const response = buildResponse();
  const session = { _id: "42", expiresAt: "2026-09-01T00:00:00.000Z" };
  const { csrfToken } = issueBrowserSession(response, {
    accessToken: "access-secret",
    refreshToken: "refresh-secret",
    session
  }, { secure: true, csrfSecret: "test-csrf-secret" });

  const request = {
    method: "POST",
    headers: {
      cookie: `${ACCESS_COOKIE}=access-secret; ${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`,
      origin: "https://app.getprio.test",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    }
  };

  await new Promise((resolve, reject) => protect(request, response, (error) => error ? reject(error) : resolve()));
});

test("cookie-authenticated image upload requires the same CSRF checks", async () => {
  const protect = createCsrfProtection({
    allowedOrigins: new Set(["https://app.getprio.test"]),
    csrfSecret: "test-csrf-secret"
  });
  const response = buildResponse();
  const { csrfToken } = issueBrowserSession(response, {
    accessToken: "access-secret",
    refreshToken: "refresh-secret",
    session: { _id: "42", expiresAt: "2026-09-01T00:00:00.000Z" }
  }, { secure: true, csrfSecret: "test-csrf-secret" });

  await new Promise((resolve, reject) => protect({
    method: "POST",
    headers: {
      cookie: `${ACCESS_COOKIE}=access-secret; ${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`,
      origin: "https://app.getprio.test",
      "sec-fetch-site": "same-origin",
      "content-type": "image/png",
      "x-csrf-token": csrfToken
    }
  }, response, (error) => error ? reject(error) : resolve()));
});

test("cookie-authenticated PDF evidence upload requires the same CSRF checks", async () => {
  const protect = createCsrfProtection({
    allowedOrigins: new Set(["https://app.getprio.test"]),
    csrfSecret: "test-csrf-secret"
  });
  const response = buildResponse();
  const { csrfToken } = issueBrowserSession(response, {
    accessToken: "access-secret",
    refreshToken: "refresh-secret",
    session: { _id: "42", expiresAt: "2026-09-01T00:00:00.000Z" }
  }, { secure: true, csrfSecret: "test-csrf-secret" });

  await new Promise((resolve, reject) => protect({
    method: "POST",
    headers: {
      cookie: `${ACCESS_COOKIE}=access-secret; ${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`,
      origin: "https://app.getprio.test",
      "sec-fetch-site": "same-origin",
      "content-type": "application/pdf",
      "x-csrf-token": csrfToken
    }
  }, response, (error) => error ? reject(error) : resolve()));
});

test("login and MFA verification can recover from a stale browser session without bypassing origin checks", async () => {
  const protect = createCsrfProtection({
    allowedOrigins: new Set(["https://app.getprio.test"]),
    csrfSecret: "test-csrf-secret"
  });
  const response = buildResponse();
  const request = {
    method: "POST",
    originalUrl: "/api/auth/login",
    headers: {
      cookie: `${ACCESS_COOKIE}=stale-access; ${CSRF_COOKIE}=stale-csrf`,
      origin: "https://app.getprio.test",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "x-csrf-token": "stale-header"
    }
  };

  await new Promise((resolve, reject) => protect(request, response, (error) => error ? reject(error) : resolve()));

  await new Promise((resolve, reject) => protect({
    ...request,
    originalUrl: "/api/auth/mfa/verify"
  }, response, (error) => error ? reject(error) : resolve()));
});

test("cookie-authenticated mutation rejects foreign origin and missing CSRF", async () => {
  const protect = createCsrfProtection({
    allowedOrigins: new Set(["https://app.getprio.test"]),
    csrfSecret: "test-csrf-secret"
  });
  const response = buildResponse();
  const request = {
    method: "POST",
    headers: {
      cookie: `${ACCESS_COOKIE}=access-secret`,
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
      "content-type": "application/json"
    }
  };

  const error = await new Promise((resolve) => protect(request, response, resolve));
  assert.equal(error.statusCode, 403);
  assert.equal(error.code, "CSRF_VALIDATION_FAILED");
});

test("public vendor registration is not blocked by an unrelated stale cookie session", async () => {
  const protect = createCsrfProtection({ allowedOrigins: ["https://getprio.online"], csrfSecret: "test-secret" });
  for (const cookie of [`${REFRESH_COOKIE}=expired-session`, `${ACCESS_COOKIE}=old-session; ${CSRF_COOKIE}=old-csrf`]) {
    const error = await new Promise(resolve => protect({
      method: "POST", originalUrl: "/api/auth/register/vendor", headers: {
        cookie, origin: "https://getprio.online", "sec-fetch-site": "same-site", "content-type": "application/json",
        "x-csrf-token": "token-from-an-older-tab"
      }
    }, buildResponse(), resolve));
    assert.equal(error, undefined);
  }
});

test("vendor registration recovery retains origin, request-format and authenticated-route protections", async () => {
  const protect = createCsrfProtection({ allowedOrigins: ["https://getprio.online"], csrfSecret: "test-secret" });
  const headers = { cookie: `${REFRESH_COOKIE}=expired-session`, origin: "https://getprio.online", "sec-fetch-site": "same-site", "content-type": "application/json" };
  for (const request of [
    { headers: { ...headers, origin: "https://evil.example" } },
    { headers: { ...headers, origin: "" } },
    { headers: { ...headers, "sec-fetch-site": "cross-site" } },
    { headers: { ...headers, "content-type": "text/plain" } },
    { headers, originalUrl: "/api/auth/register/vendor/complete" },
    { headers, originalUrl: "/api/account/profile" },
    { headers, method: "PATCH" }
  ]) {
    const error = await new Promise(resolve => protect({ method: "POST", originalUrl: "/api/auth/register/vendor", ...request }, buildResponse(), resolve));
    assert.equal(error?.code, "CSRF_VALIDATION_FAILED");
  }
});

test("account bootstrap restores the current CSRF token without rotating another tab's cookie", () => {
  const { restoreBrowserCsrf, signCsrfToken } = require("../src/services/browserSessionService");
  const csrfToken = signCsrfToken("42", "test-secret");
  const req = { headers: { cookie: `prio_csrf=${encodeURIComponent(csrfToken)}` }, auth: { transport: "cookie", session: { _id: "42", expiresAt: new Date(Date.now() + 3600000) } } };
  const res = buildResponse();
  assert.equal(restoreBrowserCsrf(req, res, { csrfSecret: "test-secret" }), csrfToken);
  assert.equal(restoreBrowserCsrf(req, res, { csrfSecret: "test-secret" }), csrfToken);
  assert.equal(res.headers.length, 0);
});

test("account bootstrap repairs missing, tampered, and previous-session CSRF cookies", () => {
  const { restoreBrowserCsrf, signCsrfToken, verifyCsrfToken, parseCookies } = require("../src/services/browserSessionService");
  for (const oldToken of ["", "tampered", signCsrfToken("previous-session", "test-secret"), signCsrfToken("42", "old-secret")]) {
    const req = { headers: { cookie: `prio_csrf=${encodeURIComponent(oldToken)}` }, auth: { transport: "cookie", session: { _id: "42", expiresAt: new Date(Date.now() + 3600000) } } };
    const res = buildResponse();
    const token = restoreBrowserCsrf(req, res, { csrfSecret: "test-secret" });
    assert.equal(verifyCsrfToken(token, "test-secret"), true);
    assert.equal(Buffer.from(token.split(".")[0], "base64url").toString(), "42");
    assert.equal(res.headers.length, 1);
    assert.match(res.headers[0][1], /^prio_csrf=.*; Path=\/; SameSite=Lax; Secure; Max-Age=\d+$/);
    assert.equal(parseCookies(res.headers[0][1]).prio_csrf, token);
    assert.doesNotMatch(res.headers[0][1], /Domain=/);
  }
});

test("CSRF restoration does not issue browser cookies for bearer or unauthenticated requests", () => {
  const { restoreBrowserCsrf } = require("../src/services/browserSessionService");
  const res = buildResponse();
  for (const auth of [undefined, { transport: "bearer", session: { _id: "42" } }]) {
    assert.equal(restoreBrowserCsrf({ auth }, res, { csrfSecret: "test-secret" }), undefined);
  }
  assert.equal(res.headers.length, 0);
});
