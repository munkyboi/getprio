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
    if (ticket.linkedBookingEstimation?.scheduledStartAt && new Date(ticket.linkedBookingEstimation.scheduledStartAt).getTime() > Date.now()) {
      continue;
    }
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

async function withAutomaticIntakeLock(tenant, location, options, action) {
  const run = async (client) => {
    const result = await client.query(
      "SELECT id, timezone, queue_lifecycle_mode FROM store_locations WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
      [tenant._id, location._id]
    );
    const current = result.rows[0];
    if (!current || !["legacy", "shadow"].includes(current.queue_lifecycle_mode)) return null;
    const queueDateKey = options.queueDateKey || getDateKey(new Date(), current.timezone);
    if (await queueDayClosureRepository.findActiveClosure(tenant._id, location._id, queueDateKey, { client })) return null;
    return action(client, queueDateKey);
  };
  return options.client && options.client !== db.pool ? run(options.client) : db.withTransaction(run);
}

async function maybeAutoPauseQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location || !tenant.autoPauseEnabled || !tenant.autoPauseThreshold) return null;
  const outcome = await withAutomaticIntakeLock(tenant, location, options, async (client, queueDateKey) => {
    const existing = await queueDayPauseRepository.findActivePause(tenant._id, location._id, queueDateKey, { client });
    if (existing) return { pause: existing, created: false };
    const waiting = await ticketRepository.listWaitingTickets(tenant._id, { client, locationId: location._id, dateKey: queueDateKey });
    if (waiting.length < Number(tenant.autoPauseThreshold)) return null;
    const pause = await queueDayPauseRepository.createPause({
      tenantId: tenant._id, locationId: location._id, queueDateKey,
      pauseReason: `Auto-paused at ${waiting.length}/${tenant.autoPauseThreshold} waiting tickets`,
      pauseMode: "auto_threshold", pausedByUserId: null
    }, { client });
    return { pause, created: true, waitingCount: waiting.length };
  });
  if (outcome?.created) {
    pushNotificationService.notifyVendorQueueLifecycle({ tenant, location, action: "auto_paused", stats: { waitingCount: outcome.waitingCount } })
      .catch(error => console.warn("[web-push-vendor-queue-auto-pause-skipped]", error.message));
  }
  return outcome?.pause || null;
}

async function maybeAutoResumeQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  const resumeWaitingCount = getAutoResumeWaitingCount(tenant);
  if (!location || resumeWaitingCount === null) return null;
  const resumed = await withAutomaticIntakeLock(tenant, location, options, async (client, queueDateKey) => {
    const pause = await queueDayPauseRepository.findActivePause(tenant._id, location._id, queueDateKey, { client });
    if (!pause || pause.pauseMode !== "auto_threshold") return false;
    const waiting = await ticketRepository.listWaitingTickets(tenant._id, { client, locationId: location._id, dateKey: queueDateKey });
    if (waiting.length > resumeWaitingCount) return false;
    await queueDayPauseRepository.resumePause(pause._id, null, { client });
    return true;
  });
  if (!resumed) return null;
  pushNotificationService.notifyVendorQueueLifecycle({ tenant, location, action: "auto_resumed" })
    .catch(error => console.warn("[web-push-vendor-queue-auto-resume-skipped]", error.message));
  return true;
}

module.exports = {
  maybeAutoPauseQueueDay,
  maybeAutoResumeQueueDay,
  maybeNotifyUpcomingTickets
};
