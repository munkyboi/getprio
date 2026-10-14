const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const permissions = require('../src/services/permissions');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');

async function usageServer(t, options = {}) {
  const calls = [];
  const mocks = {
    '../middleware/auth': {
      authenticate: (req, res, next) => {
        if (!req.get('x-test-role')) return res.sendStatus(401);
        req.user = { tenantMemberships: [{ tenantId: '5', role: req.get('x-test-role'), isActive: req.get('x-test-active') !== 'false' }] };
        next();
      },
      userHasTenantAccess: (user, id) => Boolean(permissions.getTenantRole(user, id)),
      assertTenantPermission: (user, id, permission) => permissions.assertPermission(user, permission, { tenantId: id })
    },
    '../repositories/tenants': { findTenantBySlug: async slug => slug === 'pickle' ? { _id: '5', slug, contactEmail: 'private@example.invalid' } : slug === 'other' ? { _id: '6', slug } : null },
    '../config/releaseControls': { ...require('../src/config/releaseControls'), vendorCapacityExperience: false },
    '../services/usageCreditService': { getTenantUsage: async id => {
      calls.push(id);
      if (options.fail) throw Object.assign(new Error('Usage unavailable'), { statusCode: 503 });
      return { usageAvailable: true, period: { start: '2026-10-11T16:31:21.376Z', end: '2026-11-11T16:31:21.376Z' }, resources: { queueTickets: { used: 18, limit: 5000 } } };
    } }
  };
  const router = loadModuleWithMocks(require.resolve('../src/routes/billingRoutes'), mocks);
  const app = express();
  app.use('/billing', router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { calls, request: (slug, role, active = true, endpoint = 'usage') => fetch(`http://127.0.0.1:${server.address().port}/billing/tenant/${slug}/${endpoint}`, { headers: { ...(role ? { 'x-test-role': role } : {}), 'x-test-active': String(active) } }) };
}

test('monthly usage read remains available to existing report roles with the capacity experience disabled', async t => {
  const { request, calls } = await usageServer(t);
  for (const role of ['owner', 'admin', 'staff']) {
    const res = await request('PICKLE', role);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.tenant, { id: '5', slug: 'pickle' });
    assert.equal(body.usage.resources.queueTickets.used, 18);
    assert.equal(body.usage.period.end, '2026-11-11T16:31:21.376Z');
  }
  assert.deepEqual(calls, ['5', '5', '5']);
  assert.equal((await request('pickle', 'owner', true, 'capacity')).status, 404);
});

test('usage rejects anonymous, inactive, cross-tenant and unpermitted readers before reading usage', async t => {
  const { request, calls } = await usageServer(t);
  for (const [slug, role, active, status] of [['pickle', null, true, 401], ['pickle', 'owner', false, 403], ['other', 'owner', true, 403], ['pickle', 'customer', true, 403], ['missing', 'owner', true, 404]]) {
    assert.equal((await request(slug, role, active)).status, status);
  }
  assert.deepEqual(calls, []);
});

test('failed usage reads return the error instead of fabricated zero counters', async t => {
  const { request } = await usageServer(t, { fail: true });
  const res = await request('pickle', 'owner');
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { message: 'Usage unavailable' });
});
