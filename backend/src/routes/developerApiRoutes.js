const express = require("express");
const openApiDocument = require("./developerApiOpenapi");
const asyncHandler = require("../middleware/asyncHandler");
const tenantRepository = require("../repositories/tenants");
const storeLocationRepository = require("../repositories/storeLocations");
const queueService = require("../services/queueService");
const queueEvents = require("../services/queueEvents");
const entitlementAdmissionService = require("../services/entitlementAdmissionService");
const storeHoursService = require("../services/storeHoursService");
const { assertPublicTextFieldsAllowed } = require("../services/contentModeration");
const idempotencyService = require("../services/idempotencyService");
const idempotencyRepository = require("../repositories/idempotency");
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

function envelopeBody(req, data) {
  return { data, request_id: getRequestId(req) };
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

function formatIssuedTicket(ticket, location) {
  return {
    id: String(ticket._id),
    ticket_number: ticket.ticketNumber,
    lookup_code: ticket.lookupCode,
    status: ticket.status,
    location_id: String(location._id),
    queue_date_key: ticket.dateKey,
    created_at: ticket.createdAt
  };
}

function readBodyValue(body, camelName, snakeName) {
  return body?.[camelName] ?? body?.[snakeName];
}

function cleanOptionalText(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  if (!text || text.length > maxLength) {
    const error = new Error(`${label} must be at most ${maxLength} characters.`);
    error.statusCode = 400;
    error.code = "INVALID_REQUEST";
    throw error;
  }
  return text;
}

function readBoolean(value, label) {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  const error = new Error(`${label} must be a boolean.`);
  error.statusCode = 400;
  error.code = "INVALID_REQUEST";
  throw error;
}

async function getQueueContext(req) {
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

  return { tenant, location };
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

router.post(
  ["/queues/:tenantSlug/tickets", "/queues/:tenantSlug/locations/:locationSlug/tickets"],
  authenticateDeveloperApiKey,
  requireApiScope("queues:write"),
  asyncHandler(async (req, res) => {
    const { tenant, location } = await getQueueContext(req);
    if (!location) throw notFound("Queue location not found.");

    const customerName = String(readBodyValue(req.body, "customerName", "customer_name") || "").trim();
    if (!customerName || customerName.length > 120) {
      const error = new Error("customerName is required and must be at most 120 characters.");
      error.statusCode = 400;
      error.code = "INVALID_REQUEST";
      throw error;
    }
    const customerEmail = cleanOptionalText(
      readBodyValue(req.body, "customerEmail", "customer_email"),
      "customerEmail",
      320
    );
    const customerPhone = cleanOptionalText(
      readBodyValue(req.body, "customerPhone", "customer_phone"),
      "customerPhone",
      40
    );
    const notes = cleanOptionalText(req.body?.notes, "notes", 1000);
    const notifyByEmail = readBoolean(
      readBodyValue(req.body, "notifyByEmail", "notify_by_email"),
      "notifyByEmail"
    );
    const notifyBySms = readBoolean(
      readBodyValue(req.body, "notifyBySms", "notify_by_sms"),
      "notifyBySms"
    );
    assertPublicTextFieldsAllowed({ "Customer name": customerName, Notes: notes });

    const idempotency = await idempotencyService.claim({
      actorId: req.apiKey.createdByUserId,
      scope: `developer_api.ticket.issue:${req.apiKey.id}`,
      key: req.get("Idempotency-Key"),
      payload: {
        tenantSlug: req.params.tenantSlug,
        locationSlug: req.params.locationSlug || null,
        body: req.body || {}
      }
    });
    if (idempotency.state === "replay") {
      res.status(idempotency.statusCode).setHeader("Cache-Control", "no-store").setHeader("X-API-Version", "v1").json(idempotency.body);
      return;
    }

    try {
      await entitlementAdmissionService.admit({ tenantId: tenant._id, featureKey: "queue" });
      await storeHoursService.assertLocationOpenForCustomerJoin(location);
      const result = await queueService.createTicket({
        tenant,
        location,
        customerName,
        customerEmail,
        customerPhone,
        notifyByEmail,
        notifyBySms,
        joinChannel: "vendor",
        notes,
        actorRole: "developer_api",
        servicePriorityBand: "normal"
      });

      const responseBody = envelopeBody(req, {
        ticket: formatIssuedTicket(result.ticket, location)
      });
      await idempotencyRepository.complete(idempotency.record.id, 201, responseBody);
      res.status(201).setHeader("Cache-Control", "no-store").setHeader("X-API-Version", "v1").json(responseBody);
    } catch (error) {
      await idempotencyRepository.fail(idempotency.record.id).catch(() => {});
      throw error;
    }
  })
);

router.get(
  "/queues/:tenantSlug/locations",
  authenticateDeveloperApiKey,
  requireApiScope("queues:read"),
  asyncHandler(async (req, res) => {
    const { tenant } = await getQueueContext(req);
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
    const { tenant, location } = await getQueueContext(req);
    const snapshot = await queueService.getQueueSnapshot(tenant, { location });
    sendEnvelope(req, res, formatQueueResource(snapshot));
  })
);

router.get(
  ["/queues/:tenantSlug/stream", "/queues/:tenantSlug/locations/:locationSlug/stream"],
  authenticateDeveloperApiKey,
  requireApiScope("queues:read"),
  asyncHandler(async (req, res) => {
    const { tenant, location } = await getQueueContext(req);
    const initialSnapshot = await queueService.getQueueSnapshot(tenant, { location });
    let closed = false;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const writeSnapshot = (snapshot) => {
      if (!closed) {
        res.write(`event: snapshot\ndata: ${JSON.stringify(formatQueueResource(snapshot))}\n\n`);
      }
    };
    writeSnapshot(initialSnapshot);

    const unsubscribe = queueEvents.subscribe(
      tenant.slug,
      (snapshot) => {
        if (location && snapshot?.location?.id && String(snapshot.location.id) !== String(location._id)) {
          return;
        }
        try {
          writeSnapshot(snapshot);
        } catch (error) {
          console.error(error);
        }
      },
      { locationId: location?._id }
    );
    const heartbeat = setInterval(() => {
      if (!closed) res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`);
    }, 25000);

    req.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  })
);

module.exports = router;
