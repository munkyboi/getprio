const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { authenticate } = require("../src/middleware/auth");
const asyncHandler = require("../src/middleware/asyncHandler");
const repository = require("./pushRegistrationRepository");

const router = express.Router();
const mobilePushLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown"),
  message: { message: "Too many mobile push requests. Please try again later." }
});
router.use(mobilePushLimiter);
router.use(authenticate);

function requiredText(value, label, maxLength = 200) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) {
    const error = new Error(`${label} is required.`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function normalizePlatform(value) {
  const platform = String(value || "").trim().toLowerCase();
  if (!["ios", "android"].includes(platform)) {
    const error = new Error("platform must be ios or android.");
    error.statusCode = 400;
    throw error;
  }
  return platform;
}

router.put(
  "/registrations/:installationId",
  asyncHandler(async (req, res) => {
    const installationId = requiredText(req.params.installationId, "installationId", 128);
    const token = requiredText(req.body?.token, "token", 4096);
    const platform = normalizePlatform(req.body?.platform);
    const registration = await repository.upsert({
      userId: req.user._id,
      installationId,
      token,
      platform,
      appVersion: String(req.body?.appVersion || "").trim().slice(0, 64),
      locale: String(req.body?.locale || "").trim().slice(0, 32)
    });
    res.json({ registration });
  })
);

router.delete(
  "/registrations/:installationId",
  asyncHandler(async (req, res) => {
    const installationId = requiredText(req.params.installationId, "installationId", 128);
    const registration = await repository.deactivateForUser(req.user._id, installationId);
    res.json({ registration, deactivated: Boolean(registration) });
  })
);

module.exports = router;
