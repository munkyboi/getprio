const express = require("express");
const openApiDocument = require("./developerApiOpenapi");
const asyncHandler = require("../middleware/asyncHandler");
const tenantRepository = require("../repositories/tenants");
const storeLocationRepository = require("../repositories/storeLocations");
const ticketRepository = require("../repositories/tickets");
const queueEventRepository = require("../repositories/queueEvents");
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
const DEVELOPER_API_IDEMPOTENCY_RETENTION_MS = 7 * 24 * 60 * 60_000;

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

function developerWebhookContext(req) {
  return {
    projectId: req.apiKey.projectId,
    environment: req.apiKey.environment
  };
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
    created_at: ticket.createdAt,
    ...(ticket.externalReference ? { external_reference: ticket.externalReference } : {})
  };
}

function formatTicketResource(ticket) {
  return {
    id: String(ticket._id),
    ticket_number: ticket.ticketNumber,
    status: ticket.status,
    location_id: ticket.locationId,
    queue_date_key: ticket.dateKey,
    join_channel: ticket.joinChannel,
    service_priority_band: ticket.servicePriorityBand,
    status_reason: ticket.statusReason,
    called_at: ticket.calledAt,
    served_at: ticket.servedAt,
    skipped_at: ticket.skippedAt,
    cancelled_at: ticket.cancelledAt,
    unserved_at: ticket.unservedAt,
    terminal_at: ticket.terminalAt,
    created_at: ticket.createdAt,
    updated_at: ticket.updatedAt,
    ...(ticket.externalReference ? { external_reference: ticket.externalReference } : {})
  };
}

function formatTicketEvent(event) {
  const eventType = {
    ticket_created: "ticket.issued",
    ticket_called: "ticket.called",
    ticket_served: "ticket.served",
    ticket_skipped: "ticket.skipped",
    ticket_requeued: "ticket.restored",
    ticket_cancelled: "ticket.cancelled",
    ticket_unserved: "ticket.unserved",
    ticket_expired: "ticket.expired"
  }[event.eventType] || event.eventType;
  return {
    id: event._id,
    ticket_id: event.ticketId,
    location_id: event.locationId,
    queue_date_key: event.queueDateKey,
    type: eventType,
    resource_version: event._id,
    from_status: event.fromStatus,
    to_status: event.toStatus,
    source: event.source,
    occurred_at: event.createdAt
  };
}

function readEventCursor(value) {
  if (value === undefined) return null;
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(Number(normalized))) {
    const error = new Error("cursor must be an opaque event cursor returned by the API.");
    error.statusCode = 400;
    error.code = "INVALID_REQUEST";
    throw error;
  }
  return normalized;
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

function cleanDisplayLabel(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    const error = new Error("displayLabel must be text.");
    error.statusCode = 400;
    error.code = "INVALID_REQUEST";
    throw error;
  }
  const label = value.trim();
  if (!label || [...label].length > 80) {
    const error = new Error("displayLabel must be at most 80 characters.");
    error.statusCode = 400;
    error.code = "INVALID_REQUEST";
    throw error;
  }
  const hasControlCharacter = label && [...label].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (hasControlCharacter) {
    const error = new Error("displayLabel must be plain single-line text.");
    error.statusCode = 400;
    error.code = "INVALID_REQUEST";
    throw error;
  }
  return label;
}

function cleanExternalReference(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(value)) {
    const error = new Error("externalReference must be 1-128 characters using letters, digits, underscore, hyphen, dot, or colon.");
    error.statusCode = 400;
    error.code = "INVALID_REQUEST";
    throw error;
  }
  return value;
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

function readEventLimit(value) {
  if (value === undefined) return 50;
  const normalized = String(value).trim();
  const limit = Number(normalized);
  if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    const error = new Error("limit must be an integer between 1 and 100.");
    error.statusCode = 400;
    error.code = "INVALID_REQUEST";
    throw error;
  }
  return limit;
}

