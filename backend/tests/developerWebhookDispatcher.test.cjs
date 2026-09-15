const test = require("node:test");
const assert = require("node:assert/strict");
const deliveries = require("../src/repositories/developerWebhookDeliveries");
const webhookService = require("../src/services/developerWebhookService");
const dispatcherModule = require("../src/services/developerWebhookDispatcher");

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("webhook dispatcher signs the stored raw body and rejects redirects", async () => {
  const secret = webhookService.createSigningSecret();
  const payloadBody = '{"type":"ticket.called","data":{"id":"t_1"}}';
  let request;
  const dispatcher = dispatcherModule.createDeveloperWebhookDispatcher({
    now: () => 1_700_000_000_000,
    lookup: publicLookup,
    fetch: async (_url, options) => {
      request = options;
      return { status: 204, headers: { get: () => null } };
    }
  });

  const result = await dispatcher.deliver({
    url: "https://hooks.example.test/events",
    eventId: "evt_1",
    payloadBody,
    signingSecretCiphertext: webhookService.encryptSecret(secret)
  });

  assert.deepEqual(result, { status: 204 });
  assert.equal(request.redirect, "error");
  assert.equal(request.pinnedAddress, "93.184.216.34");
  assert.equal(request.body, payloadBody);
  assert.equal(webhookService.verifySignature({
    payload: payloadBody,
    header: request.headers["GetPrio-Signature"],
    secret,
    now: 1_700_000_000
  }), true);
});

test("webhook dispatcher schedules a bounded retry and respects Retry-After", async () => {
  const original = {
    claimBatch: deliveries.claimBatch,
    markRetry: deliveries.markRetry,
    markSent: deliveries.markSent,
    markFailed: deliveries.markFailed
  };
  const retryCalls = [];
  deliveries.claimBatch = async () => [{
    id: "delivery-1",
    url: "https://hooks.example.test/events",
    eventId: "evt_1",
    payloadBody: "{}",
    signingSecretCiphertext: webhookService.encryptSecret("whsec_test"),
    attemptCount: 1,
    expiresAt: new Date(1_700_000_120_000)
  }];
  deliveries.markRetry = async (...args) => retryCalls.push(args);
  deliveries.markSent = async () => { throw new Error("unexpected success"); };
  deliveries.markFailed = async () => { throw new Error("unexpected terminal failure"); };
  try {
    const dispatcher = dispatcherModule.createDeveloperWebhookDispatcher({
      now: () => 1_700_000_000_000,
      random: () => 0,
      lookup: publicLookup,
      fetch: async () => ({ status: 503, headers: { get: (name) => name === "retry-after" ? "30" : null } })
    });
    assert.equal(await dispatcher.runBatch(), 1);
    assert.equal(retryCalls.length, 1);
    assert.equal(retryCalls[0][0], "delivery-1");
    assert.equal(retryCalls[0][2].getTime(), 1_700_000_030_000);
    assert.equal(retryCalls[0][4], 503);
  } finally {
    Object.assign(deliveries, original);
  }
});

test("webhook event fan-out stores the exact rendered body and a bounded expiry", async () => {
  const original = deliveries.enqueueForRegistrations;
  let call;
  deliveries.enqueueForRegistrations = async (data) => {
    call = data;
    return [{ id: "delivery-1", registrationId: "registration-1" }];
  };
  try {
    const result = await webhookService.enqueueEvent({
      projectId: "project-1",
      environment: "sandbox",
      eventId: "evt_1",
      eventType: "ticket.called",
      payload: { type: "ticket.called", data: { id: "t_1" } }
    }, { client: {} });
    assert.deepEqual(result, [{ id: "delivery-1", registrationId: "registration-1" }]);
    assert.equal(call.payloadBody, JSON.stringify(call.payload));
    assert.ok(call.expiresAt.getTime() > Date.now());
    await assert.rejects(
      () => webhookService.enqueueEvent({ projectId: "project-1", environment: "sandbox", eventId: "evt_2", eventType: "ticket.unknown" }, { client: {} }),
      { code: "INVALID_WEBHOOK" }
    );
  } finally {
    deliveries.enqueueForRegistrations = original;
  }
});

test("webhook fan-out renders each registration at its immutable payload version", async () => {
  const queries = [];
  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (queries.length === 1) return { rows: [{ id: "r1", payload_version: 1 }, { id: "r2", payload_version: 2 }] };
      return { rows: [{ id: `d${queries.length - 1}`, registration_id: params[0] }] };
    }
  };
  const result = await deliveries.enqueueForRegistrations({
    projectId: "project-1",
    environment: "sandbox",
    eventId: "evt_versions",
    eventType: "ticket.called",
    payloadVersion: 1,
    payload: { type: "ticket.called", payload_version: 1 },
    payloadBody: '{"type":"ticket.called","payload_version":1}',
    renderPayload: async (version) => ({
      payload: { type: "ticket.called", payload_version: version },
      payloadBody: JSON.stringify({ type: "ticket.called", payload_version: version })
    })
  }, { client });
  assert.deepEqual(result, [
    { id: "d1", registrationId: "r1" },
    { id: "d2", registrationId: "r2" }
  ]);
  assert.equal(queries[1].params[3], 1);
  assert.equal(queries[2].params[3], 2);
  assert.equal(queries[2].params[4], '{"type":"ticket.called","payload_version":2}');
});

test("webhook fan-out rejects an oversized version-specific render before insert", async () => {
  let inserts = 0;
  const client = {
    query: async (sql) => {
      if (String(sql).includes("SELECT id, payload_version")) return { rows: [{ id: "r1", payload_version: 2 }] };
      inserts += 1;
      return { rows: [] };
    }
  };
  await assert.rejects(
    () => deliveries.enqueueForRegistrations({
      projectId: "project-1",
      environment: "sandbox",
      eventId: "evt_large",
      eventType: "ticket.called",
      payloadVersion: 1,
      payloadBody: "{}",
      payload: {},
      maxBodyBytes: 4,
      renderPayload: async () => ({ payload: {}, payloadBody: "too-large" })
    }, { client }),
    { code: "WEBHOOK_PAYLOAD_TOO_LARGE" }
  );
  assert.equal(inserts, 0);
});
