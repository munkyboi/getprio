require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { selectionInputV4, selectionIssuesV4 } = require('../src/vendor/QueueSelectionFieldsV4.tsx');
const { removedNamedSelections } = require('../src/vendor/namedQueueSelectionDraft.ts');

// Exercise the actual form callback without mounting portals or touching a server.
const source = ts.createSourceFile('NamedQueuePlanDialog.tsx', fs.readFileSync(path.join(__dirname, '../src/vendor/NamedQueuePlanDialog.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'updateDurationCount') callback = node.initializer;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(callback, 'duration control callback exists');
const executable = ts.transpileModule('const update = ' + callback.getText(source) + '; update(next);', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function change(draft, next) {
  const state = { draft, next: String(next), agreement: true, validation: 'Previous validation' };
  state.setDraft = value => { state.result = value; };
  state.setAgreement = value => { state.agreement = value; };
  state.setValidation = value => { state.validation = value; };
  vm.runInNewContext(executable, state);
  return state;
}
const policy = { revision: 'duration-1', mode: 'adjustable', visible: true, baseMinutes: 30, minCount: 1, maxCount: 6, stepCount: 1, defaultCount: 1 };
const extra = (id, serviceId, count) => ({ extraSelectionId: id, serviceId, resourceMemberIds: [id + '-member'], quantity: '1', durationMinutes: '', durationCount: count, durationPolicyRevision: policy.revision, durationBaseMinutes: 30 });
function fixture() {
  return { customerName: 'Local fixture', notes: 'Keep notes', catalogRevision: 'accepted-catalog', selections: [{ serviceSelectionId: 'service-row', serviceId: 'court', courts: [{ courtSelectionId: 'court-row', resourceMemberId: 'court-member', resourceQuantity: '1', durationMinutes: '', durationCount: '2', durationPolicyRevision: policy.revision, durationBaseMinutes: 30, extras: [extra('required-id', 'required', '1'), extra('optional-id', 'optional', '2')] }] }] };
}
const choice = (id, requirement) => ({ serviceId: id, name: id, configured: true, resourceReady: true, selectionRequirement: requirement, quantityMin: 1, quantityMax: 1, assignmentPolicy: { mode: 'named' }, resourceMembers: [{ id: id + '-id-member', name: id, isActive: true }], durationPolicy: policy });
const options = { capabilities: { namedExtraMembers: true }, services: [{ id: 'court', durationPolicy: policy, quantityMin: 1, quantityMax: 1, assignmentPolicy: { mode: 'named' }, resourceMembers: [{ id: 'court-member', isActive: true }], extras: [choice('required', 'required'), choice('optional', 'optional')] }] };

test('duration increase and decrease retain required and optional extra lineage and reset review', () => {
  const before = fixture();
  for (const count of [3, 1]) {
    const state = change(before, count), resource = state.result.selections[0].courts[0];
    assert.equal(resource.durationCount, String(count));
    assert.deepEqual(resource.extras, before.selections[0].courts[0].extras);
    assert.equal(resource.courtSelectionId, 'court-row');
    assert.equal(resource.resourceMemberId, 'court-member');
    assert.equal(state.result.notes, 'Keep notes');
    assert.equal(state.result.catalogRevision, null);
    assert.equal(state.agreement, false);
    assert.equal(state.validation, '');
    assert.deepEqual(removedNamedSelections(before.selections, state.result.selections), []);
  }
  assert.equal(before.selections[0].courts[0].durationCount, '2');
});

test('retained extras serialize with stable IDs; shorter parent is blocked rather than deleting children', () => {
  const state = change(fixture(), 1);
  const payload = selectionInputV4(state.result.selections);
  assert.deepEqual(payload[0].resources[0].extras.map(item => item.extraSelectionId), ['required-id', 'optional-id']);
  assert.deepEqual(payload[0].resources[0].extras[1].resourceMemberIds, ['optional-id-member']);
  assert.equal(payload[0].resources[0].extras[1].durationCount, 2);
  assert.ok(selectionIssuesV4(state.result.selections, options).includes('An extra cannot outlast its parent resource.'));
  const reopened = JSON.parse(JSON.stringify(state.result));
  assert.deepEqual(selectionInputV4(reopened.selections), payload);
  reopened.selections[0].courts[0].extras = reopened.selections[0].courts[0].extras.filter(item => item.extraSelectionId !== 'optional-id');
  assert.deepEqual(removedNamedSelections(state.result.selections, reopened.selections), ['optional-id']);
  reopened.selections[0].courts[0].extras = [];
  assert.ok(selectionIssuesV4(reopened.selections, options).includes('Add required extra required.'));
});

test('resource-only requests retain invalid typed counts for review without deleting children', () => {
  const draft = fixture(); draft.selections[0].courts[0].extras = [];
  for (const [next, expected] of [[0, '0'], [99, '99'], ['1.5', '1.5'], ['', '']]) {
    const result = change(draft, next).result;
    assert.equal(result.selections[0].courts[0].durationCount, expected);
    assert.deepEqual(result.selections[0].courts[0].extras, []);
    assert.ok(selectionIssuesV4(result.selections, options).includes('Review the resource duration count and policy.'));
  }
});
