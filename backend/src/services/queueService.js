const crypto = require("crypto");
const db = require("../config/db");
const env = require("../config/env");
const billingRepository = require("../repositories/billing");
const notificationDeliveryRepository = require("../repositories/notificationDeliveries");
const publicBoardThemeRepository = require("../repositories/publicBoardThemes");
const queueEventRepository = require("../repositories/queueEvents");
const queueDayClosureRepository = require("../repositories/queueDayClosures");
const storeLocationRepository = require("../repositories/storeLocations");
const ticketRepository = require("../repositories/tickets");
const queueEvents = require("./queueEvents");
const queueLifecycle = require("./queueLifecycle");
const notificationService = require("./notificationService");
const queueFeeService = require("./queueFeeService");
const storeHoursService = require("./storeHoursService");
const { buildJoinUrl, buildMonitorUrl } = require("../publicLinks");

function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function getRecoveryDeadline(date = new Date()) {
  return new Date(date.getTime() + env.queueRecoveryGraceMinutes * 60 * 1000);
}

function buildQueueEventActor(options = {}) {
  return {
    actorUserId: options.actorUserId || null,
    actorRole: options.actorRole || null,
    source: options.source || "system"
  };
}

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

function formatTicketNumber(prefix, value) {
  return `${prefix}${String(value).padStart(3, "0")}`;
}

function buildLookupCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
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

async function reserveNextSequence(client, tenantId, locationId, dateKey) {
  const result = await client.query(
    `
      INSERT INTO counters (tenant_id, location_id, key, date_key, value)
      VALUES ($1, $2, 'ticket', $3, 1)
      ON CONFLICT (tenant_id, location_id, key, date_key)
      DO UPDATE SET value = counters.value + 1
      RETURNING value
    `,
    [Number(tenantId), Number(locationId), dateKey]
  );

  return result.rows[0].value;
}

async function createTicketRecord(client, data) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await ticketRepository.createTicket(
        {
          ...data,
          lookupCode: buildLookupCode()
        },
        { client }
      );
    } catch (error) {
      if (error.code !== "23505") {
        throw error;
      }
    }
  }

  const error = new Error("Unable to generate a unique ticket code.");
  error.statusCode = 500;
  throw error;
}

async function resolveLocation(tenant, options = {}) {
  if (options.location) {
    return options.location;
  }

  if (options.locationSlug) {
    const location = await storeLocationRepository.findLocationByTenantAndSlug(
      tenant._id,
      options.locationSlug
    );
    if (location) {
      return location;
    }
  }

  return storeLocationRepository.findPrimaryLocationByTenantId(tenant._id);
}

