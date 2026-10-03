const db = require("../config/db");
const tickets = require("../repositories/tickets");
const timing = require("../repositories/serviceTiming");
const bookings = require("../repositories/bookings");
const events = require("../repositories/queueEvents");
const queue = require("./queueService");
const automation = require("./queueAutomationHelpers");
const notificationService = require("./notificationService");
const pushNotificationService = require("./pushNotificationService");
const developerWebhookService = require("./developerWebhookService");

function reject(message, statusCode = 409) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

async function recordEvent(client, ticket, eventType, options, previousStatus) {
  const event = await events.createQueueEvent({
    ticketId: ticket._id, tenantId: ticket.tenantId, locationId: ticket.locationId,
    queueDateKey: ticket.dateKey, eventType, fromStatus: previousStatus, toStatus: ticket.status,
    actorUserId: options.actorUserId, actorRole: "vendor", source: "vendor",
    metadata: { serviceStartedAt: ticket.serviceStartedAt, serviceEndedAt: ticket.serviceEndedAt,
      serviceOutcome: ticket.serviceOutcome }
  }, { client });
  await developerWebhookService.enqueueQueueEvent({ event, ticket }, { client });
}

async function startService(current, enabled, options, client) {
  if (current.serviceStartedAt && !current.serviceEndedAt) return false;
  if (current.serviceEndedAt) reject("This ticket already has a finished service record. Issue a new ticket for another service.");
  if (!enabled) reject("Service timing is not enabled for this location.");
  if (current.status !== "called") reject("Call the ticket before starting service.");
  if (!current.customerConfirmedAt && current.joinChannel !== "vendor") reject("Confirm the ticket before starting service.");
  await timing.start(current, options.actorUserId, client);
  return true;
}

async function endService(current, outcome, options, client) {
  if (!current.serviceStartedAt) reject("Start service before recording its outcome.");
  if (current.serviceEndedAt) {
    if (current.serviceOutcome !== outcome) reject("This service already has a different recorded outcome.");
    return false;
  }
  if (["waiting", "pending_carry_over"].includes(current.status)) reject("Refresh the queue before resolving this service record.");
  await timing.finish(current, outcome, options.actorUserId, client);
  return true;
}

async function resolveCalledTicket(client, current, updated, options) {
  if (current.status !== "called" || updated.status === "called") return undefined;
  if (updated.status === "served") {
    await bookings.updateBookingByQueueTicketId(updated._id, {
      status: "completed", fulfillmentOutcomeReason: "ticket_served", refundEligible: false,
      fulfillmentResolvedAt: updated.serviceEndedAt
    }, { client });
  }
  const eventType = updated.status === "served" ? "ticket_served" : "ticket_unserved";
  await recordEvent(client, updated, eventType, options, current.status);
  return updated.status;
}

async function recordTicketService(tenant, ticketId, action, options) {
  if (!/^[1-9]\d*$/u.test(String(ticketId)) || !Number.isSafeInteger(Number(ticketId))) reject("Ticket not found.", 404);
  const eventTypes = { start: "service_started", complete: "service_completed", interrupt: "service_interrupted" };
  if (!Object.prototype.hasOwnProperty.call(eventTypes, action)) reject("Unknown service action.", 400);
  const location = options.location;
  if (!location) reject("Location not found.", 404);
  const { ticket, resolvedQueueStatus } = await db.withTransaction(async (client) => {
    // Serialize starts against setting changes; repeat state and scope checks
    // under locks. The browser cannot supply clocks or actors.
    const branch = await client.query(`SELECT service_timing_enabled FROM store_locations
      WHERE id = $1 AND tenant_id = $2 FOR SHARE`, [location._id, tenant._id]);
    if (!branch.rows[0]) reject("Location not found.", 404);
    const current = await tickets.findTicketByIdForUpdate(ticketId, { client });
    if (!current || String(current.tenantId) !== String(tenant._id)
      || String(current.locationId) !== String(location._id)) reject("Ticket not found.", 404);
    const changed = action === "start"
      ? await startService(current, branch.rows[0].service_timing_enabled, options, client)
      : await endService(current, action === "complete" ? "completed" : "interrupted", options, client);
    if (!changed) return { ticket: current };
    const updated = await tickets.findTicketById(ticketId, { client });
    await recordEvent(client, updated, eventTypes[action], options, current.status);
    return { ticket: updated, resolvedQueueStatus: await resolveCalledTicket(client, current, updated, options) };
  });
  if (resolvedQueueStatus) {
    await automation.maybeAutoResumeQueueDay(tenant, { location, queueDateKey: ticket.dateKey });
    await notificationService.notifyJourneyLifecycle({ ticket, tenant,
      slot: resolvedQueueStatus === "served" ? "final" : "exception", action: resolvedQueueStatus });
    await automation.maybeNotifyUpcomingTickets(tenant, { location });
    pushNotificationService.notifyCustomerQueueUpdate({ tenant, ticket, action: resolvedQueueStatus })
      .catch((error) => console.warn("[service-timing-push-skipped]", error.message));
  }
  return { ticket, snapshot: await queue.publishSnapshot(tenant, { location }) };
}

module.exports = { recordTicketService };
