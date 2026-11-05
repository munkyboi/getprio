const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');

const files = ['repositories/queueCommandReceipt.js', 'repositories/queuePlanDrafts.js',
  'services/queuePlanCommandService.js', 'services/queueWorkflowService.js'];
const payload = {'é': {Z: 1, a: 2}, '😀': 3, '\uE000': 4, z: [{b: 2, A: 1}], A: 0, _: 5};
const golden = '{"A":0,"_":5,"z":[{"A":1,"b":2}],"é":{"Z":1,"a":2},"😀":3,"":4}';
for (const file of files) test(`canonical command bytes retain UTF-16 ordering: ${file}`, () => {
  const filename = path.join(__dirname, '../src', file);
  const sandbox = {module: {exports: {}}, require: name => name.startsWith('node:') ? require(name) : {}};
  // Inspect the actual private canonicalizer without expanding its production API.
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.canonicalForTest=canonical;', sandbox, {filename});
  const canonical = sandbox.module.exports.canonicalForTest;
  assert.equal(JSON.stringify(canonical(payload)), golden);
  assert.equal(createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex'),
    'a4a0f2c5767e30e953491ca8f29fda12331481531ab093b6308b5af2be6f0d97');
  assert.equal(JSON.stringify(canonical(Object.fromEntries(Object.entries(payload).reverse()))), golden);
});

test('availability compares named member sets with deterministic UUID ordering', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/queueNamedAvailabilityService.js'), 'utf8');
  const callbacks = [...source.matchAll(/\.sort\((\(left, right\) => left < right \? -1 : Number\(left > right\))\)/g)];
  assert.equal(callbacks.length, 2);
  const ids = ['ffffffff-ffff-ffff-ffff-ffffffffffff', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002'];
  const expected = [ids[2], ids[1], ids[0]];
  for (const callback of callbacks) assert.deepEqual([...ids].sort(vm.runInNewContext(callback[1])), expected);
});

test('existing canonical receipt hash replays reordered keys and rejects changed payload', async () => {
  const receipt = require('../src/repositories/queueCommandReceipt');
  const saved = {accepted: true};
  const client = {query: async () => ({rows: [{payload_hash: '0a45e30e7e2b31fc62797f6bc087320cddeef4ce06585d49d5c7c9be36075988', result: saved}]})};
  const scope = {tenantId:'1',locationId:'10',actorUserId:'1'};
  const command = {operationKey:'existing-receipt',action:'test',target:'10',payload};
  const mutate = () => assert.fail('a matching existing receipt must not mutate');
  assert.deepEqual(await receipt.execute(client,scope,command,mutate),saved);
  assert.deepEqual(await receipt.execute(client,scope,{...command,payload:Object.fromEntries(Object.entries(payload).reverse())},mutate),saved);
  await assert.rejects(receipt.execute(client,scope,{...command,payload:{...payload,A:1}},mutate),{code:'IDEMPOTENCY_CONFLICT'});
});
