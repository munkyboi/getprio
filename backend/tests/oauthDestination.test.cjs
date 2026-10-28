const test = require('node:test'), assert = require('node:assert/strict');
const { resolveOAuthDestination } = require('../src/services/oauthDestination');
test('Vendor requested next never overrides membership guard; active membership retains safe next', () => {
  for (const tenantMemberships of [[], [{ isActive: false }]]) {
    for (const intent of ['login', 'register_vendor']) {
      assert.equal(resolveOAuthDestination({ surface: 'vendor', intent, provider: 'google', user: { tenantMemberships }, next: '/dashboard' }), '/register/vendor?oauth=google');
    }
  }
  const user = { tenantMemberships: [{ isActive: false }, { isActive: true }] };
  assert.equal(resolveOAuthDestination({ surface: 'vendor', provider: 'google', user, next: '/dashboard/queue?boardPairing=ABC#today' }), '/dashboard/queue?boardPairing=ABC#today');
  assert.equal(resolveOAuthDestination({ surface: 'vendor', provider: 'google', user, next: '//evil.example' }), '/dashboard');
});
test('Customer and legacy OAuth keep their destinations without using inactive memberships', () => {
  const user = { tenantMemberships: [{ isActive: false }] };
  assert.equal(resolveOAuthDestination({ surface: 'customer', provider: 'google', user, next: '/dashboard' }), '/account/dashboard');
  assert.equal(resolveOAuthDestination({ intent: 'login', provider: 'google', user }), '/');
  assert.equal(resolveOAuthDestination({ intent: 'register_vendor', provider: 'google', user }), '/register/vendor?oauth=google');
});
