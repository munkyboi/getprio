const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { authenticate } = require("../src/middleware/auth");
const asyncHandler = require("../src/middleware/asyncHandler");
const tenantRepository = require("../src/repositories/tenants");
const locationRepository = require("../src/repositories/storeLocations");
const mobileTicketLinkService = require("../src/services/mobileTicketLinkService");

const router = express.Router();
const mobileTicketLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown"),
  message: { message: "Too many ticket-link requests. Please try again later." }
});
const PRODUCTION_HOSTS = new Set(["getprio.online"]);
const SANDBOX_HOSTS = new Set(["sandbox.getprio.online"]);

function getEnvironment(req) {
  const hostname = String(req.hostname || req.headers.host || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  if (SANDBOX_HOSTS.has(hostname)) return "sandbox";
  if (PRODUCTION_HOSTS.has(hostname)) return "production";
  return "unknown";
}

function unavailableError() {
  const error = new Error("This ticket link can’t be used. Please request a new link.");
  error.statusCode = 404;
  error.code = "TICKET_LINK_UNAVAILABLE";
  return error;
}

router.use(mobileTicketLinkLimiter);
router.use(authenticate);

router.post(
  "/ticket-links/preview",
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const environment = getEnvironment(req);
    let result;
    try {
      result = await mobileTicketLinkService.previewPrivateLink({
        token: req.body?.token,
        environment
      });
    } catch (error) {
      if (error?.code === "TICKET_LINK_UNAVAILABLE") throw error;
      throw unavailableError();
    }

    let tenant;
    let location;
    try {
      tenant = await tenantRepository.findTenantById(result.ticket.tenantId);
      location = result.ticket.locationId
        ? await locationRepository.findLocationById(result.ticket.locationId)
        : null;
    } catch {
      throw unavailableError();
    }
    if (!tenant || !location) throw unavailableError();

    res.json({
      ticket_number: result.ticket.ticketNumber,
      queue_name: tenant.name,
      location_name: location.name,
      status: result.ticket.status,
      expires_at: new Date(result.link.expiresAt).toISOString()
    });
  })
);

module.exports = router;
