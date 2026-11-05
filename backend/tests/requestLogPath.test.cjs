const test = require('node:test');
const assert = require('node:assert/strict');
const { requestLogPath } = require('../src/middleware/requestLogPath');
test('resource HTTP logs omit private selectors/searches, including legacy and versioned requests', () => {
  for (const prefix of ['/api/platform','/api/v1/platform','/platform','/API/V1/PLATFORM']) {
    for (const suffix of ['/report','/scopes','/report/']) {
      const path = `${prefix}/resource-inventory${suffix}`;
      assert.equal(requestLogPath(`${path}?q=Private%20branch&tenantId=1&locationId=10&windowFrom=private-time`), path);
    }
  }
  assert.equal(requestLogPath('/api/platform/tenants?q=business'), '/api/platform/tenants?q=business');
  assert.equal(requestLogPath('/api/platform/resource-inventory-other?q=test'), '/api/platform/resource-inventory-other?q=test');
});

test('private local image capability queries are omitted from HTTP logs', () => {
  assert.equal(
    requestLogPath('/api/local-image-assets/application-private/abc?expires=1&signature=secret&readerId=12'),
    '/api/local-image-assets/application-private/abc'
  );
});
