const nodemailer = require("nodemailer");
const { createBrandedEmail } = require("./emailTemplates");
const env = require("../config/env");
const notificationDeliveryRepository = require("../repositories/notificationDeliveries");
const queueEmailJourneyService = require("./queueEmailJourneyService");
const { queueLifecycleEmail } = require("./queueEmailTemplates");

let transport;

function formatSender(name, email) {
  return name ? `${name} <${email}>` : email;
}

function getTransport() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    return null;
  }

  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      }
    });
  }

  return transport;
}

function getEmailProvider() {
  if (env.resendApiKey && env.resendFromEmail) {
    return "resend";
  }

  if (env.sendgridApiKey && env.sendgridFromEmail) {
    return "sendgrid";
  }

  if (env.smtpHost && env.smtpUser && env.smtpPass) {
    return "smtp";
  }

  return "console";
}

async function recordEmailDelivery({ to, subject, tenantId, ticketId, purpose, provider, status, error, metadata, outboxId }) {
  if (!tenantId) {
    return;
  }

  try {
    await notificationDeliveryRepository.recordDelivery({
      tenantId,
      ticketId,
      channel: "email",
      purpose,
      recipient: to,
      subject,
      provider,
      status,
      errorMessage: error ? String(error.message || error).slice(0, 1000) : null,
      metadata,
      outboxId
    });
  } catch (recordError) {
    console.warn("[notification-tracking-failed]", recordError.message);
  }
}

async function requireSuccessfulResponse(response, providerName) {
  if (response.ok) return;
  const errorText = await response.text();
  throw Object.assign(new Error(`${providerName} email delivery failed: ${errorText}`), {
    deliveryAmbiguous: !(response.status >= 400 && response.status < 500 && ![408, 409].includes(response.status))
  });
}

async function deliverWithResend({ to, subject, text, html, idempotencyKey, resendTemplate, resendFrom }) {
  const response = await fetch(env.resendApiUrl, {
    method: "POST",
    ...(idempotencyKey ? { signal: AbortSignal.timeout(20_000) } : {}),
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
    },
    body: JSON.stringify({
      from: resendFrom || formatSender(env.resendFromName, env.resendFromEmail),
      to,
      subject,
      ...(resendTemplate ? { template: resendTemplate } : { text, ...(html ? { html } : {}) })
    })
  });
  await requireSuccessfulResponse(response, "Resend");
}

async function deliverWithSendgrid({ to, subject, text, html }) {
  const response = await fetch(env.sendgridApiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.sendgridApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: env.sendgridFromEmail, name: env.sendgridFromName },
      subject,
      content: [{ type: "text/plain", value: text }, ...(html ? [{ type: "text/html", value: html }] : [])]
    })
  });
  await requireSuccessfulResponse(response, "SendGrid");
}

async function deliverEmail({ provider, to, subject, text, html, idempotencyKey, resendTemplate, resendFrom }) {
  if (provider === "resend") return deliverWithResend({ to, subject, text, html, idempotencyKey, resendTemplate, resendFrom });
  if (provider === "sendgrid") return deliverWithSendgrid({ to, subject, text, html });
  if (provider === "smtp") {
    try {
      return await getTransport().sendMail({ from: env.smtpUser, to, subject, text, ...(html ? { html } : {}) });
    } catch (error) {
      if (error.responseCode >= 400 && error.responseCode < 600) error.deliveryAmbiguous = false;
      throw error;
    }
  }
  console.log("[email-fallback]", { to, subject, text, html });
}

async function sendEmail({ to, subject, text, html, emailTemplate, tenantId, ticketId, purpose = "general", metadata, outboxId, idempotencyKey, resendTemplate, resendFrom, deliveryProvider }) {
  if (!to) {
    return false;
  }

  const provider = deliveryProvider || getEmailProvider();

  try {
    // Resend-managed templates may carry a branded inline fallback for other configured providers.
    if (resendTemplate && provider !== "resend" && !text && !html) {
      throw new Error("Managed email templates require Resend or an inline fallback");
    }
    if (!resendTemplate) html = html || createBrandedEmail({ subject, message: text, ...emailTemplate }).html;

    await deliverEmail({ provider, to, subject, text, html, idempotencyKey, resendTemplate, resendFrom });

    await recordEmailDelivery({
      to,
      subject,
      tenantId,
      ticketId,
      purpose,
      provider,
      status: "sent",
      metadata,
      outboxId
    });
    return true;
  } catch (error) {
    await recordEmailDelivery({
      to,
      subject,
      tenantId,
      ticketId,
      purpose,
      provider,
      status: "failed",
      error,
      metadata,
      outboxId
    });
    throw error;
  }
}

