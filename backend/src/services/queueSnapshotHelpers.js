const env = require("../config/env");
const publicBoardThemeRepository = require("../repositories/publicBoardThemes");
const queueDayClosureRepository = require("../repositories/queueDayClosures");
const queueDayPauseRepository = require("../repositories/queueDayPauses");
const storeLocationRepository = require("../repositories/storeLocations");
const ticketRepository = require("../repositories/tickets");
const waitTimePredictionRepository = require("../repositories/waitTimePredictions");
const queueFeeService = require("./queueFeeService");
const storeHoursService = require("./storeHoursService");
const { predictWaitTime } = require("./waitTimePredictor");
const { buildServiceTimeContext } = require("./queueEstimationInputs");
const {
  getDateKey,
  getQueueIntakeState,
  redactPublicContactDetails
} = require("./queueHelpers");
const { buildJoinUrl, buildMonitorUrl } = require("../publicLinks.ts");

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

async function buildQueueSnapshot(tenant, options = {}, getTenantUsage) {
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
  const pendingCarryOverTickets = await ticketRepository.listPendingCarryOverTickets(
    tenant._id,
    { locationId, limit: 50 }
  );
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
  const businessProfileTheme = await publicBoardThemeRepository.getResolvedTheme(
    tenant._id,
    undefined,
    { mediaOnly: true }
  );

  const nextUp = waitingTickets.slice(0, 10).map((ticket, index) => ({
    id: String(ticket._id),
    ticketNumber: ticket.ticketNumber,
    customerName: ticket.customerName,
    customerDisplayName: ticket.customerDisplayName || null,
    status: ticket.status,
    position: index + 1,
    joinChannel: ticket.joinChannel,
    createdAt: ticket.createdAt,
    isCarriedOver: Boolean(ticket.carriedOverAt || ticket.carryOverCount > 0),
    carryOverCount: ticket.carryOverCount || 0,
    carriedOverAt: ticket.carriedOverAt || null,
    servicePriorityBand: ticket.servicePriorityBand || "normal",
    linkedBookingReference: ticket.linkedBookingReference || null,
    bookingScheduledStartAt: ticket.linkedBookingEstimation?.scheduledStartAt || null
  }));

  const pendingOverflow = pendingCarryOverTickets.map((ticket) => ({
    id: String(ticket._id),
    ticketNumber: ticket.ticketNumber,
    customerName: ticket.customerName,
    customerDisplayName: ticket.customerDisplayName || null,
    status: ticket.status,
    position: null,
    joinChannel: ticket.joinChannel,
    createdAt: ticket.createdAt,
    isCarriedOver: false,
    carryOverCount: ticket.carryOverCount || 0,
    carriedOverAt: ticket.carriedOverAt || null,
    carryOverExpiresAt: ticket.carryOverExpiresAt || null,
    servicePriorityBand: ticket.servicePriorityBand || "normal"
  }));
  const activatedOverflow = overflowTickets.map((ticket, index) => ({
    id: String(ticket._id),
    ticketNumber: ticket.ticketNumber,
    customerName: ticket.customerName,
    customerDisplayName: ticket.customerDisplayName || null,
    status: ticket.status,
    position: index + 1,
    joinChannel: ticket.joinChannel,
    createdAt: ticket.createdAt,
    isCarriedOver: true,
    carryOverCount: ticket.carryOverCount || 0,
    carriedOverAt: ticket.carriedOverAt || null,
    carryOverExpiresAt: ticket.carryOverExpiresAt || null,
    servicePriorityBand: ticket.servicePriorityBand || "normal"
  }));
  const overflow = [...pendingOverflow, ...activatedOverflow];

  let focusTicket = null;
  if (lookupTicket) {
    const predictionDateKey = lookupTicket.dateKey || dateKey;
    const isSnapshotDate = predictionDateKey === dateKey;
    const predictionWaitingTickets = lookupTicket.status === "waiting"
      ? isSnapshotDate
        ? waitingTickets
        : await ticketRepository.listWaitingTickets(tenant._id, {
            locationId,
            dateKey: predictionDateKey
          })
      : [];
    const position = lookupTicket.status === "waiting"
      ? predictionWaitingTickets.findIndex(
          (waitingTicket) => String(waitingTicket._id) === String(lookupTicket._id)
        ) + 1
      : null;
    const predictionCurrent = lookupTicket.status !== "waiting" || isSnapshotDate
      ? current
      : await ticketRepository.findCurrentCalledTicket(tenant._id, {
          locationId,
          dateKey: predictionDateKey
        });
    const predictionPause = lookupTicket.status !== "waiting" || isSnapshotDate || !locationId
      ? queueDayPause
      : await queueDayPauseRepository.findActivePause(
          tenant._id,
          locationId,
          predictionDateKey
        );

    const prediction = predictWaitTime({
      position: position || 0,
      waitingCount: predictionWaitingTickets.length,
      averageServiceMinutes: tenant.averageServiceMinutes,
      priorityBand: lookupTicket.servicePriorityBand || "normal",
      currentTicketCalledAt: predictionCurrent?.calledAt || null,
      queuePaused: Boolean(predictionPause),
      serviceTimeContext: buildServiceTimeContext({
        ticket: lookupTicket,
        position: position || 0,
        waitingTickets: predictionWaitingTickets,
        currentTicket: predictionCurrent,
        averageServiceMinutes: tenant.averageServiceMinutes
      })
    });

    if (
      lookupTicket.status === "waiting" &&
      position > 0 &&
      env.waitTimePredictionCaptureEnabled
    ) {
      void waitTimePredictionRepository.recordPrediction({
        ticketId: lookupTicket._id,
        tenantId: tenant._id,
        locationId,
        queueDateKey: predictionDateKey,
        predictorVersion: prediction.predictorVersion,
        featureHash: prediction.featureHash,
        sampleBucket: prediction.sampleBucket,
        observedAt: prediction.observedAt,
        features: prediction.features,
        predictedWaitMinutes: prediction.estimatedWaitMinutes
      }).catch((error) => {
        console.error("Wait-time prediction sample capture failed.", error);
      });
    }

    focusTicket = {
      id: String(lookupTicket._id),
      lookupCode: lookupTicket.lookupCode,
      ticketNumber: lookupTicket.ticketNumber,
      customerName: lookupTicket.customerName,
      customerDisplayName: lookupTicket.customerDisplayName || null,
      status: lookupTicket.status,
      customerConfirmedAt: lookupTicket.customerConfirmedAt || null,
      statusReason: lookupTicket.statusReason || null,
      isCarriedOver: Boolean(
        lookupTicket.servicePriorityBand === "carry_over" ||
        lookupTicket.carriedOverAt ||
        lookupTicket.carryOverCount > 0
      ),
      carryOverCount: lookupTicket.carryOverCount || 0,
      servicePriorityBand: lookupTicket.servicePriorityBand || "normal",
      carryOverExpiresAt: lookupTicket.carryOverExpiresAt || null,
      currentQueueDayId: lookupTicket.currentQueueDayId || null,
      linkedBookingReference: lookupTicket.linkedBookingReference || null,
      bookingScheduledStartAt: lookupTicket.linkedBookingEstimation?.scheduledStartAt || null,
      notifyByEmail: Boolean(lookupTicket.notifyByEmail && lookupTicket.customerEmail),
      emailJourneyMode: lookupTicket.emailJourneyMode || "not_eligible",
      position: position || null,
      estimatedWaitMinutes: prediction.estimatedWaitMinutes,
      joinedAt: lookupTicket.createdAt
    };
  }

  return {
    tenant: redactPublicContactDetails({
      id: String(tenant._id),
      name: tenant.publicProfileDisplayName || tenant.name,
      businessName: tenant.name,
      publicProfileDescription: tenant.publicProfileDescription || "",
      slug: tenant.slug,
      publicProfileCategory: tenant.publicProfileCategory || "",
      businessCategoryId: tenant.businessCategoryId || null,
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
    businessProfileTheme,
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
      estimatedWaitMinutes: predictWaitTime({
        position: waitingTickets.length,
        waitingCount: waitingTickets.length,
        averageServiceMinutes: tenant.averageServiceMinutes
      }).estimatedWaitMinutes
    },
    current: current
      ? {
          id: String(current._id),
          ticketNumber: current.ticketNumber,
          customerName: current.customerName,
          customerDisplayName: current.customerDisplayName || null,
          calledAt: current.calledAt,
          joinChannel: current.joinChannel,
          customerConfirmedAt: current.customerConfirmedAt || null,
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

module.exports = {
  buildQueueSnapshot,
  resolveLocation
};
