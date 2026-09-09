const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();
  for (const [requestPath, mockExports] of Object.entries(mocks)) {
    const resolvedDependency = require.resolve(requestPath, { paths: [path.dirname(resolvedTarget)] });
    originals.set(resolvedDependency, require.cache[resolvedDependency]);
    require.cache[resolvedDependency] = {
      id: resolvedDependency,
      filename: resolvedDependency,
      loaded: true,
      exports: mockExports
    };
  }
  delete require.cache[resolvedTarget];
  try {
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, originalEntry] of originals.entries()) {
      if (originalEntry) require.cache[resolvedDependency] = originalEntry;
      else delete require.cache[resolvedDependency];
    }
  }
}

test("notification service selects providers and enforces transactional email limits", async () => {
  const deliveryCalls = [];
  const service = requireWithMocks("../src/services/notificationService.js", {
    "../config/env": {
      smtpHost: "",
      smtpUser: "",
      smtpPass: "",
      resendApiKey: "",
      resendFromEmail: "",
      sendgridApiKey: "",
      sendgridFromEmail: "",
      smsAccountSid: "",
      smsAuthToken: "",
      smsFromNumber: ""
    },
    "../repositories/billing": {
      getActiveSubscriptionByTenantId: async () => ({
        status: "active",
        planSlug: "economical",
        entitlements: { emailAlerts: true, monthlyTransactionalEmails: 1 }
      })
    },
    "../repositories/notificationDeliveries": {
      countSentTransactionalEmails: async () => 1,
      recordDelivery: async (data) => {
        deliveryCalls.push(data);
      }
    },
    "./subscriptionPlans": {
      getPlanEntitlements: async () => ({ emailAlerts: true, monthlyTransactionalEmails: 2 })
    }
  });

  assert.equal(await service.sendEmail({ to: "", subject: "x", text: "y" }), false);
  await assert.rejects(
    () =>
      service.sendEmail({
        to: "customer@example.com",
        subject: "Hello",
        text: "Body",
        tenantId: "tenant-1",
        purpose: "almost_there"
      }),
    (error) => error.statusCode === 403
  );
  assert.equal(deliveryCalls.length, 1);
  assert.equal(deliveryCalls[0].status, "failed");
});

test("notification service falls back to console transport and sms fallback", async () => {
  const logs = [];
  const service = requireWithMocks("../src/services/notificationService.js", {
    "../config/env": {
      smtpHost: "",
      smtpUser: "",
      smtpPass: "",
      resendApiKey: "",
      resendFromEmail: "",
      sendgridApiKey: "",
      sendgridFromEmail: "",
      smsAccountSid: "",
      smsAuthToken: "",
      smsFromNumber: ""
    },
    "../repositories/billing": {
      getActiveSubscriptionByTenantId: async () => null
    },
    "../repositories/notificationDeliveries": {
      countSentTransactionalEmails: async () => 0,
      recordDelivery: async () => {}
    },
    "./subscriptionPlans": {
      getPlanEntitlements: async () => ({ emailAlerts: false, monthlyTransactionalEmails: 0 })
    }
  });

  const originalLog = console.log;
  console.log = (...args) => logs.push(args);
  try {
    assert.equal(await service.sendSms({ to: "", body: "x" }), false);
    assert.equal(await service.sendSms({ to: "0917", body: "hello" }), true);
    assert.equal(await service.notifyAlmostThere({ ticket: { _id: "ticket-1", ticketNumber: "A001", notifyByEmail: false, notifyBySms: false }, tenant: { _id: "tenant-1", name: "Demo" }, position: 2 }), undefined);
  } finally {
    console.log = originalLog;
  }

  assert.equal(logs.length >= 1, true);
});

test("all email providers deliver the shared HTML while retaining the original plain text", async () => {
  const originalFetch = global.fetch;
  try {
    for (const provider of ["resend", "sendgrid", "smtp"]) {
      let delivered;
      global.fetch = async (_url, options) => {
        delivered = JSON.parse(options.body);
        return { ok: true };
      };
      const service = requireWithMocks("../src/services/notificationService.js", {
        "../config/env": {
          resendApiKey: provider === "resend" ? "fixture" : "", resendFromEmail: "sender@example.com",
          sendgridApiKey: provider === "sendgrid" ? "fixture" : "", sendgridFromEmail: "sender@example.com",
          smtpHost: provider === "smtp" ? "smtp.example.com" : "", smtpUser: "sender@example.com", smtpPass: "fixture"
        },
        nodemailer: { createTransport: () => ({ sendMail: async (payload) => { delivered = payload; } }) }
      });
      const text = "Use code 012345. Expires in 10 minutes.";
      await service.sendEmail({ to: "recipient@example.com", subject: "Verify your GetPrio email", text,
        emailTemplate: { code: "012345", expiryText: "Expires in 10 minutes.", illustration: "account-verification" } });
      const html = provider === "sendgrid" ? delivered.content.find(item => item.type === "text/html").value : delivered.html;
      const plain = provider === "sendgrid" ? delivered.content.find(item => item.type === "text/plain").value : delivered.text;
      assert.equal(plain, text, provider);
      assert.match(html, /VERIFICATION CODE/, provider);
      assert.match(html, /012345/, provider);
      assert.match(html, /getprio-logo.png/, provider);
      assert.match(html, /#FFFAF4/, provider);
      await service.sendEmail({ to: "recipient@example.com", subject: "Security update", text: "Your settings changed." });
      const generic = provider === "sendgrid" ? delivered.content.find(item => item.type === "text/html").value : delivered.html;
      assert.match(generic, /The GetPrio Team/);
      assert.doesNotMatch(generic, /VERIFICATION CODE/);
    }
  } finally { global.fetch = originalFetch; }
});
