const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../src/config/db");
const developerTestAccounts = require("../src/repositories/developerTestAccounts");
const securityEventService = require("../src/services/securityEventService");
const service = require("../src/services/sandboxAppleReviewAccountService");

function replace(object, name, value, originals) {
  originals.push([object, name, object[name]]);
  object[name] = value;
}

function restore(originals) {
  for (const [object, name, value] of originals.reverse()) object[name] = value;
}

test("platform Apple review account service creates one 30-day credential set and audits the actor", async () => {
  const originals = [];
  const calls = [];
  replace(developerTestAccounts, "list", async () => [], originals);
  replace(developerTestAccounts, "create", async (input, options) => {
    calls.push({ input, options });
    return { id: "review-account-1", projectId: input.projectId, slot: 1, purpose: input.purpose, username: input.username, email: input.email, status: "active", expiresAt: input.expiresAt, deviceCount: 0, createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T00:00:00.000Z" };
  }, originals);
  replace(db, "withTransaction", async (callback) => callback({ transaction: true }), originals);
  replace(securityEventService, "logSecurityEvent", async (event, options) => { calls.push({ event, options }); }, originals);
  try {
    const result = await service.create({ projectId: "project-1", actorId: 7, sessionId: "session-1", ipAddress: "127.0.0.1", userAgent: "test-agent" });
    assert.equal(result.testAccount.purpose, "apple_review");
    assert.equal(result.credentials.password.length, 8);
    assert.match(result.warning, /30 days/);
    assert.ok(calls[0].input.expiresAt.getTime() - Date.now() > 29 * 24 * 60 * 60 * 1000);
    assert.equal(calls[0].input.purpose, "apple_review");
    assert.ok(calls[0].options.client.transaction);
    assert.equal(calls[1].event.eventType, "platform_developer_sandbox_apple_review_account_created");
    assert.equal(calls[1].event.userId, 7);
    assert.ok(calls[1].options.client.transaction);
  } finally {
    restore(originals);
  }
});

test("platform Apple review account service refuses a second active account", async () => {
  const originals = [];
  replace(developerTestAccounts, "list", async () => [{ purpose: "apple_review", status: "active" }], originals);
  try {
    await assert.rejects(
      () => service.create({ projectId: "project-1", actorId: 7, sessionId: "session-1" }),
      (error) => error.code === "SANDBOX_APPLE_REVIEW_ACCOUNT_EXISTS" && error.statusCode === 409
    );
  } finally {
    restore(originals);
  }
});

test("platform Apple review account service resets only Apple review accounts", async () => {
  const originals = [];
  const calls = [];
  const existing = { id: "review-account-1", projectId: "project-1", purpose: "apple_review", username: "sb_review", email: "sb-review@test.getprio.invalid", status: "expired", expiresAt: "2026-09-26T00:00:00.000Z", deviceCount: 1 };
  replace(developerTestAccounts, "findById", async () => existing, originals);
  replace(developerTestAccounts, "reset", async (projectId, accountId, input, options) => {
    calls.push({ projectId, accountId, input, options });
    return { ...existing, status: "active", expiresAt: input.expiresAt, deviceCount: 0 };
  }, originals);
  replace(db, "withTransaction", async (callback) => callback({ transaction: true }), originals);
  replace(securityEventService, "logSecurityEvent", async (event, options) => calls.push({ event, options }), originals);
  try {
    const result = await service.reset({ projectId: "project-1", accountId: "review-account-1", actorId: 7, sessionId: "session-1" });
    assert.equal(result.testAccount.purpose, "apple_review");
    assert.ok(calls[0].input.expiresAt.getTime() - Date.now() > 29 * 24 * 60 * 60 * 1000);
    assert.equal(calls[1].event.eventType, "platform_developer_sandbox_apple_review_account_reset");
  } finally {
    restore(originals);
  }
});
