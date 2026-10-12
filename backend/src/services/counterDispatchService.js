const tickets = require("../repositories/tickets");

function fail(message, code, statusCode = 409) {
  throw Object.assign(new Error(message), { statusCode, code });
}

function counterId(options) {
  if (!Object.hasOwn(options, "serviceCounter")) {
    fail("Select a counter before operating the queue.", "COUNTER_REQUIRED", 400);
  }
  const id = options.serviceCounter?._id ?? null;
  if (id !== null && (!/^[1-9]\d*$/u.test(String(id)) || !Number.isSafeInteger(Number(id)))) {
    fail("Counter not found.", "COUNTER_NOT_FOUND", 404);
  }
  return id === null ? null : String(id);
}

async function assertCounter(client, scope, id, { allowInactive = false } = {}) {
  if (id === null) return;
  const counter = await client.query(`SELECT id FROM service_counters
    WHERE id=$1 AND tenant_id=$2 AND location_id=$3
      ${allowInactive ? "" : "AND is_active=TRUE"} FOR SHARE`, [id, scope.tenantId, scope.locationId]);
  if (!counter.rows.length) fail("Counter not found.", "COUNTER_NOT_FOUND", 404);
}

// Caller holds the existing branch/resource transaction lock throughout this claim.
async function claimNext(client, scope, options) {
  const serviceCounterId = counterId(options);
  if (serviceCounterId === null) fail("Select an active counter before calling a customer.", "COUNTER_REQUIRED", 400);
  await assertCounter(client, scope, serviceCounterId);
  // An unresolved call occupies its counter across Queue Day boundaries.
  const lane = { client, locationId: scope.locationId, serviceCounterId };
  if (await tickets.findCurrentCalledTicket(scope.tenantId, { ...lane, forUpdate: true })) {
    fail("Serve or skip this counter's called ticket before calling the next one.", "COUNTER_OCCUPIED");
  }
  const query = { ...lane, dateKey: scope.dateKey };
  const next = await tickets.callNextWaitingTicket(scope.tenantId, query);
  if (!next && (await tickets.listWaitingTickets(scope.tenantId, { ...query, limit: 1 })).length) {
    fail("No waiting ticket is ready to be called yet. Arrived bookings become ready at their scheduled start.", "NO_READY_WAITING_TICKET");
  }
  return next;
}

async function lockCurrent(client, scope, options) {
  const serviceCounterId = counterId(options);
  if (!/^[1-9]\d*$/u.test(String(options.ticketId || "")) || !Number.isSafeInteger(Number(options.ticketId))) {
    fail("Refresh the queue and select the called ticket.", "CURRENT_TICKET_REQUIRED", 400);
  }
  // An inactive counter may still have a called ticket that staff must resolve.
  await assertCounter(client, scope, serviceCounterId, { allowInactive: true });
  const ticket = await tickets.findCurrentCalledTicket(scope.tenantId, {
    client, forUpdate: true, locationId: scope.locationId,
    serviceCounterId, ticketId: options.ticketId
  });
  if (!ticket) fail("This counter's called ticket changed. Refresh the queue before continuing.", "CURRENT_TICKET_CHANGED");
  return ticket;
}

function formatCalledTicket(ticket) {
  return {
    id: String(ticket._id), ticketNumber: ticket.ticketNumber,
    serviceCounterId: ticket.serviceCounterId || null,
    customerName: ticket.customerName, customerDisplayName: ticket.customerDisplayName || null,
    calledAt: ticket.calledAt, serviceStartedAt: ticket.serviceStartedAt,
    joinChannel: ticket.joinChannel, customerConfirmedAt: ticket.customerConfirmedAt || null,
    servicePriorityBand: ticket.servicePriorityBand || "normal",
    linkedBookingReference: ticket.linkedBookingReference || null
  };
}

function buildCounterDispatch(counters, calledTickets, readyWaitingCount, queueOpen) {
  const lanes = [...counters, { _id: null, slug: null, name: "Unassigned", isActive: false }];
  return lanes.map(counter => {
    const current = calledTickets.find(ticket => ticket.serviceCounterId === counter._id);
    const blockReason = !queueOpen ? "QUEUE_DAY_CLOSED" : current ? "COUNTER_OCCUPIED"
      : !counter.isActive ? "COUNTER_INACTIVE" : !readyWaitingCount ? "NO_READY_WAITING_TICKET" : null;
    return { serviceCounterId: counter._id, counterSlug: counter.slug, counterName: counter.name,
      currentTicketId: current?.id || null, canCallNext: blockReason === null, blockReason };
  });
}

module.exports = { claimNext, lockCurrent, formatCalledTicket, buildCounterDispatch };
