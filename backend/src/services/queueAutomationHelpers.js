const db = require("../config/db");
const env = require("../config/env");
const queueDayClosureRepository = require("../repositories/queueDayClosures");
const queueDayPauseRepository = require("../repositories/queueDayPauses");
const ticketRepository = require("../repositories/tickets");
const queueEventRepository = require("../repositories/queueEvents");
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
  for (const value of [tenant._id, location._id]) {
    if (!/^[1-9]\d{0,18}$/u.test(String(value)) || !Number.isSafeInteger(Number(value))) {
      throw Object.assign(new Error("Queue identity requires reconciliation."), { statusCode: 400 });
    }
  }
  const run = async (client) => {
    const result = await client.query(
      "SELECT id, timezone, queue_lifecycle_mode, is_active FROM store_locations WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
      [tenant._id, location._id]
    );
    const current = result.rows[0];
    if (!current?.is_active || !["legacy", "shadow"].includes(current.queue_lifecycle_mode)) return null;
    const policy = (await client.query(`SELECT is_active,auto_pause_enabled,auto_pause_threshold,
      auto_resume_enabled,auto_resume_vacancy_percent FROM tenants WHERE id=$1 FOR SHARE`, [tenant._id])).rows[0];
    if (!policy?.is_active || !policy.auto_pause_enabled || !Number.isInteger(policy.auto_pause_threshold)
      || policy.auto_pause_threshold < 1 || policy.auto_pause_threshold > 500) return null;
    const currentTenant = { ...tenant, autoPauseEnabled: policy.auto_pause_enabled, autoPauseThreshold: policy.auto_pause_threshold,
      autoResumeEnabled: policy.auto_resume_enabled, autoResumeVacancyPercent: policy.auto_resume_vacancy_percent };
    const queueDateKey = options.queueDateKey || getDateKey(new Date(), current.timezone);
    if (await queueDayClosureRepository.findActiveClosure(tenant._id, location._id, queueDateKey, { client })) return null;
    return action(client, queueDateKey, currentTenant);
  };
  return options.client && options.client !== db.pool ? run(options.client) : db.withTransaction(run);
}

async function recordAutomaticIntakeChange(client, tenant, location, queueDateKey, eventType, metadata) {
  await client.query("INSERT INTO resource_ledger_scopes(tenant_id,location_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [tenant._id, location._id]);
  await queueEventRepository.createQueueEvent({
    ticketId: null, tenantId: tenant._id, locationId: location._id, queueDateKey, eventType,
    actorUserId: null, actorRole: null, source: "system", metadata
  }, { client });
  await client.query("UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2", [tenant._id, location._id]);
}

async function maybeAutoPauseQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) return null;
  const outcome = await withAutomaticIntakeLock(tenant, location, options, async (client, queueDateKey, currentTenant) => {
    const existing = await queueDayPauseRepository.findActivePause(tenant._id, location._id, queueDateKey, { client });
    if (existing) return { pause: existing, created: false };
    const waiting = await ticketRepository.listWaitingTickets(tenant._id, { client, locationId: location._id, dateKey: queueDateKey });
    if (waiting.length < currentTenant.autoPauseThreshold) return null;
    const pause = await queueDayPauseRepository.createPause({
      tenantId: tenant._id, locationId: location._id, queueDateKey,
      pauseReason: `Auto-paused at ${waiting.length}/${currentTenant.autoPauseThreshold} waiting tickets`,
      pauseMode: "auto_threshold", pausedByUserId: null
    }, { client });
    await recordAutomaticIntakeChange(client, tenant, location, queueDateKey, "queue_paused", {
      pauseMode: pause.pauseMode, pauseReason: pause.pauseReason, waitingCount: waiting.length,
      autoPauseThreshold: currentTenant.autoPauseThreshold
    });
    return { pause, created: true, waitingCount: waiting.length };
  });
  // A supplied transaction belongs to the caller; it has not committed yet.
  if (outcome?.created && (!options.client || options.client === db.pool)) {
    pushNotificationService.notifyVendorQueueLifecycle({ tenant, location, action: "auto_paused", stats: { waitingCount: outcome.waitingCount } })
      .catch(error => console.warn("[web-push-vendor-queue-auto-pause-skipped]", error.message));
  }
  return outcome?.pause || null;
}

async function maybeAutoResumeQueueDay(tenant, options = {}) {
  const location = await resolveLocation(tenant, options);
  if (!location) return null;
  const resumed = await withAutomaticIntakeLock(tenant, location, options, async (client, queueDateKey, currentTenant) => {
    if (!Number.isInteger(currentTenant.autoResumeVacancyPercent) || currentTenant.autoResumeVacancyPercent < 5
      || currentTenant.autoResumeVacancyPercent > 50) return false;
    const resumeWaitingCount = getAutoResumeWaitingCount(currentTenant);
    if (resumeWaitingCount === null) return false;
    const pause = await queueDayPauseRepository.findActivePause(tenant._id, location._id, queueDateKey, { client });
    if (pause?.pauseMode !== "auto_threshold") return false;
    const waiting = await ticketRepository.listWaitingTickets(tenant._id, { client, locationId: location._id, dateKey: queueDateKey });
    if (waiting.length > resumeWaitingCount) return false;
    const updated = await queueDayPauseRepository.resumePause(pause._id, null, { client });
    if (!updated) return false;
    await recordAutomaticIntakeChange(client, tenant, location, queueDateKey, "queue_resumed", {
      pauseMode: pause.pauseMode, pauseReason: pause.pauseReason, waitingCount: waiting.length,
      autoPauseThreshold: currentTenant.autoPauseThreshold, autoResumeVacancyPercent: currentTenant.autoResumeVacancyPercent
    });
    return true;
  });
  if (!resumed) return null;
  if (!options.client || options.client === db.pool) pushNotificationService.notifyVendorQueueLifecycle({ tenant, location, action: "auto_resumed" })
    .catch(error => console.warn("[web-push-vendor-queue-auto-resume-skipped]", error.message));
  return true;
}

module.exports = {
  maybeAutoPauseQueueDay,
  maybeAutoResumeQueueDay,
  maybeNotifyUpcomingTickets
};
