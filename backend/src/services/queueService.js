const db = require("../config/db");
const billingRepository = require("../repositories/billing");
const notificationDeliveryRepository = require("../repositories/notificationDeliveries");
const queueEventRepository = require("../repositories/queueEvents");
const queueDayClosureRepository = require("../repositories/queueDayClosures");
const queueDayPauseRepository = require("../repositories/queueDayPauses");
const ticketRepository = require("../repositories/tickets");
const bookingRepository = require("../repositories/bookings");
const queueEvents = require("./queueEvents");
const queueLifecycle = require("./queueLifecycle");
const notificationService = require("./notificationService");
const pushNotificationService = require("./pushNotificationService");
const {
  buildQueueEventActor,
  formatTicketNumber,
  getDateKey,
  getRecoveryDeadline
} = require("./queueHelpers");
const { buildQueueSnapshot, resolveLocation } = require("./queueSnapshotHelpers");
const {
  createTicketRecord,
  reserveNextSequence
} = require("./queueTicketPersistenceHelpers");
const {
  maybeAutoPauseQueueDay,
  maybeAutoResumeQueueDay,
  maybeNotifyUpcomingTickets
} = require("./queueAutomationHelpers");

async function appendQueueEvent(client, ticket, eventType, options = {}) {
  return queueEventRepository.createQueueEvent(
    {
      ticketId: ticket?._id || null,
      tenantId: ticket.tenantId,
      locationId: ticket.locationId,
      queueDateKey: ticket.dateKey,
      eventType,
      fromStatus: options.fromStatus || null,
      toStatus: options.toStatus || null,
      actorUserId: options.actorUserId || null,
      actorRole: options.actorRole || null,
      source: options.source || "system",
      metadata: options.metadata || {}
    },
    { client }
  );
}

async function appendScopedQueueEvent(client, data) {
  return queueEventRepository.createQueueEvent(
    {
      ticketId: null,
      tenantId: data.tenantId,
      locationId: data.locationId,
      queueDateKey: data.queueDateKey,
      eventType: data.eventType,
      fromStatus: null,
      toStatus: null,
      actorUserId: data.actorUserId || null,
      actorRole: data.actorRole || null,
      source: data.source || "system",
      metadata: data.metadata || {}
    },
    { client }
  );
}


function getCurrentMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function getTenantUsage(tenantId) {
  const subscription = await billingRepository.getActiveSubscriptionByTenantId(tenantId);
  const periodStart = subscription?.currentPeriodStart || getCurrentMonthStart();
  const periodEnd = subscription?.currentPeriodEnd || null;
  const emailsSentThisPeriod = await notificationDeliveryRepository.countSentTransactionalEmails(tenantId, {
    from: periodStart,
    to: periodEnd,
    ignoreMissingTable: true
  });

  return {
    periodStart,
    periodEnd,
    emailsSentThisPeriod
  };
}

async function assertQueueDayOpen(tenant, location, options = {}) {
  const queueDateKey = options.queueDateKey || getDateKey();
  const activeClosure = await queueDayClosureRepository.findActiveClosure(
    tenant._id,
    location._id,
    queueDateKey,
    { client: options.client }
  );
  if (!activeClosure) {
    return;
  }

  const error = new Error("This queue day is closed. Reopen the queue to continue operations.");
  error.statusCode = 409;
  error.code = "QUEUE_DAY_CLOSED";
  throw error;
}

async function getQueueSnapshot(tenant, options = {}) {
  return buildQueueSnapshot(tenant, options, getTenantUsage);
}

async function assertQueueIntakeOpen(tenant, location, options = {}) {
  await assertQueueDayOpen(tenant, location, options);

  const queueDateKey = options.queueDateKey || getDateKey();
  const activePause = await queueDayPauseRepository.findActivePause(
    tenant._id,
    location._id,
    queueDateKey,
    { client: options.client }
  );

  if (!activePause) {
    return;
  }

  const reasonText = activePause.pauseReason ? ` ${activePause.pauseReason}` : "";
  const error = new Error(
    `This queue is paused for new joins.${reasonText}`.trim()
  );
  error.statusCode = 409;
  error.code = "QUEUE_INTAKE_PAUSED";
  throw error;
}

