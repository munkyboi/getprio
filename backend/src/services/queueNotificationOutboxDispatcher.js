const crypto = require("crypto");
const outboxRepository = require("../repositories/queueNotificationOutbox");
const notificationDeliveryRepository = require("../repositories/notificationDeliveries");
const tenantRepository = require("../repositories/tenants");
const locationRepository = require("../repositories/storeLocations");
const ticketRepository = require("../repositories/tickets");
const userRepository = require("../repositories/users");
const notificationService = require("./notificationService");
const pushNotificationService = require("./pushNotificationService");
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

async function dispatchIntent(intent) {
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
      action: customerAction(intent.template_name)
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

  async function runBatch(limit = 50) {
    const intents = await outboxRepository.claimBatch(workerId, limit);
    for (const intent of intents) {
      try {
        await dispatchIntent(intent);
        await outboxRepository.markSent(intent.id, workerId);
      } catch (error) {
        if (intent.channel === "web_push") {
          await notificationDeliveryRepository.recordDelivery({
            tenantId: intent.tenant_id,
            ticketId: intent.ticket_id,
            channel: "web_push",
            purpose: intent.template_name,
            recipient: intent.recipient_key,
            provider: "web_push",
            status: "failed",
            errorMessage: String(error.message || error).slice(0, 500),
            outboxId: intent.id
          }).catch(() => {});
        }
        await outboxRepository.markRetry(intent.id, workerId, error.message);
      }
    }
    return intents.length;
  }

  return { runBatch, workerId };
}

module.exports = {
  customerEmailCopy,
  createQueueNotificationOutboxDispatcher,
  dispatchIntent
};
