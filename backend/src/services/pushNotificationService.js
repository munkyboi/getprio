const crypto = require("node:crypto");
const path = require("node:path");
const webPush = require("web-push");
const env = require("../config/env");
const pushSubscriptionRepository = require("../repositories/pushSubscriptions");
const userRepository = require("../repositories/users");
const mobilePushService = require(path.resolve(__dirname, "../../mobile/fcmRegistrationService.js"));

const VENDOR_ALERT_ROLES = ["owner", "admin", "staff"];
const DEDUPE_WINDOW_MS = 2 * 60 * 1000;
const recentNotificationKeys = new Map();

function isPushConfigured() {
  return isWebPushConfigured() || mobilePushService.isConfigured();
}

function isWebPushConfigured() {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject);
}

function configureWebPush() {
  if (!isWebPushConfigured()) {
    return false;
  }

  webPush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  return true;
}

function getPublicKeyResponse() {
  return {
    publicKey: env.vapidPublicKey || "",
    configured: isPushConfigured()
  };
}

function normalizePushSubscriptionPayload(payload) {
  const subscription = payload?.subscription || payload;
  const endpoint = String(subscription?.endpoint || "").trim();
  const p256dh = String(subscription?.keys?.p256dh || "").trim();
  const auth = String(subscription?.keys?.auth || "").trim();

  if (!endpoint || !p256dh || !auth) {
    const error = new Error("A valid browser push subscription is required.");
    error.statusCode = 400;
    throw error;
  }

  return { endpoint, p256dh, auth };
}

async function saveSubscription({ user, tenant, payload, userAgent }) {
  const subscription = normalizePushSubscriptionPayload(payload);
  return pushSubscriptionRepository.upsertSubscription({
    userId: user._id,
    tenantId: tenant?._id || null,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
    userAgent
  });
}

async function deleteSubscription({ user, subscriptionId }) {
  return pushSubscriptionRepository.deactivateSubscriptionForUser(user._id, subscriptionId);
}

function buildBrowserSubscription(subscription) {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth
    }
  };
}

function pruneRecentNotificationKeys(now = Date.now()) {
  for (const [key, expiresAt] of recentNotificationKeys.entries()) {
    if (expiresAt <= now) {
      recentNotificationKeys.delete(key);
    }
  }
}

function claimNotificationKey(key, now = Date.now()) {
  if (!key) {
    return true;
  }

  pruneRecentNotificationKeys(now);
  const expiresAt = recentNotificationKeys.get(key);
  if (expiresAt && expiresAt > now) {
    return false;
  }

  recentNotificationKeys.set(key, now + DEDUPE_WINDOW_MS);
  return true;
}

function logPushSendAttempt({ subscription, payload, outcome, reason }) {
  console.info("[web-push-send-attempt]", {
    subscriptionId: subscription?._id,
    tenantId: subscription?.tenantId || null,
    userId: subscription?.userId || null,
    eventType: payload?.eventType || "unknown",
    tag: payload?.tag || "untagged",
    outcome,
    reason
  });
}

async function sendToSubscription(subscription, payload) {
  if (!isWebPushConfigured()) {
    logPushSendAttempt({
      subscription,
      payload,
      outcome: "skipped",
      reason: "vapid_not_configured"
    });
    return false;
  }

  configureWebPush();

  try {
    await webPush.sendNotification(buildBrowserSubscription(subscription), JSON.stringify(payload));
    await pushSubscriptionRepository.recordPushSuccess(subscription._id);
    logPushSendAttempt({ subscription, payload, outcome: "sent" });
    return true;
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await pushSubscriptionRepository.deactivateByEndpoint(subscription.endpoint);
      logPushSendAttempt({
        subscription,
        payload,
        outcome: "deactivated",
        reason: String(error.statusCode)
      });
      return false;
    }

    await pushSubscriptionRepository.recordPushFailure(subscription._id);
    logPushSendAttempt({
      subscription,
      payload,
      outcome: "failed",
      reason: error.statusCode ? String(error.statusCode) : error.name || "send_error"
    });
    console.warn("[web-push-failed]", error.message);
    return false;
  }
}