async function getQueueSnapshot(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  const locationId = location?._id;
  const dateKey = options.queueDateKey || getDateKey();
  const queueDayClosure = location
    ? await queueDayClosureRepository.findActiveClosure(tenant._id, location._id, dateKey)
    : null;
  const current = await ticketRepository.findCurrentCalledTicket(tenant._id, { locationId, dateKey });
  const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id, { locationId, dateKey });
  const overflowTickets = await ticketRepository.listWaitingTickets(tenant._id, {
    locationId,
    dateKey,
    onlyCarriedOver: true,
    limit: 50
  });
  const history = await ticketRepository.listHistoryTickets(tenant._id, {
    limit: 30,
    dateKey,
    locationId
  });
  const servedToday = await ticketRepository.countServedToday(tenant._id, dateKey, { locationId });
  const usage = await getTenantUsage(tenant._id);
  const queueFee = await queueFeeService.getQueueFeeForTenant(tenant._id);
  const activeSubscription = await queueFeeService.getActiveTenantSubscription(tenant._id);
  const openStatus = location
    ? await storeHoursService.getOpenStatus(location)
    : { isOpen: true, timezone: "Asia/Manila", summary: "Open 24 hours", today: null, nextOpenAt: null };
  const hours = location ? await storeLocationRepository.listHoursByLocationId(location._id) : [];
  const publicBoardTheme = await publicBoardThemeRepository.getResolvedTheme(
    tenant._id,
    location?._id
  );

  const nextUp = waitingTickets.slice(0, 10).map((ticket, index) => ({
    id: String(ticket._id),
    ticketNumber: ticket.ticketNumber,
    customerName: ticket.customerName,
    status: ticket.status,
    position: index + 1,
    joinChannel: ticket.joinChannel,
    createdAt: ticket.createdAt,
    isCarriedOver: Boolean(ticket.carriedOverAt || ticket.carryOverCount > 0),
    carryOverCount: ticket.carryOverCount || 0,
    carriedOverAt: ticket.carriedOverAt || null
  }));

  const overflow = overflowTickets.map((ticket, index) => ({
    id: String(ticket._id),
    ticketNumber: ticket.ticketNumber,
    customerName: ticket.customerName,
    status: ticket.status,
    position: index + 1,
    joinChannel: ticket.joinChannel,
    createdAt: ticket.createdAt,
    isCarriedOver: true,
    carryOverCount: ticket.carryOverCount || 0,
    carriedOverAt: ticket.carriedOverAt || null
  }));

  let focusTicket = null;
  if (options.lookupCode) {
    const ticket = await ticketRepository.findTicketByTenantAndLookupCode(
      tenant._id,
      options.lookupCode.toUpperCase()
    );

    if (ticket) {
      const position =
        ticket.status === "waiting"
          ? (
              ticket.dateKey === dateKey
                ? waitingTickets
                : await ticketRepository.listWaitingTickets(tenant._id, {
                    locationId,
                    dateKey: ticket.dateKey
                  })
            ).findIndex((waitingTicket) => String(waitingTicket._id) === String(ticket._id)) + 1
          : null;

      focusTicket = {
        id: String(ticket._id),
        lookupCode: ticket.lookupCode,
        ticketNumber: ticket.ticketNumber,
        customerName: ticket.customerName,
        status: ticket.status,
        position: position || null,
        estimatedWaitMinutes:
          position && position > 0 ? position * tenant.averageServiceMinutes : 0,
        joinedAt: ticket.createdAt
      };
    }
  }

  return {
    tenant: {
      id: String(tenant._id),
      name: tenant.name,
      slug: tenant.slug,
      queuePrefix: tenant.queuePrefix,
      averageServiceMinutes: tenant.averageServiceMinutes,
      notificationThreshold: tenant.notificationThreshold,
      contactEmail: tenant.contactEmail || "",
      contactPhone: tenant.contactPhone || "",
      joinUrl: buildJoinUrl(env.appBaseUrl, tenant.slug, location?.slug),
      monitorUrl: buildMonitorUrl(env.appBaseUrl, tenant.slug, location?.slug),
      isActive: Boolean(activeSubscription),
      queueFee
    },
    location: location
      ? {
          id: String(location._id),
          tenantId: String(location.tenantId),
          name: location.name,
          slug: location.slug,
          addressLine1: location.addressLine1,
          addressLine2: location.addressLine2,
          city: location.city,
          province: location.province,
          postalCode: location.postalCode,
          country: location.country,
          contactEmail: location.contactEmail,
          contactPhone: location.contactPhone,
          timezone: location.timezone,
          isPrimary: location.isPrimary,
          isActive: location.isActive,
          joinUrl: buildJoinUrl(env.appBaseUrl, tenant.slug, location.slug),
          monitorUrl: buildMonitorUrl(env.appBaseUrl, tenant.slug, location.slug),
          openStatus,
          hours: hours.map((hour) => ({
            weekday: hour.weekday,
            opensAt: hour.opensAt,
            closesAt: hour.closesAt,
            isClosed: hour.isClosed
          }))
        }
      : null,
    publicBoardTheme,
    queueDay: {
      isClosed: Boolean(queueDayClosure),
      queueDateKey: dateKey,
      closedAt: queueDayClosure?.closedAt || queueDayClosure?.createdAt || null,
      reopenedAt: queueDayClosure?.reopenedAt || null,
      closureReason: queueDayClosure?.closureReason || null
    },
    stats: {
      waitingCount: waitingTickets.length,
      servedToday,
      currentTicketNumber: current ? current.ticketNumber : null,
      estimatedWaitMinutes:
        waitingTickets.length > 0 ? waitingTickets.length * tenant.averageServiceMinutes : 0
    },
    current: current
      ? {
          id: String(current._id),
          ticketNumber: current.ticketNumber,
          customerName: current.customerName,
          calledAt: current.calledAt
        }
      : null,
    nextUp,
    overflow,
    history: history.map((ticket) => ({
      id: String(ticket._id),
      lookupCode: ticket.lookupCode,
      ticketNumber: ticket.ticketNumber,
      customerName: ticket.customerName,
      status: ticket.status,
      updatedAt: ticket.updatedAt,
      rejoinDeadlineAt: ticket.rejoinDeadlineAt || null,
      servicePriorityBand: ticket.servicePriorityBand || "normal"
    })),
    usage,
    focusTicket
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

async function publishSnapshot(tenant, options = {}) {
  const snapshot = await getQueueSnapshot(tenant, options);
  queueEvents.publish(tenant.slug, snapshot);
  return snapshot;
}

async function maybeNotifyUpcomingTickets(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id, {
    limit: tenant.notificationThreshold,
    locationId: location?._id
  });
  const cooldownMs = env.notificationCooldownMinutes * 60 * 1000;

  for (let index = 0; index < waitingTickets.length; index += 1) {
    const ticket = waitingTickets[index];
    const shouldNotify =
      !ticket.notifiedAlmostThereAt ||
      Date.now() - ticket.notifiedAlmostThereAt.getTime() > cooldownMs;

    if (!shouldNotify) {
      continue;
    }

    if (!(ticket.notifyByEmail || ticket.notifyBySms)) {
      continue;
    }

    await notificationService.notifyAlmostThere({
      ticket,
      tenant,
      position: index + 1
    });

    await ticketRepository.markTicketNotifiedAlmostThere(ticket._id);
  }
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
  actorRole
}) {
  const resolvedLocation = await resolveLocation(tenant, { location });
  await assertQueueDayOpen(tenant, resolvedLocation);
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
      notes
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
  const snapshot = await publishSnapshot(tenant, {
    lookupCode: ticket.lookupCode,
    location: resolvedLocation
  });

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
  notes
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
    notes
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

  await maybeNotifyUpcomingTickets(tenant, { location });
  const snapshot = await publishSnapshot(tenant, { location });

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

  await maybeNotifyUpcomingTickets(tenant, { location });
  const snapshot = await publishSnapshot(tenant, { location });

  return { ticket, snapshot };
}

