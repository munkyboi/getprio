require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveLocationEditor, locationEditorPath } = require('../src/vendor/locationEditorRoute.ts');
test('slug routes resolve within authorized business IDs and support legacy IDs', () => {
  const locations = [{id:'2',slug:'review'}, {id:'9',slug:'other-business'}];
  const allowed = new Set(['2']);
  assert.equal(resolveLocationEditor('review',locations,allowed),locations[0]);
  assert.equal(resolveLocationEditor('2',locations,allowed),locations[0]);
  assert.equal(resolveLocationEditor('other-business',locations,allowed),undefined);
  assert.equal(resolveLocationEditor('9',locations,allowed),undefined);
});
test('canonical route retains query scope and stable identity across a server slug change', () => {
  const saved={id:'2',slug:'new-link'};
  assert.equal(resolveLocationEditor('new-link',[saved],new Set(['2'])),saved);
  assert.equal(locationEditorPath(saved.slug,'?workspace=administration&business=club'),'/dashboard/locations/new-link/edit?workspace=administration&business=club');
});
