const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { authenticate } = require("../src/middleware/auth");
const asyncHandler = require("../src/middleware/asyncHandler");
const ticketRepository = require("../src/repositories/tickets");
const developerQueues = require("../src/repositories/developerQueues");
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
// Mobile ticket resources intentionally expose only customer-safe queue context.

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
    if (!parsed?.createdAt || !/^\d+$/.test(String(parsed.id))) throw new Error("invalid");
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
  if (ticket.status !== "waiting" || ticket.isDeveloperApiTicket) return null;
  const waiting = await ticketRepository.listWaitingTickets(ticket.tenantId, {
    locationId: ticket.locationId,
    dateKey: ticket.dateKey
  });
  const position = waiting.findIndex((item) => String(item._id) === String(ticket._id)) + 1;
  if (!position) return null;
  return { position, people_ahead: Math.max(0, position - 1), as_of: new Date().toISOString() };
}

async function buildDeveloperQueueMetrics(ticket, environment) {
  if (!ticket.isDeveloperApiTicket && !ticket.developerProjectId) return null;
  if (!ticket.queueId || typeof developerQueues.mobileQueueMetrics !== "function") return null;
  return developerQueues.mobileQueueMetrics(ticket.queueId, ticket._id || ticket.id, { environment });
}

async function buildDeveloperQueueMetricsForTickets(tickets, environment) {
  if (typeof developerQueues.mobileQueueMetricsForTickets !== "function") return new Map();
  const byQueue = new Map();
  for (const ticket of tickets) {
    if ((!ticket.isDeveloperApiTicket && !ticket.developerProjectId) || !ticket.queueId) continue;
    const queueTickets = byQueue.get(ticket.queueId) || [];
    queueTickets.push(ticket);
    byQueue.set(ticket.queueId, queueTickets);
  }
  const results = await Promise.all([...byQueue.entries()].map(async ([queueId, queueTickets]) => [
    queueId,
    await developerQueues.mobileQueueMetricsForTickets(
      queueId,
      queueTickets.map((ticket) => ticket._id || ticket.id),
      { environment }
    )
  ]));
  const metricsByTicket = new Map();
  for (const [queueId, metrics] of results) {
    for (const ticket of byQueue.get(queueId)) {
      const ticketId = ticket._id || ticket.id;
      metricsByTicket.set(ticketId, metrics.get(String(ticketId)) || null);
    }
  }
  return metricsByTicket;
}