async function runIdempotentMutation(req, res, { scope, payload, run }) {
  const idempotency = await idempotencyService.claim({
    actorId: req.apiKey.createdByUserId,
    scope: `${scope}:${req.apiKey.id}`,
    key: req.get("Idempotency-Key"),
    payload,
    retentionMs: DEVELOPER_API_IDEMPOTENCY_RETENTION_MS
  });
  if (idempotency.state === "replay") {
    res.status(idempotency.statusCode)
      .setHeader("Cache-Control", "no-store")
      .setHeader("X-API-Version", "v1")
      .json(idempotency.body);
    return;
  }

  try {
    const responseBody = envelopeBody(req, await run());
    await idempotencyRepository.complete(idempotency.record.id, 200, responseBody);
    res.setHeader("Cache-Control", "no-store")
      .setHeader("X-API-Version", "v1")
      .json(responseBody);
  } catch (error) {
    await idempotencyRepository.fail(idempotency.record.id).catch(() => {});
    throw error;
  }
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

async function getScopedTicket(req, tenant, location) {
  if (!/^\d+$/.test(String(req.params.ticketId))) throw notFound("Ticket not found.");
  const ticket = await ticketRepository.findTicketById(req.params.ticketId);
  if (
    !ticket ||
    String(ticket.tenantId) !== String(tenant._id) ||
    (location && String(ticket.locationId) !== String(location._id))
  ) {
    throw notFound("Ticket not found.");
  }
  return ticket;
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

    const rawDisplayLabel = readBodyValue(req.body, "displayLabel", "display_label");
    const rawCustomerName = readBodyValue(req.body, "customerName", "customer_name");
    const customerName = rawDisplayLabel !== undefined
      ? cleanDisplayLabel(rawDisplayLabel)
      : String(rawCustomerName || "").trim();
    if (rawDisplayLabel === undefined && rawCustomerName !== undefined && (!customerName || customerName.length > 120)) {
      const error = new Error("customerName is required and must be at most 120 characters.");
      error.statusCode = 400;
      error.code = "INVALID_REQUEST";
      throw error;
    }
    if (rawDisplayLabel !== undefined && !customerName) {
      const error = new Error("displayLabel must contain text when supplied.");
      error.statusCode = 400;
      error.code = "INVALID_REQUEST";
      throw error;
    }
    const externalReference = cleanExternalReference(
      readBodyValue(req.body, "externalReference", "external_reference")
    );
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
      },
      retentionMs: DEVELOPER_API_IDEMPOTENCY_RETENTION_MS
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
        developerProjectId: req.apiKey.projectId,
        developerEnvironment: req.apiKey.environment,
        externalReference,
        notifyByEmail,
        notifyBySms,
        joinChannel: "vendor",
        notes,
        actorRole: "developer_api",
        source: "developer_api",
        servicePriorityBand: "normal",
        developerWebhook: developerWebhookContext(req)
      });

      const responseBody = envelopeBody(req, {
        ticket: formatIssuedTicket(result.ticket, location)
      });
      await idempotencyRepository.complete(idempotency.record.id, 201, responseBody);
      res.status(201).setHeader("Cache-Control", "no-store").setHeader("X-API-Version", "v1").json(responseBody);
    } catch (error) {
      await idempotencyRepository.fail(idempotency.record.id).catch(() => {});
      if (error.code === "23505" && error.constraint === "tickets_developer_external_reference_idx") {
        error.statusCode = 409;
        error.code = "EXTERNAL_REFERENCE_EXISTS";
        error.message = "externalReference is already in use for this project and environment.";
      }
      throw error;
    }
  })
);

router.post(
  ["/queues/:tenantSlug/call-next", "/queues/:tenantSlug/locations/:locationSlug/call-next"],
  authenticateDeveloperApiKey,
  requireApiScope("queues:write"),
  asyncHandler(async (req, res) => {
    const { tenant, location } = await getQueueContext(req);
    if (!location) throw notFound("Queue location not found.");

    await runIdempotentMutation(req, res, {
      scope: "developer_api.queue.call_next",
      payload: {
        tenantSlug: req.params.tenantSlug,
        locationSlug: req.params.locationSlug || null,
        body: req.body || {}
      },
      run: async () => {
      const result = await queueService.callNextTicket(tenant, {
        location,
        actorUserId: req.apiKey.createdByUserId,
        actorRole: "developer_api",
        source: "developer_api",
        developerWebhook: developerWebhookContext(req)
      });
      return {
        ticket: result?.ticket ? formatTicketResource(result.ticket) : null
      };
      }
    });
  })
);

function registerCurrentTicketResolution(paths, status) {
  router.post(
    paths,
    authenticateDeveloperApiKey,
    requireApiScope("queues:write"),
    asyncHandler(async (req, res) => {
      const { tenant, location } = await getQueueContext(req);
      if (!location) throw notFound("Queue location not found.");

      await runIdempotentMutation(req, res, {
        scope: `developer_api.queue.${status}`,
        payload: {
          tenantSlug: req.params.tenantSlug,
          locationSlug: req.params.locationSlug || null,
          body: req.body || {}
        },
        run: async () => {
          const result = await queueService.updateCurrentTicketStatus(tenant, status, {
            location,
            actorUserId: req.apiKey.createdByUserId,
            actorRole: "developer_api",
            source: "developer_api",
            developerWebhook: developerWebhookContext(req)
          });
          return {
            ticket: result?.ticket ? formatTicketResource(result.ticket) : null
          };
        }
      });
    })
  );
}

