const express = require("express");
const openApiDocument = require("./developerApiOpenapi");
const asyncHandler = require("../middleware/asyncHandler");
const tenantRepository = require("../repositories/tenants");
const storeLocationRepository = require("../repositories/storeLocations");
const queueService = require("../services/queueService");
const {
  authenticateDeveloperApiKey,
  requireApiScope
} = require("../middleware/developerApiKeyAuth");

const router = express.Router();

const PRODUCTION_HOSTS = new Set(["api.getprio.online"]);
const SANDBOX_HOSTS = new Set(["sandbox-api.getprio.online"]);

function getEnvironment(req) {
  const hostname = String(req.hostname || req.headers.host || "")
    .trim()
    .toLowerCase()
    .split(":")[0];

  if (SANDBOX_HOSTS.has(hostname)) {
    return "sandbox";
  }

  if (PRODUCTION_HOSTS.has(hostname)) {
    return "production";
  }

  return "unknown";
}

function getRequestId(req) {
  return req.context?.correlationId || req.headers["x-request-id"] || "unknown";
}

function sendEnvelope(req, res, data) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-API-Version", "v1");
  res.json({ data, request_id: getRequestId(req) });
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = "API_RESOURCE_NOT_FOUND";
  return error;
}

function redactTicket(ticket) {
  if (!ticket) return null;
  const { customerName: _customerName, customerDisplayName: _customerDisplayName, lookupCode: _lookupCode, ...safeTicket } = ticket;
  return safeTicket;
}

function formatQueueResource(snapshot) {
  return {
    tenant: snapshot.tenant,
    location: snapshot.location,
    queue_day: snapshot.queueDay,
    queue_intake: snapshot.queueIntake,
    stats: snapshot.stats,
    current: redactTicket(snapshot.current),
    next_up: (snapshot.nextUp || []).map(redactTicket),
    overflow: (snapshot.overflow || []).map(redactTicket)
  };
}

function formatLocationResource(location) {
  return {
    id: String(location._id),
    name: location.name,
    slug: location.slug,
    addressLine1: location.addressLine1,
    addressLine2: location.addressLine2,
    city: location.city,
    province: location.province,
    postalCode: location.postalCode,
    country: location.country,
    timezone: location.timezone,
    isPrimary: Boolean(location.isPrimary),
    isActive: Boolean(location.isActive)
  };
}

router.get("/", (req, res) => {
  const environment = getEnvironment(req);
  const baseUrl = environment === "sandbox"
    ? "https://sandbox-api.getprio.online/v1"
    : environment === "production"
      ? "https://api.getprio.online/v1"
      : null;

  sendEnvelope(req, res, {
    service: "getprio-queue-api",
    version: "v1",
    environment,
    base_url: baseUrl,
    documentation_url: "https://developers.getprio.online"
  });
});

router.get("/health", (req, res) => {
  sendEnvelope(req, res, {
    status: "ok",
    service: "getprio-queue-api",
    version: "v1",
    environment: getEnvironment(req)
  });
});

router.get("/openapi.json", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.type("application/json").json(openApiDocument);
});

router.get(
  "/queues/:tenantSlug/locations",
  authenticateDeveloperApiKey,
  requireApiScope("queues:read"),
  asyncHandler(async (req, res) => {
    const tenant = await tenantRepository.findTenantBySlug(
      String(req.params.tenantSlug).toLowerCase(),
      { activeOnly: true }
    );
    if (!tenant) throw notFound("Queue not found.");
    const locations = await storeLocationRepository.listLocationsByTenantId(tenant._id);
    sendEnvelope(req, res, {
      tenant: {
        id: String(tenant._id),
        name: tenant.publicProfileDisplayName || tenant.name,
        slug: tenant.slug
      },
      locations: locations.filter((location) => location.isActive).map(formatLocationResource)
    });
  })
);

router.get(
  ["/queues/:tenantSlug", "/queues/:tenantSlug/locations/:locationSlug"],
  authenticateDeveloperApiKey,
  requireApiScope("queues:read"),
  asyncHandler(async (req, res) => {
    const tenant = await tenantRepository.findTenantBySlug(
      String(req.params.tenantSlug).toLowerCase(),
      { activeOnly: true }
    );
    if (!tenant) throw notFound("Queue not found.");

    let location;
    if (req.params.locationSlug) {
      location = await storeLocationRepository.findLocationByTenantAndSlug(
        tenant._id,
        String(req.params.locationSlug).toLowerCase()
      );
      if (!location || !location.isActive) throw notFound("Queue location not found.");
    } else {
      location = await storeLocationRepository.findPrimaryLocationByTenantId(tenant._id);
    }

    const snapshot = await queueService.getQueueSnapshot(tenant, { location });
    sendEnvelope(req, res, formatQueueResource(snapshot));
  })
);

module.exports = router;
