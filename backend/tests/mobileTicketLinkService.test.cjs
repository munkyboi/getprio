const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/config/db");
const ticketRepository = require("../src/repositories/tickets");
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

test("replacing a mobile link revokes the old link inside one transaction", async () => {
  const originals = {
    withTransaction: db.withTransaction,
    findTicketByIdForUpdate: ticketRepository.findTicketByIdForUpdate,
    findActiveLinkForTicket: ticketMobileLinks.findActiveLinkForTicket,
    revokeLink: ticketMobileLinks.revokeLink,
    createLink: ticketMobileLinks.createLink
  };
  let revokedId;
  db.withTransaction = async (callback) => callback({ id: "transaction-client" });
  ticketRepository.findTicketByIdForUpdate = async () => ({
    _id: "42",
    userId: null,
    developerProjectId: "project-1",
    developerEnvironment: "sandbox"
  });
  ticketMobileLinks.findActiveLinkForTicket = async (_scope, options) => {
    assert.equal(options.client.id, "transaction-client");
    return { id: "old-link" };
  };
  ticketMobileLinks.revokeLink = async (id, options) => {
    revokedId = id;
    assert.equal(options.client.id, "transaction-client");
  };
  ticketMobileLinks.createLink = async (data, options) => {
    assert.equal(options.client.id, "transaction-client");
    assert.equal(data.ticketId, "42");
    return { id: "new-link" };
  };
  try {
    const result = await service.replacePrivateLink({
      ticketId: "42",
      developerProjectId: "project-1",
      environment: "sandbox",
      now: new Date("2026-09-15T06:00:00.000Z")
    });
    assert.equal(revokedId, "old-link");
    assert.match(result.url, /^https:\/\/sandbox\.getprio\.online\/t\/[A-Za-z0-9_-]{43}$/);
    assert.equal(result.expiresAt.toISOString(), "2026-09-15T06:15:00.000Z");
  } finally {
    Object.assign(db, { withTransaction: originals.withTransaction });
    Object.assign(ticketRepository, { findTicketByIdForUpdate: originals.findTicketByIdForUpdate });
    Object.assign(ticketMobileLinks, {
      findActiveLinkForTicket: originals.findActiveLinkForTicket,
      revokeLink: originals.revokeLink,
      createLink: originals.createLink
    });
  }
});

test("replacing a mobile link rejects an already-linked ticket", async () => {
  const originalWithTransaction = db.withTransaction;
  const originalFindTicketByIdForUpdate = ticketRepository.findTicketByIdForUpdate;
  db.withTransaction = async (callback) => callback({});
  ticketRepository.findTicketByIdForUpdate = async () => ({
    _id: "42",
    userId: "customer-1",
    developerProjectId: "project-1",
    developerEnvironment: "sandbox"
  });
  try {
    await assert.rejects(
      service.replacePrivateLink({ ticketId: "42", developerProjectId: "project-1", environment: "sandbox" }),
      (error) => error.code === "MOBILE_LINK_ALREADY_CLAIMED" && error.statusCode === 409
    );
  } finally {
    db.withTransaction = originalWithTransaction;
    ticketRepository.findTicketByIdForUpdate = originalFindTicketByIdForUpdate;
  }
});
