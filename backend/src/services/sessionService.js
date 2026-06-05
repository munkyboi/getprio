const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const authSessionRepository = require("../repositories/authSessions");

function hashOpaqueToken(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function createOpaqueToken() {
  return crypto.randomBytes(48).toString("hex");
}

function getRefreshTtlDays(user) {
  if ((user.roles || []).includes("platform_admin")) {
    return env.refreshTokenTtlDaysPlatformAdmin;
  }

  const tenantRoles = (user.tenantMemberships || []).map((membership) => membership.role);
  if (tenantRoles.includes("owner") || tenantRoles.includes("admin")) {
    return env.refreshTokenTtlDaysVendorAdmin;
  }

  if (tenantRoles.includes("staff")) {
    return env.refreshTokenTtlDaysVendorStaff;
  }

  return env.refreshTokenTtlDaysCustomer;
}

function buildAccessToken(user, session) {
  return jwt.sign(
    {
      sub: String(user._id),
      session_id: String(session._id),
      roles: user.roles || []
    },
    env.jwtSecret,
    { expiresIn: `${env.accessTokenTtlMinutes}m` }
  );
}

async function createAuthSession({ user, authMethod, ipAddress, userAgent, deviceLabel, client }) {
  const refreshToken = createOpaqueToken();
  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const expiresAt = new Date(Date.now() + getRefreshTtlDays(user) * 24 * 60 * 60 * 1000);

  const session = await authSessionRepository.createSession(
    {
      userId: user._id,
      refreshTokenHash,
      authMethod,
      ipAddress,
      userAgent,
      deviceLabel,
      expiresAt
    },
    { client }
  );

  return {
    session,
    refreshToken,
    accessToken: buildAccessToken(user, session)
  };
}

async function rotateRefreshSession({ session, user, client }) {
  const refreshToken = createOpaqueToken();
  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const expiresAt = new Date(Date.now() + getRefreshTtlDays(user) * 24 * 60 * 60 * 1000);
  const rotatedSession = await authSessionRepository.rotateSessionRefreshToken(
    session._id,
    refreshTokenHash,
    expiresAt,
    { client }
  );

  return {
    session: rotatedSession,
    refreshToken,
    accessToken: buildAccessToken(user, rotatedSession)
  };
}

async function revokeSessionById(sessionId, revokeReason, options = {}) {
  return authSessionRepository.revokeSession(sessionId, revokeReason, options);
}

async function revokeAllSessionsForUser(userId, revokeReason, options = {}) {
  return authSessionRepository.revokeAllSessionsForUser(userId, revokeReason, options);
}

async function resolveSessionByRefreshToken(refreshToken, options = {}) {
  return authSessionRepository.findSessionByRefreshTokenHash(
    hashOpaqueToken(refreshToken),
    options
  );
}

module.exports = {
  buildAccessToken,
  createAuthSession,
  hashOpaqueToken,
  resolveSessionByRefreshToken,
  revokeAllSessionsForUser,
  revokeSessionById,
  rotateRefreshSession
};
