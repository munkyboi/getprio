const crypto = require("node:crypto");
const db = require("../config/db");
const env = require("../config/env");
const authSessionRepository = require("../repositories/authSessions");
const mfaRepository = require("../repositories/mfa");
const userRepository = require("../repositories/users");
const sessionService = require("./sessionService");
const notificationService = require("./notificationService");
const securityEventService = require("./securityEventService");
const {
  createRecoveryCodes,
  createTotpSecret,
  decryptSecret,
  encryptSecret,
  hashRecoveryCode,
  userRequiresPrivilegedMfa,
  verifyTotp
} = require("./mfaService");

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function invalidCodeError() {
  const error = new Error("That security code could not be verified. Check the code and try again.");
  error.statusCode = 400;
  error.code = "MFA_CODE_INVALID";
  return error;
}

async function issueLoginChallenge({ user, ipAddress, userAgent }, options = {}) {
  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  await mfaRepository.createChallenge({
    userId: user._id,
    tokenHash: hashToken(token),
    challengeType: "login",
    primaryAuthenticatedAt: new Date(),
    ipAddress,
    userAgent,
    expiresAt
  }, options);
  return { token, expiresAt };
}

async function startTotpEnrollment({ user, session, currentCode }, options = {}) {
  if (user.mfaEnabled) {
    const primaryAge = Date.now() - new Date(session?.primaryAuthenticatedAt || 0).getTime();
    if (!Number.isFinite(primaryAge) || primaryAge > 10 * 60_000) {
      const error = new Error("Please sign in again before replacing your authenticator.");
      error.statusCode = 403;
      error.code = "RECENT_AUTHENTICATION_REQUIRED";
      throw error;
    }
    const activeFactor = await mfaRepository.findTotpFactor(user._id, "active", options);
    const activeSecret = activeFactor && decryptSecret(activeFactor, env.mfaEncryptionSecret);
    if (!activeSecret || !verifyTotp(activeSecret, currentCode)) throw invalidCodeError();
  }

  const secret = createTotpSecret();
  await mfaRepository.replacePendingTotpFactor(
    user._id,
    encryptSecret(secret, env.mfaEncryptionSecret),
    options
  );
  const label = encodeURIComponent(user.email || user.username || `user-${user._id}`);
  return {
    secret,
    otpAuthUri: `otpauth://totp/GetPrio:${label}?secret=${secret}&issuer=GetPrio&digits=6&period=30`
  };
}

async function confirmTotpEnrollment({ user, sessionId, code }) {
  const enrollment = await db.withTransaction(async (client) => {
    const factor = await mfaRepository.findTotpFactor(user._id, "pending", { client });
    if (!factor) {
      const error = new Error("Start authenticator setup before confirming a code.");
      error.statusCode = 409;
      error.code = "MFA_ENROLLMENT_NOT_STARTED";
      throw error;
    }
    const secret = decryptSecret(factor, env.mfaEncryptionSecret);
    if (!verifyTotp(secret, code)) throw invalidCodeError();

    const recoveryCodes = createRecoveryCodes();
    await mfaRepository.activateFactor(factor._id, { client });
    await mfaRepository.replaceRecoveryCodes(
      user._id,
      recoveryCodes.map((value) => hashRecoveryCode(value, env.mfaRecoveryPepper)),
      { client }
    );
    await userRepository.updateUser(user._id, {
      mfaEnabled: true,
      mfaRequired: userRequiresPrivilegedMfa(user)
    }, { client });
    await authSessionRepository.markMfaVerified(sessionId, { client });
    await authSessionRepository.revokeOtherSessionsForUser(user._id, sessionId, "MFA factor enrolled or replaced", { client });
    return { recoveryCodes };
  });
  if (user.email) {
    await notificationService.sendEmail({
      to: user.email,
      subject: "Your GetPrio security method changed",
      text: "Your authenticator and recovery codes were updated. Other signed-in sessions were closed for your protection. If you did not make this change, reset your password and contact GetPrio support.",
      purpose: "security_mfa_changed"
    }).catch((error) => console.warn("[mfa-change-notification-skipped]", error.message));
  }
  return enrollment;
}

async function cancelTotpEnrollment({ user }) {
  const canceled = await mfaRepository.revokePendingTotpFactor(user._id);
  return { success: true, canceled };
}

