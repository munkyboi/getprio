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

test("preview resolves an unexpired proof without consuming it", async () => {
  const originals = {
    findUsableLinkByTokenHash: ticketMobileLinks.findUsableLinkByTokenHash,
    findTicketById: ticketRepository.findTicketById
  };
  let lookedUpHash;
  ticketMobileLinks.findUsableLinkByTokenHash = async (tokenHash) => {
    lookedUpHash = tokenHash;
    return {
      ticketId: "42",
      developerProjectId: "project-1",
      environment: "production",
      expiresAt: "2026-09-15T06:15:00.000Z",
      usedAt: null,
      revokedAt: null
    };
  };
  ticketRepository.findTicketById = async () => ({
    _id: "42",
    developerProjectId: "project-1",
    developerEnvironment: "production",
    userId: null,
    ticketNumber: "A-042"
  });
  try {
    const result = await service.previewPrivateLink({
      token: "A".repeat(43),
      environment: "production"
    });
    assert.equal(result.ticket.ticketNumber, "A-042");
    assert.equal(lookedUpHash, service.hashToken("A".repeat(43)));
    assert.equal(result.link.usedAt, null);
  } finally {
    Object.assign(ticketMobileLinks, { findUsableLinkByTokenHash: originals.findUsableLinkByTokenHash });
    Object.assign(ticketRepository, { findTicketById: originals.findTicketById });
  }
});

test("preview collapses wrong-environment and already-linked proofs", async () => {
  const originals = {
    findUsableLinkByTokenHash: ticketMobileLinks.findUsableLinkByTokenHash,
    findTicketById: ticketRepository.findTicketById
  };
  ticketMobileLinks.findUsableLinkByTokenHash = async () => ({
    ticketId: "42",
    developerProjectId: "project-1",
    environment: "sandbox"
  });
  ticketRepository.findTicketById = async () => ({
    _id: "42",
    developerProjectId: "project-1",
    developerEnvironment: "sandbox",
    userId: "customer-9"
  });
  try {
    await assert.rejects(
      service.previewPrivateLink({ token: "B".repeat(43), environment: "production" }),
      (error) => error.code === "TICKET_LINK_UNAVAILABLE" && error.statusCode === 404
    );
    await assert.rejects(
      service.previewPrivateLink({ token: "B".repeat(43), environment: "sandbox" }),
      (error) => error.code === "TICKET_LINK_UNAVAILABLE" && error.statusCode === 404
    );
  } finally {
    Object.assign(ticketMobileLinks, { findUsableLinkByTokenHash: originals.findUsableLinkByTokenHash });
    Object.assign(ticketRepository, { findTicketById: originals.findTicketById });
  }
});

test("accepting a private link locks ticket first, claims ownership, and consumes the proof", async () => {
  const originals = {
    withTransaction: db.withTransaction,
    findUsableLinkByTokenHash: ticketMobileLinks.findUsableLinkByTokenHash,
    findTicketByIdForUpdate: ticketRepository.findTicketByIdForUpdate,
    claimTicketForUser: ticketRepository.claimTicketForUser,
    consumeLink: ticketMobileLinks.consumeLink
  };
  const calls = [];
  db.withTransaction = async (callback) => callback({ id: "transaction-client" });
  ticketMobileLinks.findUsableLinkByTokenHash = async (_hash, options) => {
    calls.push(options.forUpdate ? "link-lock" : "link-read");
    return {
      id: "link-1",
      ticketId: "42",
      developerProjectId: "project-1",
      environment: "sandbox",
      expiresAt: "2026-09-15T06:15:00.000Z"
    };
  };
  ticketRepository.findTicketByIdForUpdate = async (_id, options) => {
    calls.push(options.client.id === "transaction-client" ? "ticket-lock" : "wrong-client");
    return {
      _id: "42",
      tenantId: "7",
      locationId: "8",
      ticketNumber: "S-042",
      userId: null,
      developerProjectId: "project-1",
      developerEnvironment: "sandbox",
      status: "waiting",
      statusReason: null
    };
  };
  ticketRepository.claimTicketForUser = async (_ticketId, userId, options) => {
    calls.push(`claim:${userId}:${options.client.id}`);
    return { _id: "42", ticketNumber: "S-042", status: "waiting", userId: "17" };
  };
  ticketMobileLinks.consumeLink = async (_linkId, options) => {
    calls.push(`consume:${options.client.id}`);
    return { id: "link-1", usedAt: "2026-09-15T06:01:00.000Z" };
  };
  try {
    const result = await service.acceptPrivateLink({
      token: "A".repeat(43),
      environment: "sandbox",
      userId: "17"
    });
    assert.equal(result.ticket.ticketNumber, "S-042");
    assert.equal(result.link.usedAt, "2026-09-15T06:01:00.000Z");
    assert.deepEqual(calls, ["link-read", "ticket-lock", "link-lock", "claim:17:transaction-client", "consume:transaction-client"]);
  } finally {
    Object.assign(db, { withTransaction: originals.withTransaction });
    Object.assign(ticketMobileLinks, {
      findUsableLinkByTokenHash: originals.findUsableLinkByTokenHash,
      consumeLink: originals.consumeLink
    });
    Object.assign(ticketRepository, {
      findTicketByIdForUpdate: originals.findTicketByIdForUpdate,
      claimTicketForUser: originals.claimTicketForUser
    });
  }
});

test("accepting an ineligible or deletion-restricted ticket leaves the proof unconsumed", async () => {
  const originals = {
    withTransaction: db.withTransaction,
    findUsableLinkByTokenHash: ticketMobileLinks.findUsableLinkByTokenHash,
    findTicketByIdForUpdate: ticketRepository.findTicketByIdForUpdate,
    claimTicketForUser: ticketRepository.claimTicketForUser,
    consumeLink: ticketMobileLinks.consumeLink
  };
  let claimCalls = 0;
  let consumeCalls = 0;
  db.withTransaction = async (callback) => callback({});
  ticketMobileLinks.findUsableLinkByTokenHash = async (_hash, options) => options.forUpdate
    ? { id: "link-1", ticketId: "42", developerProjectId: "project-1", environment: "production" }
    : { ticketId: "42", developerProjectId: "project-1", environment: "production" };
  ticketRepository.findTicketByIdForUpdate = async () => ({
    _id: "42",
    userId: null,
    developerProjectId: "project-1",
    developerEnvironment: "production",
    status: "called",
    statusReason: "account_deletion"
  });
  ticketRepository.claimTicketForUser = async () => { claimCalls += 1; return null; };
  ticketMobileLinks.consumeLink = async () => { consumeCalls += 1; return null; };
  try {
    await assert.rejects(
      service.acceptPrivateLink({ token: "B".repeat(43), environment: "production", userId: "17" }),
      (error) => error.code === "TICKET_LINK_UNAVAILABLE" && error.statusCode === 404
    );
    assert.equal(claimCalls, 0);
    assert.equal(consumeCalls, 0);
  } finally {
    Object.assign(db, { withTransaction: originals.withTransaction });
    Object.assign(ticketMobileLinks, {
      findUsableLinkByTokenHash: originals.findUsableLinkByTokenHash,
      consumeLink: originals.consumeLink
    });
    Object.assign(ticketRepository, {
      findTicketByIdForUpdate: originals.findTicketByIdForUpdate,
      claimTicketForUser: originals.claimTicketForUser
    });
  }
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
