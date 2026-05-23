const nodemailer = require("nodemailer");
const env = require("../config/env");
const billingRepository = require("../repositories/billing");
const notificationDeliveryRepository = require("../repositories/notificationDeliveries");
const { getPlanEntitlements } = require("./subscriptionPlans");

let transport;
const TRANSACTIONAL_EMAIL_PURPOSES = new Set(["almost_there", "called"]);

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

function getCurrentMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function getEmailEntitlements(tenantId) {
  const subscription = await billingRepository.getActiveSubscriptionByTenantId(tenantId);

  if (subscription?.status === "active" && subscription.entitlements) {
    const planEntitlements = (await getPlanEntitlements(subscription.planSlug)) || {};

    return {
      entitlements: {
        ...planEntitlements,
        ...subscription.entitlements
      },
      periodStart: subscription.currentPeriodStart || getCurrentMonthStart(),
      periodEnd: subscription.currentPeriodEnd || null
    };
  }

  return {
    entitlements: await getPlanEntitlements("economical"),
    periodStart: getCurrentMonthStart(),
    periodEnd: null
  };
}

async function assertTransactionalEmailAllowance({ tenantId, purpose }) {
  if (!tenantId || !TRANSACTIONAL_EMAIL_PURPOSES.has(purpose)) {
    return;
  }

  const { entitlements, periodStart, periodEnd } = await getEmailEntitlements(tenantId);
  const limit = entitlements?.emailAlerts ? entitlements.monthlyTransactionalEmails : 0;

  if (limit === null || limit === undefined) {
    return;
  }

  const used = await notificationDeliveryRepository.countSentTransactionalEmails(tenantId, {
    from: periodStart,
    to: periodEnd
  });

  if (used >= Number(limit)) {
    const error = new Error("Transactional email limit reached for this subscription.");
    error.statusCode = 403;
    throw error;
  }
}

async function recordEmailDelivery({ to, subject, tenantId, ticketId, purpose, provider, status, error, metadata }) {
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
      metadata
    });
  } catch (recordError) {
    console.warn("[notification-tracking-failed]", recordError.message);
  }
}

async function sendEmail({ to, subject, text, tenantId, ticketId, purpose = "general", metadata }) {
  if (!to) {
    return false;
  }

  const provider = getEmailProvider();

  try {
    await assertTransactionalEmailAllowance({ tenantId, purpose });

    if (provider === "resend") {
      const response = await fetch(env.resendApiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.resendApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: formatSender(env.resendFromName, env.resendFromEmail),
          to,
          subject,
          text
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend email delivery failed: ${errorText}`);
      }
    } else if (provider === "sendgrid") {
      const response = await fetch(env.sendgridApiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.sendgridApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: to }]
            }
          ],
          from: {
            email: env.sendgridFromEmail,
            name: env.sendgridFromName
          },
          subject,
          content: [
            {
              type: "text/plain",
              value: text
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SendGrid email delivery failed: ${errorText}`);
      }
    } else if (provider === "smtp") {
      const transporter = getTransport();
      await transporter.sendMail({
        from: env.smtpUser,
        to,
        subject,
        text
      });
    } else {
      console.log("[email-fallback]", { to, subject, text });
    }

    await recordEmailDelivery({
      to,
      subject,
      tenantId,
      ticketId,
      purpose,
      provider,
      status: "sent",
      metadata
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
      metadata
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

async function notifyAlmostThere({ ticket, tenant, position }) {
  const message = `${tenant.name}: You're almost next. Ticket ${ticket.ticketNumber} is now ${position} in the queue.`;

  if (ticket.notifyByEmail && ticket.customerEmail) {
    try {
      await sendEmail({
        to: ticket.customerEmail,
        subject: `${tenant.name}: you're almost next`,
        text: message,
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
  const message = `${tenant.name}: Ticket ${ticket.ticketNumber} is now being served. Please proceed to the counter.`;

  if (ticket.notifyByEmail && ticket.customerEmail) {
    try {
      await sendEmail({
        to: ticket.customerEmail,
        subject: `${tenant.name}: it is your turn`,
        text: message,
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

module.exports = {
  sendEmail,
  sendSms,
  notifyAlmostThere,
  notifyCalled
};
