const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { authenticate } = require("../src/middleware/auth");
const asyncHandler = require("../src/middleware/asyncHandler");
const ticketRepository = require("../src/repositories/tickets");
const serviceCounterRepository = require("../src/repositories/serviceCounters");
const tenantRepository = require("../src/repositories/tenants");
const locationRepository = require("../src/repositories/storeLocations");

const router = express.Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown"),
  message: { message: "Too many mobile ticket requests. Please try again later." }
});
const ACTIVE_STATUSES = new Set(["waiting", "called", "skipped", "pending_carry_over"]);

router.use(limiter);
router.use(authenticate);

function environmentForRequest(req) {
  const hostname = String(req.hostname || req.headers.host || "").toLowerCase().split(":")[0];
  return hostname === "sandbox.getprio.online" || hostname === "sandbox-api.getprio.online" ? "sandbox" : "production";
}

function encodeCursor(cursor) {
  return cursor ? Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url") : null;
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (!parsed || !parsed.createdAt || !/^\d+$/.test(String(parsed.id))) throw new Error("invalid");
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    const error = new Error("Invalid cursor.");
    error.statusCode = 400;
    error.code = "INVALID_CURSOR";
    throw error;
  }
}

function normalizeView(value) {
  const view = String(value || "active").toLowerCase();
  if (view !== "active" && view !== "history") {
    const error = new Error("View must be active or history.");
    error.statusCode = 400;
    error.code = "INVALID_VIEW";
    throw error;
  }
  return view;
}

async function buildQueuePosition(ticket) {
  if (ticket.status !== "waiting") return null;
  const waiting = await ticketRepository.listWaitingTickets(ticket.tenantId, {
    locationId: ticket.locationId,
    dateKey: ticket.dateKey
  });
  const position = waiting.findIndex((item) => String(item._id) === String(ticket._id)) + 1;
  if (!position) return null;
  return { position, people_ahead: Math.max(0, position - 1), as_of: new Date().toISOString() };
}

async function formatMobileTicket(ticket, environment) {
  const [tenant, location, queuePosition, counter] = await Promise.all([
    tenantRepository.findTenantById(ticket.tenantId),
    locationRepository.findLocationById(ticket.locationId),
    buildQueuePosition(ticket),
    ticket.status === "called" && ticket.serviceCounterId
      ? serviceCounterRepository.findCounterById(ticket.serviceCounterId)
      : Promise.resolve(null)
  ]);
  const isDeveloperTicket = Boolean(ticket.developerProjectId);
  const canCancel = ACTIVE_STATUSES.has(ticket.status) && ticket.status !== "pending_carry_over";
  return {
    id: ticket._id,
    ticket_number: ticket.ticketNumber,
    source: isDeveloperTicket ? "developer_api" : "first_party",
    display_label: tenant?.publicProfileDisplayName || tenant?.name || ticket.tenantName || null,
    external_reference: isDeveloperTicket ? ticket.externalReference : null,
    status: ticket.status,
    status_reason: ticket.statusReason,
    profile: {
      queue_name: tenant?.name || ticket.tenantName || null,
      location_name: location?.name || ticket.locationName || null,
      location_slug: location?.slug || ticket.locationSlug || null
    },
    queue_position: queuePosition,
    called_counter: ticket.status === "called" && counter && String(counter.locationId) === String(ticket.locationId)
      ? { id: counter._id, name: counter.name }
      : null,
    estimated_wait_minutes: queuePosition ? null : null,
    can_cancel: canCancel,
    tracking_status: ACTIVE_STATUSES.has(ticket.status) ? "active" : "terminal",
    issued_at: ticket.createdAt,
    updated_at: ticket.updatedAt,
    developer_environment: isDeveloperTicket ? (ticket.developerEnvironment || environment) : null
  };
}

router.get("/tickets", asyncHandler(async (req, res) => {
  const view = normalizeView(req.query.view);
  const result = await ticketRepository.listMobileTicketsForUser(req.user._id, {
    environment: environmentForRequest(req),
    view,
    cursor: decodeCursor(req.query.cursor),
    limit: req.query.limit
  });
  res.setHeader("Cache-Control", "no-store");
  res.json({
    tickets: await Promise.all(result.tickets.map((ticket) => formatMobileTicket(ticket, environmentForRequest(req)))),
    next_cursor: encodeCursor(result.nextCursor)
  });
}));

router.get("/tickets/:ticketId", asyncHandler(async (req, res) => {
  if (!/^\d+$/.test(String(req.params.ticketId || ""))) {
    const error = new Error("Ticket not found.");
    error.statusCode = 404;
    throw error;
  }
  const environment = environmentForRequest(req);
  const ticket = await ticketRepository.findMobileTicketForUser(req.params.ticketId, req.user._id);
  if (!ticket || (environment === "sandbox" && (!ticket.developerProjectId || ticket.developerEnvironment !== "sandbox")) ||
      (environment === "production" && ticket.developerEnvironment === "sandbox")) {
    const error = new Error("Ticket not found.");
    error.statusCode = 404;
    throw error;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ ticket: await formatMobileTicket(ticket, environment) });
}));

module.exports = router;
