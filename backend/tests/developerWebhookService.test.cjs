const test = require("node:test");
const assert = require("node:assert/strict");
const webhookService = require("../src/services/developerWebhookService");

test("developer webhook validation keeps registrations on supported event types", () => {
  assert.deepEqual(webhookService.normalizeEvents(["ticket.called", "ticket.called"]), ["ticket.called"]);
  assert.ok(webhookService.normalizeEvents().includes("ticket.cancelled"));
  assert.throws(() => webhookService.normalizeEvents(["ticket.unknown"]), { code: "INVALID_WEBHOOK" });
});

test("queue session event mapping leaves paused sessions to the intake event", () => {
  assert.equal(webhookService.queueSessionEventType("open"), "queue.session.opened");
  assert.equal(webhookService.queueSessionEventType("closing"), "queue.session.closing");
  assert.equal(webhookService.queueSessionEventType("closed"), "queue.session.closed");
  assert.equal(webhookService.queueSessionEventType("paused"), null);
});

test("developer webhook destinations require HTTPS and public DNS answers", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  assert.equal(
    await webhookService.validateDestination("https://hooks.example.test/events", { lookup }),
    "https://hooks.example.test/events"
  );
  await assert.rejects(
    () => webhookService.validateDestination("http://hooks.example.test/events", { lookup }),
    { code: "INVALID_WEBHOOK" }
  );
  await assert.rejects(
    () => webhookService.validateDestination("https://user:pass@hooks.example.test/events", { lookup }),
    { code: "INVALID_WEBHOOK" }
  );
  await assert.rejects(
    () => webhookService.validateDestination("https://hooks.example.test/events", { lookup: async () => [{ address: "10.0.0.8" }] }),
    { code: "INVALID_WEBHOOK" }
  );
  await assert.rejects(
    () => webhookService.validateDestination("https://hooks.example.test/events", { lookup: async () => [{ address: "::ffff:127.0.0.1" }] }),
    { code: "INVALID_WEBHOOK" }
  );
  for (const address of ["100.64.0.1", "198.18.0.1", "224.0.0.1", "2001:db8::1", "ff02::1"]) {
    await assert.rejects(
      () => webhookService.validateDestination("https://hooks.example.test/events", { lookup: async () => [{ address }] }),
      { code: "INVALID_WEBHOOK" }
    );
  }
});

test("developer webhook signing secrets encrypt and decrypt without exposing plaintext", () => {
  const secret = webhookService.createSigningSecret();
  const ciphertext = webhookService.encryptSecret(secret);
  assert.notEqual(ciphertext, secret);
  assert.equal(webhookService.decryptSecret(ciphertext), secret);
});

test("developer webhook signatures verify the exact body within the timestamp window", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_123", type: "ticket.called" });
  const header = webhookService.buildSignatureHeader({ payload, secret, timestamp: 1_700_000_000, period: 1 });

  assert.equal(webhookService.verifySignature({ payload, header, secret, now: 1_700_000_100 }), true);
  assert.equal(webhookService.verifySignature({ payload: `${payload} `, header, secret, now: 1_700_000_100 }), false);
  assert.equal(webhookService.verifySignature({ payload, header, secret, now: 1_700_000_301 }), false);
});
