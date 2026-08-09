const env = require("../config/env");

const BRAND = Object.freeze({
  accent: "#f45d01",
  background: "#f5ecdf",
  ink: "#251e19",
  muted: "#756b63",
  paper: "#fffdf9",
  border: "#eadfd2"
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildQueueTicketUrl(tenant, ticket) {
  if (!tenant?.slug || !ticket?.lookupCode) {
    return "";
  }

  const baseUrl = String(env.appBaseUrl || "").replace(/\/$/, "");
  return `${baseUrl}/ticket/${encodeURIComponent(tenant.slug)}?ticket=${encodeURIComponent(ticket.lookupCode)}`;
}

function buildPlainText({ message, details, actionUrl, actionLabel, footer }) {
  const detailLines = details
    .filter((detail) => detail.value)
    .map((detail) => `${detail.label}: ${detail.value}`);
  return [
    message,
    detailLines.length ? `\nTicket details\n${detailLines.join("\n")}` : "",
    actionUrl ? `\n${actionLabel}: ${actionUrl}` : "",
    footer ? `\n${footer}` : "",
    "\nGetPrio | Clear queues. Calmer customers."
  ].filter(Boolean).join("\n");
}

function renderEmailHtml({ preheader, eyebrow, title, message, details, actionUrl, actionLabel, footer }) {
  const detailRows = details
    .filter((detail) => detail.value)
    .map((detail) => `
      <tr>
        <td style="padding:7px 0;color:${BRAND.muted};font-family:Arial,sans-serif;font-size:13px;vertical-align:top;width:42%;">${escapeHtml(detail.label)}</td>
        <td style="padding:7px 0;color:${BRAND.ink};font-family:Arial,sans-serif;font-size:14px;font-weight:700;text-align:right;vertical-align:top;word-break:break-word;">${escapeHtml(detail.value)}</td>
      </tr>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.background};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.background};border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:${BRAND.paper};border:1px solid ${BRAND.border};border-radius:24px;border-collapse:separate;overflow:hidden;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid ${BRAND.border};">
                <span style="color:${BRAND.ink};font-family:Georgia,serif;font-size:25px;font-weight:700;letter-spacing:-1px;">gp</span>
                <span style="margin-left:8px;color:${BRAND.ink};font-family:Arial,sans-serif;font-size:16px;font-weight:800;">GetPrio</span>
              </td>
            </tr>
            <tr>
              <td style="padding:38px 32px 18px;">
                <div style="color:${BRAND.accent};font-family:Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(eyebrow)}</div>
                <h1 style="margin:10px 0 14px;color:${BRAND.ink};font-family:Georgia,serif;font-size:38px;line-height:1.05;letter-spacing:-1px;">${escapeHtml(title)}</h1>
                <p style="margin:0;color:${BRAND.muted};font-family:Arial,sans-serif;font-size:16px;line-height:1.65;">${escapeHtml(message)}</p>
              </td>
            </tr>
            ${detailRows ? `
            <tr>
              <td style="padding:10px 32px 18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ef;border:1px solid ${BRAND.border};border-radius:16px;padding:14px 18px;">
                  ${detailRows}
                </table>
              </td>
            </tr>` : ""}
            ${actionUrl ? `
            <tr>
              <td style="padding:8px 32px 30px;">
                <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:${BRAND.accent};border-radius:999px;color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:800;padding:14px 24px;text-decoration:none;">${escapeHtml(actionLabel)}</a>
                <p style="margin:16px 0 0;color:${BRAND.muted};font-family:Arial,sans-serif;font-size:12px;line-height:1.5;word-break:break-all;">Or open:<br>${escapeHtml(actionUrl)}</p>
              </td>
            </tr>` : ""}
            <tr>
              <td style="padding:20px 32px 28px;background:#2b211b;color:#e8ddd3;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;">
                ${escapeHtml(footer || "This transactional message was sent for an active GetPrio queue journey.")}
                <br><strong style="color:#ffffff;">GetPrio</strong> | Clear queues. Calmer customers.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function createBrandedEmail({ subject, preheader, eyebrow, title, message, details = [], actionUrl = "", actionLabel = "View queue ticket", footer = "" }) {
  return {
    subject,
    text: buildPlainText({ message, details, actionUrl, actionLabel, footer }),
    html: renderEmailHtml({ preheader, eyebrow, title, message, details, actionUrl, actionLabel, footer })
  };
}

function ticketDetails(tenant, ticket) {
  return [
    { label: "Business", value: tenant?.name || "GetPrio vendor" },
    { label: "Ticket number", value: ticket?.ticketNumber || "" },
    { label: "Ticket code", value: ticket?.lookupCode || "" },
    { label: "Current status", value: ticket?.status ? String(ticket.status).replaceAll("_", " ") : "" }
  ];
}

function createTicketEmail({ tenant, ticket, subject, preheader, eyebrow, title, message, actionLabel, footer }) {
  return createBrandedEmail({
    subject,
    preheader,
    eyebrow,
    title,
    message,
    details: ticketDetails(tenant, ticket),
    actionUrl: buildQueueTicketUrl(tenant, ticket),
    actionLabel: actionLabel || "View queue ticket",
    footer: footer || "Keep this ticket code and status link private. Anyone with the link may be able to view this queue ticket."
  });
}

function queueOtpEmail({ tenant, code, expiresMinutes }) {
  return createBrandedEmail({
    subject: `${tenant.name}: verification code`,
    preheader: `Your GetPrio verification code is ${code}.`,
    eyebrow: "Secure queue entry",
    title: "Verify your queue request.",
    message: "Enter this one-time code to continue joining the queue. Do not share it with anyone.",
    details: [
      { label: "Business", value: tenant.name },
      { label: "Verification code", value: code },
      { label: "Expires in", value: `${expiresMinutes} minutes` }
    ],
    footer: "If you did not request this code, you can safely ignore this email."
  });
}

function queueLifecycleEmail({ tenant, ticket, kind, action, position }) {
  const ticketNumber = ticket.ticketNumber || "Your ticket";
  const messages = {
    joined: {
      subject: `${tenant.name}: queue ticket confirmed`, eyebrow: "Queue confirmed", title: `${ticketNumber} is in the queue.`,
      message: "Your queue request is confirmed. Use the button below for live position and status updates."
    },
    near_turn: {
      subject: `${tenant.name}: you're almost next`, eyebrow: "Almost your turn", title: "Please get ready.",
      message: `${ticketNumber} is now ${position} in the queue. Stay nearby and watch your live status page.`
    },
    called: {
      subject: `${tenant.name}: it is your turn`, eyebrow: "Ticket called", title: "Please proceed for confirmation.",
      message: `${ticketNumber} has been called. Open your ticket and present its barcode or ticket code to the vendor. A successful scan confirms your ticket, but service begins only when the vendor accepts you for service.`,
      actionLabel: "Open ticket barcode"
    },
    exception: {
      subject: `${tenant.name}: ticket update`, eyebrow: "Queue update", title: `${ticketNumber} was ${action}.`,
      message: "Open your queue ticket to review the current status and any available next step."
    },
    continuation: {
      subject: `${tenant.name}: ticket carried over`, eyebrow: "Queue day update", title: `${ticketNumber} was carried over.`,
      message: "Your ticket was retained for the next eligible queue day. It will receive a new live position when that queue day opens."
    },
    final: {
      subject: `${tenant.name}: ticket ${action}`, eyebrow: "Queue journey complete", title: `${ticketNumber} is ${action}.`,
      message: action === "served"
        ? "The vendor marked your service as completed. This is the final email for this queue journey, and your ticket page keeps the final status for reference."
        : "This is the final email for this queue journey. Your ticket page keeps the final status for reference."
    },
    pending_carry_over: {
      subject: `${ticketNumber} was saved for carry-over`, eyebrow: "Queue day closed", title: "Your place was retained.",
      message: `${tenant.name} closed before serving ${ticketNumber}. Your ticket is retained for one later eligible queue day, but it has no live position until staff opens that queue day.`
    },
    expired: {
      subject: `${ticketNumber} expired`, eyebrow: "Final queue update", title: "The carry-over window ended.",
      message: `${ticketNumber} reached its final expiration after the carry-over opportunity ended without service. This is not a cancellation. Contact ${tenant.name} about the appropriate next step.`
    },
    unserved: {
      subject: `${ticketNumber} was not served before closing`, eyebrow: "Final queue update", title: "Service was not completed.",
      message: `${tenant.name} closed after ${ticketNumber} was called. The unserved outcome is final and is not a cancellation. Contact the vendor about the appropriate next step.`
    }
  };
  const copy = messages[kind] || {
    subject: "Your queue ticket was updated", eyebrow: "Queue update", title: "Your ticket changed.",
    message: `${ticketNumber}: ${String(action || kind || "updated").replaceAll("_", " ")}.`
  };
  return createTicketEmail({ tenant, ticket, ...copy });
}

function queueReconciliationEmail({ tenant, location }) {
  const locationName = location?.name || tenant.name;
  const actionUrl = `${String(env.appBaseUrl || "").replace(/\/$/, "")}/dashboard/queue`;
  return createBrandedEmail({
    subject: `Queue reconciliation needs attention: ${locationName}`,
    preheader: `${locationName} queue actions are locked pending review.`,
    eyebrow: "Action required",
    title: "Queue reconciliation needs attention.",
    message: `${locationName} could not confirm a trustworthy closed state. Queue actions are locked until the state is reviewed.`,
    details: [
      { label: "Business", value: tenant.name },
      { label: "Location", value: locationName },
      { label: "Required action", value: "Review queue state" }
    ],
    actionUrl,
    actionLabel: "Open vendor dashboard",
    footer: "Retry reconciliation first. Escalate to Platform Admin repair only when retry cannot restore the state."
  });
}

module.exports = {
  BRAND,
  buildQueueTicketUrl,
  createBrandedEmail,
  queueLifecycleEmail,
  queueOtpEmail,
  queueReconciliationEmail
};
