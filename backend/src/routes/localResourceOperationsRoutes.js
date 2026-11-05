const express = require('express');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../config/db');
const { localPoolDemoConfiguration } = require('../services/localPoolDemoScope');
const { createLocalResourceOperationsReader } = require('../services/localResourceOperationsService');
const router = express.Router();
const read = createLocalResourceOperationsReader({ pool: db.pool });

router.get('/tenant/:tenantSlug/locations/:locationSlug/resource-operations', (req, res, next) => {
  if (!localPoolDemoConfiguration() || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
    res.status(404).json({ message: 'Local resource demo not found.' });
    return;
  }
  next();
}, authenticate, asyncHandler(async (req, res) => {
  const snapshot = await read({ tenantSlug: req.params.tenantSlug, locationSlug: req.params.locationSlug, actorUserId: req.user._id });
  res.set('Cache-Control', 'no-store').json(snapshot);
}));
module.exports = router;
