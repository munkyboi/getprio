const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requirePlatformPermission } = require('../middleware/auth');
const service = require('../services/platformMaintenanceService');
const router = express.Router();
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.get('/', requirePlatformPermission('platform.tenants.read'), asyncHandler(async (req, res) => res.json(await service.read(req.user))));
router.get('/operations/:key', requirePlatformPermission('platform.settings.manage'), asyncHandler(async (req, res) => res.json(await service.operationStatus(req.user, req.params.key))));
router.post('/preview', requirePlatformPermission('platform.settings.manage'), asyncHandler(async (req, res) => {
  res.json(await service.preview({ user: req.user, session: req.auth.session, draft: req.body?.policy, reason: req.body?.reason }));
}));
router.post('/policy', requirePlatformPermission('platform.settings.manage'), asyncHandler(async (req, res) => {
  res.json(await service.update({ user: req.user, session: req.auth.session, draft: req.body?.policy,
    reason: req.body?.reason, expectedRevision: req.body?.expectedRevision,
    confirmationToken: req.get('x-transaction-confirmation'), operationKey: req.get('idempotency-key') }));
}));
module.exports = router;