async function assertRestoreCapacityAvailable(tenant, location, options = {}) {
  if (!tenant.autoPauseEnabled || !tenant.autoPauseThreshold) {
    return;
  }

  const queueDateKey = options.queueDateKey || getDateKey();
  const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id, {
    client: options.client,
    locationId: location._id,
    dateKey: queueDateKey
  });

  if (waitingTickets.length < Number(tenant.autoPauseThreshold)) {
    return;
  }

  const error = new Error(
    `This queue is already at its intake threshold of ${tenant.autoPauseThreshold} waiting tickets. Resume or clear space before restoring a missed ticket.`
  );
  error.statusCode = 409;
  error.code = "QUEUE_RESTORE_THRESHOLD_REACHED";
  throw error;
}

async function publishSnapshot(tenant, options = {}) {
  const snapshot = await getQueueSnapshot(tenant, options);
  queueEvents.publish(tenant.slug, snapshot);
  return snapshot;
}

async function createTicket({
  tenant,
  location,
  userId,
  customerName,
  customerEmail,
  customerPhone,
  notifyByEmail,
  notifyBySms,
  joinChannel,
  notes,
  actorUserId,
  actorRole,
  servicePriorityBand
}) {
  const resolvedLocation = await resolveLocation(tenant, { location });
  await assertQueueIntakeOpen(tenant, resolvedLocation);
  const ticket = await db.withTransaction(async (client) => {
    const createdTicket = await createTicketForTenantInTransaction(client, {
      tenant,
      location: resolvedLocation,
      userId,
      customerName,
      customerEmail,
      customerPhone,
      notifyByEmail,
      notifyBySms,
      joinChannel,
      notes,
      servicePriorityBand
    });

    const actor = buildQueueEventActor({
      actorUserId,
      actorRole,
      source: joinChannel === "vendor" ? "vendor" : "public"
    });
    await appendQueueEvent(client, createdTicket, "ticket_created", {
      toStatus: createdTicket.status,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {
        joinChannel: createdTicket.joinChannel
      }
    });

    return createdTicket;
  });

  await maybeNotifyUpcomingTickets(tenant, { location: resolvedLocation });
  await maybeAutoPauseQueueDay(tenant, { location: resolvedLocation });
  const snapshot = await publishSnapshot(tenant, {
    lookupCode: ticket.lookupCode,
    location: resolvedLocation
  });

  if (tenant.notificationSettings?.queueJoin !== false) {
    pushNotificationService.notifyVendorQueueJoin({ tenant, ticket }).catch((error) => {
      console.warn("[web-push-queue-join-skipped]", error.message);
    });
  }

  return { ticket, snapshot };
}

async function createTicketForTenantInTransaction(client, {
  tenant,
  location,
  userId,
  customerName,
  customerEmail,
  customerPhone,
  notifyByEmail,
  notifyBySms,
  joinChannel,
  notes,
  servicePriorityBand
}) {
  const dateKey = getDateKey();
  const resolvedLocation = location || (await resolveLocation(tenant));
  const sequence = await reserveNextSequence(client, tenant._id, resolvedLocation._id, dateKey);

  return createTicketRecord(client, {
    tenantId: tenant._id,
    locationId: resolvedLocation._id,
    userId,
    ticketNumber: formatTicketNumber(tenant.queuePrefix, sequence),
    sequence,
    dateKey,
    customerName,
    customerEmail,
    customerPhone,
    notifyByEmail: Boolean(notifyByEmail && customerEmail),
    notifyBySms: Boolean(notifyBySms && customerPhone),
    joinChannel: joinChannel || "online",
    notes,
    servicePriorityBand
  });
}