async function sendSms({ to, body }) {
  if (!to) {
    return false;
  }

  if (!env.smsAccountSid || !env.smsAuthToken || !env.smsFromNumber) {
    console.log("[sms-fallback]", { to, body });
    return true;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.smsAccountSid}/Messages.json`;
  const auth = Buffer.from(`${env.smsAccountSid}:${env.smsAuthToken}`).toString("base64");
  const payload = new URLSearchParams({
    From: env.smsFromNumber,
    To: to,
    Body: body
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SMS delivery failed: ${errorText}`);
  }

  return true;
}

function deliverLifecycleEmail(ticket, slot, logicalMessageKey, payload) {
  const deliveryPayload = { ...payload, deliveryProvider: getEmailProvider(),
    ...(getEmailProvider() === "resend" ? { resendFrom: formatSender(env.resendFromName, env.resendFromEmail) } : {}) };
  return queueEmailJourneyService.withLifecycleSlot(ticket._id, slot, logicalMessageKey,
    ({ idempotencyKey, deliveryPayload: savedPayload } = {}) => sendEmail({ ...(savedPayload || deliveryPayload), idempotencyKey }),
    deliveryPayload);
}

async function notifyAlmostThere({ ticket, tenant, position }) {
  const message = `${tenant.name}: You're almost next. Ticket ${ticket.ticketNumber} is now ${position} in the queue.`;

  if (ticket.notifyByEmail && ticket.customerEmail) {
    try {
      const email = queueLifecycleEmail({ tenant, ticket, kind: "near_turn", position });
      await deliverLifecycleEmail(ticket, "near_turn", `ticket:${ticket._id}:near-turn`, {
        to: ticket.customerEmail,
        ...email,
        tenantId: tenant._id,
        ticketId: ticket._id,
        purpose: "almost_there"
      });
    } catch (error) {
      console.warn("[email-notification-skipped]", error.message);
    }
  }

  if (ticket.notifyBySms && ticket.customerPhone) {
    await sendSms({
      to: ticket.customerPhone,
      body: message
    });
  }
}

async function notifyCalled({ ticket, tenant }) {
  const message = `${tenant.name}: Ticket ${ticket.ticketNumber} has been called. Please proceed and present the barcode or ticket code for confirmation.`;

  if (ticket.notifyByEmail && ticket.customerEmail) {
    try {
      const email = queueLifecycleEmail({ tenant, ticket, kind: "called" });
      await deliverLifecycleEmail(ticket, "called", `ticket:${ticket._id}:called`, {
        to: ticket.customerEmail,
        ...email,
        tenantId: tenant._id,
        ticketId: ticket._id,
        purpose: "called"
      });
    } catch (error) {
      console.warn("[email-notification-skipped]", error.message);
    }
  }

  if (ticket.notifyBySms && ticket.customerPhone) {
    await sendSms({
      to: ticket.customerPhone,
      body: message
    });
  }
}

const JOURNEY_MESSAGE_KINDS = new Set(["joined", "exception", "continuation", "final"]);

async function notifyJourneyLifecycle({ ticket, tenant, slot, action }) {
  if (!ticket?.notifyByEmail || !ticket?.customerEmail || !JOURNEY_MESSAGE_KINDS.has(slot)) return false;
  const email = queueLifecycleEmail({ tenant, ticket, kind: slot, action });
  try {
    return await deliverLifecycleEmail(ticket, slot, `ticket:${ticket._id}:${slot}`, {
      to: ticket.customerEmail, ...email,
      tenantId: tenant._id, ticketId: ticket._id, purpose: `queue_${slot}`
    });
  } catch (error) {
    // Provider response text is retained in delivery tracking, not emitted as
    // untrusted terminal output. Only controlled categories reach this log.
    console.warn("[email-journey-notification-skipped]", {
      category: error.statusCode === 403 ? "policy" : "delivery"
    });
    return false;
  }
}

module.exports = {
  sendEmail,
  sendSms,
  notifyAlmostThere,
  notifyCalled,
  notifyJourneyLifecycle
};
