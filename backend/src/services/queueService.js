const crypto = require("crypto");
const db = require("../config/db");
const env = require("../config/env");
const billingRepository = require("../repositories/billing");
const notificationDeliveryRepository = require("../repositories/notificationDeliveries");
const publicBoardThemeRepository = require("../repositories/publicBoardThemes");
const storeLocationRepository = require("../repositories/storeLocations");
const ticketRepository = require("../repositories/tickets");
const queueEvents = require("./queueEvents");
const notificationService = require("./notificationService");
const queueFeeService = require("./queueFeeService");
const storeHoursService = require("./storeHoursService");
const { buildJoinUrl, buildMonitorUrl } = require("../publicLinks");

function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
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

async function rolloverQueueDayForTenant(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  const dateKey = getDateKey();
  await ticketRepository.rolloverQueueDay(tenant._id, dateKey, {
    client: options.client,
    locationId: location?._id
  });

  return { dateKey, location };
}

async function getQueueSnapshot(tenant, options = {}) {
  const { dateKey, location } = await rolloverQueueDayForTenant(tenant, options);
  const locationId = location?._id;
  const current = await ticketRepository.findCurrentCalledTicket(tenant._id, {
    locationId,
    queueDateKey: dateKey
  });
  const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id, {
    locationId,
    queueDateKey: dateKey
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
    createdAt: ticket.createdAt
  }));

  let focusTicket = null;
  if (options.lookupCode) {
    const ticket = await ticketRepository.findTicketByTenantAndLookupCode(
      tenant._id,
      options.lookupCode.toUpperCase()
    );

    if (ticket) {
      const position =
        ticket.status === "waiting" && ticket.queueDateKey === dateKey
          ? waitingTickets.findIndex(
              (waitingTicket) => String(waitingTicket._id) === String(ticket._id)
            ) + 1
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
    history: history.map((ticket) => ({
      id: String(ticket._id),
      ticketNumber: ticket.ticketNumber,
      customerName: ticket.customerName,
      status: ticket.status,
      updatedAt: ticket.updatedAt
    })),
    usage,
    focusTicket
  };
}

async function publishSnapshot(tenant, options = {}) {
  const snapshot = await getQueueSnapshot(tenant, options);
  queueEvents.publish(tenant.slug, snapshot);
  return snapshot;
}

async function maybeNotifyUpcomingTickets(tenant, options = {}) {
  const { dateKey, location } = await rolloverQueueDayForTenant(tenant, options);
  const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id, {
    limit: tenant.notificationThreshold,
    locationId: location?._id,
    queueDateKey: dateKey
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
  notes
}) {
  const resolvedLocation = await resolveLocation(tenant, { location });
  const ticket = await db.withTransaction(async (client) => {
    return createTicketForTenantInTransaction(client, {
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
  await ticketRepository.rolloverQueueDay(tenant._id, dateKey, {
    client,
    locationId: resolvedLocation._id
  });
  const sequence = await reserveNextSequence(client, tenant._id, resolvedLocation._id, dateKey);

  return createTicketRecord(client, {
    tenantId: tenant._id,
    locationId: resolvedLocation._id,
    userId,
    ticketNumber: formatTicketNumber(tenant.queuePrefix, sequence),
    sequence,
    dateKey,
    queueDateKey: dateKey,
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
  const dateKey = getDateKey();
  const ticket = await db.withTransaction(async (client) => {
    await ticketRepository.rolloverQueueDay(tenant._id, dateKey, {
      client,
      locationId: location?._id
    });
    const activeTicket = await ticketRepository.findCurrentCalledTicket(tenant._id, {
      client,
      locationId: location?._id,
      queueDateKey: dateKey
    });
    if (activeTicket) {
      const error = new Error("Serve or skip the current ticket before calling the next one.");
      error.statusCode = 400;
      throw error;
    }

    return ticketRepository.callNextWaitingTicket(tenant._id, {
      client,
      locationId: location?._id,
      queueDateKey: dateKey,
      serviceCounterId: options.serviceCounter?._id
    });
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
  const dateKey = getDateKey();
  const ticket = await db.withTransaction(async (client) => {
    await ticketRepository.rolloverQueueDay(tenant._id, dateKey, {
      client,
      locationId: location?._id
    });

    return ticketRepository.updateCurrentCalledTicketStatus(tenant._id, status, {
      client,
      locationId: location?._id,
      queueDateKey: dateKey
    });
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
  const dateKey = getDateKey();
  const rolloverLocationId =
    options.location || options.locationSlug ? location?._id : undefined;
  const ticket = await db.withTransaction(async (client) => {
    await ticketRepository.rolloverQueueDay(tenant._id, dateKey, {
      client,
      locationId: rolloverLocationId
    });

    return ticketRepository.cancelWaitingTicket(tenant._id, lookupCode.toUpperCase(), {
      client,
      queueDateKey: dateKey
    });
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
  publishSnapshot,
  maybeNotifyUpcomingTickets
};
