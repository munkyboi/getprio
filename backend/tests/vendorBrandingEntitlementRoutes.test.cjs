const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the registered route callbacks with all I/O mocked. Admission deliberately
// permits the request, matching the legacy/release-flag-off policy QA observed.
function fixture(brandedQueuePages) {
  const routes = [], calls = [];
  const noop = () => {};
  const fallback = new Proxy(noop, { get: () => noop });
  const router = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'use']) {
    router[method] = (url, ...handlers) => { routes.push({ method, url, handler: handlers.at(-1) }); return router; };
  }
  const mocks = {
    express: { Router: () => router, raw: () => noop },
    '../middleware/asyncHandler': fn => fn,
    '../middleware/auth': { assertTenantPermission: () => calls.push('permission') },
    './vendorRouteHelpers': {
      getAuthorizedTenant: async () => ({ _id: '7' }),
      getLocationForTenant: async () => ({ _id: '9' }),
      normalizeRequestText: value => String(value || '').trim()
    },
    '../services/billingService': { getTenantEntitlements: async () => { calls.push('entitlements'); return { brandedQueuePages }; } },
    '../services/entitlementAdmissionService': { admit: async () => calls.push('admission') },
    '../repositories/publicBoardThemes': { saveTheme: async input => { calls.push('save'); return input; } },
    '../services/publicBoardThemeUploadService': {
      uploadBinary: async () => { calls.push('upload'); return { asset: {} }; },
      createUpload: async () => { calls.push('presign'); return { asset: {} }; }
    },
    '../services/queueTicketDetailsService': { createQueueTicketDetailsService: () => ({}) }
  };
  const file = path.join(__dirname, '../src/routes/vendorRoutes.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : fallback,
    module: { exports: {} }, Buffer, URL, process, console
  }, { filename: file });
  async function request(method, suffix, { location, applyToAllLocations } = {}) {
    const req = { params: { tenantSlug: 'qa' }, user: { _id: '12' }, query: location ? { location } : {}, headers: { 'content-type': 'image/png' }, body: method === 'patch' ? { theme: {}, applyToAllLocations } : Buffer.from('image') };
    let status = 200, response;
    const res = { status(code) { status = code; return this; }, json(body) { response = { status, body }; return response; } };
    await routes.find(r => r.method === method && r.url === '/tenant/:tenantSlug/public-board-theme' + suffix).handler(req, res);
    return response;
  }
  return { calls, request };
}

test('Free scoped direct branding and scoped/apply-all saves are denied before any storage or persistence', async () => {
  for (const [method, suffix, scope] of [
    ['post', '/uploads/direct', { location: 'main' }],
    ['patch', '', { location: 'main' }],
    ['patch', '', { applyToAllLocations: true }]
  ]) {
    const f = fixture(false);
    await assert.rejects(f.request(method, suffix, scope), error => error.statusCode === 403 && /not available for this plan/.test(error.message));
    assert.deepEqual(f.calls, ['permission', 'admission', 'entitlements']);
  }
});

test('Pro keeps scoped upload and scoped/apply-all save contracts', async () => {
  for (const [method, suffix, scope, status, write] of [
    ['post', '/uploads/direct', { location: 'main' }, 201, 'upload'],
    ['patch', '', { location: 'main' }, 200, 'save'],
    ['patch', '', { applyToAllLocations: true }, 200, 'save']
  ]) {
    const f = fixture(true);
    assert.equal((await f.request(method, suffix, scope)).status, status);
    assert.deepEqual(f.calls, ['permission', 'admission', 'entitlements', write]);
  }
});

test('Free unscoped business media and theme defaults remain available', async () => {
  for (const [method, suffix, status, write] of [['post', '/uploads/direct', 201, 'upload'], ['patch', '', 200, 'save']]) {
    const f = fixture(false);
    assert.equal((await f.request(method, suffix)).status, status);
    assert.deepEqual(f.calls, ['permission', write]);
  }
});
