const test = require('node:test');
const assert = require('node:assert/strict');
const { QueryClient, QueryObserver } = require('@tanstack/react-query');
const { createDirtyForms } = require('../src/vendor/dirtyForms.js');
const { activeMemberships, rememberedTenantWorkspace, preferenceKey, workspacePath } = require('../src/vendor/workspace.js');

test('saving one form keeps another form dirty; discarded modal forms do not warn', () => {
  const edits = createDirtyForms();
  const profile = { isConnected: true };
  const service = { isConnected: true };
  edits.mark(profile); edits.mark(service);
  edits.clear(service);
  assert.equal(edits.hasEdits(), true);
  edits.clear(profile);
  assert.equal(edits.hasEdits(), false);
  edits.mark(service);
  service.isConnected = false;
  assert.equal(edits.hasEdits(), false);
  service.isConnected = true;
  assert.equal(edits.hasEdits(), false, 'reopening a discarded form starts clean');
});

test('failed saves retain edits until explicit discard', () => {
  const edits = createDirtyForms();
  edits.mark({ isConnected: true });
  assert.equal(edits.hasEdits(), true);
  edits.clear();
  assert.equal(edits.hasEdits(), false);
});

test('inactive memberships cannot supply a picker option, initial business or role', () => {
  const disabled = { slug: 'disabled', role: 'owner', isActive: false };
  const enabled = { slug: 'enabled', role: 'staff', isActive: true };
  const legacy = { slug: 'legacy', role: 'admin' };
  const active = activeMemberships([disabled, enabled, legacy]);
  assert.deepEqual(active, [enabled, legacy]);
  assert.equal(active.find(tenant => tenant.slug === disabled.slug), undefined);
  assert.deepEqual(activeMemberships([disabled]), []);
});

test('business switch restores target preference without copying the previous workspace', () => {
  const values = new Map([[preferenceKey('user', 'a'), 'operations'], [preferenceKey('user', 'b'), 'administration']]);
  const storage = { getItem: key => values.get(key) };
  const target = { slug: 'b', role: 'owner' };
  const workspace = rememberedTenantWorkspace('user', target, storage);
  const url = new URL(workspacePath('settings', workspace, '?next=%2Fdashboard%2Fqueue'), 'https://local.test');
  assert.equal(url.searchParams.get('workspace'), 'administration');
  assert.equal(values.get(preferenceKey('user', 'b')), 'administration');
  assert.equal(rememberedTenantWorkspace('user', { ...target, role: 'staff' }, storage), 'operations');
  assert.equal(rememberedTenantWorkspace('other-user', target, storage), 'operations');
});

for (const resource of ['counters', 'staff', 'services', 'availability']) {
  test(`${resource} query observer cannot receive a late previous-business result`, async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let finishOld;
    const old = new Promise(resolve => { finishOld = resolve; });
    const observer = new QueryObserver(client, { queryKey: [resource, 'a', 'location'], queryFn: () => old });
    const results = [];
    const unsubscribe = observer.subscribe(result => { if (result.data) results.push(result.data); });
    observer.setOptions({ queryKey: [resource, 'b', 'location'], queryFn: async () => ['business-b'] });
    await client.fetchQuery({ queryKey: [resource, 'b', 'location'] });
    finishOld(['business-a']);
    await client.fetchQuery({ queryKey: [resource, 'a', 'location'] });
    assert.deepEqual(observer.getCurrentResult().data, ['business-b']);
    assert.equal(results.some(data => data[0] === 'business-a'), false);
    unsubscribe(); client.clear();
  });
}

test('context Retry re-establishes locations through bootstrap, alongside snapshot refresh', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const ts = require('typescript');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/pages/VendorDashboardPage.tsx'), 'utf8');
  const start = source.indexOf('  async function retryDashboardContext()');
  const end = source.indexOf('  async function reloadDashboardSnapshot()', start);
  const script = ts.transpileModule(source.slice(start, end) + '\nretryDashboardContext;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let selectedLocation = '';
  let error = 'Locations request failed';
  let snapshotRefreshed = false;
  const retry = vm.runInNewContext(script, {
    setError: value => { error = value; },
    dashboardBootstrapQuery: { refetch: async () => { selectedLocation = 'primary'; } },
    queueLifecycleSnapshotQuery: { refetch: async () => { snapshotRefreshed = true; } }
  });
  await retry();
  assert.equal(selectedLocation, 'primary');
  assert.equal(snapshotRefreshed, true);
  assert.equal(error, '');
});
