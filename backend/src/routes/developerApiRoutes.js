const express = require("express");
const db = require("../config/db");
const openApiDocument = require("./developerApiOpenapi");
const asyncHandler = require("../middleware/asyncHandler");
const developerQueues = require("../repositories/developerQueues");
const developerApiOperations = require("../repositories/developerApiOperations");
const developerWebhookService = require("../services/developerWebhookService");
const { authenticateDeveloperApiKey, requireApiScope } = require("../middleware/developerApiKeyAuth");

const router = express.Router();
const PRODUCTION_HOSTS = new Set(["api.getprio.online"]);
const SANDBOX_HOSTS = new Set(["sandbox-api.getprio.online"]);
const INTERNAL_TICKET = Symbol("developerApiInternalTicket");

function getEnvironment(req) {
  const hostname = String(req.hostname || req.headers.host || "").trim().toLowerCase().split(":")[0];
  if (SANDBOX_HOSTS.has(hostname)) return "sandbox";
  if (PRODUCTION_HOSTS.has(hostname)) return "production";
  return "unknown";
}
function requestId(req) { return req.context?.correlationId || req.headers["x-request-id"] || "unknown"; }
function envelope(req, data) { return { data, request_id: requestId(req) }; }
function send(req, res, data, status = 200) {
  res.status(status).setHeader("Cache-Control", "no-store").setHeader("X-API-Version", "v1").json(envelope(req, data));
}
function error(statusCode, code, message) { const next = new Error(message); next.statusCode = statusCode; next.code = code; return next; }
function notFound(message) { return error(404, "API_RESOURCE_NOT_FOUND", message); }
function slug(value, label = "slug") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(normalized)) throw error(400, "INVALID_REQUEST", `${label} must be a lowercase URL-safe slug.`);
  return normalized;
}
function text(value, label, maxLength, required = false) {
  if (value === undefined || value === null || value === "") {
    if (!required) return null;
    throw error(400, "INVALID_REQUEST", `${label} is required.`);
  }
  const normalized = String(value).trim();
  if (!normalized || normalized.length > maxLength) throw error(400, "INVALID_REQUEST", `${label} must be at most ${maxLength} characters.`);
  return normalized;
}
function only(body, keys) {
  const unexpected = Object.keys(body || {}).filter((key) => !keys.has(key));
  if (unexpected.length) throw error(400, "INVALID_REQUEST", `Unsupported fields: ${unexpected.join(", ")}.`);
}
function directoryContent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw error(400, "INVALID_REQUEST", "directory_content must be an object.");
  only(value, new Set(["description", "website_url", "websiteUrl"]));
  const description = value.description === undefined ? "" : String(value.description).trim();
  if (description.length > 1000) throw error(400, "INVALID_REQUEST", "description must be at most 1000 characters.");
  const websiteUrl = value.website_url ?? value.websiteUrl ?? "";
  if (websiteUrl && !/^https?:\/\/[^\s]+$/i.test(String(websiteUrl).trim())) throw error(400, "INVALID_REQUEST", "website_url must use http or https.");
  return { description, websiteUrl: String(websiteUrl).trim() };
}
function eventLimit(value) {
  if (value === undefined) return 50;
  const normalized = Number(String(value));
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > 100) throw error(400, "INVALID_REQUEST", "limit must be an integer between 1 and 100.");
  return normalized;
}
function eventCursor(value) {
  if (value === undefined) return null;
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) throw error(400, "INVALID_REQUEST", "cursor must be an event cursor returned by the API.");
  return normalized;
}
function verificationCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(normalized)) throw error(400, "INVALID_REQUEST", "verification_code must be an 8-character hexadecimal code.");
  return normalized;
}
function profileView(profile) {
  const content = profile.directoryContent || {};
  return { id: profile.id, slug: profile.slug, display_name: profile.displayName, directory_status: profile.directoryStatus, directory_content: { description: content.description || "", website_url: content.websiteUrl || "" }, created_at: profile.createdAt, updated_at: profile.updatedAt };
}
function queueView(queue) { return { id: queue.id, slug: queue.slug, display_name: queue.displayName, session_state: queue.sessionState, intake_enabled: queue.intakeEnabled, joining_enabled: queue.joiningEnabled, priority_ratio: queue.priorityRatio, resource_version: queue.resourceVersion, created_at: queue.createdAt, updated_at: queue.updatedAt }; }
function ticketView(ticket) {
  if (!ticket) return null;
  const value = { id: ticket.id, ticket_number: ticket.ticketNumber, sequence: ticket.sequence, display_label: ticket.displayLabel, status: ticket.status, queue_id: ticket.queueId, external_reference: ticket.externalReference, ...(ticket.verificationCode ? { verification_code: ticket.verificationCode } : {}), ...(ticket.customerConfirmedAt ? { customer_confirmed_at: ticket.customerConfirmedAt } : {}), status_reason: ticket.statusReason, called_at: ticket.calledAt, served_at: ticket.servedAt, skipped_at: ticket.skippedAt, cancelled_at: ticket.cancelledAt, unserved_at: ticket.unservedAt, terminal_at: ticket.terminalAt, resource_version: ticket.resourceVersion, created_at: ticket.createdAt, updated_at: ticket.updatedAt };
  if (ticket.event) Object.defineProperty(value, "event", { value: ticket.event, enumerable: false });
  if (ticket.projectId) Object.defineProperty(value, "projectId", { value: ticket.projectId, enumerable: false });
  if (ticket.environment) Object.defineProperty(value, "environment", { value: ticket.environment, enumerable: false });
  if (ticket.queueId) Object.defineProperty(value, "queueId", { value: ticket.queueId, enumerable: false });
  if (ticket.ticketNumber) Object.defineProperty(value, "ticketNumber", { value: ticket.ticketNumber, enumerable: false });
  if (ticket.statusReason) Object.defineProperty(value, "statusReason", { value: ticket.statusReason, enumerable: false });
  if (ticket.linkedUserId) Object.defineProperty(value, "linkedUserId", { value: ticket.linkedUserId, enumerable: false });
  if (ticket.calledAt) Object.defineProperty(value, "calledAt", { value: ticket.calledAt, enumerable: false });
  if (ticket.servedAt) Object.defineProperty(value, "servedAt", { value: ticket.servedAt, enumerable: false });
  if (ticket.skippedAt) Object.defineProperty(value, "skippedAt", { value: ticket.skippedAt, enumerable: false });
  if (ticket.cancelledAt) Object.defineProperty(value, "cancelledAt", { value: ticket.cancelledAt, enumerable: false });
  if (ticket.unservedAt) Object.defineProperty(value, "unservedAt", { value: ticket.unservedAt, enumerable: false });
  if (ticket.terminalAt) Object.defineProperty(value, "terminalAt", { value: ticket.terminalAt, enumerable: false });
  Object.defineProperty(value, INTERNAL_TICKET, { value: ticket, enumerable: false });
  return value;
}
async function scopedProfile(req) {
  const profileSlug = slug(req.params.tenantSlug || req.params.profileSlug, "profile slug");
  if (req.apiKey.profileAccess === "selected" && !req.apiKey.profileSlugs.includes(profileSlug)) throw notFound("Profile not found.");
  const profile = await developerQueues.findProfile(req.apiKey.projectId, req.apiKey.environment, profileSlug);
  if (!profile) throw notFound("Profile not found.");
  return profile;
}
async function context(req) {
  const profile = await scopedProfile(req);
  const queueSlug = req.params.locationSlug || req.params.queueSlug;
  const queue = queueSlug ? await developerQueues.findQueue(profile.id, slug(queueSlug, "queue slug")) : await developerQueues.findFirstQueue(profile.id);
  if (!queue) throw notFound("Queue not found.");
  return { profile, queue };
}
async function scopedTicket(req, queue) {
  const ticket = await developerQueues.findTicket(req.apiKey.projectId, req.apiKey.environment, queue.id, req.params.ticketId);
  if (!ticket) throw notFound("Ticket not found.");
  return ticket;
}
async function mutate(req, res, { scope, payload, status = 200, run }) {
  let result;
  try {
    result = await db.withTransaction(async (client) => {
    const operation = await developerApiOperations.claim({ projectId: req.apiKey.projectId, environment: req.apiKey.environment, apiKeyId: req.apiKey.id, scope, key: req.get("Idempotency-Key"), payload }, { client });
    if (operation.state === "replay") return operation;
    const data = await run(client);
    if (data.ticket?.event) await developerWebhookService.enqueueDeveloperTicketEvent({ event: data.ticket.event, ticket: data.ticket }, { client });
    for (const queueEvent of data.queueEvents || []) {
      await developerWebhookService.enqueueDeveloperQueueEvent({ event: queueEvent.event, queue: queueEvent.queue }, { client });
    }
    const publicData = { ...data };
    delete publicData.queueEvents;
    const body = envelope(req, publicData);
    await developerApiOperations.complete(operation.recordId, status, body, { client });
    return {
      state: "completed",
      statusCode: status,
      body,
      notificationTicket: data.ticket?.[INTERNAL_TICKET] || null
    };
    });
  } catch (mutationError) {
    if (mutationError.code === "23505") throw error(409, "RESOURCE_CONFLICT", "A resource with this value already exists.");
    throw mutationError;
  }
  const linkedUserId = result.notificationTicket?.linkedUserId;
  if (linkedUserId && result.body?.data?.ticket?.status) {
    const ticket = result.body.data.ticket;
    const action = ticket.status === "called" ? "called" : ticket.status;
    const pushNotificationService = require("../services/pushNotificationService");
    pushNotificationService.sendUserNotification({
      userId: linkedUserId,
      title: "Developer API ticket update",
      body: `${ticket.ticket_number || "Your ticket"} is now ${ticket.status}.`,
      url: `/tickets/${ticket.id}`,
      route: "ticket",
      ticketRef: ticket.ticket_number || ticket.id,
      tag: `developer-ticket-${ticket.id}-${action}`,
      eventType: `developer_ticket_${action}`,
      environment: getEnvironment(req)
    }).catch((notificationError) => {
      console.warn("[developer-ticket-push-skipped]", notificationError.message);
    });
  }
  res.status(result.statusCode).setHeader("Cache-Control", "no-store").setHeader("X-API-Version", "v1").json(result.body);
}

