require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const Module = require('node:module');

function extractFunction(file, name, context) {
  const source = fs.readFileSync(path.join(__dirname, '../src/vendor', file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(declaration, `${name} should exist`);
  context.exports = {};
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(`exports.run=${declaration.getText(ast)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports.run;
}

function extractFormSubmit(context) {
  const source = fs.readFileSync(path.join(__dirname, '../src/vendor/NamedQueuePlanDialog.tsx'), 'utf8');
  const ast = ts.createSourceFile('NamedQueuePlanDialog.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.text === 'onSubmit' && node.initializer?.expression) handler = node.initializer.expression;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(handler, 'named queue form submit handler should exist');
  context.exports = {};
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(`exports.run=${handler.getText(ast)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports.run;
}

test('table Call emits selected request intent with counter and exact revisions', async () => {
  const commands = [];
  const planAction = extractFunction('NamedQueuePanel.tsx', 'planAction', {
    crypto,
    counterSlug: 'front-desk',
    setProtectionReason() {}, setError() {}, setProtection() {}, open() {},
    revisions: plan => ({ expectedTicketRevision: plan.ticketRevision, expectedPlanRevision: plan.planRevision, currentStageId: plan.currentStage.id, expectedStageRevision: plan.currentStage.revision }),
    send(command) { commands.push(command); },
    completionReview: { current: null },
  });
  const plan = { id: 'plan-later', ticketRevision: 'ticket-9', planRevision: 'plan-4', currentStage: { id: 'stage-2', revision: 'stage-7', attemptId: 'attempt-1' }, reservationGroups: [] };
  planAction(plan, 'call');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(commands.length, 1);
  assert.equal(commands[0].id, 'plan-later');
  assert.equal(commands[0].action, 'call');
  assert.equal(commands[0].body.dispatchMode, 'selectedRequest');
  assert.equal(commands[0].body.counterSlug, 'front-desk');
  assert.deepEqual({ ...commands[0].body }, { expectedTicketRevision: 'ticket-9', expectedPlanRevision: 'plan-4', currentStageId: 'stage-2', expectedStageRevision: 'stage-7', counterSlug: 'front-desk', dispatchMode: 'selectedRequest' });
  assert.match(commands[0].key, /^[0-9a-f-]{36}$/);
});

const NamedQueuePlanDialog = (() => {
  const load = Module._load;
  Module._load = function (id, parent, ...rest) {
    if (id === './TaskDialog' && parent?.filename.endsWith('NamedQueuePlanDialog.tsx')) return { TaskDialog: ({ children, bodyOverlay, footer }) => React.createElement('section', null, bodyOverlay, children, footer), QueueConfirmation: () => null };
    return load.call(this, id, parent, ...rest);
  };
  const component = require('../src/vendor/NamedQueuePlanDialog.tsx').NamedQueuePlanDialog;
  Module._load = load;
  return component;
})();
const { VendorToastProvider } = require('../src/vendor/VendorToasts.tsx');
const { requestDurationFit } = require('../src/vendor/requestDurationFit.ts');

function optionsFor(now) {
  const observedAt = new Date(now).toISOString();
  return { contractVersion: 4, catalogRevision: 'catalog-4', observedAt, workflow: { mode: 'linear', stages: [] }, capabilities: { publication: true, childOutcomes: true, automaticNamedMemberSelection: false }, quote: { status: 'unavailable' }, clientRequestStartedAt: performance.now(), serviceHoursWindow: { status: 'open', provisional: true, observedAt, timezone: 'Asia/Manila', opensAt: new Date(now - 60 * 60000).toISOString(), closesAt: new Date(now + 75 * 60000).toISOString(), remainingWholeMinutes: 75 }, services: [{ id: 'court-service', name: 'Court', labels: { resources: 'Courts', duration: 'Duration' }, resourceReady: true, assignmentPolicy: { mode: 'named' }, durationPolicy: { revision: 'duration-1', mode: 'adjustable', visible: true, baseMinutes: 60, minCount: 1, maxCount: 8, stepCount: 1, defaultCount: 1 }, resourceMembers: [{ id: 'court-1', name: 'Court 1', isActive: true, archivedAt: null, availability: { state: 'provisional_free' } }], extras: [] }] };
}
function selection(count) {
  return [{ serviceSelectionId: 'selection-1', serviceId: 'court-service', courts: [{ courtSelectionId: 'court-selection-1', resourceMemberId: 'court-1', resourceQuantity: '1', durationMinutes: '', durationCount: String(count), durationPolicyRevision: 'duration-1', durationBaseMinutes: 60, extras: [] }] }];
}
function renderAmend(count, options, startedAt) {
  return renderToStaticMarkup(React.createElement(VendorToastProvider, null, React.createElement(NamedQueuePlanDialog, { initial: { customerName: 'Customer', customerEmail: '', customerPhone: '', notes: '', catalogRevision: 'catalog-4', selections: selection(count) }, ticketNumber: 'VD-LATER', options: [], v4Options: options, resourceCatalog: [], catalogRevision: 'catalog-4', mode: 'amend', busy: false, uncertain: false, error: '', publishAvailable: false, hoursRequestStartedAt: startedAt, onClose() {}, onSave: async () => {}, onPublish: async () => {}, onAmend: async () => {}, onRetry: async () => {}, onRefreshPolicies() {} })));
}

test('published amend renders the live 75 minute bound and notice without changing selection state', () => {
  const now = Date.now();
  const initial = selection(2);
  const html = renderToStaticMarkup(React.createElement(VendorToastProvider, null, React.createElement(NamedQueuePlanDialog, { initial: { customerName: 'Customer', customerEmail: '', customerPhone: '', notes: '', catalogRevision: 'catalog-4', selections: initial }, ticketNumber: 'VD-LATER', options: [], v4Options: optionsFor(now), resourceCatalog: [], catalogRevision: 'catalog-4', mode: 'amend', busy: false, uncertain: false, error: '', publishAvailable: false, hoursRequestStartedAt: performance.now(), onClose() {}, onSave: async () => {}, onPublish: async () => {}, onAmend: async () => {}, onRetry: async () => {}, onRefreshPolicies() {} })));
  assert.match(html, /There isn&#x27;t enough time before closing/);
  assert.match(html, /Duration count/);
  assert.match(html, /max="1"/);
  assert.doesNotMatch(html, /max="8"/);
  assert.deepEqual(initial, selection(2));
});

async function submitAmend(count) {
  const options = optionsFor(Date.now());
  const draft = { customerName: 'Customer', selections: selection(count) };
  const fit = requestDurationFit(draft.selections, options, 1, 2);
  const result = { failed: [], amendments: [] };
  const submit = extractFormSubmit({
    busy: false, uncertain: false, step: 'review', advanceStep() {}, setValidation() {}, setInvalidStep() {}, mode: 'amend', publishAvailable: false,
    onSave: async () => {}, hoursIssue: fit.message, hoursFit: fit, v4Options: options, draft,
    fail(message, step) { result.failed.push({ message, step }); }, selectionIssuesV4: () => [], namedSelectionScheduleIssues: () => [], reason: 'hours test', reduction: false, agreement: true,
    onAmend: async (...args) => result.amendments.push(args), onPublish: async () => {},
  });
  await submit({ preventDefault() {} });
  return { result, draft };
}

test('published amend blocks the 120 minute selection and submits the fitting 60 minute selection', async () => {
  const invalid = await submitAmend(2);
  assert.equal(invalid.result.amendments.length, 0);
  assert.equal(invalid.result.failed.length, 1);
  assert.match(invalid.result.failed[0].message, /not enough time|shorter duration/i);
  assert.deepEqual(invalid.draft.selections, selection(2));
  const fitting = await submitAmend(1);
  assert.equal(fitting.result.failed.length, 0);
  assert.equal(fitting.result.amendments.length, 1);
  assert.deepEqual(fitting.result.amendments[0][0].selections, selection(1));
  assert.deepEqual(fitting.draft.selections, selection(1));
});
