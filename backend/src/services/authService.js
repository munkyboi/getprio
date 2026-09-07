const bcrypt = require("bcryptjs");
const env = require("../config/env");
const authLoginAttemptRepository = require("../repositories/authLoginAttempts");
const userRepository = require("../repositories/users");
const securityEventService = require("./securityEventService");

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeLoginIdentifier(value) {
  const identifierValue = String(value || "").trim().toLowerCase();
  return {
    identifierType: identifierValue.includes("@") ? "email" : "username",
    identifierValue
  };
}

function getRequestIp(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.ip ||
    null
  );
}

function getUserAgent(req) {
  return req.headers["user-agent"] || null;
}

function getLockoutThreshold() {
  return Math.max(1, Number(env.loginLockoutThreshold) || 5);
}

function getLockoutWindowMinutes() {
  return Math.max(1, Number(env.loginLockoutWindowMinutes) || 15);
}

function getLockoutDurationMinutes() {
  return Math.max(1, Number(env.loginLockoutDurationMinutes) || 15);
}

function getLockoutExpiry(now = new Date()) {
  return new Date(now.getTime() + getLockoutDurationMinutes() * 60 * 1000);
}

function isUserLocked(user, now = new Date()) {
  if (!user?.accountLockedUntil) {
    return false;
  }

  return new Date(user.accountLockedUntil).getTime() > now.getTime();
}

async function verifyPasswordLogin(user, password) {
  if (!user?.passwordHash) {
    return false;
  }

  return bcrypt.compare(password, user.passwordHash);
}

async function recordLoginAttempt({
  email,
  identifierType,
  identifierValue,
  success,
  failureReason,
  user,
  sessionId,
  req,
  client
}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedIdentifierValue = String(identifierValue || normalizedEmail).trim().toLowerCase();
  const normalizedIdentifierType = identifierType || "email";
  const ipAddress = getRequestIp(req);
  const userAgent = getUserAgent(req);

  await authLoginAttemptRepository.createAttempt(
    {
      identifierType: normalizedIdentifierType,
      identifierValue: normalizedIdentifierValue,
      ipAddress,
      userAgent,
      success,
      failureReason
    },
    { client }
  );

  await securityEventService.logSecurityEvent(
    {
      userId: user?._id || null,
      sessionId: sessionId || null,
      eventType: success ? "login_success" : "login_failed",
      actorRole: user?.roles?.[0] || null,
      ipAddress,
      userAgent,
      metadata: {
        identifierType: normalizedIdentifierType,
        identifierValue: normalizedIdentifierValue,
        failureReason: failureReason || null
      }
    },
    { client }
  );
}

async function handleFailedPasswordLogin({ user, email, req, client }) {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();

  await recordLoginAttempt({
    email: normalizedEmail,
    success: false,
    failureReason: "invalid_credentials",
    user,
    req,
    client
  });

  const recentFailedCount = await authLoginAttemptRepository.countRecentFailedAttempts(
    normalizedEmail,
    getLockoutWindowMinutes(),
    { client }
  );

  const updates = {
    failedLoginCount: recentFailedCount,
    lastFailedLoginAt: now
  };
  let lockoutTriggered = false;

  if (user && recentFailedCount >= getLockoutThreshold() && !isUserLocked(user, now)) {
    updates.accountLockedUntil = getLockoutExpiry(now);
    lockoutTriggered = true;
  }

  let updatedUser = user;
  if (user) {
    updatedUser = await userRepository.updateUser(user._id, updates, { client });
  }

  if (lockoutTriggered && updatedUser) {
    await securityEventService.logSecurityEvent(
      {
        userId: updatedUser._id,
        eventType: "lockout_triggered",
        actorRole: updatedUser.roles?.[0] || null,
        ipAddress: getRequestIp(req),
        userAgent: getUserAgent(req),
        metadata: {
          identifierType: "email",
          identifierValue: normalizedEmail,
          failedAttemptCount: recentFailedCount,
          lockoutWindowMinutes: getLockoutWindowMinutes(),
          lockoutDurationMinutes: getLockoutDurationMinutes(),
          lockedUntil: updatedUser.accountLockedUntil || updates.accountLockedUntil
        }
      },
      { client }
    );
  }

  return {
    recentFailedCount,
    updatedUser
  };
}

async function handleSuccessfulPasswordLogin({ user, client }) {
  const needsReset =
    Number(user?.failedLoginCount || 0) > 0 ||
    Boolean(user?.lastFailedLoginAt) ||
    Boolean(user?.accountLockedUntil) ||
    user?.lastLoginProvider !== "password";

  if (!needsReset) {
    return user;
  }

  return userRepository.updateUser(
    user._id,
    {
      failedLoginCount: 0,
      lastFailedLoginAt: null,
      accountLockedUntil: null,
      lastLoginProvider: "password"
    },
    { client }
  );
}

async function recordLockedLoginAttempt({ email, user, req, client }) {
  await recordLoginAttempt({
    email,
    success: false,
    failureReason: "account_locked",
    user,
    req,
    client
  });

  await securityEventService.logSecurityEvent(
    {
      userId: user?._id || null,
      eventType: "account_locked",
      actorRole: user?.roles?.[0] || null,
      ipAddress: getRequestIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        identifierType: "email",
        identifierValue: normalizeEmail(email),
        lockedUntil: user?.accountLockedUntil || null
      }
    },
    { client }
  );
}

module.exports = {
  getRequestIp,
  getUserAgent,
  getLockoutDurationMinutes,
  getLockoutThreshold,
  getLockoutWindowMinutes,
  handleFailedPasswordLogin,
  handleSuccessfulPasswordLogin,
  isUserLocked,
  normalizeEmail,
  normalizeLoginIdentifier,
  recordLockedLoginAttempt,
  recordLoginAttempt,
  verifyPasswordLogin
};
