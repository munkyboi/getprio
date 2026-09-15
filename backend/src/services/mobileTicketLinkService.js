const crypto = require("node:crypto");
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

module.exports = {
  LINK_TTL_MS,
  buildMobileTicketUrl,
  hashToken,
  issuePrivateLink
};
