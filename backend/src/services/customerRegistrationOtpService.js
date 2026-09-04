const crypto = require("node:crypto");
const db = require("../config/db");
const registrationOtpRepository = require("../repositories/customerRegistrationOtps");
const userRepository = require("../repositories/users");
const notificationService = require("./notificationService");
const sessionService = require("./sessionService");

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
  error.code = "CUSTOMER_REGISTRATION_CODE_INVALID";
  return error;
}

function assertValidPassword(password) {
  const value = String(password || "");
  const valid = value.length >= 6
    && value.length <= 32
    && /[^A-Za-z0-9]/.test(value)
    && (value.match(/[0-9]/g) || []).length >= 2
    && /[A-Z]/.test(value);
  if (!valid) {
    const error = new Error("Use a password with 1 special character, 2 numbers, 1 uppercase letter, and 6-32 characters.");
    error.statusCode = 400;
    error.code = "CUSTOMER_REGISTRATION_PASSWORD_INVALID";
    throw error;
  }
}

async function sendOtp(email, code) {
  await notificationService.sendEmail({
    to: email,
    subject: "Verify your GetPrio email address",
    text: `Use this code to verify your GetPrio customer account: ${code}\n\nThis code expires in 10 minutes. If you did not create this account, you can ignore this email.`,
    purpose: "customer_registration_otp"
  });
}

async function start({ name, username, email, phone, passwordHash, password }) {
  if (password !== undefined) assertValidPassword(password);
  const code = issueCode();
  const challenge = await db.withTransaction(async (client) => {
    const user = await userRepository.createUser({
      name,
      username,
      email,
      phone,
      passwordHash,
      passwordHashAlgorithm: "bcrypt",
      emailVerified: false,
      lastLoginProvider: "password",
      roles: ["customer"]
    }, { client });
    return registrationOtpRepository.createChallenge({
      id: crypto.randomUUID(),
      userId: user._id,
      email,
      codeHash: hashCode(code),
      codeExpiresAt: new Date(Date.now() + OTP_TTL_MS)
    }, { client });
  });

  await sendOtp(email, code);
  return {
    challengeId: challenge.id,
    step: "email_otp",
    deliveryTarget: maskEmail(email),
    expiresAt: challenge.codeExpiresAt
  };
}

async function resend({ challengeId }) {
  const code = issueCode();
  const challenge = await db.withTransaction(async (client) => {
    const current = await registrationOtpRepository.findByIdForUpdate(challengeId, { client });
    assertActiveChallenge(current);
    return registrationOtpRepository.replaceCode(challengeId, {
      codeHash: hashCode(code),
      codeExpiresAt: new Date(Date.now() + OTP_TTL_MS)
    }, { client });
  });
  await sendOtp(challenge.email, code);
  return {
    challengeId: challenge.id,
    step: "email_otp",
    deliveryTarget: maskEmail(challenge.email),
    expiresAt: challenge.codeExpiresAt
  };
}

async function verify({ challengeId, code, ipAddress, userAgent }) {
  const result = await db.withTransaction(async (client) => {
    const challenge = await registrationOtpRepository.findByIdForUpdate(challengeId, { client });
    assertActiveChallenge(challenge);
    if (!matchesCode(code, challenge.codeHash)) {
      await registrationOtpRepository.recordAttempt(challengeId, { client });
      return { invalid: true };
    }
    if (!await registrationOtpRepository.markUsed(challengeId, { client })) {
      return { invalid: true };
    }

    const user = await userRepository.updateUser(
      challenge.userId,
      { emailVerified: true },
      { client }
    );
    const sessionResult = await sessionService.createAuthSession({
      user,
      authMethod: "password",
      ipAddress,
      userAgent,
      client
    });
    return { user, sessionResult };
  });

  if (result.invalid) throw invalidCode();
  return result;
}

function assertActiveChallenge(challenge) {
  if (!challenge || challenge.usedAt) {
    throw invalidCode("This email verification has already been completed. Start registration again.");
  }
  if (challenge.codeAttempts >= MAX_ATTEMPTS || new Date(challenge.codeExpiresAt).getTime() <= Date.now()) {
    throw invalidCode("This email verification has expired. Start registration again.");
  }
}

module.exports = {
  assertValidPassword,
  resend,
  start,
  verify
};
