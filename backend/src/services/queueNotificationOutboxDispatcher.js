const bookingReminderService = require("./bookingReminderService");
const notificationInbox = require("./customerNotificationInbox");
const crypto = require("crypto");
const path = require("node:path");
const outboxRepository = require("../repositories/queueNotificationOutbox");
const notificationDeliveryRepository = require("../repositories/notificationDeliveries");
const tenantRepository = require("../repositories/tenants");
const locationRepository = require("../repositories/storeLocations");
const ticketRepository = require("../repositories/tickets");
const userRepository = require("../repositories/users");
const notificationService = require("./notificationService");
const pushNotificationService = require("./pushNotificationService");
// These legacy mobile modules live outside the TypeScript source tree. Resolve them
// dynamically so the backend build does not try to emit JavaScript over the source
// files, while both tsx (src/) and compiled (dist/) execution resolve the same files.
const fcmRegistrationService = require(path.resolve(__dirname, "../../mobile/fcmRegistrationService.js"));
const pushRegistrationRepository = require(path.resolve(__dirname, "../../mobile/pushRegistrationRepository.js"));
const mobilePushOutboxDeliveryRepository = require(path.resolve(__dirname, "../../mobile/mobilePushOutboxDeliveryRepository.js"));
const { queueLifecycleEmail, queueReconciliationEmail } = require("./queueEmailTemplates");

function warningAction(templateName) {
  if (templateName === "queue_closing_15m") {
    return "closing_15m";
  }
  if (templateName === "queue_closing_5m") {
    return "closing_5m";
  }
  if (templateName === "queue_extended") {
    return "extended";
  }
  if (templateName === "queue_reopened") {
    return "reopened";
  }
  if (templateName === "queue_closed") {
    return "closed";
  }
  if (templateName === "queue_opened") {
    return "opened";
  }
  if (templateName === "queue_reconciliation_failed") {
    return "reconciliation_failed";
  }
  return "updated";
}

function customerAction(templateName) {
  return String(templateName || "").replace(/^ticket_/, "");
}

function customerEmailCopy(tenant, ticket, action) {
  return queueLifecycleEmail({ tenant, ticket, kind: action, action });
}

function userIdFromRecipient(recipientKey) {
  const match = /^user:(\d+)$/.exec(String(recipientKey || ""));
  return match ? match[1] : null;
}

function inboxNotificationId(intent) {
  return intent.queue_event_id ? `queue-event:${intent.queue_event_id}:${intent.template_name}`
    : `queue-intent:${String(intent.idempotency_key || intent.id).replace(/:(web_push|fcm)$/u, "")}`;
}

async function dispatchFcmIntent(intent, tenant, ticket, workerId, timeoutMs) {
  const userId = userIdFromRecipient(intent.recipient_key);
  if (!userId) {
    throw new Error("FCM outbox intent must target a user recipient.");
  }

  const user = await userRepository.findUserById(userId);
  if (!user || user.notificationSettings?.queueAlerts === false) {
    return { attempted: 0, sent: 0, skipped: true };
  }

  const payload = pushNotificationService.buildCustomerQueueNotificationPayload({
    tenant, ticket, action: customerAction(intent.template_name), notificationId: `outbox:${intent.id}`
  });
  await notificationInbox.record({ userId, ...payload,
    notificationId: inboxNotificationId(intent), occurredAt: intent.created_at });
  const registrations = await pushRegistrationRepository.listActiveByUserId(userId);
  await mobilePushOutboxDeliveryRepository.ensurePending(intent.id, registrations);
  const pending = await mobilePushOutboxDeliveryRepository.claimPending(intent.id, workerId);
  if (!pending.length) {
    return { attempted: registrations.length, sent: 0, skipped: registrations.length === 0 };
  }

  let result;
  try {
    result = await fcmRegistrationService.sendToRegistrations({
      registrations: pending,
      payload,
      ...(timeoutMs ? {timeoutMs} : {}),
      environment: ticket.developerEnvironment === "sandbox" ? "sandbox" : "production"
    });
  } catch (error) {
    await mobilePushOutboxDeliveryRepository.releasePending(intent.id, workerId).catch(() => {});
    throw error;
  }
  if (!result.configured) {
    await mobilePushOutboxDeliveryRepository.releasePending(intent.id, workerId);
    throw new Error("FCM delivery is not configured.");
  }

  const activeAfter = new Set(
    (await pushRegistrationRepository.listActiveByUserId(userId)).map((registration) => String(registration.id))
  );
  const transientFailures = [];
  for (const outcome of result.outcomes) {
    if (outcome.status === "accepted") {
      await mobilePushOutboxDeliveryRepository.markSent(intent.id, outcome.registrationId, { workerId });
    } else if (!activeAfter.has(String(outcome.registrationId))) {
      await mobilePushOutboxDeliveryRepository.markStale(intent.id, outcome.registrationId, { workerId });
    } else {
      await mobilePushOutboxDeliveryRepository.markFailure(intent.id, outcome.registrationId, outcome.error, { workerId });
      transientFailures.push(outcome);
    }
  }

  if (transientFailures.length) {
    throw new Error(`FCM delivery failed for ${transientFailures.length} installation(s).`);
  }

  return {
    attempted: result.attempted,
    sent: result.sent,
    stale: result.outcomes.filter((outcome) => outcome.status !== "accepted").length,
    skipped: false
  };
}