async function formatMobileTicket(ticket, environment, { developerMetrics: providedDeveloperMetrics } = {}) {
  const isDeveloperTicket = Boolean(ticket.isDeveloperApiTicket || ticket.developerProjectId);
  const developerTenantName = ticket.profileName || ticket.queueName || null;
  const developerLocationName = ticket.queueName || ticket.locationName || null;
  const [tenant, location, queuePosition, counter, developerMetrics] = await Promise.all([
    isDeveloperTicket ? Promise.resolve(null) : tenantRepository.findTenantById(ticket.tenantId),
    isDeveloperTicket ? Promise.resolve(null) : locationRepository.findLocationById(ticket.locationId),
    isDeveloperTicket ? Promise.resolve(null) : buildQueuePosition(ticket),
    ticket.status === "called" && ticket.serviceCounterId
      ? serviceCounterRepository.findCounterById(ticket.serviceCounterId)
      : Promise.resolve(null),
    providedDeveloperMetrics === undefined
      ? buildDeveloperQueueMetrics(ticket, environment)
      : Promise.resolve(providedDeveloperMetrics)
  ]);
  const resolvedQueuePosition = developerMetrics?.queuePosition || queuePosition;
  const canCancel = ACTIVE_STATUSES.has(ticket.status) && ticket.status !== "pending_carry_over";
  return {
    id: ticket._id,
    ticket_number: ticket.ticketNumber,
    source: isDeveloperTicket ? "developer_api" : "first_party",
    display_label: isDeveloperTicket
      ? (ticket.displayLabel || developerTenantName || null)
      : (tenant?.publicProfileDisplayName || tenant?.name || ticket.tenantName || null),
    external_reference: isDeveloperTicket ? ticket.externalReference : null,
    ...(isDeveloperTicket && ticket.verificationCode ? { verification_code: ticket.verificationCode } : {}),
    ...(isDeveloperTicket && ticket.customerConfirmedAt ? { customer_confirmed_at: ticket.customerConfirmedAt } : {}),
    status: ticket.status,
    status_reason: ticket.statusReason,
    profile: {
      queue_name: isDeveloperTicket ? developerTenantName : (tenant?.name || ticket.tenantName || null),
      location_name: isDeveloperTicket ? developerLocationName : (location?.name || ticket.locationName || null),
      location_slug: location?.slug || ticket.locationSlug || null
    },
    queue_position: resolvedQueuePosition
      ? {
          position: resolvedQueuePosition.position,
          people_ahead: resolvedQueuePosition.peopleAhead ?? resolvedQueuePosition.people_ahead,
          as_of: resolvedQueuePosition.asOf ?? resolvedQueuePosition.as_of
        }
      : null,
    called_counter: ticket.status === "called" && counter && String(counter.locationId) === String(ticket.locationId)
      ? { id: counter._id, name: counter.name }
      : null,
    queue_length: developerMetrics?.queueLength ?? null,
    queue_updated_at: developerMetrics?.queueUpdatedAt ?? null,
    estimated_wait_minutes: developerMetrics?.estimatedWaitMinutes ?? null,
    can_cancel: canCancel,
    tracking_status: ACTIVE_STATUSES.has(ticket.status) ? "active" : "terminal",
    issued_at: ticket.createdAt,
    updated_at: ticket.updatedAt,
    developer_environment: isDeveloperTicket ? (ticket.developerEnvironment || environment) : null
  };
}

async function formatDeveloperMobileTicket(ticket, environment, { invitation = false, developerMetrics } = {}) {
  const tenantName = ticket.profileDisplayName || ticket.queueDisplayName || "Developer queue";
  const locationName = ticket.queueDisplayName || null;
  const metrics = developerMetrics === undefined
    ? await buildDeveloperQueueMetrics({
        ...ticket,
        isDeveloperApiTicket: true,
        _id: ticket._id || ticket.id
      }, environment)
    : developerMetrics;
  return {
    id: ticket.id || ticket._id,
    ticket_number: ticket.ticketNumber,
    source: "developer_api",
    display_label: ticket.displayLabel || null,
    external_reference: ticket.externalReference || null,
    ...(ticket.verificationCode ? { verification_code: ticket.verificationCode } : {}),
    ...(ticket.customerConfirmedAt ? { customer_confirmed_at: ticket.customerConfirmedAt } : {}),
    status: ticket.status,
    status_reason: ticket.statusReason || null,
    profile: {
      queue_name: tenantName,
      location_name: locationName,
      location_slug: ticket.queueSlug
    },
    queue_position: metrics?.queuePosition
      ? {
          position: metrics.queuePosition.position,
          people_ahead: metrics.queuePosition.peopleAhead,
          as_of: metrics.queuePosition.asOf
        }
      : null,
    called_counter: null,
    queue_length: metrics?.queueLength ?? null,
    queue_updated_at: metrics?.queueUpdatedAt ?? null,
    estimated_wait_minutes: metrics?.estimatedWaitMinutes ?? null,
    can_cancel: false,
    tracking_status: ACTIVE_STATUSES.has(ticket.status) ? "active" : "terminal",
    issued_at: ticket.createdAt,
    updated_at: ticket.updatedAt,
    developer_environment: ticket.environment || environment,
    ...(invitation ? { invitation_pending: true } : {})
  };
}

