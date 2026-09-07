const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const pushNotificationService = require("../services/pushNotificationService");

const router = express.Router();

router.get(
  "/vapid-public-key",
  asyncHandler(async (_req, res) => {
    res.json(pushNotificationService.getPublicKeyResponse());
  })
);

module.exports = router;
