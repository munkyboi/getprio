const env = require("../config/env");
const { BRAND, createBrandedEmail } = require("./emailTemplates");

function buildQueueTicketUrl(tenant, ticket) {
  if (!tenant?.slug || !ticket?.lookupCode) {
    return "";
  }

  const baseUrl = String(env.appBaseUrl || "").replace(/\/$/, "");
  return `${baseUrl}/ticket/${encodeURIComponent(tenant.slug)}?ticket=${encodeURIComponent(ticket.lookupCode)}`;
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
    details: ticketDetails(tenant, ticket).filter((detail) => !["Ticket number", "Current status"].includes(detail.label)),
    illustration: "queue-update",
    queue: { number: ticket.ticketNumber, status: String(ticket.status || "").replaceAll("_", " ") },
    actionUrl: buildQueueTicketUrl(tenant, ticket),
    actionLabel: actionLabel || "View queue ticket",
    footer: footer || "Keep this ticket code and status link private. Anyone with the link may be able to view this queue ticket."
  });
}

function queueOtpEmail({ tenant, code, expiresMinutes }) {
  return createBrandedEmail({
    subject: `${tenant.name}: verification code`,
    preheader: "Verify your GetPrio queue request.",
    eyebrow: "Secure queue entry",
    title: "Verify your queue request.",
    message: "Enter this one-time code to continue joining the queue. Do not share it with anyone.",
    illustration: "account-verification",
    code,
    expiryText: `This code expires in ${expiresMinutes} minutes.`,
    details: [{ label: "Business", value: tenant.name }],
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
