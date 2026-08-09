const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function requireWithMockRepository(repository) {
  const target = require.resolve("../src/services/privilegedTransactionService.js");
  const dependency = require.resolve("../src/repositories/privilegedTransactions.js");
  const previous = require.cache[dependency];
  require.cache[dependency] = { id: dependency, filename: dependency, loaded: true, exports: repository };
  delete require.cache[target];
  try {
    return require(target);
  } finally {
    delete require.cache[target];
    if (previous) require.cache[dependency] = previous;
    else delete require.cache[dependency];
  }
}

test("transaction confirmation binds action, target, reason, payload, and preview revision", async () => {
  let created;
  const service = requireWithMockRepository({
    createConfirmation: async (data) => { created = data; return { _id: "confirmation-1", ...data }; },
    consumeConfirmation: async () => ({ _id: "confirmation-1" })
  });
  const session = {
    _id: "session-1",
    primaryAuthenticatedAt: new Date(),
    mfaVerifiedAt: new Date()
  };

  const issued = await service.issueConfirmation({
    actorId: "user-1",
    session,
    action: "plan.update",
    target: "pro",
    reason: "Approved allowance update",
    payload: { limits: { tickets: 5000 }, enabled: true },
    previewRevision: "revision-7"
  });

  assert.match(issued.token, /^[a-f0-9]{96}$/);
  assert.equal(created.payloadDigest, service.buildPayloadDigest({ enabled: true, limits: { tickets: 5000 } }));
  assert.equal(created.action, "plan.update");
  assert.equal(created.previewRevision, "revision-7");
});

test("payload digests are stable across nested object key insertion order", () => {
  const service = requireWithMockRepository({});

  assert.equal(
    service.buildPayloadDigest({ zeta: true, limits: { tickets: 5000, emails: 500 } }),
    service.buildPayloadDigest({ limits: { emails: 500, tickets: 5000 }, zeta: true })
  );
});

test("transaction confirmation rejects stale primary or MFA assurance", async () => {
  const service = requireWithMockRepository({ createConfirmation: async () => null });
  await assert.rejects(
    () => service.issueConfirmation({
      actorId: "user-1",
      session: {
        _id: "session-1",
        primaryAuthenticatedAt: new Date(Date.now() - 11 * 60_000),
        mfaVerifiedAt: new Date()
      },
      action: "plan.update",
      target: "pro",
      reason: "Approved update",
      payload: {},
      previewRevision: "revision-7"
    }),
    (error) => error.statusCode === 403 && error.code === "RECENT_AUTHENTICATION_REQUIRED"
  );
});

test("transaction confirmation rejects a target that changed after preview", async () => {
  const service = requireWithMockRepository({ consumeConfirmation: async () => ({ _id: "confirmation-1" }) });
  await assert.rejects(
    () => service.consumeConfirmation({
      token: "confirmation-token",
      actorId: "user-1",
      session: {
        _id: "session-1",
        primaryAuthenticatedAt: new Date(),
        mfaVerifiedAt: new Date()
      },
      action: "plan.update",
      target: "pro",
      reason: "Approved update",
      payload: {},
      previewRevision: "server-before",
      currentPreviewRevision: "server-after"
    }),
    (error) => error.statusCode === 409 && error.code === "TRANSACTION_PREVIEW_STALE"
  );
});
