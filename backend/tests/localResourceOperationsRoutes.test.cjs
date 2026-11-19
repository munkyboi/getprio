const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');

test('local operations reads are limited and retain authentication', async () => {
  let authenticated = 0;
  const router = loadModuleWithMocks(require.resolve('../src/routes/localResourceOperationsRoutes'), {
    '../middleware/auth': { authenticate: (req, _res, next) => { authenticated++; req.user = { _id: '1' }; next(); } },
    '../config/db': { pool: {} },
    '../services/localPoolDemoScope': { localPoolDemoConfiguration: () => ({}) },
    '../services/localResourceOperationsService': { createLocalResourceOperationsReader: () => async () => ({ ok: true }) },
  });
  const app = express(); app.use(router);
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/tenant/demo/locations/main/resource-operations`;
    for (let i = 0; i < 300; i++) assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url)).status, 429);
    assert.equal(authenticated, 300);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