router.get("/", (req, res) => {
  const environment = getEnvironment(req);
  send(req, res, { service: "getprio-queue-api", version: "v1", environment, base_url: environment === "sandbox" ? "https://sandbox-api.getprio.online/v1" : environment === "production" ? "https://api.getprio.online/v1" : null, documentation_url: "https://developers.getprio.online" });
});
router.get("/health", (req, res) => send(req, res, { status: "ok", service: "getprio-queue-api", version: "v1", environment: getEnvironment(req) }));
router.get("/openapi.json", (_req, res) => res.setHeader("Cache-Control", "public, max-age=300").type("application/json").json(openApiDocument));

router.get("/profiles", authenticateDeveloperApiKey, requireApiScope("profiles:read"), asyncHandler(async (req, res) => {
  const profiles = await developerQueues.listProfiles(req.apiKey.projectId, req.apiKey.environment);
  const visible = req.apiKey.profileAccess === "selected" ? profiles.filter((profile) => req.apiKey.profileSlugs.includes(profile.slug)) : profiles;
  send(req, res, { profiles: visible.map(profileView) });
}));
router.post("/profiles", authenticateDeveloperApiKey, requireApiScope("profiles:write"), asyncHandler(async (req, res) => {
  if (req.apiKey.profileAccess === "selected") throw error(403, "API_PROFILE_ACCESS_RESTRICTED", "A key limited to selected profiles cannot create new profiles.");
  only(req.body, new Set(["slug", "display_name", "displayName"]));
  const profileSlug = slug(req.body?.slug); const displayName = text(req.body?.display_name ?? req.body?.displayName, "display_name", 120, true);
  await mutate(req, res, { scope: "developer_api.profile.create", payload: { profileSlug, displayName }, status: 201, run: async (client) => ({ profile: profileView(await developerQueues.createProfile({ projectId: req.apiKey.projectId, environment: req.apiKey.environment, slug: profileSlug, displayName, userId: req.apiKey.createdByUserId }, { client })) }) });
}));
router.patch("/profiles/:profileSlug", authenticateDeveloperApiKey, requireApiScope("profiles:write"), asyncHandler(async (req, res) => {
  only(req.body, new Set(["display_name", "displayName", "directory_content", "directoryContent"]));
  const profile = await scopedProfile(req);
  const changes = {};
  if (req.body?.display_name !== undefined || req.body?.displayName !== undefined) {
    changes.displayName = text(req.body?.display_name ?? req.body?.displayName, "display_name", 120, true);
  }
  if (req.body?.directory_content !== undefined || req.body?.directoryContent !== undefined) {
    changes.directoryContent = directoryContent(req.body?.directory_content ?? req.body?.directoryContent);
    changes.directoryStatus = "draft";
  }
  if (!Object.keys(changes).length) throw error(400, "NO_PROFILE_CHANGES", "Provide a display_name or directory_content to update.");
  await mutate(req, res, { scope: "developer_api.profile.update", payload: { profileId: profile.id, changes }, run: async (client) => {
    const updated = await developerQueues.updateProfile(profile.id, changes, { client });
    if (!updated) throw notFound("Profile not found.");
    return { profile: profileView(updated) };
  } });
}));
router.get("/profiles/:profileSlug/queues", authenticateDeveloperApiKey, requireApiScope("queues:read"), asyncHandler(async (req, res) => {
  const profile = await scopedProfile(req); send(req, res, { profile: profileView(profile), queues: (await developerQueues.listQueues(profile.id)).map(queueView) });
}));
router.post("/profiles/:profileSlug/queues", authenticateDeveloperApiKey, requireApiScope("queues:write"), asyncHandler(async (req, res) => {
  only(req.body, new Set(["slug", "display_name", "displayName", "session_state", "sessionState", "intake_enabled", "intakeEnabled"]));
  const profile = await scopedProfile(req); const queueSlug = slug(req.body?.slug); const displayName = text(req.body?.display_name ?? req.body?.displayName, "display_name", 120, true);
  const sessionState = req.body?.session_state ?? req.body?.sessionState ?? "closed"; if (!["open", "paused", "closing", "closed"].includes(sessionState)) throw error(400, "INVALID_REQUEST", "session_state is invalid.");
  const intakeEnabled = Boolean(req.body?.intake_enabled ?? req.body?.intakeEnabled ?? false);
  await mutate(req, res, { scope: "developer_api.queue.create", payload: { profileId: profile.id, queueSlug, displayName, sessionState, intakeEnabled }, status: 201, run: async (client) => ({ queue: queueView(await developerQueues.createQueue({ profileId: profile.id, slug: queueSlug, displayName, sessionState, intakeEnabled }, { client })) }) });
}));
router.patch("/profiles/:profileSlug/queues/:queueSlug", authenticateDeveloperApiKey, requireApiScope("queues:write"), asyncHandler(async (req, res) => {
  only(req.body, new Set(["display_name", "displayName", "session_state", "sessionState", "intake_enabled", "intakeEnabled", "resource_version", "resourceVersion"]));
  const profile = await scopedProfile(req);
  const queue = await developerQueues.findQueue(profile.id, slug(req.params.queueSlug, "queue slug"));
  if (!queue) throw notFound("Queue not found.");
  const changes = {};
  if (req.body?.display_name !== undefined || req.body?.displayName !== undefined) changes.displayName = text(req.body?.display_name ?? req.body?.displayName, "display_name", 120, true);
  if (req.body?.session_state !== undefined || req.body?.sessionState !== undefined) {
    changes.sessionState = req.body?.session_state ?? req.body?.sessionState;
    if (!["open", "paused", "closing", "closed"].includes(changes.sessionState)) throw error(400, "INVALID_REQUEST", "session_state is invalid.");
  }
  if (req.body?.intake_enabled !== undefined || req.body?.intakeEnabled !== undefined) changes.intakeEnabled = Boolean(req.body?.intake_enabled ?? req.body?.intakeEnabled);
  if (!Object.keys(changes).length) throw error(400, "NO_QUEUE_CHANGES", "Provide a display name, session state, or intake setting to update.");
  if (req.body?.resource_version !== undefined || req.body?.resourceVersion !== undefined) {
    changes.resourceVersion = Number(req.body?.resource_version ?? req.body?.resourceVersion);
    if (!Number.isSafeInteger(changes.resourceVersion) || changes.resourceVersion < 1) throw error(400, "INVALID_REQUEST", "resource_version must be a positive integer.");
  }
  await mutate(req, res, { scope: "developer_api.queue.update", payload: { profileId: profile.id, queueId: queue.id, changes }, run: async (client) => {
    const updated = await developerQueues.updateQueue(queue.id, changes, { client });
    if (!updated) throw error(409, "QUEUE_UPDATE_CONFLICT", "Queue changed before this update was applied.");
    const events = [];
    if (changes.sessionState !== undefined && changes.sessionState !== queue.sessionState) {
      const type = developerWebhookService.queueSessionEventType(changes.sessionState);
      if (type) events.push({ type, fromStatus: queue.sessionState, toStatus: changes.sessionState });
    }
    if (Object.prototype.hasOwnProperty.call(changes, "intakeEnabled") && changes.intakeEnabled !== queue.intakeEnabled) {
      events.push({ type: changes.intakeEnabled ? "queue.intake.resumed" : "queue.intake.paused", fromStatus: String(queue.intakeEnabled), toStatus: String(changes.intakeEnabled) });
    }
    return { queue: queueView(updated), queueEvents: events.map((event) => ({ event: { ...event, id: `${updated.id}:${updated.resourceVersion}:${event.type}`, resourceVersion: updated.resourceVersion, occurredAt: updated.updatedAt, source: "developer_api" }, queue: { ...updated, projectId: req.apiKey.projectId, environment: req.apiKey.environment } })) };
  } });
}));

