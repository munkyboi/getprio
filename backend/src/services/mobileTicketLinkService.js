const crypto = require("node:crypto");
const db = require("../config/db");
const ticketRepository = require("../repositories/tickets");
const ticketMobileLinks = require("../repositories/ticketMobileLinks");

const LINK_TTL_MS = 15 * 60 * 1000;
const MOBILE_LINK_ORIGINS = {
  sandbox: "https://sandbox.getprio.online",
  production: "https://getprio.online"
};

function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildMobileTicketUrl(environment, token) {
  const origin = MOBILE_LINK_ORIGINS[environment];
  if (!origin) throw new Error("Unsupported mobile ticket link environment.");
  return `${origin}/t/${encodeURIComponent(token)}`;
}

function unavailableError() {
  const error = new Error("This ticket link can’t be used. Please request a new link.");
  error.statusCode = 404;
  error.code = "TICKET_LINK_UNAVAILABLE";
  return error;
}

function normalizeToken(token) {
  const value = String(token || "").trim();
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

async function previewPrivateLink({ token, environment }) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken || !MOBILE_LINK_ORIGINS[environment]) {
    throw unavailableError();
  }

  const link = await ticketMobileLinks.findUsableLinkByTokenHash(hashToken(normalizedToken));
  if (!link || link.environment !== environment) {
    throw unavailableError();
  }

  const ticket = await ticketRepository.findTicketById(link.ticketId);
  if (
    !ticket ||
    String(ticket.developerProjectId) !== String(link.developerProjectId) ||
    ticket.developerEnvironment !== environment ||
    ticket.userId
  ) {
    throw unavailableError();
  }

  return { link, ticket };
}

async function acceptPrivateLink({ token, environment, userId }) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken || !MOBILE_LINK_ORIGINS[environment] || !userId) {
    throw unavailableError();
  }

  const tokenHash = hashToken(normalizedToken);
  return db.withTransaction(async (client) => {
    const candidate = await ticketMobileLinks.findUsableLinkByTokenHash(tokenHash, { client });
    if (!candidate || candidate.environment !== environment) {
      throw unavailableError();
    }

    // Lock in ticket-first order, matching developer link replacement, so acceptance and replacement cannot deadlock.
    const ticket = await ticketRepository.findTicketByIdForUpdate(candidate.ticketId, { client });
    const link = await ticketMobileLinks.findUsableLinkByTokenHash(tokenHash, { client, forUpdate: true });
    if (
      !link ||
      link.environment !== environment ||
      String(link.ticketId) !== String(candidate.ticketId) ||
      !ticket ||
      String(ticket.developerProjectId) !== String(link.developerProjectId) ||
      ticket.developerEnvironment !== environment ||
      ticket.userId ||
      !["waiting", "called"].includes(ticket.status) ||
      ticket.statusReason === "account_deletion"
    ) {
      throw unavailableError();
    }

    const claimedTicket = await ticketRepository.claimTicketForUser(ticket._id, userId, { client });
    if (!claimedTicket) {
      throw unavailableError();
    }
    const consumedLink = await ticketMobileLinks.consumeLink(link.id, { client });
    if (!consumedLink) {
      throw unavailableError();
    }
    return { link: consumedLink, ticket: claimedTicket };
  });
}

async function issuePrivateLink({ ticketId, developerProjectId, environment, client, now = new Date() }) {
  if (!ticketId || !developerProjectId || !MOBILE_LINK_ORIGINS[environment]) {
    throw new Error("Ticket mobile link scope is incomplete.");
  }
  const token = createToken();
  const expiresAt = new Date(now.getTime() + LINK_TTL_MS);
  await ticketMobileLinks.createLink({
    ticketId,
    developerProjectId,
    environment,
    tokenHash: hashToken(token),
    expiresAt
  }, { client });
  return {
    url: buildMobileTicketUrl(environment, token),
    expiresAt
  };
}

async function replacePrivateLink({ ticketId, developerProjectId, environment, now = new Date() }) {
  return db.withTransaction(async (client) => {
    const ticket = await ticketRepository.findTicketByIdForUpdate(ticketId, { client });
    if (!ticket || String(ticket.developerProjectId) !== String(developerProjectId) || ticket.developerEnvironment !== environment) {
      const error = new Error("Mobile ticket link not found.");
      error.statusCode = 404;
      error.code = "MOBILE_LINK_NOT_FOUND";
      throw error;
    }
    if (ticket.userId) {
      const error = new Error("This ticket has already been linked.");
      error.statusCode = 409;
      error.code = "MOBILE_LINK_ALREADY_CLAIMED";
      throw error;
    }

    const currentLink = await ticketMobileLinks.findActiveLinkForTicket({
      ticketId,
      developerProjectId,
      environment
    }, { client });
    if (!currentLink) {
      const error = new Error("No unused mobile ticket link is available to replace.");
      error.statusCode = 409;
      error.code = "MOBILE_LINK_NOT_REPLACEABLE";
      throw error;
    }
    await ticketMobileLinks.revokeLink(currentLink.id, { client });
    return issuePrivateLink({ ticketId, developerProjectId, environment, client, now });
  });
}

module.exports = {
  LINK_TTL_MS,
  buildMobileTicketUrl,
  hashToken,
  normalizeToken,
  previewPrivateLink,
  acceptPrivateLink,
  issuePrivateLink,
  replacePrivateLink,
  unavailableError
};