async function callNextTicket(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  await assertQueueDayOpen(tenant, location);
  const dateKey = options.queueDateKey || getDateKey();
  const ticket = await db.withTransaction(async (client) => {
    const activeTicket = await ticketRepository.findCurrentCalledTicket(tenant._id, {
      client,
      locationId: location?._id,
      dateKey
    });
    if (activeTicket) {
      const error = new Error("Serve or skip the current ticket before calling the next one.");
      error.statusCode = 400;
      throw error;
    }

    const nextWaitingTicket = (await ticketRepository.listWaitingTickets(tenant._id, {
      client,
      locationId: location?._id,
      dateKey,
      limit: 1
    }))[0];
    if (!nextWaitingTicket) {
      return null;
    }

    queueLifecycle.assertValidTransition(nextWaitingTicket.status, "called");
    const nextTicket = await ticketRepository.callNextWaitingTicket(tenant._id, {
      client,
      locationId: location?._id,
      serviceCounterId: options.serviceCounter?._id,
      dateKey
    });
    if (!nextTicket) {
      return null;
    }

    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor"
    });
    await appendQueueEvent(client, nextTicket, "ticket_called", {
      fromStatus: "waiting",
      toStatus: "called",
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {
        serviceCounterId: options.serviceCounter?._id || null
      }
    });

    return nextTicket;
  });

  if (!ticket) {
    return null;
  }

  if (ticket.notifyByEmail || ticket.notifyBySms) {
    await notificationService.notifyCalled({ ticket, tenant });
  }

  await maybeAutoResumeQueueDay(tenant, { location, queueDateKey: dateKey });
  await maybeNotifyUpcomingTickets(tenant, { location });
  const snapshot = await publishSnapshot(tenant, { location });
  pushNotificationService.notifyCustomerQueueUpdate({
    tenant,
    ticket,
    action: "called"
  }).catch((error) => {
    console.warn("[web-push-customer-queue-called-skipped]", error.message);
  });

  return { ticket, snapshot };
}

async function updateCurrentTicketStatus(tenant, status, options = {}) {
  const location = await resolveLocation(tenant, options);
  queueLifecycle.assertSupportedCurrentTicketResolution(status);
  const dateKey = options.queueDateKey || getDateKey();
  const ticket = await db.withTransaction(async (client) => {
    const currentTicket = await ticketRepository.findCurrentCalledTicket(tenant._id, {
      client,
      locationId: location?._id,
      dateKey
    });
    if (!currentTicket) {
      return null;
    }

    queueLifecycle.assertValidTransition(currentTicket.status, status);
    const updatedTicket = await ticketRepository.updateCurrentCalledTicketStatus(tenant._id, status, {
      client,
      locationId: location?._id,
      dateKey,
      rejoinDeadlineAt: status === "skipped" ? getRecoveryDeadline() : null
    });
    if (!updatedTicket) {
      return null;
    }

    if (["served", "cancelled"].includes(status)) {
      await bookingRepository.updateBookingByQueueTicketId(
        updatedTicket._id,
        { status: status === "served" ? "completed" : "canceled" },
        { client }
      );
    }

    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor"
    });
    const eventTypeByStatus = {
      served: "ticket_served",
      skipped: "ticket_skipped",
      cancelled: "ticket_cancelled",
      unserved: "ticket_unserved"
    };
    await appendQueueEvent(client, updatedTicket, eventTypeByStatus[status], {
      fromStatus: currentTicket.status,
      toStatus: status,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {}
    });

    return updatedTicket;
  });

  if (!ticket) {
    return null;
  }

  if (status === "served" || status === "cancelled") {
    await maybeAutoResumeQueueDay(tenant, { location, queueDateKey: dateKey });
  }
  await maybeNotifyUpcomingTickets(tenant, { location });
  const snapshot = await publishSnapshot(tenant, { location });
  pushNotificationService.notifyCustomerQueueUpdate({
    tenant,
    ticket,
    action: status
  }).catch((error) => {
    console.warn("[web-push-customer-queue-status-skipped]", error.message);
  });

  return { ticket, snapshot };
}

