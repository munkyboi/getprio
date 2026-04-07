const nodemailer = require("nodemailer");
const env = require("../config/env");

let transport;

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

async function sendEmail({ to, subject, text }) {
  if (!to) {
    return false;
  }

  const transporter = getTransport();
  if (!transporter) {
    console.log("[email-fallback]", { to, subject, text });
    return true;
  }

  await transporter.sendMail({
    from: env.smtpUser,
    to,
    subject,
    text
  });

  return true;
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
    await sendEmail({
      to: ticket.customerEmail,
      subject: `${tenant.name}: you're almost next`,
      text: message
    });
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
    await sendEmail({
      to: ticket.customerEmail,
      subject: `${tenant.name}: it is your turn`,
      text: message
    });
  }

  if (ticket.notifyBySms && ticket.customerPhone) {
    await sendSms({
      to: ticket.customerPhone,
      body: message
    });
  }
}

module.exports = {
  notifyAlmostThere,
  notifyCalled
};
