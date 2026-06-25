const crypto = require("crypto");
const db = require("../config/db");
const env = require("../config/env");
const billingRepository = require("../repositories/billing");
const notificationDeliveryRepository = require("../repositories/notificationDeliveries");
const publicBoardThemeRepository = require("../repositories/publicBoardThemes");
const queueEventRepository = require("../repositories/queueEvents");
const queueDayClosureRepository = require("../repositories/queueDayClosures");
const queueDayPauseRepository = require("../repositories/queueDayPauses");
const storeLocationRepository = require("../repositories/storeLocations");
const ticketRepository = require("../repositories/tickets");
const bookingRepository = require("../repositories/bookings");
const queueEvents = require("./queueEvents");
const queueLifecycle = require("./queueLifecycle");
const notificationService = require("./notificationService");
const queueFeeService = require("./queueFeeService");
const storeHoursService = require("./storeHoursService");
const { buildJoinUrl, buildMonitorUrl } = require("../publicLinks");

function getDateKey(date = new Date(), timezone = env.appTimezone || "Asia/Manila") {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(date).replace(/-/g, "");
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

function redactPublicContactDetails(entity) {
  if (!entity) {
    return null;
  }

  const { contactEmail: _contactEmail, contactPhone: _contactPhone, ...publicEntity } = entity;
  return publicEntity;
}

function getQueueIntakeState({
  waitingCount,
  autoPauseEnabled,
  autoPauseThreshold,
  autoResumeEnabled,
  autoResumeVacancyPercent,
  isPaused,
  pauseMode
}) {
  if (!autoPauseEnabled || !autoPauseThreshold) {
    return {
      autoPauseEnabled: Boolean(autoPauseEnabled),
      autoPauseThreshold: autoPauseThreshold || null,
      autoResumeEnabled: Boolean(autoResumeEnabled),
      autoResumeVacancyPercent: autoResumeVacancyPercent || null,
      currentWaitingCount: waitingCount,
      fillRatio: null,
      thresholdRemaining: null,
      resumeWaitingCount: null,
      state: "disabled",
      stateLabel: "Auto-pause off"
    };
  }

  const fillRatio = Math.min(waitingCount / autoPauseThreshold, 1);
  const thresholdRemaining = Math.max(autoPauseThreshold - waitingCount, 0);
  const resumeWaitingCount =
    autoResumeEnabled && autoResumeVacancyPercent
      ? Math.floor(autoPauseThreshold * (1 - autoResumeVacancyPercent / 100))
      : null;

  if (isPaused) {
    return {
      autoPauseEnabled: true,
      autoPauseThreshold,
      autoResumeEnabled: Boolean(autoResumeEnabled),
      autoResumeVacancyPercent: autoResumeVacancyPercent || null,
      currentWaitingCount: waitingCount,
      fillRatio,
      thresholdRemaining,
      resumeWaitingCount,
      state: "paused",
      stateLabel: pauseMode === "manual" ? "Paused" : "Auto-paused"
    };
  }

  if (fillRatio >= 0.85) {
    return {
      autoPauseEnabled: true,
      autoPauseThreshold,
      autoResumeEnabled: Boolean(autoResumeEnabled),
      autoResumeVacancyPercent: autoResumeVacancyPercent || null,
      currentWaitingCount: waitingCount,
      fillRatio,
      thresholdRemaining,
      resumeWaitingCount,
      state: "near_limit",
      stateLabel: "Near limit"
    };
  }

  return {
    autoPauseEnabled: true,
    autoPauseThreshold,
    autoResumeEnabled: Boolean(autoResumeEnabled),
    autoResumeVacancyPercent: autoResumeVacancyPercent || null,
    currentWaitingCount: waitingCount,
    fillRatio,
    thresholdRemaining,
    resumeWaitingCount,
    state: "open",
    stateLabel: "Open"
  };
}

function getAutoResumeWaitingCount(tenant) {
  if (
    !tenant.autoPauseEnabled ||
    !tenant.autoPauseThreshold ||
    !tenant.autoResumeEnabled ||
    !tenant.autoResumeVacancyPercent
  ) {
    return null;
  }

  return Math.floor(
    Number(tenant.autoPauseThreshold) * (1 - Number(tenant.autoResumeVacancyPercent) / 100)
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

async function reserveNextSequence(client, tenantId, locationId, dateKey) {
  try {
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
  } catch (error) {
    console.error("reserveNextSequence failed", {
      tenantId,
      locationId,
      dateKey,
      code: error.code,
      constraint: error.constraint,
      detail: error.detail,
      table: error.table,
      column: error.column,
      message: error.message
    });
    throw error;
  }
}

async function createTicketRecord(client, data) {
  let nextTicketData = { ...data };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const savepointName = `ticket_insert_attempt_${attempt}`;
    try {
      await client.query(`SAVEPOINT ${savepointName}`);
      return await ticketRepository.createTicket(
        {
          ...nextTicketData,
          lookupCode: buildLookupCode()
        },
        { client }
      );
    } catch (error) {
      console.error("createTicketRecord attempt failed", {
        attempt,
        code: error.code,
        constraint: error.constraint,
        detail: error.detail,
        table: error.table,
        column: error.column,
        message: error.message
      });
      await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      if (error.code === "23505" && error.constraint === "tickets_tenant_location_date_sequence_key") {
        nextTicketData.sequence = await reserveNextSequence(
          client,
          nextTicketData.tenantId,
          nextTicketData.locationId,
          nextTicketData.dateKey
        );
      }
      if (error.code !== "23505") {
        throw error;
      }
    } finally {
      try {
        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
      } catch {
        // Savepoint may already be gone after a successful return or rollback path.
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
  let locationId = location?._id;
  let snapshotLocation = location;
  const lookupTicket = options.lookupCode
    ? await ticketRepository.findTicketByTenantAndLookupCode(
        tenant._id,
        options.lookupCode.toUpperCase()
      )
    : null;

  if (lookupTicket?.locationId) {
    const ticketLocation = await storeLocationRepository.findLocationById(lookupTicket.locationId);
    if (ticketLocation && String(ticketLocation.tenantId) === String(tenant._id)) {
      snapshotLocation = ticketLocation;
      locationId = ticketLocation._id;
    }
  }

  const locationToUse = snapshotLocation;
  const dateKey =
    options.queueDateKey ||
    getDateKey(new Date(), locationToUse?.timezone || env.appTimezone || "Asia/Manila");
  const queueDayClosure = locationToUse
    ? await queueDayClosureRepository.findActiveClosure(tenant._id, locationToUse._id, dateKey)
    : null;
  const queueDayPause = locationToUse
    ? await queueDayPauseRepository.findActivePause(tenant._id, locationToUse._id, dateKey)
    : null;
  const overflowDateKey = queueDayClosure?.nextQueueDateKey || dateKey;
  const current = await ticketRepository.findCurrentCalledTicket(tenant._id, { locationId, dateKey });
  const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id, { locationId, dateKey });
  const overflowTickets = await ticketRepository.listWaitingTickets(tenant._id, {
    locationId,
    dateKey: overflowDateKey,
    onlyCarriedOver: true,
    limit: 50
  });
  const recoveryTickets = await ticketRepository.listSkippedTickets(tenant._id, {
    locationId,
    dateKey,
    limit: 20
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
  const openStatus = locationToUse
    ? await storeHoursService.getOpenStatus(locationToUse)
    : { isOpen: true, timezone: "Asia/Manila", summary: "Open 24 hours", today: null, nextOpenAt: null };
  const hours = locationToUse ? await storeLocationRepository.listHoursByLocationId(locationToUse._id) : [];
  const publicBoardTheme = await publicBoardThemeRepository.getResolvedTheme(
    tenant._id,
    locationToUse?._id
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
    carriedOverAt: ticket.carriedOverAt || null,
    servicePriorityBand: ticket.servicePriorityBand || "normal",
    linkedBookingReference: ticket.linkedBookingReference || null
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
    carriedOverAt: ticket.carriedOverAt || null,
    servicePriorityBand: ticket.servicePriorityBand || "normal"
  }));

  let focusTicket = null;
  if (lookupTicket) {
    const position =
      lookupTicket.status === "waiting"
        ? (
            await ticketRepository.listWaitingTickets(tenant._id, {
              locationId,
              dateKey: lookupTicket.dateKey
            })
          ).findIndex((waitingTicket) => String(waitingTicket._id) === String(lookupTicket._id)) + 1
        : null;

    focusTicket = {
      id: String(lookupTicket._id),
      lookupCode: lookupTicket.lookupCode,
      ticketNumber: lookupTicket.ticketNumber,
      customerName: lookupTicket.customerName,
      status: lookupTicket.status,
      position: position || null,
      estimatedWaitMinutes:
        position && position > 0 ? position * tenant.averageServiceMinutes : 0,
      joinedAt: lookupTicket.createdAt
    };
  }

  return {
    tenant: redactPublicContactDetails({
      id: String(tenant._id),
      name: tenant.name,
      slug: tenant.slug,
      queuePrefix: tenant.queuePrefix,
      averageServiceMinutes: tenant.averageServiceMinutes,
      notificationThreshold: tenant.notificationThreshold,
      autoPauseEnabled: Boolean(tenant.autoPauseEnabled),
      autoPauseThreshold: tenant.autoPauseThreshold ?? null,
      autoResumeEnabled: Boolean(tenant.autoResumeEnabled),
      autoResumeVacancyPercent: tenant.autoResumeVacancyPercent ?? null,
      joinUrl: buildJoinUrl(env.appBaseUrl, tenant.slug, locationToUse?.slug),
      monitorUrl: buildMonitorUrl(env.appBaseUrl, tenant.slug, locationToUse?.slug),
      isActive: Boolean(activeSubscription),
      queueFee
    }),
    location: redactPublicContactDetails(
      locationToUse
        ? {
            id: String(locationToUse._id),
            tenantId: String(locationToUse.tenantId),
            name: locationToUse.name,
            slug: locationToUse.slug,
            addressLine1: locationToUse.addressLine1,
            addressLine2: locationToUse.addressLine2,
            city: locationToUse.city,
            province: locationToUse.province,
            postalCode: locationToUse.postalCode,
            country: locationToUse.country,
            timezone: locationToUse.timezone,
            isPrimary: locationToUse.isPrimary,
            isActive: locationToUse.isActive,
            joinUrl: buildJoinUrl(env.appBaseUrl, tenant.slug, locationToUse.slug),
            monitorUrl: buildMonitorUrl(env.appBaseUrl, tenant.slug, locationToUse.slug),
            openStatus,
            hours: hours.map((hour) => ({
              weekday: hour.weekday,
              opensAt: hour.opensAt,
              closesAt: hour.closesAt,
              isClosed: hour.isClosed
            }))
          }
        : null
    ),
    publicBoardTheme,
    queueDay: {
      isClosed: Boolean(queueDayClosure),
      isPaused: Boolean(queueDayPause) && !queueDayClosure,
      queueDateKey: dateKey,
      closedAt: queueDayClosure?.closedAt || queueDayClosure?.createdAt || null,
      reopenedAt: queueDayClosure?.reopenedAt || null,
      closureReason: queueDayClosure?.closureReason || null,
      pausedAt: queueDayPause?.pausedAt || queueDayPause?.createdAt || null,
      resumedAt: queueDayPause?.resumedAt || null,
      pauseReason: queueDayPause?.pauseReason || null,
      pauseMode: queueDayPause?.pauseMode || null
    },
    queueIntake: getQueueIntakeState({
      waitingCount: waitingTickets.length,
      autoPauseEnabled: tenant.autoPauseEnabled,
      autoPauseThreshold: tenant.autoPauseThreshold,
      autoResumeEnabled: tenant.autoResumeEnabled,
      autoResumeVacancyPercent: tenant.autoResumeVacancyPercent,
      isPaused: Boolean(queueDayPause) && !queueDayClosure,
      pauseMode: queueDayPause?.pauseMode || null
    }),
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
          calledAt: current.calledAt,
          servicePriorityBand: current.servicePriorityBand || "normal",
          linkedBookingReference: current.linkedBookingReference || null
        }
      : null,
    nextUp,
    overflow,
    recovery: recoveryTickets.map((ticket) => ({
      id: String(ticket._id),
      lookupCode: ticket.lookupCode,
      ticketNumber: ticket.ticketNumber,
      customerName: ticket.customerName,
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      rejoinDeadlineAt: ticket.rejoinDeadlineAt || null,
      servicePriorityBand: ticket.servicePriorityBand || "normal"
    })),
    history: history.map((ticket) => ({
      id: String(ticket._id),
      lookupCode: ticket.lookupCode,
      ticketNumber: ticket.ticketNumber,
      customerName: ticket.customerName,
      status: ticket.status,
      createdAt: ticket.createdAt,
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

async function maybeAutoPauseQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location || !tenant.autoPauseEnabled || !tenant.autoPauseThreshold) {
    return null;
  }

  const queueDateKey = options.queueDateKey || getDateKey();
  const queueDayClosure = await queueDayClosureRepository.findActiveClosure(
    tenant._id,
    location._id,
    queueDateKey,
    { client: options.client }
  );
  if (queueDayClosure) {
    return null;
  }

  const existingPause = await queueDayPauseRepository.findActivePause(
    tenant._id,
    location._id,
    queueDateKey,
    { client: options.client }
  );
  if (existingPause) {
    return existingPause;
  }

  const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id, {
    client: options.client,
    locationId: location._id,
    dateKey: queueDateKey
  });

  if (waitingTickets.length < Number(tenant.autoPauseThreshold)) {
    return null;
  }

  const pause = await db.withTransaction(async (client) => {
    const activePause = await queueDayPauseRepository.findActivePause(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (activePause) {
      return activePause;
    }

    const createdPause = await queueDayPauseRepository.createPause(
      {
        tenantId: tenant._id,
        locationId: location._id,
        queueDateKey,
        pauseReason: `Auto-paused at ${waitingTickets.length}/${tenant.autoPauseThreshold} waiting tickets`,
        pauseMode: "auto_threshold",
        pausedByUserId: null
      },
      { client }
    );

    await appendScopedQueueEvent(client, {
      tenantId: tenant._id,
      locationId: location._id,
      queueDateKey,
      eventType: "queue_paused",
      actorUserId: null,
      actorRole: "system",
      source: "system",
      metadata: {
        pauseMode: "auto_threshold",
        waitingCount: waitingTickets.length,
        autoPauseThreshold: tenant.autoPauseThreshold
      }
    });

    return createdPause;
  });

  await publishSnapshot(tenant, { location, queueDateKey });
  return pause;
}

async function maybeAutoResumeQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) {
    return null;
  }

  const resumeWaitingCount = getAutoResumeWaitingCount(tenant);
  if (resumeWaitingCount === null) {
    return null;
  }

  const queueDateKey = options.queueDateKey || getDateKey();
  const activePause = await queueDayPauseRepository.findActivePause(
    tenant._id,
    location._id,
    queueDateKey,
    { client: options.client }
  );

  if (!activePause || activePause.pauseMode !== "auto_threshold") {
    return null;
  }

  const waitingTickets = await ticketRepository.listWaitingTickets(tenant._id, {
    client: options.client,
    locationId: location._id,
    dateKey: queueDateKey
  });

  if (waitingTickets.length > resumeWaitingCount) {
    return null;
  }

  await db.withTransaction(async (client) => {
    const currentPause = await queueDayPauseRepository.findActivePause(
      tenant._id,
      location._id,
      queueDateKey,
      { client }
    );
    if (!currentPause || currentPause.pauseMode !== "auto_threshold") {
      return;
    }

    const currentWaitingTickets = await ticketRepository.listWaitingTickets(tenant._id, {
      client,
      locationId: location._id,
      dateKey: queueDateKey
    });
    if (currentWaitingTickets.length > resumeWaitingCount) {
      return;
    }

    await queueDayPauseRepository.resumePause(currentPause._id, null, { client });
    await appendScopedQueueEvent(client, {
      tenantId: tenant._id,
      locationId: location._id,
      queueDateKey,
      eventType: "queue_resumed",
      actorUserId: null,
      actorRole: "system",
      source: "system",
      metadata: {
        pauseMode: currentPause.pauseMode,
        pauseReason: currentPause.pauseReason,
        waitingCount: currentWaitingTickets.length,
        autoPauseThreshold: tenant.autoPauseThreshold || null,
        autoResumeVacancyPercent: tenant.autoResumeVacancyPercent || null,
        resumeWaitingCount
      }
    });
  });

  await publishSnapshot(tenant, { location, queueDateKey });
  return true;
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
