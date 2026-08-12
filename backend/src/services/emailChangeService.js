const crypto = require("node:crypto");
const db = require("../config/db");
const env = require("../config/env");
const authSessionRepository = require("../repositories/authSessions");
const challengeRepository = require("../repositories/accountEmailChangeChallenges");
const mfaRepository = require("../repositories/mfa");
const userRepository = require("../repositories/users");
const authService = require("./authService");
const notificationService = require("./notificationService");
const securityEventService = require("./securityEventService");
const { decryptSecret, verifyTotp } = require("./mfaService");

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

function matchesCode(code, expectedHash) {
  const actual = Buffer.from(hashCode(code), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function issueCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) return "your email address";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(1, Math.min(6, local.length - 1)))}@${domain}`;
}

function invalidCode(message = "That verification code could not be verified. Check it and try again.") {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "EMAIL_CHANGE_CODE_INVALID";
  return error;
}

function validateNewEmail(value, currentEmail) {
  const email = authService.normalizeEmail(value);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Enter a valid new email address."); error.statusCode = 400; throw error;
  }
  if (email === authService.normalizeEmail(currentEmail)) {
    const error = new Error("The new email address must be different from your current email."); error.statusCode = 400; throw error;
  }
  return email;
}

async function assertEmailAvailable(email, userId, options = {}) {
  if (await userRepository.findUserByEmail(email, { excludeId: userId, ...options })) {
    const error = new Error("That email address is already in use."); error.statusCode = 409; throw error;
  }
}

async function sendOtp({ to, code, kind }) {
  await notificationService.sendEmail({
    to,
    subject: kind === "current" ? "Confirm your GetPrio email change" : "Confirm your new GetPrio email",
    text: kind === "current"
      ? `Use this code to confirm your request to change your GetPrio email address: ${code}\n\nThis code expires in 10 minutes. If you did not request this, secure your account immediately.`
      : `Use this code to confirm this email address for your GetPrio account: ${code}\n\nThis code expires in 10 minutes. If you did not request this, you can ignore this email.`,
    purpose: "account_email_change_otp",
    metadata: { kind }
  });
}

async function start({ user, newEmail, method, password, totpCode }) {
  if (!user?.email) {
    const error = new Error("Add and verify an email address before changing it."); error.statusCode = 409; throw error;
  }
  const normalizedEmail = validateNewEmail(newEmail, user.email);
  await assertEmailAvailable(normalizedEmail, user._id);
  const newCode = issueCode();
  const now = new Date();
  const base = {
    id: crypto.randomUUID(), userId: user._id, currentEmail: user.email,
    newEmail: normalizedEmail, newCodeHash: hashCode(newCode),
    newCodeExpiresAt: new Date(now.getTime() + OTP_TTL_MS)
  };

  if (method === "mfa") {
    if (!user.passwordHash || !(await authService.verifyPasswordLogin(user, String(password || "")))) {
      const error = new Error("We could not verify your sign-in details."); error.statusCode = 401; throw error;
    }
    if (!user.mfaEnabled) {
      const error = new Error("Authenticator verification must be enabled before using this recovery option."); error.statusCode = 409; throw error;
    }
    const factor = await mfaRepository.findTotpFactor(user._id, "active");
    const secret = factor && decryptSecret(factor, env.mfaEncryptionSecret);
    if (!secret || !verifyTotp(secret, totpCode)) throw invalidCode("That authenticator code could not be verified.");
    const challenge = await db.withTransaction(async (client) => {
      await challengeRepository.invalidateActiveForUser(user._id, { client });
      return challengeRepository.createChallenge({ ...base, currentEmailVerifiedAt: now }, { client });
    });
    await sendOtp({ to: normalizedEmail, code: newCode, kind: "new" });
    return { challengeId: challenge.id, step: "new_email", deliveryTarget: maskEmail(normalizedEmail), expiresAt: challenge.newCodeExpiresAt };
  }

  const currentCode = issueCode();
  const challenge = await db.withTransaction(async (client) => {
    await challengeRepository.invalidateActiveForUser(user._id, { client });
    return challengeRepository.createChallenge({
      ...base, currentCodeHash: hashCode(currentCode), currentCodeExpiresAt: new Date(now.getTime() + OTP_TTL_MS)
    }, { client });
  });
  await sendOtp({ to: user.email, code: currentCode, kind: "current" });
  return { challengeId: challenge.id, step: "current_email", deliveryTarget: maskEmail(user.email), expiresAt: challenge.currentCodeExpiresAt };
}

async function verifyCurrent({ user, challengeId, code }) {
  if (!/^[0-9a-f-]{36}$/i.test(String(challengeId || ""))) throw invalidCode();
  const challenge = await challengeRepository.findById(challengeId);
  if (!challenge || challenge.userId !== String(user._id) || challenge.usedAt || challenge.currentEmailVerifiedAt || !challenge.currentCodeHash || challenge.currentCodeAttempts >= MAX_ATTEMPTS || new Date(challenge.currentCodeExpiresAt).getTime() <= Date.now()) throw invalidCode("This email verification has expired. Start the email change again.");
  if (!matchesCode(code, challenge.currentCodeHash)) {
    await challengeRepository.recordCurrentAttempt(challenge.id);
    throw invalidCode();
  }
  const verified = await challengeRepository.markCurrentVerified(challenge.id);
  if (!verified) throw invalidCode("This email verification has already been completed.");
  const newCode = issueCode();
  const updated = await db.withTransaction(async (client) => {
    const locked = await challengeRepository.findById(challenge.id, { client });
    if (!locked || locked.usedAt || locked.userId !== String(user._id)) throw invalidCode();
    await client.query(`UPDATE account_email_change_challenges SET new_code_hash = $2, new_code_expires_at = $3, new_code_attempts = 0, updated_at = NOW() WHERE id = $1`, [challenge.id, hashCode(newCode), new Date(Date.now() + OTP_TTL_MS)]);
    return challengeRepository.findById(challenge.id, { client });
  });
  await sendOtp({ to: updated.newEmail, code: newCode, kind: "new" });
  return { challengeId: updated.id, step: "new_email", deliveryTarget: maskEmail(updated.newEmail), expiresAt: updated.newCodeExpiresAt };
}

async function verifyNew({ user, challengeId, code, sessionId, ipAddress, userAgent }) {
  if (!/^[0-9a-f-]{36}$/i.test(String(challengeId || ""))) throw invalidCode();
  const result = await db.withTransaction(async (client) => {
    const challenge = await challengeRepository.findById(challengeId, { client });
    if (!challenge || challenge.userId !== String(user._id) || challenge.usedAt || !challenge.currentEmailVerifiedAt || challenge.newCodeAttempts >= MAX_ATTEMPTS || new Date(challenge.newCodeExpiresAt).getTime() <= Date.now()) throw invalidCode("This email verification has expired. Start the email change again.");
    if (!matchesCode(code, challenge.newCodeHash)) {
      await challengeRepository.recordNewAttempt(challenge.id, { client });
      throw invalidCode();
    }
    if (!(await challengeRepository.markUsed(challenge.id, { client }))) throw invalidCode("This email verification has already been completed.");
    let updatedUser;
    try {
      updatedUser = await userRepository.updateUser(user._id, { email: challenge.newEmail, emailVerified: true }, { client });
    } catch (error) {
      if (error.code === "23505") { error.statusCode = 409; error.message = "That email address is already in use."; }
      throw error;
    }
    await authSessionRepository.revokeOtherSessionsForUser(user._id, sessionId, "Email address changed", { client });
    await securityEventService.logSecurityEvent({ userId: user._id, sessionId, eventType: "email_changed", actorRole: user.roles?.[0] || null, ipAddress, userAgent, metadata: { previousEmail: challenge.currentEmail, newEmail: challenge.newEmail } }, { client });
    return updatedUser;
  });
  await Promise.all([
    user.email ? notificationService.sendEmail({ to: user.email, subject: "Your GetPrio email address changed", text: `Your GetPrio account email address was changed to ${result.email}. Other signed-in sessions were closed. If you did not make this change, reset your password and contact support.`, purpose: "security_email_changed" }).catch(() => undefined) : undefined,
    notificationService.sendEmail({ to: result.email, subject: "Your GetPrio email address changed", text: "Your GetPrio account email address was changed. Other signed-in sessions were closed. If you did not make this change, reset your password and contact support.", purpose: "security_email_changed" }).catch(() => undefined)
  ]);
  return result;
}

module.exports = { start, verifyCurrent, verifyNew, maskEmail };
