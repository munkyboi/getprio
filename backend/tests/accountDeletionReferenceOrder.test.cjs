const test = require('node:test');
const assert = require('node:assert/strict');
const { compareReferenceIds } = require('../src/services/accountDeletionReferenceOrder');
test('opaque reference IDs preserve code-unit, not numeric or locale ordering', () => {
  const ids = ['f000', 'a123', '9000', 'A123', '10', '2', 'a123'];
  assert.deepEqual([...ids].sort(compareReferenceIds), ['10', '2', '9000', 'A123', 'a123', 'a123', 'f000']);
  assert.equal(compareReferenceIds('a123', 'a123'), 0);
  assert.equal(compareReferenceIds('a123', 'f000'), -1);
  assert.equal(compareReferenceIds('f000', 'a123'), 1);
});