async function cancelTicket(tenant, lookupCode, options = {}) {
  const location = options.location || (await resolveLocation(tenant, options));
  const normalizedLookupCode = lookupCode.toUpperCase();
  const ticket = await db.withTransaction(async (client) => {
    const existingTicket = await ticketRepository.findTicketByTenantAndLookupCode(
      tenant._id,
      normalizedLookupCode,
      { client }
    );
    if (!existingTicket) {
      return null;
    }

    queueLifecycle.assertValidTransition(existingTicket.status, "cancelled");
    const cancelledTicket = await ticketRepository.cancelWaitingTicket(
      tenant._id,
      normalizedLookupCode,
      { client }
    );
    if (!cancelledTicket) {
      return null;
    }

    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "public"
    });
    await appendQueueEvent(client, cancelledTicket, "ticket_cancelled", {
      fromStatus: existingTicket.status,
      toStatus: "cancelled",
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {
        lookupCode: cancelledTicket.lookupCode
      }
    });

    return cancelledTicket;
  });

  if (!ticket) {
    return null;
  }

  await maybeAutoResumeQueueDay(tenant, { location });
  await maybeNotifyUpcomingTickets(tenant, { location });
  const snapshot = await publishSnapshot(tenant, { location });
  pushNotificationService.notifyCustomerQueueUpdate({
    tenant,
    ticket,
    action: "cancelled"
  }).catch((error) => {
    console.warn("[web-push-customer-queue-cancel-skipped]", error.message);
  });

  return { ticket, snapshot };
}

async function closeQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) {
    const error = new Error("A location is required to close the queue.");
    error.statusCode = 400;
    throw error;
  }

  const queueDateKey = options.queueDateKey || getDateKey();
  const nextQueueDateKey = options.nextQueueDateKey || getDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  let unservedTicketsForPush = [];
  let carriedTicketsForPush = [];
  await db.withTransaction(async (client) => {
    const existingClosure = await queueDayClosureRepository.findActiveClosure(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (existingClosure) {
      const error = new Error("This queue day is already closed.");
      error.statusCode = 409;
      throw error;
    }

    const activePause = await queueDayPauseRepository.findActivePause(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (activePause) {
      await queueDayPauseRepository.resumePause(activePause._id, options.actorUserId || null, { client });
    }

    const affectedTickets = await ticketRepository.listTicketsForQueueClosure(tenant._id, {
      client,
      locationId: location._id,
      dateKey: queueDateKey
    });
    const calledTickets = affectedTickets.filter((ticket) => ticket.status === "called");
    const waitingTickets = affectedTickets.filter((ticket) => ticket.status === "waiting");
    const calledTicketIds = calledTickets.map((ticket) => ticket._id);
    const waitingTicketIds = waitingTickets.map((ticket) => ticket._id);
    const updatedTickets = await ticketRepository.markTicketsUnservedForClosure(tenant._id, {
      client,
      locationId: location._id,
      dateKey: queueDateKey,
      ticketIds: calledTicketIds
    });
    const carriedTickets = await ticketRepository.carryOverWaitingTickets(tenant._id, {
      client,
      locationId: location._id,
      fromDateKey: queueDateKey,
      toDateKey: nextQueueDateKey,
      ticketIds: waitingTicketIds
    });
    unservedTicketsForPush = updatedTickets;
    carriedTicketsForPush = carriedTickets;
    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor"
    });

    for (const ticket of updatedTickets) {
      const originalTicket = calledTickets.find(
        (candidate) => String(candidate._id) === String(ticket._id)
      );
      await appendQueueEvent(client, ticket, "ticket_unserved", {
        fromStatus: originalTicket?.status || null,
        toStatus: "unserved",
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        source: actor.source,
        metadata: {
          reason: "queue_day_closed"
        }
      });
    }

    for (const ticket of carriedTickets) {
      const originalTicket = waitingTickets.find(
        (candidate) => String(candidate._id) === String(ticket._id)
      );
      await appendQueueEvent(client, ticket, "ticket_carried_over", {
        fromStatus: originalTicket?.status || "waiting",
        toStatus: "waiting",
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        source: actor.source,
        metadata: {
          fromQueueDateKey: queueDateKey,
          toQueueDateKey: nextQueueDateKey,
          carryOverCount: ticket.carryOverCount
        }
      });
    }

    await queueDayClosureRepository.createClosure(
      {
        tenantId: tenant._id,
        locationId: location._id,
        queueDateKey,
        nextQueueDateKey,
        closureReason: options.reason || "",
        affectedTicketIds: [...calledTicketIds, ...waitingTicketIds],
        waitingCarriedCount: carriedTickets.length,
        calledUnservedCount: updatedTickets.length,
        closedByUserId: options.actorUserId || null
      },
      { client }
    );

    await appendScopedQueueEvent(client, {
      tenantId: tenant._id,
      locationId: location._id,
      queueDateKey,
      eventType: "queue_closed",
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {
        closureReason: options.reason || "",
        affectedTicketIds: [...calledTicketIds, ...waitingTicketIds],
        waitingCarriedCount: carriedTickets.length,
        calledUnservedCount: updatedTickets.length,
        nextQueueDateKey
      }
    });
  });

  for (const ticket of unservedTicketsForPush) {
    pushNotificationService.notifyCustomerQueueUpdate({
      tenant,
      ticket,
      action: "unserved"
    }).catch((error) => {
      console.warn("[web-push-customer-queue-unserved-skipped]", error.message);
    });
  }

  for (const ticket of carriedTicketsForPush) {
    pushNotificationService.notifyCustomerQueueUpdate({
      tenant,
      ticket,
      action: "carried_over"
    }).catch((error) => {
      console.warn("[web-push-customer-queue-carried-over-skipped]", error.message);
    });
  }

  pushNotificationService.notifyVendorQueueLifecycle({
    tenant,
    location,
    action: "closed"
  }).catch((error) => {
    console.warn("[web-push-vendor-queue-closed-skipped]", error.message);
  });

  return publishSnapshot(tenant, { location });
}

