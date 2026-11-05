const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

function middleware(repository) {
  return loadModuleWithMocks(require.resolve('../src/middleware/idempotency'), {
    '../services/idempotencyService': { claim: async () => ({ state: 'claimed', record: { id: '9007199254740993' } }) },
    '../repositories/idempotency': repository
  }).requireIdempotency;
}

test('retryable response waits for claim release and actual error handling does not complete on release failure', async () => {
  let rejectRelease;
  const pending = new Promise((_, reject) => { rejectRelease = reject; });
  const sent = []; let completed = 0, failure;
  const factory = middleware({ releasePending: async id => { assert.equal(id, '9007199254740993'); await pending; }, complete: async () => { completed++; } });
  const req = { user: { _id: '1' }, get: () => 'retry-key-1' };
  const res = { statusCode: 409, status(code) { this.statusCode = code; return this; }, json(body) { sent.push({ status: this.statusCode, body }); } };
  await factory('suspend', { retryableErrorCodes: ['SUBSCRIPTION_BUSY'] })(req, res, error => { if (error) { failure = error; require('../src/middleware/errorHandler')(error, req, res, () => {}); } });
  res.json({ code: 'SUBSCRIPTION_BUSY' });
  assert.equal(sent.length, 0); assert.equal(completed, 0);
  rejectRelease(new Error('release unavailable')); await tick();
  assert.match(failure.message, /release unavailable/); assert.deepEqual(sent, [{ status: 500, body: { message: 'release unavailable' } }]); assert.equal(completed, 0);
});

for (const scenario of [
  { name: 'default route', options: {}, status: 409, code: 'SUBSCRIPTION_BUSY' },
  { name: 'unlisted error', options: { retryableErrorCodes: ['SUBSCRIPTION_BUSY'] }, status: 409, code: 'TRANSACTION_PREVIEW_STALE' },
  { name: 'success response', options: { retryableErrorCodes: ['SUBSCRIPTION_BUSY'] }, status: 200, code: 'SUBSCRIPTION_BUSY' }
]) {
  test(`${scenario.name} retains existing completion behavior`, async () => {
    let completed = 0, sent = 0;
    const factory = middleware({ releasePending: async () => assert.fail('unexpected release'), complete: async () => { completed++; } });
    const res = { statusCode: scenario.status, json: () => { sent++; } };
    await factory('suspend', scenario.options)({ user: { _id: '1' }, get: () => 'retry-key-1' }, res, error => { if (error) throw error; });
    res.json({ code: scenario.code }); await tick();
    assert.equal(completed, 1); assert.equal(sent, 1);
  });
}

test('release only deletes the exact pending claim and retains completed replay records', async () => {
  const repository = require('../src/repositories/idempotency');
  await repository.releasePending('9007199254740993', { client: { query: async (sql, values) => {
    assert.match(sql, /DELETE FROM idempotency_records WHERE id = \$1 AND status = 'pending'/);
    assert.deepEqual(values, ['9007199254740993']);
  } } });
});
