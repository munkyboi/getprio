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
  assert.match(email.html, /background:#f5ecdf/);
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
