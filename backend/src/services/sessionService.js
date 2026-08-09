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

async function createAuthSession({ user, authMethod, ipAddress, userAgent, deviceLabel, mfaVerifiedAt, primaryAuthenticatedAt, client }) {
  const refreshToken = createOpaqueToken();
  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const expiresAt = new Date(Date.now() + getRefreshTtlDays(user) * 24 * 60 * 60 * 1000);
  const inactivityExpiresAt = new Date(
    Math.min(expiresAt.getTime(), Date.now() + Number(env.sessionInactivityMinutes || 10080) * 60 * 1000)
  );

  const session = await authSessionRepository.createSession(
    {
      userId: user._id,
      refreshTokenHash,
      authMethod,
      ipAddress,
      userAgent,
      deviceLabel,
      mfaVerifiedAt,
      primaryAuthenticatedAt: primaryAuthenticatedAt || new Date(),
      expiresAt,
      absoluteExpiresAt: expiresAt,
      inactivityExpiresAt
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
  const requestedExpiresAt = new Date(
    Date.now() + getRefreshTtlDays(user) * 24 * 60 * 60 * 1000
  );
  const absoluteExpiresAt = new Date(
    session.absoluteExpiresAt || session.expiresAt || requestedExpiresAt
  );
  const expiresAt = new Date(
    Math.min(
      absoluteExpiresAt.getTime(),
      requestedExpiresAt.getTime()
    )
  );
  const inactivityExpiresAt = new Date(
    Math.min(expiresAt.getTime(), Date.now() + Number(env.sessionInactivityMinutes || 10080) * 60 * 1000)
  );
  const rotatedSession = await authSessionRepository.rotateSessionRefreshToken(
    session._id,
    refreshTokenHash,
    expiresAt,
    {
      client,
      inactivityExpiresAt,
      expectedRefreshTokenHash: session.refreshTokenHash || null
    }
  );

  if (!rotatedSession) {
    const replayedSession = await authSessionRepository.findSessionByPreviousRefreshTokenHash(
      session.refreshTokenHash,
      { client }
    );
    const replayAge = replayedSession?.lastRotatedAt
      ? Date.now() - new Date(replayedSession.lastRotatedAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (replayedSession && replayAge >= 0 && replayAge <= 10_000) {
      const error = new Error("Your session was already refreshed. Please retry the request.");
      error.statusCode = 409;
      error.code = "REFRESH_ALREADY_ROTATED";
      throw error;
    }
    if (replayedSession) {
      await authSessionRepository.revokeSession(replayedSession._id, "refresh_token_reuse", { client });
    }
    const error = new Error("Refresh session is no longer valid.");
    error.statusCode = 401;
    error.code = "REFRESH_REUSE_DETECTED";
    throw error;
  }

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
  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const session = await authSessionRepository.findSessionByRefreshTokenHash(
    refreshTokenHash,
    options
  );
  if (session) {
    return session;
  }
  if (typeof authSessionRepository.findSessionByPreviousRefreshTokenHash !== "function") {
    return null;
  }

  const replayedSession = await authSessionRepository.findSessionByPreviousRefreshTokenHash(
    refreshTokenHash,
    options
  );
  if (!replayedSession) {
    return null;
  }

  const replayAge = replayedSession.lastRotatedAt
    ? Date.now() - new Date(replayedSession.lastRotatedAt).getTime()
    : Number.POSITIVE_INFINITY;
  if (replayAge >= 0 && replayAge <= 10_000) {
    const error = new Error("Your session was already refreshed. Please retry the request.");
    error.statusCode = 409;
    error.code = "REFRESH_ALREADY_ROTATED";
    throw error;
  }

  await authSessionRepository.revokeSession(replayedSession._id, "refresh_token_reuse", options);
  const error = new Error("Refresh session is no longer valid.");
  error.statusCode = 401;
  error.code = "REFRESH_REUSE_DETECTED";
  throw error;
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
