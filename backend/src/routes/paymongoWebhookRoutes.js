const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const billingService = require("../services/billingService");

const router = express.Router();

router.post(
  "/paymongo",
  express.raw({ type: "application/json" }),
  asyncHandler(async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body || {}));
    const result = await billingService.handlePayMongoWebhook(
      rawBody,
      req.headers["paymongo-signature"]
    );

    res.json({
      received: true,
      result
    });
  })
);

module.exports = router;