async function reopenQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) {
    const error = new Error("A location is required to reopen the queue.");
    error.statusCode = 400;
    throw error;
  }

  const queueDateKey = options.queueDateKey || getDateKey();
  let reopenedTicketsForPush = [];
  await db.withTransaction(async (client) => {
    const activeClosure = await queueDayClosureRepository.findActiveClosure(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (!activeClosure) {
      const error = new Error("There is no closed queue day to reopen.");
      error.statusCode = 404;
      throw error;
    }

    const reopenedUnservedTickets = await ticketRepository.reopenTicketsFromClosure(tenant._id, {
      client,
      locationId: location._id,
      dateKey: queueDateKey,
      ticketIds: activeClosure.affectedTicketIds
    });
    const restoredCarriedTickets = await ticketRepository.restoreCarriedOverTicketsFromClosure(
      tenant._id,
      {
        client,
        locationId: location._id,
        fromDateKey: activeClosure.nextQueueDateKey,
        toDateKey: queueDateKey,
        ticketIds: activeClosure.affectedTicketIds
      }
    );
    reopenedTicketsForPush = [...reopenedUnservedTickets, ...restoredCarriedTickets];
    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor"
    });

    for (const ticket of reopenedUnservedTickets) {
      await appendQueueEvent(client, ticket, "ticket_requeued", {
        fromStatus: "unserved",
        toStatus: "waiting",
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        source: actor.source,
        metadata: {
          reason: "queue_day_reopened"
        }
      });
    }

    for (const ticket of restoredCarriedTickets) {
      await appendQueueEvent(client, ticket, "ticket_requeued", {
        fromStatus: "waiting",
        toStatus: "waiting",
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        source: actor.source,
        metadata: {
          reason: "queue_day_reopened",
          fromQueueDateKey: activeClosure.nextQueueDateKey,
          toQueueDateKey: queueDateKey,
          restoredFromCarryOver: true
        }
      });
    }

    await queueDayClosureRepository.reopenClosure(activeClosure._id, options.actorUserId || null, {
      client
    });

    await appendScopedQueueEvent(client, {
      tenantId: tenant._id,
      locationId: location._id,
      queueDateKey,
      eventType: "queue_reopened",
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {
        affectedTicketIds: activeClosure.affectedTicketIds,
        restoredCarriedTicketIds: restoredCarriedTickets.map((ticket) => ticket._id)
      }
    });
  });

  await maybeNotifyUpcomingTickets(tenant, { location });
  for (const ticket of reopenedTicketsForPush) {
    pushNotificationService.notifyCustomerQueueUpdate({
      tenant,
      ticket,
      action: "requeued"
    }).catch((error) => {
      console.warn("[web-push-customer-queue-reopened-skipped]", error.message);
    });
  }
  pushNotificationService.notifyVendorQueueLifecycle({
    tenant,
    location,
    action: "reopened"
  }).catch((error) => {
    console.warn("[web-push-vendor-queue-reopened-skipped]", error.message);
  });
  return publishSnapshot(tenant, { location });
}

