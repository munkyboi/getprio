const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

function load({ saved = null, systemDark = false, unavailable = false } = {}) {
  const store = new Map(saved === null ? [] : [['getprio.public.auth.theme', saved]]);
  const { outputFiles } = buildSync({ entryPoints: [path.resolve(__dirname, '../src/pages/publicAuthTheme.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' });
  const module = { exports: {} };
  vm.runInNewContext(outputFiles[0].text, { module, exports: module.exports, window: {
    localStorage: {
      getItem(key) { if (unavailable) throw Error('Storage blocked'); return store.get(key) ?? null; },
      setItem(key, value) { if (unavailable) throw Error('Storage blocked'); store.set(key, value); }
    },
    matchMedia: () => ({ matches: systemDark })
  } });
  return { ...module.exports, store };
}

test('explicit public preference takes priority over system theme', () => {
  assert.equal(load({ saved: 'dark' }).readPublicAuthTheme(), 'dark');
  assert.equal(load({ saved: 'light', systemDark: true }).readPublicAuthTheme(), 'light');
});
test('missing or invalid public preference follows system theme', () => {
  assert.equal(load({ systemDark: true }).readPublicAuthTheme(), 'dark');
  assert.equal(load().readPublicAuthTheme(), 'light');
  assert.equal(load({ saved: 'invalid', systemDark: true }).readPublicAuthTheme(), 'dark');
});
test('chosen theme survives repeated reads and saves only the public namespace', () => {
  const theme = load();
  theme.savePublicAuthTheme('dark');
  assert.equal(theme.readPublicAuthTheme(), 'dark');
  assert.equal(theme.readPublicAuthTheme(), 'dark');
  theme.savePublicAuthTheme('light');
  assert.equal(theme.readPublicAuthTheme(), 'light');
  assert.deepEqual([...theme.store.keys()], ['getprio.public.auth.theme']);
});
test('blocked optional storage cannot break auth rendering or toggle', () => {
  const theme = load({ unavailable: true, systemDark: true });
  assert.equal(theme.readPublicAuthTheme(), 'dark');
  assert.doesNotThrow(() => theme.savePublicAuthTheme('light'));
});
