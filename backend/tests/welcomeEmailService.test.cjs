const test = require("node:test");
const assert = require("node:assert/strict");

function loadService(sendEmail) {
  const senderPath = require.resolve("../src/services/notificationService");
  const servicePath = require.resolve("../src/services/welcomeEmailService");
  const original = require.cache[senderPath];
  require.cache[senderPath] = { id: senderPath, filename: senderPath, loaded: true, exports: { sendEmail } };
  delete require.cache[servicePath];
  try { return require(servicePath); } finally {
    delete require.cache[servicePath];
    if (original) require.cache[senderPath] = original;
    else delete require.cache[senderPath];
  }
}

for (const vendor of [false, true]) {
  test(`${vendor ? "vendor" : "customer"} welcome uses approved artwork and audience action`, async () => {
    const messages = [];
    const service = loadService(async (message) => { messages.push(message); return true; });
    const user = { _id: "user-1", name: "Alex <Example>", email: "alex@example.com" };
    const tenant = vendor ? { _id: "tenant-1", name: "Example Studio" } : undefined;
    assert.equal(await service.sendWelcomeEmail({ user, tenant }), true);
    assert.equal(messages.length, 1);
    const message = messages[0];
    assert.equal(message.to, user.email);
    assert.equal(message.purpose, vendor ? "vendor_welcome" : "customer_welcome");
    assert.equal(message.tenantId, tenant?._id);
    assert.match(message.html, /getprio-welcome-hero\.png/);
    assert.match(message.html, /Alex &lt;Example&gt;/);
    assert.match(message.html, vendor ? /\/dashboard/ : /\/vendors/);
    assert.match(message.text, vendor ? /Example Studio/ : /Your GetPrio account is ready/);
    assert.doesNotMatch(message.text, /verified|approved/i);
  });
}

test("missing recipient is skipped and provider failure does not fail signup", async () => {
  let calls = 0;
  const service = loadService(async () => { calls++; throw new Error("private provider message"); });
  assert.equal(await service.sendWelcomeEmail({ user: { _id: "user-1" } }), false);
  assert.equal(calls, 0);
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    assert.equal(await service.sendWelcomeEmail({ user: { _id: "user-1", email: "alex@example.com" } }), false);
  } finally { console.warn = original; }
  assert.equal(calls, 1);
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(JSON.stringify(warnings), /alex@example|private provider/);
});