async function pauseQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) {
    const error = new Error("A location is required to pause queue intake.");
    error.statusCode = 400;
    throw error;
  }

  const queueDateKey = options.queueDateKey || getDateKey();
  await db.withTransaction(async (client) => {
    const activeClosure = await queueDayClosureRepository.findActiveClosure(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (activeClosure) {
      const error = new Error("This queue day is already closed.");
      error.statusCode = 409;
      throw error;
    }

    const activePause = await queueDayPauseRepository.findActivePause(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (activePause) {
      const error = new Error("This queue is already paused.");
      error.statusCode = 409;
      throw error;
    }

    const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id, {
      client,
      locationId: location._id,
      dateKey: queueDateKey
    });

    const pause = await queueDayPauseRepository.createPause(
      {
        tenantId: tenant._id,
        locationId: location._id,
        queueDateKey,
        pauseReason: options.reason || "Paused from vendor dashboard",
        pauseMode: options.pauseMode || "manual",
        pausedByUserId: options.actorUserId || null
      },
      { client }
    );

    await appendScopedQueueEvent(client, {
      tenantId: tenant._id,
      locationId: location._id,
      queueDateKey,
      eventType: "queue_paused",
      actorUserId: options.actorUserId || null,
      actorRole: options.actorRole || null,
      source: options.source || "vendor",
      metadata: {
        pauseMode: pause.pauseMode,
        pauseReason: pause.pauseReason,
        waitingCount: waitingTickets.length,
        autoPauseThreshold: tenant.autoPauseThreshold || null
      }
    });
  });

  pushNotificationService.notifyVendorQueueLifecycle({
    tenant,
    location,
    action: "paused"
  }).catch((error) => {
    console.warn("[web-push-vendor-queue-paused-skipped]", error.message);
  });

  return publishSnapshot(tenant, { location, queueDateKey });
}

async function resumeQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) {
    const error = new Error("A location is required to resume queue intake.");
    error.statusCode = 400;
    throw error;
  }

  const queueDateKey = options.queueDateKey || getDateKey();
  await db.withTransaction(async (client) => {
    const activePause = await queueDayPauseRepository.findActivePause(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (!activePause) {
      const error = new Error("This queue is not paused.");
      error.statusCode = 404;
      throw error;
    }

    await queueDayPauseRepository.resumePause(activePause._id, options.actorUserId || null, {
      client
    });

    await appendScopedQueueEvent(client, {
      tenantId: tenant._id,
      locationId: location._id,
      queueDateKey,
      eventType: "queue_resumed",
      actorUserId: options.actorUserId || null,
      actorRole: options.actorRole || null,
      source: options.source || "vendor",
      metadata: {
        pauseMode: activePause.pauseMode,
        pauseReason: activePause.pauseReason
      }
    });
  });

  pushNotificationService.notifyVendorQueueLifecycle({
    tenant,
    location,
    action: "resumed"
  }).catch((error) => {
    console.warn("[web-push-vendor-queue-resumed-skipped]", error.message);
  });

  return publishSnapshot(tenant, { location, queueDateKey });
}

