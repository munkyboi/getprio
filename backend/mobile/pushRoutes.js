const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { authenticate } = require("../src/middleware/auth");
const asyncHandler = require("../src/middleware/asyncHandler");
const db = require("../src/config/db");
const repository = require("./pushRegistrationRepository");
const developerTestAccounts = require("../src/repositories/developerTestAccounts");
const { isSandboxRequest } = require("../src/services/sandboxTestAccountAccess");

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
    const registrationInput = {
      userId: req.user._id,
      installationId,
      token,
      platform,
      appVersion: String(req.body?.appVersion || "").trim().slice(0, 64),
      locale: String(req.body?.locale || "").trim().slice(0, 32)
    };
    const upsert = async (client) => {
      if (req.user.isSandboxTestAccount && isSandboxRequest(req)) {
        const knownInstallation = await developerTestAccounts.hasActiveDevice(req.user._id, installationId, { client });
        const activeDeviceCount = await developerTestAccounts.countActiveDevices(req.user._id, { client });
        if (!knownInstallation && activeDeviceCount >= 2) {
          const error = new Error("This Sandbox account already has two active devices. Reset the test account from the Developer Portal to remove them.");
          error.statusCode = 409;
          error.code = "SANDBOX_DEVICE_LIMIT_REACHED";
          throw error;
        }
      }
      return repository.upsert(registrationInput, client ? { client } : {});
    };
    const registration = req.user.isSandboxTestAccount && isSandboxRequest(req)
      ? await db.withTransaction(async (client) => {
        await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [Number(req.user._id)]);
        return upsert(client);
      })
      : await upsert();
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
