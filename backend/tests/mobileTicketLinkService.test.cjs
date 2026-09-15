const test = require("node:test");
const assert = require("node:assert/strict");
const ticketMobileLinks = require("../src/repositories/ticketMobileLinks");
const service = require("../src/services/mobileTicketLinkService");

test("mobile ticket links use environment-specific origins and a 15-minute expiry", async () => {
  const originalCreateLink = ticketMobileLinks.createLink;
  let persisted;
  ticketMobileLinks.createLink = async (data) => {
    persisted = data;
    return { id: "link-1" };
  };
  try {
    const now = new Date("2026-09-15T06:00:00.000Z");
    const result = await service.issuePrivateLink({
      ticketId: "42",
      developerProjectId: "project-1",
      environment: "sandbox",
      now
    });
    assert.match(result.url, /^https:\/\/sandbox\.getprio\.online\/t\/[A-Za-z0-9_-]{43}$/);
    assert.equal(result.expiresAt.toISOString(), "2026-09-15T06:15:00.000Z");
    assert.equal(persisted.ticketId, "42");
    assert.equal(persisted.developerProjectId, "project-1");
    assert.equal(persisted.environment, "sandbox");
    assert.match(persisted.tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(persisted.expiresAt.toISOString(), "2026-09-15T06:15:00.000Z");
    assert.equal(service.hashToken(result.url.split("/t/")[1]), persisted.tokenHash);
  } finally {
    ticketMobileLinks.createLink = originalCreateLink;
  }
});

test("mobile ticket links reject an incomplete scope", async () => {
  await assert.rejects(
    service.issuePrivateLink({ ticketId: "42", developerProjectId: "project-1", environment: "unknown" }),
    /scope is incomplete/
  );
});