async function restoreSkippedTicket(tenant, ticketId, options = {}) {
  const location = await resolveLocation(tenant, options);
  const dateKey = options.queueDateKey || getDateKey();

  const ticket = await db.withTransaction(async (client) => {
    await assertQueueIntakeOpen(tenant, location, { client, queueDateKey: dateKey });
    await assertRestoreCapacityAvailable(tenant, location, { client, queueDateKey: dateKey });

    const targetTicket = await ticketRepository.findTicketById(ticketId, { client });

    if (!targetTicket || String(targetTicket.tenantId) !== String(tenant._id)) {
      const error = new Error("Skipped ticket not found.");
      error.statusCode = 404;
      throw error;
    }

    if (
      options.lookupCode &&
      String(targetTicket.lookupCode || "").toUpperCase() !==
        String(options.lookupCode || "").toUpperCase()
    ) {
      const error = new Error("Skipped ticket not found.");
      error.statusCode = 404;
      throw error;
    }

    if (targetTicket.locationId && String(targetTicket.locationId) !== String(location._id)) {
      const error = new Error("Skipped ticket not found.");
      error.statusCode = 404;
      throw error;
    }

    if (targetTicket.status !== "skipped") {
      const error = new Error("Only skipped tickets can be restored.");
      error.statusCode = 409;
      throw error;
    }

    if (!targetTicket.skippedAt) {
      const error = new Error("This skipped ticket is missing recovery metadata.");
      error.statusCode = 409;
      throw error;
    }

    const recoveryDeadline = targetTicket.rejoinDeadlineAt
      ? new Date(targetTicket.rejoinDeadlineAt)
      : null;
    const servicePriorityBand =
      recoveryDeadline && recoveryDeadline.getTime() > Date.now() ? "recovery" : "normal";

    queueLifecycle.assertValidTransition(targetTicket.status, "waiting");
    const restoredTicket = await ticketRepository.restoreSkippedTicket(tenant._id, ticketId, {
      client,
      locationId: location._id,
      servicePriorityBand
    });

    if (!restoredTicket) {
      return null;
    }

    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor"
    });

    await appendQueueEvent(client, restoredTicket, "ticket_requeued", {
      fromStatus: "skipped",
      toStatus: "waiting",
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      source: actor.source,
      metadata: {
        reason: servicePriorityBand === "recovery" ? "missed_ticket_recovery" : "missed_ticket_rejoin_expired",
        servicePriorityBand,
        queueDateKey: dateKey
      }
    });

    return restoredTicket;
  });

  if (!ticket) {
    return null;
  }

  await maybeNotifyUpcomingTickets(tenant, { location });
  await maybeAutoPauseQueueDay(tenant, { location, queueDateKey: dateKey });
  const snapshot = await publishSnapshot(tenant, { location });
  pushNotificationService.notifyCustomerQueueUpdate({
    tenant,
    ticket,
    action: "requeued"
  }).catch((error) => {
    console.warn("[web-push-customer-queue-requeued-skipped]", error.message);
  });

  return { ticket, snapshot };
}

module.exports = {
  resolveLocation,
  createTicket,
  createTicketForTenantInTransaction,
  assertQueueIntakeOpen,
  getQueueSnapshot,
  callNextTicket,
  updateCurrentTicketStatus,
  cancelTicket,
  closeQueueDay,
  reopenQueueDay,
  pauseQueueDay,
  resumeQueueDay,
  restoreSkippedTicket,
  publishSnapshot,
  maybeNotifyUpcomingTickets,
  maybeAutoPauseQueueDay
};