async function dispatchIntent(intent, options = {}) {
  const workerId = options.workerId || "queue-outbox-direct";
  if (intent.booking_id) {
    return bookingReminderService.dispatch(intent, workerId, {timeoutMs:options.timeoutMs});
  }
  const tenant = await tenantRepository.findTenantById(intent.tenant_id);
  if (!tenant) {
    return;
  }
  if (intent.channel === "web_push" && String(intent.recipient_key).includes("queue-operators")) {
    const location = intent.queue_day_id
      ? await locationRepository.findLocationById(intent.payload?.locationId)
      : null;
    await pushNotificationService.notifyVendorQueueLifecycle({
      tenant,
      location,
      action: warningAction(intent.template_name),
      stats: {
        deadlineVersion: intent.deadline_version,
        warningMinutes: intent.payload?.warningMinutes,
        outcomes: intent.payload?.outcomes
      }
    });
    await notificationDeliveryRepository.recordDelivery({
      tenantId: tenant._id,
      channel: "web_push",
      purpose: intent.template_name,
      recipient: intent.recipient_key,
      provider: "web_push",
      status: "sent",
      outboxId: intent.id,
      metadata: { deadlineVersion: intent.deadline_version }
    });
    return;
  }

  if (intent.channel === "email" && String(intent.recipient_key).includes("queue-admins")) {
    const [location, users] = await Promise.all([
      locationRepository.findLocationById(intent.payload?.locationId),
      userRepository.listUsersByTenantId(tenant._id)
    ]);
    const recipients = users.filter((user) =>
      user.email &&
      user.tenantMemberships.some((membership) =>
        String(membership.tenantId) === String(tenant._id) &&
        membership.isActive !== false &&
        ["owner", "admin"].includes(membership.role)
      )
    );
    const email = queueReconciliationEmail({ tenant, location });
    for (const recipient of recipients) {
      await notificationService.sendEmail({
        to: recipient.email,
        ...email,
        tenantId: tenant._id,
        purpose: "queue_reconciliation_failure",
        metadata: {
          queueOutboxId: String(intent.id),
          queueDayId: intent.queue_day_id ? String(intent.queue_day_id) : null
        },
        outboxId: intent.id
      });
    }
    return;
  }

  const ticket = intent.ticket_id
    ? await ticketRepository.findTicketById(intent.ticket_id)
    : null;
  if (!ticket) {
    return;
  }
  if (intent.channel === "web_push") {
    await pushNotificationService.notifyCustomerQueueUpdate({
      tenant,
      ticket,
      action: customerAction(intent.template_name),
      channels: { webPush: true, fcm: false },
      notificationId: inboxNotificationId(intent), occurredAt: intent.created_at
    });
    await notificationDeliveryRepository.recordDelivery({
      tenantId: tenant._id,
      ticketId: ticket._id,
      channel: "web_push",
      purpose: intent.template_name,
      recipient: intent.recipient_key,
      provider: "web_push",
      status: "sent",
      outboxId: intent.id
    });
    return;
  }
  if (intent.channel === "fcm") {
    const result = await dispatchFcmIntent(intent, tenant, ticket, workerId, options.timeoutMs);
    await notificationDeliveryRepository.recordDelivery({
      tenantId: tenant._id,
      ticketId: ticket._id,
      channel: "fcm",
      purpose: intent.template_name,
      recipient: intent.recipient_key,
      provider: "fcm",
      status: "sent",
      outboxId: intent.id,
      metadata: {
        attempted: result.attempted,
        sent: result.sent,
        stale: result.stale || 0,
        skipped: Boolean(result.skipped)
      }
    });
    return;
  }
  if (intent.channel === "email") {
    const action = customerAction(intent.template_name);
    const copy = customerEmailCopy(tenant, ticket, action);
    await notificationService.sendEmail({
      to: ticket.customerEmail,
      ...copy,
      tenantId: tenant._id,
      ticketId: ticket._id,
      purpose: "queue_lifecycle",
      metadata: {
        queueOutboxId: String(intent.id),
        reasonCode: intent.payload?.reasonCode || null
      },
      outboxId: intent.id
    });
  }
}

function createQueueNotificationOutboxDispatcher(options = {}) {
  const workerId = options.workerId || `queue-outbox-${process.pid}-${crypto.randomUUID()}`;

  const nowMs = options.nowMs || Date.now;
  const maxRuntimeMs = Math.max(1,Math.min(30_000,Number(options.maxRuntimeMs)||15_000));
  async function runBatch(limit = 50) {
    const startedAt = nowMs();
    let processed = 0;
    while (processed < Math.max(1,Math.min(200,Number(limit)||50)) && nowMs()-startedAt < maxRuntimeMs) {
      // Never consume leases for jobs waiting behind a slow network delivery.
      const [intent] = await outboxRepository.claimBatch(workerId, 1);
      if (!intent) break;
      processed += 1;
      try {
        await dispatchIntent(intent, { workerId, timeoutMs:Math.max(1,maxRuntimeMs-(nowMs()-startedAt)) });
        await outboxRepository.markSent(intent.id, workerId);
      } catch (error) {
        if (intent.channel === "web_push" || intent.channel === "fcm") {
          await notificationDeliveryRepository.recordDelivery({
            tenantId: intent.tenant_id,
            ticketId: intent.ticket_id,
            channel: intent.channel,
            purpose: intent.template_name,
            recipient: intent.recipient_key,
            provider: intent.channel,
            status: "failed",
            errorMessage: String(error.message || error).slice(0, 500),
            outboxId: intent.id
          }).catch(() => {});
        }
        await outboxRepository.markRetry(intent.id, workerId, error.message);
      }
    }
    return processed;
  }

  return { runBatch, workerId };
}

module.exports = {
  customerEmailCopy,
  createQueueNotificationOutboxDispatcher,
  dispatchIntent
};
