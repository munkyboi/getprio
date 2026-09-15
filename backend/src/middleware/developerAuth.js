const jwt = require("jsonwebtoken");
const env = require("../config/env");
const authSessionRepository = require("../repositories/authSessions");
const userRepository = require("../repositories/users");
const developerAccountRepository = require("../repositories/developerAccounts");
const { getAccessCookie, parseCookies } = require("../services/browserSessionService");

function getDeveloperTokenFromRequest(req) {
  const authorization = req.headers.authorization || "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
  const cookieToken = getAccessCookie(parseCookies(req.headers.cookie), env.authCookieSecure, "developer");

  if (bearerToken && cookieToken) {
    const error = new Error("Use one authentication method per request.");
    error.statusCode = 400;
    error.code = "AMBIGUOUS_AUTHENTICATION";
    throw error;
  }

  return cookieToken || bearerToken;
}

async function loadDeveloperIdentity(req, strict = true) {
  const token = getDeveloperTokenFromRequest(req);
  if (!token) {
    if (strict) {
      const error = new Error("Developer authentication required.");
      error.statusCode = 401;
      throw error;
    }
    req.user = null;
    req.developerMembership = null;
    return;
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    const error = new Error("Developer session is no longer valid.");
    error.statusCode = 401;
    throw error;
  }

  if (payload.surface !== "developer" || !payload.session_id) {
    const error = new Error("Developer session is no longer valid.");
    error.statusCode = 401;
    throw error;
  }

  const session = await authSessionRepository.findSessionById(payload.session_id);
  if (
    !session ||
    session.surface !== "developer" ||
    session.status !== "active" ||
    new Date(session.expiresAt).getTime() <= Date.now() ||
    (session.absoluteExpiresAt && new Date(session.absoluteExpiresAt).getTime() <= Date.now()) ||
    (session.inactivityExpiresAt && new Date(session.inactivityExpiresAt).getTime() <= Date.now())
  ) {
    const error = new Error("Developer session is no longer valid.");
    error.statusCode = 401;
    throw error;
  }

  const user = await userRepository.findUserById(payload.sub);
  const membership = user && await developerAccountRepository.findMembershipByUserId(user._id);
  if (!user || !membership || membership.accountStatus !== "active") {
    const error = new Error("Developer account is not active.");
    error.statusCode = 403;
    error.code = "DEVELOPER_ACCOUNT_INACTIVE";
    throw error;
  }

  req.user = user;
  req.developerMembership = membership;
  req.auth = {
    sessionId: String(session._id),
    transport: getAccessCookie(parseCookies(req.headers.cookie), env.authCookieSecure, "developer") ? "cookie" : "bearer",
    session,
    surface: "developer"
  };

  if (typeof authSessionRepository.touchSession === "function") {
    await authSessionRepository.touchSession(session._id, { inactivityMinutes: env.sessionInactivityMinutes });
  }
}

async function authenticateDeveloper(req, _res, next) {
  try {
    await loadDeveloperIdentity(req, true);
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticateDeveloper, getDeveloperTokenFromRequest, loadDeveloperIdentity };
