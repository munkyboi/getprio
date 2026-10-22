require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { apiRequest, apiUpload } = require('../src/api/client.ts');
const sessionService = require('../../backend/src/services/browserSessionService');
const { createCsrfProtection } = require('../../backend/src/middleware/csrfProtection');

function accountHandler() {
  const routes = [];
  const router = new Proxy({}, { get: (_, method) => (...args) => { if (method === 'get') routes.push(args); } });
  const fallback = new Proxy({}, { get: () => () => undefined });
  const mocks = {
    express: { Router: () => router },
    '../middleware/asyncHandler': handler => handler,
    '../config/env': { csrfSecret: 'test-secret', authCookieSecure: true },
    '../services/browserSessionService': sessionService,
    '../repositories/tenants': { findTenantsByIds: async () => [] },
    '../services/mfaService': { userRequiresPrivilegedMfa: () => false }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../backend/src/routes/authRoutes'), 'utf8'), {
    require: name => mocks[name] || fallback, module: { exports: {} }, Buffer, URL, console
  });
  return routes.find(([url]) => url === '/me').at(-1);
}

test('a new storefront tab restores CSRF from account loading before its avatar upload', async () => {
  const handler = accountHandler();
  const storage = new Map();
  const saved = { window: global.window, document: global.document, fetch: global.fetch };
  global.window = { sessionStorage: { getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value) } };
  // Host-only API cookies cannot be read from getprio.online.
  global.document = { cookie: '' };
  const csrfToken = sessionService.signCsrfToken('42', 'test-secret');
  const cookies = `__Host-prio_access=access; prio_csrf=${encodeURIComponent(csrfToken)}`;
  const protect = createCsrfProtection({ allowedOrigins: ['https://getprio.online'], csrfSecret: 'test-secret' });
  let uploads = 0;
  global.fetch = async (url, options) => {
    if (url.endsWith('/auth/me')) {
      let data;
      await handler({ headers: { cookie: cookies }, user: { _id: '1', roles: ['customer'] }, auth: { transport: 'cookie', sessionId: '42', session: { _id: '42', expiresAt: new Date(Date.now()+3600000) } } }, {
        set: () => {}, append: () => {}, json: value => { data = value; }
      });
      return new Response(JSON.stringify(data), { status: 200 });
    }
    if (url.endsWith('/public/upload-policy')) return new Response(JSON.stringify({ maxImageUploadKb: 200, maxImageUploadBytes: 204800 }));
    assert.ok(url.includes('/account/profile/avatar'));
    let failure;
    protect({ method: 'POST', headers: { cookie: cookies, origin: 'https://getprio.online', 'sec-fetch-site': 'same-site', 'content-type': options.headers['Content-Type'], 'x-csrf-token': options.headers['X-CSRF-Token'] } }, {}, error => { failure = error; });
    if (failure) return new Response(JSON.stringify({ message: failure.message, code: failure.code }), { status: failure.statusCode });
    uploads += 1;
    return new Response(JSON.stringify({ avatarUrl: 'https://cdn.example.test/photo.png' }), { status: 201 });
  };
  try {
    await apiRequest('/auth/me', { skipAuthRefresh: true });
    await apiUpload('/account/profile/avatar?fileName=photo.png', { token: 'cookie-session', body: new Blob(['image'], { type: 'image/png' }), contentType: 'image/png' });
    assert.equal(uploads, 1);
  } finally {
    for (const [key,value] of Object.entries(saved)) { if (value === undefined) delete global[key]; else global[key] = value; }
  }
});
