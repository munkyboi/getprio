const { test } = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const path = require('node:path');
const source = path.join(__dirname, '../src/auth/universalAuthPolicy.ts');
const bundle = esbuild.buildSync({ entryPoints: [source], bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = { exports: {} }; new Function('module', 'exports', bundle.outputFiles[0].text)(mod, mod.exports);
const { UNIVERSAL_AUTH_ENABLED, safeNext, canEnter } = mod.exports;
test('candidate is disabled and destination stays within the selected surface', () => {
  assert.equal(UNIVERSAL_AUTH_ENABLED, false);
  for (const bad of ['//evil.test', '/%2f%2fevil.test', '/account/%2e%2e/dashboard', 'https://evil.test', '/dashboard']) assert.equal(safeNext(bad, 'customer'), '/account');
  assert.equal(safeNext('/account/tickets?from=join#top', 'customer'), '/account/tickets?from=join#top');
  assert.equal(safeNext('/dashboard/queue', 'vendor'), '/dashboard/queue');
  assert.equal(canEnter('vendor', { user: { tenants: [] } }), false);
  assert.equal(canEnter('vendor', { user: { tenants: [{ isActive: true }] } }), true);
});
