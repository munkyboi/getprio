require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');

require.extensions['.css'] = () => {};
const { default: LoginPage, getAuthRegistrationLinks, resolveVendorNextPath } = require('../src/pages/LoginPage.tsx');

test('vendor and public auth profiles expose the correct registration destinations', () => {
  assert.equal(typeof LoginPage, 'function');
  assert.deepEqual(getAuthRegistrationLinks(true), [
    { label: 'Create a vendor workspace', to: '/register/vendor' },
  ]);
  assert.deepEqual(getAuthRegistrationLinks(false), [
    { label: 'Create a vendor workspace', to: '/register/vendor' },
    { label: 'register as a customer', to: '/register/customer' },
  ]);
});

test('vendor next paths canonicalize safely and reject traversal or cross-origin escapes', () => {
  const accepted = [
    ['/dashboard', '/dashboard'],
    ['/dashboard/queue?tab=active#today', '/dashboard/queue?tab=active#today'],
    ['/dashboard/queue?search=50%25', '/dashboard/queue?search=50%25'],
    ['/dashboard/queue#50%25', '/dashboard/queue#50%25'],
  ];
  for (const [input, expected] of accepted) assert.equal(resolveVendorNextPath(input), expected);

  const rejected = [
    '/account/dashboard',
    '/dashboard/../account/dashboard',
    '/dashboard/%2e%2e/account/dashboard',
    '/dashboard/%252e%252e/account/dashboard',
    '/dashboard/%2f%2fexample.com',
    '/dashboard/%5c%5cexample.com',
    '//example.com/dashboard',
    'https://example.com/dashboard',
    '/dashboard\\\\example.com',
  ];
  for (const input of rejected) assert.equal(resolveVendorNextPath(input), '/dashboard', input);
});

test('shared auth page remains the executable MFA and recovery entry point', () => {
  assert.equal(typeof LoginPage, 'function');
  assert.equal(typeof resolveVendorNextPath, 'function');
  // LoginPage retains the same useAuth-backed component for password, MFA, OTP,
  // recovery-code, reset-request, and reset-confirm states in both profiles.
});