registerCurrentTicketResolution(
  ["/queues/:tenantSlug/current/serve", "/queues/:tenantSlug/locations/:locationSlug/current/serve"],
  "served"
);
registerCurrentTicketResolution(
  ["/queues/:tenantSlug/current/skip", "/queues/:tenantSlug/locations/:locationSlug/current/skip"],
  "skipped"
);

function registerTicketMutation(paths, action, run) {
  router.post(
    paths,
    authenticateDeveloperApiKey,
    requireApiScope("queues:write"),
    asyncHandler(async (req, res) => {
      const { tenant, location } = await getQueueContext(req);
      if (!location) throw notFound("Queue location not found.");
      const ticket = await getScopedTicket(req, tenant, location);

      await runIdempotentMutation(req, res, {
        scope: `developer_api.ticket.${action}`,
        payload: {
          tenantSlug: req.params.tenantSlug,
          locationSlug: req.params.locationSlug || null,
          ticketId: req.params.ticketId,
          body: req.body || {}
        },
        run: async () => {
          const result = await run({ tenant, location, ticket, req });
          return { ticket: result?.ticket ? formatTicketResource(result.ticket) : null };
        }
      });
    })
  );
}

registerTicketMutation(
  ["/queues/:tenantSlug/tickets/:ticketId/cancel", "/queues/:tenantSlug/locations/:locationSlug/tickets/:ticketId/cancel"],
  "cancel",
  async ({ tenant, location, ticket, req }) => {
    if (!["waiting", "pending_carry_over"].includes(ticket.status)) {
      const error = new Error("Only waiting tickets can be cancelled by this endpoint.");
      error.statusCode = 409;
      error.code = "INVALID_TICKET_STATE";
      throw error;
    }
    return queueService.cancelTicket(tenant, ticket.lookupCode, {
      location,
      actorUserId: req.apiKey.createdByUserId,
      actorRole: "developer_api",
      source: "developer_api",
      developerWebhook: developerWebhookContext(req)
    });
  }
);

registerTicketMutation(
  ["/queues/:tenantSlug/tickets/:ticketId/restore", "/queues/:tenantSlug/locations/:locationSlug/tickets/:ticketId/restore"],
  "restore",
  async ({ tenant, location, ticket, req }) => {
    if (ticket.status !== "skipped") {
      const error = new Error("Only skipped tickets can be restored.");
      error.statusCode = 409;
      error.code = "INVALID_TICKET_STATE";
      throw error;
    }
    return queueService.restoreSkippedTicket(tenant, ticket._id, {
      location,
      actorUserId: req.apiKey.createdByUserId,
      actorRole: "developer_api",
      source: "developer_api",
      developerWebhook: developerWebhookContext(req)
    });
  }
);

router.get(
  ["/queues/:tenantSlug/tickets/:ticketId", "/queues/:tenantSlug/locations/:locationSlug/tickets/:ticketId"],
  authenticateDeveloperApiKey,
  requireApiScope("queues:read"),
  asyncHandler(async (req, res) => {
    const { tenant, location } = await getQueueContext(req);
    if (!location) throw notFound("Queue location not found.");
    const ticket = await getScopedTicket(req, tenant, location);
    sendEnvelope(req, res, { ticket: formatTicketResource(ticket) });
  })
);

router.get(
  ["/queues/:tenantSlug/tickets/:ticketId/events", "/queues/:tenantSlug/locations/:locationSlug/tickets/:ticketId/events"],
  authenticateDeveloperApiKey,
  requireApiScope("queues:read"),
  asyncHandler(async (req, res) => {
    const { tenant, location } = await getQueueContext(req);
    if (!location) throw notFound("Queue location not found.");
    const ticket = await getScopedTicket(req, tenant, location);
    const result = await queueEventRepository.listTicketEvents({
      tenantId: tenant._id,
      locationId: location._id,
      ticketId: ticket._id,
      limit: readEventLimit(req.query.limit),
      afterId: readEventCursor(req.query.cursor)
    });
    sendEnvelope(req, res, {
      events: result.events.map(formatTicketEvent),
      next_cursor: result.nextCursor
    });
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
