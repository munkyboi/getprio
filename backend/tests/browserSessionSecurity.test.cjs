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

test("login can recover from a stale browser session without bypassing origin checks", async () => {
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