async function cancelTicket(tenant, lookupCode, options = {}) {
  const location = await resolveLocation(tenant, options);
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

  await maybeNotifyUpcomingTickets(tenant, { location });
  const snapshot = await publishSnapshot(tenant, { location });

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

    const reopenedTickets = await ticketRepository.reopenTicketsFromClosure(tenant._id, {
      client,
      locationId: location._id,
      dateKey: queueDateKey,
      ticketIds: activeClosure.affectedTicketIds
    });
    const actor = buildQueueEventActor({
      actorUserId: options.actorUserId,
      actorRole: options.actorRole,
      source: options.source || "vendor"
    });

    for (const ticket of reopenedTickets) {
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
        affectedTicketIds: activeClosure.affectedTicketIds
      }
    });
  });

  await maybeNotifyUpcomingTickets(tenant, { location });
  return publishSnapshot(tenant, { location });
}

async function restoreSkippedTicket(tenant, ticketId, options = {}) {
  const location = await resolveLocation(tenant, options);
  const dateKey = options.queueDateKey || getDateKey();

  const ticket = await db.withTransaction(async (client) => {
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
  const snapshot = await publishSnapshot(tenant, { location });

  return { ticket, snapshot };
}

module.exports = {
  resolveLocation,
  createTicket,
  createTicketForTenantInTransaction,
  getQueueSnapshot,
  callNextTicket,
  updateCurrentTicketStatus,
  cancelTicket,
  closeQueueDay,
  reopenQueueDay,
  restoreSkippedTicket,
  publishSnapshot,
  maybeNotifyUpcomingTickets
};
