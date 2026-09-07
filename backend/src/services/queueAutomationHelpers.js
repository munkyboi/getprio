const db = require("../config/db");
const env = require("../config/env");
const queueDayClosureRepository = require("../repositories/queueDayClosures");
const queueDayPauseRepository = require("../repositories/queueDayPauses");
const ticketRepository = require("../repositories/tickets");
const notificationService = require("./notificationService");
const pushNotificationService = require("./pushNotificationService");
const { getDateKey, getAutoResumeWaitingCount } = require("./queueHelpers");
const { resolveLocation } = require("./queueSnapshotHelpers");

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

    if (!(ticket.notifyByEmail || ticket.notifyBySms || ticket.userId)) {
      continue;
    }

    if (ticket.notifyByEmail || ticket.notifyBySms) {
      await notificationService.notifyAlmostThere({
        ticket,
        tenant,
        position: index + 1
      });
    }

    pushNotificationService.notifyCustomerQueueUpdate({
      tenant,
      ticket,
      action: "near_turn"
    }).catch((error) => {
      console.warn("[web-push-customer-queue-near-turn-skipped]", error.message);
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

    return createdPause;
  });

  pushNotificationService.notifyVendorQueueLifecycle({
    tenant,
    location,
    action: "auto_paused",
    stats: { waitingCount: waitingTickets.length }
  }).catch((error) => {
    console.warn("[web-push-vendor-queue-auto-pause-skipped]", error.message);
  });

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
  });

  pushNotificationService.notifyVendorQueueLifecycle({
    tenant,
    location,
    action: "auto_resumed"
  }).catch((error) => {
    console.warn("[web-push-vendor-queue-auto-resume-skipped]", error.message);
  });

  return true;
}

module.exports = {
  maybeAutoPauseQueueDay,
  maybeAutoResumeQueueDay,
  maybeNotifyUpcomingTickets
};
