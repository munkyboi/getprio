const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildQueueTicketUrl,
  queueLifecycleEmail,
  queueOtpEmail,
  queueReconciliationEmail
} = require("../src/services/queueEmailTemplates");

const tenant = {
  _id: "tenant-1",
  name: "Dr. Santos & Partners",
  slug: "dr-santos"
};
const ticket = {
  _id: "ticket-1",
  ticketNumber: "DRS-042",
  lookupCode: "ABC 123",
  status: "waiting"
};

test("queue ticket emails use branded HTML and include private ticket details", () => {
  const email = queueLifecycleEmail({ tenant, ticket, kind: "joined" });

  assert.equal(email.subject, "Dr. Santos & Partners: queue ticket confirmed");
  assert.match(email.text, /Ticket number: DRS-042/);
  assert.match(email.text, /Ticket code: ABC 123/);
  assert.match(email.text, /\/ticket\/dr-santos\?ticket=ABC%20123/);
  assert.match(email.text, /Keep this ticket code and status link private/);
  assert.match(email.html, /GetPrio/);
  assert.match(email.html, /background:#FFFAF4/);
  assert.match(email.html, /View queue ticket/);
  assert.match(email.html, /Dr\. Santos &amp; Partners/);
  assert.doesNotMatch(email.html, /Dr\. Santos & Partners/);
});

test("every queue lifecycle variant retains ticket code and status URL", () => {
  const variants = [
    ["near_turn", { position: 2 }],
    ["called", {}],
    ["exception", { action: "skipped" }],
    ["continuation", { action: "carried over" }],
    ["final", { action: "served" }],
    ["pending_carry_over", {}],
    ["expired", {}],
    ["unserved", {}],
    ["unknown_status", { action: "manual_review" }]
  ];

  for (const [kind, options] of variants) {
    const email = queueLifecycleEmail({ tenant, ticket, kind, ...options });
    assert.match(email.text, /Ticket code: ABC 123/, kind);
    assert.match(email.text, /\/ticket\/dr-santos\?ticket=ABC%20123/, kind);
    assert.match(email.html, /ABC 123/, kind);
  }
});

test("called and served emails reflect the confirmation-before-service journey", () => {
  const called = queueLifecycleEmail({ tenant, ticket: { ...ticket, status: "called" }, kind: "called" });
  const served = queueLifecycleEmail({ tenant, ticket: { ...ticket, status: "served" }, kind: "final", action: "served" });

  assert.match(called.text, /present its barcode or ticket code/i);
  assert.match(called.text, /successful scan confirms your ticket/i);
  assert.match(called.html, /Open ticket barcode/);
  assert.doesNotMatch(called.text, /now being served/i);
  assert.match(served.text, /vendor marked your service as completed/i);
});

test("queue OTP and reconciliation alerts use the same GetPrio theme", () => {
  const otp = queueOtpEmail({ tenant, code: "482911", expiresMinutes: 15 });
  const reconciliation = queueReconciliationEmail({
    tenant,
    location: { name: "Main <Clinic>" }
  });

  assert.match(otp.text, /Verification code: 482911/);
  assert.match(otp.html, /Secure queue entry/);
  assert.match(otp.html, /Dr\. Santos &amp; Partners/);
  assert.match(reconciliation.text, /Required action: Review queue state/);
  assert.match(reconciliation.html, /Main &lt;Clinic&gt;/);
  assert.match(reconciliation.html, /Open vendor dashboard/);
});

test("queue ticket URL requires both tenant slug and lookup code", () => {
  assert.match(buildQueueTicketUrl(tenant, ticket), /\/ticket\/dr-santos\?ticket=ABC%20123$/);
  assert.equal(buildQueueTicketUrl({}, ticket), "");
  assert.equal(buildQueueTicketUrl(tenant, {}), "");
});

test("queue OTP preserves its original plain-text delivery contract", () => {
  const email = queueOtpEmail({ tenant, code: "482911", expiresMinutes: 15 });
  assert.equal(email.text, `Enter this one-time code to continue joining the queue. Do not share it with anyone.

Ticket details
Business: Dr. Santos & Partners
Verification code: 482911
Expires in: 15 minutes

If you did not request this code, you can safely ignore this email.

GetPrio | Clear queues. Calmer customers.`);
  assert.match(email.html, /VERIFICATION CODE/);
  assert.match(email.html, /This code expires in 15 minutes/);
});

test("queue lifecycle preserves the original plain-text ordering and sign-off", () => {
  const baseUrl = String(require("../src/config/env").appBaseUrl).replace(/\/$/, "");
  const email = queueLifecycleEmail({ tenant, ticket, kind: "joined" });
  assert.equal(email.text, `Your queue request is confirmed. Use the button below for live position and status updates.

Ticket details
Business: Dr. Santos & Partners
Ticket number: DRS-042
Ticket code: ABC 123
Current status: waiting

View queue ticket: ${baseUrl}/ticket/dr-santos?ticket=ABC%20123

Keep this ticket code and status link private. Anyone with the link may be able to view this queue ticket.

GetPrio | Clear queues. Calmer customers.`);
});