async function sendTenantNotification({
  tenant,
  title,
  body,
  url,
  tag,
  eventType,
  roles = VENDOR_ALERT_ROLES,
  locationId = null
}) {
  if (!tenant?._id) {
    return { attempted: 0, sent: 0 };
  }

  if (!isWebPushConfigured()) {
    return { attempted: 0, sent: 0 };
  }

  const payload = {
    title,
    body,
    url: url || "/dashboard",
    tag: tag || eventType || "getprio-notification",
    eventType: eventType || "vendor_alert"
  };

  if (!claimNotificationKey(`tenant:${tenant._id}:${payload.tag}`)) {
    return { attempted: 0, sent: 0, deduped: true };
  }

  const subscriptions = await pushSubscriptionRepository.listActiveByTenantId(
    tenant._id,
    { roles, locationId }
  );
  let sent = 0;
  for (const subscription of subscriptions) {
    const delivered = await sendToSubscription(subscription, payload);
    if (delivered) {
      sent += 1;
    }
  }

  return {
    attempted: subscriptions.length,
    sent
  };
}

async function sendUserNotification({ userId, title, body, url, tag, eventType }) {
  if (!userId) {
    return { attempted: 0, sent: 0 };
  }

  if (!isPushConfigured()) {
    return { attempted: 0, sent: 0 };
  }

  const payload = {
    title,
    body,
    url: url || "/account",
    tag: tag || eventType || "getprio-customer-notification",
    eventType: eventType || "customer_alert",
    notificationId: crypto.randomUUID()
  };

  if (!claimNotificationKey(`user:${userId}:${payload.tag}`)) {
    return { attempted: 0, sent: 0, deduped: true };
  }

  const subscriptions = isWebPushConfigured()
    ? await pushSubscriptionRepository.listActiveByUserId(userId)
    : [];
  let sent = 0;
  for (const subscription of subscriptions) {
    if (await sendToSubscription(subscription, payload)) {
      sent += 1;
    }
  }
  const fcm = await mobilePushService.sendToUser({ userId, payload });

  return {
    attempted: subscriptions.length + fcm.attempted,
    sent: sent + fcm.sent
  };
}

async function notifyVendorQueueJoin({ tenant, ticket }) {
  return sendTenantNotification({
    tenant,
    title: "New queue join",
    body: `${ticket.customerName || "A customer"} joined the queue as #${ticket.ticketNumber}.`,
    url: "/dashboard/queue",
    tag: `queue-${tenant._id}-${ticket._id}`,
    eventType: "vendor_queue_join"
  });
}

async function notifyVendorBookingIntake({ tenant, booking }) {
  return sendTenantNotification({
    tenant,
    title: "New booking",
    body: `${booking.customerName || "A customer"} sent booking ${booking.reference}.`,
    url: "/dashboard/bookings",
    tag: `booking-${tenant._id}-${booking._id}`,
    eventType: "vendor_booking_intake"
  });
}

async function notifyVendorPaymentProofReview({ tenant, booking }) {
  return sendTenantNotification({
    tenant,
    title: "Payment proof ready",
    body: `${booking.customerName || "A customer"} submitted payment evidence for ${booking.reference || "a booking"}.`,
    url: "/dashboard/bookings",
    tag: `payment-proof-${tenant._id}-${booking._id}`,
    eventType: "vendor_payment_proof_review",
    roles: VENDOR_ALERT_ROLES
  });
}

async function notifyVendorGroupFundedCampaignCreated({ tenant, campaign }) {
  return sendTenantNotification({
    tenant,
    title: "New group-funded campaign",
    body: `${campaign.organizerDisplayName || "A customer"} started a group-funded campaign for ${campaign.serviceNameSnapshot || "a service"}.`,
    url: "/dashboard/bookings",
    tag: `group-funded-created-${tenant._id}-${campaign._id}`,
    eventType: "vendor_group_funded_campaign_created"
  });
}

async function notifyVendorGroupFundedProofReview({ tenant, campaign, contribution }) {
  return sendTenantNotification({
    tenant,
    title: "Group-funded proof ready",
    body: `A contributor submitted payment evidence for ${campaign.serviceNameSnapshot || "a group-funded campaign"}.`,
    url: "/dashboard/bookings",
    tag: `group-funded-proof-${tenant._id}-${contribution._id}`,
    eventType: "vendor_group_funded_proof_review",
    roles: VENDOR_ALERT_ROLES
  });
}

