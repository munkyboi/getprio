const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCookies } = require('../src/services/browserSessionService');

function load(secure) {
  const envPath = require.resolve('../src/config/env');
  const helperPath = require.resolve('../src/services/browserOAuthBinding');
  const originalEnv = require.cache[envPath], originalHelper = require.cache[helperPath];
  try {
    require.cache[envPath] = { id: envPath, filename: envPath, loaded: true, exports: { authCookieSecure: secure, oauthStateTtlMinutes: 10 } };
    delete require.cache[helperPath];
    return require(helperPath);
  } finally {
    if (originalEnv) require.cache[envPath] = originalEnv; else delete require.cache[envPath];
    if (originalHelper) require.cache[helperPath] = originalHelper; else delete require.cache[helperPath];
  }
}
function response() { return { cookies: [], append(name, value) { assert.equal(name, 'Set-Cookie'); this.cookies.push(value); } }; }

test('browser OAuth uses short-lived HttpOnly host-only cookie and clears it on consume', () => {
  const service = load(true), res = response();
  const browserBinding = service.issueBrowserOAuthBinding(res, 'google');
  const cookie = res.cookies[0];
  assert.match(cookie, /^__Host-prio_oauth_google=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Max-Age=600/); assert.doesNotMatch(cookie, /Domain=/);
  const cleared = response();
  service.consumeBrowserOAuthBinding({ headers: { cookie: cookie.split(';')[0] } }, cleared, 'google', { browserBinding });
  assert.match(cleared.cookies[0], /Max-Age=0/);
  assert.throws(() => service.consumeBrowserOAuthBinding({ headers: {} }, response(), 'google', { browserBinding }), /browser where it started/);
});

test('callback from another browser, mismatched provider, tampered nonce or old unbound state fails closed', () => {
  const service = load(true), res = response(), browserBinding = service.issueBrowserOAuthBinding(res, 'google');
  const cookie = res.cookies[0].split(';')[0], name = Object.keys(parseCookies(cookie))[0];
  for (const [headers, provider, state] of [
    [{}, 'google', { browserBinding }],
    [{ cookie }, 'facebook', { browserBinding }],
    [{ cookie: `${name}=${'f'.repeat(64)}` }, 'google', { browserBinding }],
    [{ cookie }, 'google', {}],
    [{ cookie }, 'google', { browserBinding: 'bad' }]
  ]) {
    const cleared = response();
    assert.throws(() => service.consumeBrowserOAuthBinding({ headers }, cleared, provider, state), /browser where it started/);
    assert.match(cleared.cookies[0], /Max-Age=0/);
  }
});

test('Apple form-post callback binding uses Secure SameSite=None; insecure local Apple is unavailable', () => {
  const secure = load(true), res = response();
  secure.issueBrowserOAuthBinding(res, 'apple');
  assert.match(res.cookies[0], /SameSite=None/); assert.match(res.cookies[0], /Secure/); assert.match(res.cookies[0], /HttpOnly/);
  assert.throws(() => load(false).issueBrowserOAuthBinding(response(), 'apple'), /requires a secure HTTPS API/);
});

test('local Google binding preserves separate names and does not change app session cookies', () => {
  const local = load(false), res = response();
  local.issueBrowserOAuthBinding(res, 'google');
  assert.match(res.cookies[0], /^prio_oauth_google=/); assert.doesNotMatch(res.cookies[0], /; Secure|__Host-|prio_access|prio_refresh/);
});
