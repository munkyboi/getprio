const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const env = require("../config/env");
const passwordResetTokenRepository = require("../repositories/passwordResetTokens");
const sessionService = require("./sessionService");
const securityEventService = require("./securityEventService");

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createResetTokenValue() {
  return crypto.randomBytes(32).toString("hex");
}

function buildPasswordResetUrl(token) {
  const baseUrl = String(env.clientUrl || "").replace(/\/$/, "");
  return `${baseUrl}/login?resetToken=${encodeURIComponent(token)}`;
}

function getPasswordResetExpiry() {
  return new Date(Date.now() + Math.max(1, Number(env.passwordResetTtlMinutes) || 30) * 60 * 1000);
}

async function issuePasswordResetToken({ user, req, client }) {
  const token = createResetTokenValue();
  const tokenHash = hashResetToken(token);
  const expiresAt = getPasswordResetExpiry();

  await passwordResetTokenRepository.invalidateUnusedTokensForUser(user._id, { client });
  await passwordResetTokenRepository.createResetToken(
    {
      userId: user._id,
      tokenHash,
      expiresAt
    },
    { client }
  );

  await securityEventService.logSecurityEvent(
    {
      userId: user._id,
      eventType: "password_reset_requested",
      actorRole: user.roles?.[0] || null,
      ipAddress: req ? req.headers["cf-connecting-ip"] || req.ip || null : null,
      userAgent: req?.headers["user-agent"] || null,
      metadata: {
        expiresAt,
        delivery: user.email ? "email" : "none"
      }
    },
    { client }
  );

  return {
    token,
    expiresAt,
    resetUrl: buildPasswordResetUrl(token)
  };
}

async function resolveValidResetToken(token, options = {}) {
  const resetToken = await passwordResetTokenRepository.findByTokenHash(hashResetToken(token), options);
  if (!resetToken) {
    return null;
  }

  if (resetToken.used_at || resetToken.usedAt) {
    return null;
  }

  const expiresAt = new Date(resetToken.expires_at || resetToken.expiresAt);
  if (expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return resetToken;
}

async function resetPassword({ token, newPassword, req }) {
  return db.withTransaction(async (client) => {
    const resetToken = await resolveValidResetToken(token, { client });
    if (!resetToken) {
      const error = new Error("Password reset token is invalid or expired.");
      error.statusCode = 400;
      throw error;
    }

    const userId = String(resetToken.user_id || resetToken.userId);
    const userRepository = require("../repositories/users");
    const user = await userRepository.findUserById(userId, { client });
    if (!user) {
      const error = new Error("Password reset token is invalid or expired.");
      error.statusCode = 400;
      throw error;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await userRepository.updateUser(
      user._id,
      {
        passwordHash,
        passwordHashAlgorithm: "bcrypt",
        lastPasswordChangedAt: new Date(),
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        accountLockedUntil: null,
        lastLoginProvider: "password"
      },
      { client }
    );

    await passwordResetTokenRepository.markTokenUsed(resetToken.id, { client });
    await passwordResetTokenRepository.invalidateUnusedTokensForUser(user._id, { client });
    await sessionService.revokeAllSessionsForUser(user._id, "password_reset", { client });
    await securityEventService.logSecurityEvent(
      {
        userId: user._id,
        eventType: "password_reset_completed",
        actorRole: user.roles?.[0] || null,
        ipAddress: req ? req.headers["cf-connecting-ip"] || req.ip || null : null,
        userAgent: req?.headers["user-agent"] || null,
        metadata: {}
      },
      { client }
    );

    return userRepository.findUserById(user._id, { client });
  });
}

async function changePassword({ user, currentPassword, newPassword, req }) {
  const authService = require("./authService");

  if (!user.passwordHash) {
    const error = new Error("Password change is not available for this account.");
    error.statusCode = 400;
    throw error;
  }

  const passwordMatches = await authService.verifyPasswordLogin(user, currentPassword);
  if (!passwordMatches) {
    const error = new Error("Current password is incorrect.");
    error.statusCode = 401;
    throw error;
  }

  return db.withTransaction(async (client) => {
    const userRepository = require("../repositories/users");
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updatedUser = await userRepository.updateUser(
      user._id,
      {
        passwordHash,
        passwordHashAlgorithm: "bcrypt",
        lastPasswordChangedAt: new Date(),
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        accountLockedUntil: null,
        lastLoginProvider: "password"
      },
      { client }
    );

    await passwordResetTokenRepository.invalidateUnusedTokensForUser(user._id, { client });
    await sessionService.revokeAllSessionsForUser(user._id, "password_changed", { client });
    await securityEventService.logSecurityEvent(
      {
        userId: user._id,
        eventType: "password_changed",
        actorRole: user.roles?.[0] || null,
        ipAddress: req ? req.headers["cf-connecting-ip"] || req.ip || null : null,
        userAgent: req?.headers["user-agent"] || null,
        metadata: {}
      },
      { client }
    );

    return updatedUser;
  });
}

module.exports = {
  buildPasswordResetUrl,
  changePassword,
  issuePasswordResetToken,
  resetPassword,
  resolveValidResetToken
};