async function disableMfa({ user, sessionId, code, recoveryCode, ipAddress, userAgent }) {
  if (!user.mfaEnabled) {
    const error = new Error("Multi-factor authentication is not enabled on this account.");
    error.statusCode = 409;
    error.code = "MFA_NOT_ENABLED";
    throw error;
  }
  if (userRequiresPrivilegedMfa(user)) {
    const error = new Error("Multi-factor authentication is required for your account role and cannot be removed.");
    error.statusCode = 403;
    error.code = "MFA_REQUIRED_FOR_ROLE";
    throw error;
  }

  await db.withTransaction(async (client) => {
    const factor = await mfaRepository.findTotpFactor(user._id, "active", { client });
    const secret = factor && decryptSecret(factor, env.mfaEncryptionSecret);
    let verified = Boolean(secret && code && verifyTotp(secret, code));
    if (!verified && recoveryCode) {
      verified = await mfaRepository.consumeRecoveryCode(
        user._id,
        hashRecoveryCode(recoveryCode, env.mfaRecoveryPepper),
        { client }
      );
    }
    if (!verified) throw invalidCodeError();

    await mfaRepository.revokeFactorsAndRecoveryCodes(user._id, { client });
    await userRepository.updateUser(user._id, {
      mfaEnabled: false,
      mfaRequired: false
    }, { client });
    await authSessionRepository.clearMfaVerification(sessionId, { client });
    await authSessionRepository.revokeOtherSessionsForUser(
      user._id,
      sessionId,
      "MFA disabled",
      { client }
    );
    await securityEventService.logSecurityEvent({
      userId: user._id,
      sessionId,
      eventType: "mfa_disabled",
      actorRole: user.roles?.[0] || null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      metadata: {}
    }, { client });
  });

  if (user.email) {
    await notificationService.sendEmail({
      to: user.email,
      subject: "Multi-factor authentication removed from your GetPrio account",
      text: "Multi-factor authentication was removed from your account. Other signed-in sessions were closed. If you did not make this change, reset your password and contact GetPrio support immediately.",
      purpose: "security_mfa_disabled"
    }).catch((error) => console.warn("[mfa-disable-notification-skipped]", error.message));
  }
  return { success: true };
}

async function verifyLoginChallenge({ challengeToken, code, recoveryCode }) {
  return db.withTransaction(async (client) => {
    const challenge = await mfaRepository.findChallengeByTokenHash(hashToken(challengeToken), { client });
    if (!challenge || challenge.usedAt || challenge.attemptCount >= 5 || new Date(challenge.expiresAt).getTime() <= Date.now()) {
      const error = new Error("This sign-in verification has expired. Please sign in again.");
      error.statusCode = 401;
      error.code = "MFA_CHALLENGE_EXPIRED";
      throw error;
    }
    const factor = await mfaRepository.findTotpFactor(challenge.userId, "active", { client });
    const secret = factor && decryptSecret(factor, env.mfaEncryptionSecret);
    let verified = Boolean(secret && code && verifyTotp(secret, code));
    if (!verified && recoveryCode) {
      verified = await mfaRepository.consumeRecoveryCode(
        challenge.userId,
        hashRecoveryCode(recoveryCode, env.mfaRecoveryPepper),
        { client }
      );
    }
    if (!verified) {
      await mfaRepository.recordChallengeFailure(challenge._id, { client });
      throw invalidCodeError();
    }
    if (!(await mfaRepository.consumeChallenge(challenge._id, { client }))) {
      const error = new Error("This sign-in verification has already been used.");
      error.statusCode = 409;
      error.code = "MFA_CHALLENGE_USED";
      throw error;
    }
    const user = await userRepository.findUserById(challenge.userId, { client });
    const sessionResult = await sessionService.createAuthSession({
      user,
      authMethod: user.lastLoginProvider || "password",
      ipAddress: challenge.ipAddress,
      userAgent: challenge.userAgent,
      primaryAuthenticatedAt: challenge.primaryAuthenticatedAt,
      mfaVerifiedAt: new Date(),
      client
    });
    return { user, sessionResult };
  });
}

module.exports = {
  cancelTotpEnrollment,
  confirmTotpEnrollment,
  disableMfa,
  issueLoginChallenge,
  startTotpEnrollment,
  verifyLoginChallenge
};
