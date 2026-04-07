const crypto = require("crypto");
const db = require("../config/db");
const env = require("../config/env");
const ticketRepository = require("../repositories/tickets");
const queueEvents = require("./queueEvents");
const notificationService = require("./notificationService");
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

async function reserveNextSequence(client, tenantId, dateKey) {
  const result = await client.query(
    `
      INSERT INTO counters (tenant_id, key, date_key, value)
      VALUES ($1, 'ticket', $2, 1)
      ON CONFLICT (tenant_id, key, date_key)
      DO UPDATE SET value = counters.value + 1
      RETURNING value
    `,
    [Number(tenantId), dateKey]
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

async function getQueueSnapshot(tenant, options = {}) {
  const current = await ticketRepository.findCurrentCalledTicket(tenant._id);
  const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id);
  const history = await ticketRepository.listHistoryTickets(tenant._id, { limit: 10 });
  const servedToday = await ticketRepository.countServedToday(tenant._id, getDateKey());

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
        ticket.status === "waiting"
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
      joinUrl: buildJoinUrl(env.appBaseUrl, tenant.slug),
      monitorUrl: buildMonitorUrl(env.appBaseUrl, tenant.slug)
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
    history: history.map((ticket) => ({
      id: String(ticket._id),
      ticketNumber: ticket.ticketNumber,
      customerName: ticket.customerName,
      status: ticket.status,
      updatedAt: ticket.updatedAt
    })),
    focusTicket
  };
}

async function publishSnapshot(tenant, options = {}) {
  const snapshot = await getQueueSnapshot(tenant, options);
  queueEvents.publish(tenant.slug, snapshot);
  return snapshot;
}

async function maybeNotifyUpcomingTickets(tenant) {
  const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id, {
    limit: tenant.notificationThreshold
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

  const ticket = await db.withTransaction(async (client) => {
    const sequence = await reserveNextSequence(client, tenant._id, dateKey);

    return createTicketRecord(client, {
      tenantId: tenant._id,
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
  });

  await maybeNotifyUpcomingTickets(tenant);
  const snapshot = await publishSnapshot(tenant, { lookupCode: ticket.lookupCode });

  return { ticket, snapshot };
}

async function callNextTicket(tenant) {
  const ticket = await db.withTransaction(async (client) => {
    const activeTicket = await ticketRepository.findCurrentCalledTicket(tenant._id, { client });
    if (activeTicket) {
      const error = new Error("Serve or skip the current ticket before calling the next one.");
      error.statusCode = 400;
      throw error;
    }

    return ticketRepository.callNextWaitingTicket(tenant._id, { client });
  });

  if (!ticket) {
    return null;
  }

  if (ticket.notifyByEmail || ticket.notifyBySms) {
    await notificationService.notifyCalled({ ticket, tenant });
  }

  await maybeNotifyUpcomingTickets(tenant);
  const snapshot = await publishSnapshot(tenant);

  return { ticket, snapshot };
}

async function updateCurrentTicketStatus(tenant, status) {
  const ticket = await db.withTransaction((client) =>
    ticketRepository.updateCurrentCalledTicketStatus(tenant._id, status, { client })
  );

  if (!ticket) {
    return null;
  }

  await maybeNotifyUpcomingTickets(tenant);
  const snapshot = await publishSnapshot(tenant);

  return { ticket, snapshot };
}

async function cancelTicket(tenant, lookupCode) {
  const ticket = await db.withTransaction((client) =>
    ticketRepository.cancelWaitingTicket(tenant._id, lookupCode.toUpperCase(), { client })
  );

  if (!ticket) {
    return null;
  }

  await maybeNotifyUpcomingTickets(tenant);
  const snapshot = await publishSnapshot(tenant);

  return { ticket, snapshot };
}

module.exports = {
  createTicket,
  getQueueSnapshot,
  callNextTicket,
  updateCurrentTicketStatus,
  cancelTicket,
  publishSnapshot
};