router.post("/ticket-claims", asyncHandler(async (req, res) => {
  const verificationCode = String(req.body?.verification_code || "").trim().toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(verificationCode)) {
    const error = new Error("This QR code is not a valid Sandbox ticket.");
    error.statusCode = 400;
    error.code = "INVALID_TICKET_QR";
    throw error;
  }
  const environment = environmentForRequest(req);
  if (environment !== "sandbox") {
    const error = new Error("Printed ticket QR claims are only available in Sandbox.");
    error.statusCode = 404;
    error.code = "SANDBOX_TICKET_QR_ONLY";
    throw error;
  }
  const ticket = await developerQueues.claimMobileTicketByVerificationCode(
    verificationCode,
    req.user._id,
    environment
  );
  if (!ticket) {
    const error = new Error("This ticket QR code is no longer available.");
    error.statusCode = 404;
    error.code = "TICKET_QR_UNAVAILABLE";
    throw error;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ ticket: await formatDeveloperMobileTicket(ticket, environment) });
}));

router.get("/ticket-invitations", asyncHandler(async (req, res) => {
  const environment = environmentForRequest(req);
  const invitations = await developerQueues.listMobileInvitationsForUser(req.user._id, environment);
  const developerMetrics = await buildDeveloperQueueMetricsForTickets(invitations, environment);
  res.setHeader("Cache-Control", "no-store");
  res.json({ invitations: await Promise.all(invitations.map((ticket) => formatDeveloperMobileTicket(ticket, environment, {
    invitation: true,
    developerMetrics: developerMetrics.get(ticket._id || ticket.id)
  }))) });
}));

router.post("/ticket-invitations/:ticketId/accept", asyncHandler(async (req, res) => {
  const ticketId = String(req.params.ticketId || "").trim();
  if (!/^[0-9a-f-]{20,}$/i.test(ticketId)) {
    const error = new Error("Ticket invitation not found.");
    error.statusCode = 404;
    throw error;
  }
  const environment = environmentForRequest(req);
  const ticket = await developerQueues.acceptMobileInvitation(ticketId, req.user._id, environment);
  if (!ticket) {
    const error = new Error("Ticket invitation not found.");
    error.statusCode = 404;
    throw error;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ ticket: await formatDeveloperMobileTicket(ticket, environment) });
}));

router.get("/tickets", asyncHandler(async (req, res) => {
  const view = normalizeView(req.query.view);
  const environment = environmentForRequest(req);
  const result = await ticketRepository.listMobileTicketsForUser(req.user._id, {
    environment,
    view,
    cursor: decodeCursor(req.query.cursor),
    limit: req.query.limit
  });
  const developerResult = ticketRepository.listDeveloperTicketsForUser
    ? await ticketRepository.listDeveloperTicketsForUser(req.user._id, { environment, view, limit: req.query.limit })
    : { tickets: [] };
  const responseLimit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const tickets = [...result.tickets, ...developerResult.tickets]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, responseLimit);
  const developerMetrics = await buildDeveloperQueueMetricsForTickets(tickets, environment);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    tickets: await Promise.all(tickets.map((ticket) => formatMobileTicket(ticket, environment, {
      developerMetrics: developerMetrics.get(ticket._id || ticket.id)
    }))),
    next_cursor: encodeCursor(result.nextCursor)
  });
}));

router.get("/tickets/:ticketId", asyncHandler(async (req, res) => {
  const environment = environmentForRequest(req);
  const ticketId = String(req.params.ticketId || "");
  let ticket = /^\d+$/.test(ticketId)
    ? await ticketRepository.findMobileTicketForUser(ticketId, req.user._id)
    : (ticketRepository.findDeveloperTicketForUser
      ? await ticketRepository.findDeveloperTicketForUser(ticketId, req.user._id)
      : null);
  if (!ticket || (environment === "sandbox" && (!ticket.isDeveloperApiTicket && (!ticket.developerProjectId || ticket.developerEnvironment !== "sandbox"))) ||
      (environment === "production" && ticket.developerEnvironment === "sandbox")) {
    const error = new Error("Ticket not found.");
    error.statusCode = 404;
    throw error;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ ticket: await formatMobileTicket(ticket, environment) });
}));

module.exports = router;