const queuePaths = (suffix) => [`/queues/:tenantSlug${suffix}`, `/queues/:tenantSlug/locations/:locationSlug${suffix}`];
router.post(queuePaths("/tickets"), authenticateDeveloperApiKey, requireApiScope("queues:write"), asyncHandler(async (req, res) => {
  only(req.body, new Set(["display_label", "displayLabel", "external_reference", "externalReference", "recipient_email", "recipientEmail"]));
  const { profile, queue } = await context(req);
  const displayLabel = text(req.body?.display_label ?? req.body?.displayLabel, "display_label", 120);
  const externalReference = text(req.body?.external_reference ?? req.body?.externalReference, "external_reference", 160);
  const recipientEmail = text(req.body?.recipient_email ?? req.body?.recipientEmail, "recipient_email", 320);
  await mutate(req, res, { scope: "developer_api.ticket.issue", payload: { profileId: profile.id, queueId: queue.id, displayLabel, externalReference, recipientEmail }, status: 201, run: async (client) => {
    const ticket = await developerQueues.issueTicket({ projectId: req.apiKey.projectId, environment: req.apiKey.environment, profileId: profile.id, queueId: queue.id, queueSlug: queue.slug, displayLabel, externalReference, recipientEmail }, { client });
    if (!ticket) throw notFound("Queue not found."); return { ticket: ticketView(ticket) };
  }});
}));
router.post(queuePaths("/call-next"), authenticateDeveloperApiKey, requireApiScope("queues:write"), asyncHandler(async (req, res) => {
  const { profile, queue } = await context(req);
  await mutate(req, res, { scope: "developer_api.queue.call_next", payload: { profileId: profile.id, queueId: queue.id }, run: async (client) => ({ ticket: ticketView(await developerQueues.callNextTicket({ projectId: req.apiKey.projectId, environment: req.apiKey.environment, profileId: profile.id, queueId: queue.id, queueSlug: queue.slug }, { client })) }) });
}));
router.post(queuePaths("/current/confirm"), authenticateDeveloperApiKey, requireApiScope("queues:write"), asyncHandler(async (req, res) => {
  only(req.body, new Set(["verification_code", "verificationCode"]));
  const suppliedCode = verificationCode(req.body?.verification_code ?? req.body?.verificationCode);
  const { profile, queue } = await context(req);
  await mutate(req, res, { scope: "developer_api.queue.confirm", payload: { profileId: profile.id, queueId: queue.id, verificationCode: suppliedCode }, run: async (client) => {
    const ticket = await developerQueues.confirmCurrentTicket({ projectId: req.apiKey.projectId, environment: req.apiKey.environment, profileId: profile.id, queueId: queue.id, queueSlug: queue.slug, verificationCode: suppliedCode }, { client });
    if (!ticket) throw error(409, "NO_CALLED_TICKET", "There is no called ticket to confirm.");
    return { ticket: ticketView(ticket) };
  }});
}));
function currentTransition(suffix, toStatus) {
  router.post(queuePaths(suffix), authenticateDeveloperApiKey, requireApiScope("queues:write"), asyncHandler(async (req, res) => {
    const { profile, queue } = await context(req);
    await mutate(req, res, { scope: `developer_api.queue.${toStatus}`, payload: { profileId: profile.id, queueId: queue.id }, run: async (client) => {
      const snapshot = await developerQueues.queueSnapshot(queue.id, { client });
      if (!snapshot.current) throw error(409, "INVALID_TICKET_STATE", "There is no called ticket to resolve.");
      return { ticket: ticketView(await developerQueues.transitionTicket({ projectId: req.apiKey.projectId, environment: req.apiKey.environment, queueId: queue.id, ticketId: snapshot.current.id, fromStatus: "called", toStatus }, { client })) };
    }});
  }));
}
currentTransition("/current/serve", "served"); currentTransition("/current/skip", "skipped");
function ticketTransition(action, fromStatus, toStatus) {
  router.post(queuePaths(`/tickets/:ticketId/${action}`), authenticateDeveloperApiKey, requireApiScope("queues:write"), asyncHandler(async (req, res) => {
    const { profile, queue } = await context(req); const ticket = await scopedTicket(req, queue);
    await mutate(req, res, { scope: `developer_api.ticket.${toStatus}`, payload: { profileId: profile.id, queueId: queue.id, ticketId: ticket.id }, run: async (client) => ({ ticket: ticketView(await developerQueues.transitionTicket({ projectId: req.apiKey.projectId, environment: req.apiKey.environment, queueId: queue.id, ticketId: ticket.id, fromStatus, toStatus, ...(action === "restore" ? { eventType: "ticket.restored" } : {}) }, { client })) }) });
  }));
}
ticketTransition("cancel", "waiting", "cancelled"); ticketTransition("restore", "skipped", "waiting");
router.get(queuePaths("/tickets/:ticketId"), authenticateDeveloperApiKey, requireApiScope("queues:read"), asyncHandler(async (req, res) => { const { queue } = await context(req); send(req, res, { ticket: ticketView(await scopedTicket(req, queue)) }); }));
router.get(queuePaths("/tickets/:ticketId/events"), authenticateDeveloperApiKey, requireApiScope("queues:read"), asyncHandler(async (req, res) => {
  const { queue } = await context(req); const ticket = await scopedTicket(req, queue);
  const result = await developerQueues.listTicketEvents(req.apiKey.projectId, req.apiKey.environment, queue.id, ticket.id, eventLimit(req.query.limit), eventCursor(req.query.cursor));
  send(req, res, { events: result.events.map((event) => ({ id: event.id, ticket_id: event.ticketId, queue_id: event.queueId, type: event.type, resource_version: event.resourceVersion, from_status: event.fromStatus, to_status: event.toStatus, occurred_at: event.occurredAt })), next_cursor: result.nextCursor });
}));
router.get("/queues/:tenantSlug/locations", authenticateDeveloperApiKey, requireApiScope("queues:read"), asyncHandler(async (req, res) => { const profile = await scopedProfile(req); send(req, res, { profile: profileView(profile), queues: (await developerQueues.listQueues(profile.id)).map(queueView) }); }));
router.get(queuePaths(""), authenticateDeveloperApiKey, requireApiScope("queues:read"), asyncHandler(async (req, res) => {
  const { profile, queue } = await context(req); const snapshot = await developerQueues.queueSnapshot(queue.id);
  send(req, res, { profile: profileView(profile), queue: queueView(snapshot.queue), queue_intake: { state: snapshot.queue.sessionState === "open" && snapshot.queue.intakeEnabled ? "open" : "closed" }, stats: snapshot.stats, current: ticketView(snapshot.current), next_up: snapshot.nextUp.map(ticketView), overflow: snapshot.overflow.map(ticketView), skipped: (snapshot.skipped || []).map(ticketView) });
}));
let activeStreamCount = 0;
const MAX_STREAMS = 100;
router.get(queuePaths("/stream"), authenticateDeveloperApiKey, requireApiScope("queues:read"), asyncHandler(async (req, res) => {
  const { profile, queue } = await context(req);
  if (activeStreamCount >= MAX_STREAMS) throw error(429, "STREAM_LIMIT_REACHED", "Too many active queue streams. Please retry later.");
  activeStreamCount += 1;
  let closed = false; let prior = null; let released = false; let heartbeat; let refresh;
  const release = () => {
    if (released) return;
    released = true;
    activeStreamCount -= 1;
    if (heartbeat) clearInterval(heartbeat);
    if (refresh) clearInterval(refresh);
    res.end();
  };
  req.on("close", () => { closed = true; release(); });
  res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache, no-transform"); res.setHeader("Connection", "keep-alive"); res.flushHeaders();
  const publish = async () => { const snapshot = await developerQueues.queueSnapshot(queue.id); const value = JSON.stringify({ profile: profileView(profile), queue: queueView(snapshot.queue), stats: snapshot.stats, current: ticketView(snapshot.current), next_up: snapshot.nextUp.map(ticketView), overflow: snapshot.overflow.map(ticketView), skipped: (snapshot.skipped || []).map(ticketView) }); if (!closed && value !== prior) { prior = value; res.write(`event: snapshot\ndata: ${value}\n\n`); } };
  try { await publish(); } catch (streamError) { release(); throw streamError; }
  if (closed) return;
  heartbeat = setInterval(() => { if (!closed) res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`); }, 25000);
  let refreshInFlight = false;
  refresh = setInterval(() => {
    if (closed || refreshInFlight) return;
    refreshInFlight = true;
    publish().catch(() => {}).finally(() => { refreshInFlight = false; });
  }, 2000);
}));
module.exports = router;