async function notifyVendorGroupFundedReviewReady({ tenant, campaign }) {
  return sendTenantNotification({
    tenant,
    title: "Group-funded booking ready",
    body: `${campaign.serviceNameSnapshot || "A group-funded campaign"} is fully funded and ready for vendor review.`,
    url: "/dashboard/bookings",
    tag: `group-funded-review-${tenant._id}-${campaign._id}`,
    eventType: "vendor_group_funded_review_ready",
    roles: VENDOR_ALERT_ROLES
  });
}

async function notifyVendorQueueLifecycle({ tenant, location, action, stats = {} }) {
  const locationName = location?.name || "the queue";
  const outcomeSummary = stats.outcomes
    ? ` ${stats.outcomes.pendingCarryOver || 0} carried over, ${stats.outcomes.expired || 0} expired, ${stats.outcomes.unserved || 0} unserved.`
    : "";
  const actionConfig = {
    closed: {
      title: "Queue closed",
      body: `${locationName} was closed for the day.${outcomeSummary}`,
      eventType: "vendor_queue_closed"
    },
    reopened: {
      title: "Queue re-opened",
      body: `${locationName} was re-opened.`,
      eventType: "vendor_queue_reopened"
    },
    paused: {
      title: "Queue paused",
      body: `${locationName} is paused for new joins.`,
      eventType: "vendor_queue_paused"
    },
    resumed: {
      title: "Queue resumed",
      body: `${locationName} is accepting joins again.`,
      eventType: "vendor_queue_resumed"
    },
    auto_paused: {
      title: "Queue intake limit reached",
      body: `${locationName} auto-paused at ${stats.waitingCount || "the configured"} waiting tickets.`,
      eventType: "vendor_queue_auto_paused"
    },
    auto_resumed: {
      title: "Queue intake resumed",
      body: `${locationName} resumed after waiting tickets dropped below the threshold.`,
      eventType: "vendor_queue_auto_resumed"
    },
    closing_15m: {
      title: "Queue closes in 15 minutes",
      body: `${locationName} will close automatically in 15 minutes. Extend by 30 minutes if service should continue.`,
      eventType: "vendor_queue_closing_15m"
    },
    closing_5m: {
      title: "Queue closes in 5 minutes",
      body: `${locationName} will close automatically in 5 minutes.`,
      eventType: "vendor_queue_closing_5m"
    },
    extended: {
      title: "Queue closing extended",
      body: `${locationName} was extended by 30 minutes.`,
      eventType: "vendor_queue_extended"
    },
    reconciliation_failed: {
      title: "Queue reconciliation failed",
      body: `${locationName} could not confirm a trustworthy closed state. Queue actions are locked until status is recovered.`,
      eventType: "vendor_queue_reconciliation_failed"
    }
  };
  const config = actionConfig[action] || {
    title: "Queue update",
    body: `${locationName} was updated.`,
    eventType: "vendor_queue_updated"
  };

  return sendTenantNotification({
    tenant,
    title: config.title,
    body: config.body,
    url: "/dashboard/queue",
    tag: `queue-lifecycle-${tenant._id}-${location?._id || "default"}-${action}-${stats.deadlineVersion || "current"}`,
    eventType: config.eventType,
    locationId: location?._id || null
  });
}

function getBookingUpdateBody(booking, action) {
  const reference = booking.reference || "your booking";
  const serviceName = booking.serviceName || "your service";
  const tenantName = booking.tenantName || "GetPrio";

  switch (action) {
    case "confirmed":
      return `${tenantName} confirmed ${reference} for ${serviceName}.`;
    case "rescheduled":
      return `${tenantName} rescheduled ${reference}.`;
    case "canceled":
      return `${tenantName} canceled ${reference}.`;
    case "no_show":
      return `${tenantName} marked ${reference} as no-show.`;
    case "checked_in":
      return `${tenantName} checked in ${reference}. Your queue ticket is ready.`;
    case "completed":
      return `${tenantName} completed ${reference}.`;
    case "payment_rejected":
      return `${tenantName} rejected payment evidence for ${reference}.`;
    case "payment_verified":
      return `${tenantName} verified payment evidence for ${reference}.`;
    case "pending_expired":
      return `${tenantName} canceled ${reference} because payment proof was not submitted in time.`;
    case "check_in_window_open":
      return `Check-in is open for ${reference} at ${tenantName}.`;
    case "check_in_closing":
      return `Check-in for ${reference} at ${tenantName} closes in about 5 minutes.`;
    default:
      return `${tenantName} updated ${reference}.`;
  }
}

