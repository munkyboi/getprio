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
  issuePrivateLink,
  replacePrivateLink
};
