const crypto = require("node:crypto");
const db = require("../config/db");
const env = require("../config/env");
const challengeRepository = require("../repositories/accountPhoneChangeChallenges");
const mfaRepository = require("../repositories/mfa");
const userRepository = require("../repositories/users");
const authService = require("./authService");
const notificationService = require("./notificationService");
const { decryptSecret, verifyTotp } = require("./mfaService");
const { normalizePhilippineMobileNumber, isPhilippineMobileNumber } = require("../utils/phone");

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code) { return crypto.createHash("sha256").update(String(code || "")).digest("hex"); }
function issueCode() { return String(crypto.randomInt(100000, 1000000)); }
function matchesCode(code, expectedHash) {
  const actual = Buffer.from(hashCode(code), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function invalidCode(message = "That verification code could not be verified.") {
  const error = new Error(message); error.statusCode = 400; error.code = "PHONE_CHANGE_CODE_INVALID"; return error;
}
function assertVendorUser(user) {
  const isVendorUser = (user?.tenantMemberships || []).some((membership) =>
    membership.isActive !== false && ["owner", "admin", "staff"].includes(membership.role)
  );
  if (!isVendorUser) { const error = new Error("Only vendor users can change this phone number."); error.statusCode = 403; throw error; }
}

async function sendOtp(to, code) {
  await notificationService.sendEmail({
    to,
    subject: "Confirm your GetPrio phone number change",
    text: `Use this code to confirm your new GetPrio phone number: ${code}\n\nThis code expires in 10 minutes. If you did not request this, secure your account immediately.`,
    purpose: "account_phone_change_otp"
  });
}

async function verifyTotpForUser(user, code) {
  if (!user.mfaEnabled) { const error = new Error("Authenticator verification must be enabled before using this option."); error.statusCode = 409; throw error; }
  const factor = await mfaRepository.findTotpFactor(user._id, "active");
  const secret = factor && decryptSecret(factor, env.mfaEncryptionSecret);
  if (!secret || !verifyTotp(secret, code)) throw invalidCode("That authenticator code could not be verified.");
}

function normalizeNewPhone(value, currentPhone) {
  const phone = normalizePhilippineMobileNumber(value);
  if (!isPhilippineMobileNumber(phone)) { const error = new Error("Enter a valid Philippine mobile number."); error.statusCode = 400; throw error; }
  if (phone === normalizePhilippineMobileNumber(currentPhone)) { const error = new Error("The new phone number must be different from your current number."); error.statusCode = 400; throw error; }
  return phone;
}

async function start({ user, newPhone, method, totpCode }) {
  assertVendorUser(user);
  const normalizedPhone = normalizeNewPhone(newPhone, user.phone);
  if (method === "totp") {
    await verifyTotpForUser(user, totpCode);
    const updatedUser = await userRepository.updateUser(user._id, { phone: normalizedPhone });
    return { user: updatedUser, success: true, message: "Phone number updated." };
  }
  if (!user.email) { const error = new Error("Add and verify an email address before using email verification."); error.statusCode = 409; throw error; }
  const code = issueCode();
  const challenge = await db.withTransaction(async (client) => {
    await challengeRepository.invalidateActiveForUser(user._id, { client });
    return challengeRepository.createChallenge({
      id: crypto.randomUUID(), userId: user._id, newPhone: normalizedPhone,
      codeHash: hashCode(code), codeExpiresAt: new Date(Date.now() + OTP_TTL_MS)
    }, { client });
  });
  await sendOtp(user.email, code);
  return { challengeId: challenge.id, step: "email_otp", deliveryTarget: `${user.email.slice(0, 1)}***${user.email.includes("@") ? user.email.slice(user.email.indexOf("@")) : ""}`, expiresAt: challenge.codeExpiresAt };
}

async function verifyEmail({ user, challengeId, code, password }) {
  assertVendorUser(user);
  if (!user.passwordHash || !(await authService.verifyPasswordLogin(user, String(password || "")))) {
    const error = new Error("We could not verify your password."); error.statusCode = 401; throw error;
  }
  if (!/^[0-9a-f-]{36}$/i.test(String(challengeId || ""))) throw invalidCode();
  const updatedUser = await db.withTransaction(async (client) => {
    const challenge = await challengeRepository.findById(challengeId, { client });
    if (!challenge || challenge.userId !== String(user._id) || challenge.usedAt || challenge.codeAttempts >= MAX_ATTEMPTS || new Date(challenge.codeExpiresAt).getTime() <= Date.now()) throw invalidCode("This verification has expired. Start the phone change again.");
    if (!matchesCode(code, challenge.codeHash)) { await challengeRepository.recordAttempt(challenge.id, { client }); throw invalidCode(); }
    if (!(await challengeRepository.markUsed(challenge.id, { client }))) throw invalidCode("This verification has already been completed.");
    return userRepository.updateUser(user._id, { phone: challenge.newPhone }, { client });
  });
  return { user: updatedUser, success: true, message: "Phone number updated." };
}

module.exports = { start, verifyEmail };