async function customerAllowsNotification(userId, key) {
  const user = await userRepository.findUserById(userId);
  if (!user) {
    return false;
  }

  return user.notificationSettings?.[key] !== false;
}

async function notifyCustomerBookingUpdate({ booking, action }) {
  if (!booking?.customerUserId) {
    return { attempted: 0, sent: 0 };
  }

  if (!isPushConfigured()) {
    return { attempted: 0, sent: 0 };
  }

  const allowed = await customerAllowsNotification(booking.customerUserId, "bookingAlerts");
  if (!allowed) {
    return { attempted: 0, sent: 0 };
  }

  return sendUserNotification({
    userId: booking.customerUserId,
    title: "Booking update",
    body: getBookingUpdateBody(booking, action),
    url: `/account/bookings/${booking._id}`,
    tag: `customer-booking-${booking._id}-${action || booking.status}`,
    eventType: `customer_booking_${action || "updated"}`
  });
}

function getQueueUpdateBody(tenant, ticket, action) {
  const tenantName = tenant?.name || "GetPrio";
  const ticketNumber = ticket.ticketNumber || "your queue ticket";

  switch (action) {
    case "joined":
      return `You joined the queue at ${tenantName}. Your ticket number is ${ticketNumber}.`;
    case "confirmed":
      return `${tenantName} confirmed your arrival for ${ticketNumber}.`;
    case "called":
      return `${tenantName} is calling ${ticketNumber}.`;
    case "served":
      return `${tenantName} marked ${ticketNumber} as served.`;
    case "skipped":
      return `${tenantName} skipped ${ticketNumber}. You may still be able to rejoin.`;
    case "cancelled":
      return `${tenantName} canceled ${ticketNumber}.`;
    case "unserved":
      return `${tenantName} closed before serving ${ticketNumber}.`;
    case "requeued":
      return `${tenantName} returned ${ticketNumber} to the queue.`;
    case "near_turn":
      return `${ticketNumber} is almost next in the queue.`;
    case "carried_over":
    case "pending_carry_over":
      return `${tenantName} carried ${ticketNumber} over to the next queue day.`;
    case "expired":
      return `${ticketNumber} expired after its one carry-over opportunity ended without service. This is final and is not a cancellation.`;
    default:
      return `${tenantName} updated ${ticketNumber}.`;
  }
}

async function notifyCustomerQueueUpdate({ tenant, ticket, action }) {
  if (!ticket?.userId) {
    return { attempted: 0, sent: 0 };
  }

  if (!isPushConfigured()) {
    return { attempted: 0, sent: 0 };
  }

  const allowed = await customerAllowsNotification(ticket.userId, "queueAlerts");
  if (!allowed) {
    return { attempted: 0, sent: 0 };
  }

  return sendUserNotification({
    userId: ticket.userId,
    title: action === "joined" ? "Joined queue" : "Queue update",
    body: getQueueUpdateBody(tenant, ticket, action),
    url: ticket.lookupCode
      ? `/ticket/${tenant.slug}?ticket=${encodeURIComponent(ticket.lookupCode)}`
      : "/account/tickets",
    tag: `customer-queue-${ticket._id}-${action || ticket.status}`,
    eventType: `customer_queue_${action || "updated"}`
  });
}

module.exports = {
  getPublicKeyResponse,
  isPushConfigured,
  saveSubscription,
  deleteSubscription,
  sendTenantNotification,
  sendUserNotification,
  notifyVendorQueueJoin,
  notifyVendorBookingIntake,
  notifyVendorPaymentProofReview,
  notifyVendorGroupFundedCampaignCreated,
  notifyVendorGroupFundedProofReview,
  notifyVendorGroupFundedReviewReady,
  notifyVendorQueueLifecycle,
  notifyCustomerBookingUpdate,
  notifyCustomerQueueUpdate
};
