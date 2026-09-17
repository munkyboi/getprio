const crypto = require("node:crypto");
const db = require("../config/db");
const registrationOtpRepository = require("../repositories/customerRegistrationOtps");
const userRepository = require("../repositories/users");
const notificationService = require("./notificationService");
const sessionService = require("./sessionService");
const {
  OTP_TTL_MS,
  MAX_ATTEMPTS,
  createInvalidCode,
  hashCode,
  issueCode,
  maskEmail,
  matchesCode
} = require("./otpUtils");

const invalidCode = createInvalidCode(
  "CUSTOMER_REGISTRATION_CODE_INVALID",
  "That verification code could not be verified. Check it and try again."
);

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

function registrationCopy(purpose) {
  return purpose === "developer"
    ? {
        subject: "Verify your GetPrio Developer Portal email",
        text: (code) => `Use this code to verify your Developer Portal account: ${code}\n\nThis code expires in 10 minutes. If you did not create this account, you can ignore this email.`,
        message: "Enter this code in GetPrio Developers to verify your email and finish setting up your account. If you did not create this account, you can ignore this email.",
        purpose: "developer_registration_otp"
      }
    : {
        subject: "Verify your GetPrio email address",
        text: (code) => `Use this code to verify your GetPrio customer account: ${code}\n\nThis code expires in 10 minutes. If you did not create this account, you can ignore this email.`,
        message: "Enter this code in GetPrio to verify your email and finish setting up your account. If you did not create this account, you can ignore this email.",
        purpose: "customer_registration_otp"
      };
}

async function sendOtp(email, code, purpose = "customer") {
  const copy = registrationCopy(purpose);
  await notificationService.sendEmail({
    to: email,
    subject: copy.subject,
    text: copy.text(code),
    emailTemplate: {
      message: copy.message,
      illustration: "account-verification",
      code,
      expiryText: "This code expires in 10 minutes."
    },
    purpose: copy.purpose
  });
}

async function start({ name, username, email, phone, passwordHash, password, roles = ["customer"], purpose = "customer" }) {
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
      roles
    }, { client });
    return registrationOtpRepository.createChallenge({
      id: crypto.randomUUID(),
      userId: user._id,
      email,
      purpose,
      codeHash: hashCode(code),
      codeExpiresAt: new Date(Date.now() + OTP_TTL_MS)
    }, { client });
  });

  await sendOtp(email, code, purpose);
  return {
    challengeId: challenge.id,
    step: "email_otp",
    deliveryTarget: maskEmail(email),
    expiresAt: challenge.codeExpiresAt
  };
}

async function restartUnverified({ userId, name, email, passwordHash, roles = ["developer"], purpose = "developer" }) {
  const code = issueCode();
  const challenge = await db.withTransaction(async (client) => {
    const user = await userRepository.findUserById(userId, { client });
    if (!user || user.emailVerified || !(user.roles || []).includes("developer")) return null;
    await userRepository.updateUser(userId, {
      name,
      email,
      passwordHash,
      passwordHashAlgorithm: "bcrypt",
      emailVerified: false,
      lastLoginProvider: "password",
      roles
    }, { client });
    const current = await registrationOtpRepository.findLatestByUserIdForUpdate(userId, purpose, { client });
    if (current && !current.usedAt) {
      return registrationOtpRepository.replaceCode(current.id, {
        codeHash: hashCode(code),
        codeExpiresAt: new Date(Date.now() + OTP_TTL_MS)
      }, { client });
    }
    return registrationOtpRepository.createChallenge({
      id: crypto.randomUUID(),
      userId,
      email,
      purpose,
      codeHash: hashCode(code),
      codeExpiresAt: new Date(Date.now() + OTP_TTL_MS)
    }, { client });
  });
  if (!challenge) {
    return {
      challengeId: null,
      step: "email_otp",
      deliveryTarget: maskEmail(email),
      expiresAt: new Date(Date.now() + OTP_TTL_MS)
    };
  }
  await sendOtp(email, code, purpose);
  return {
    challengeId: challenge.id,
    step: "email_otp",
    deliveryTarget: maskEmail(email),
    expiresAt: challenge.codeExpiresAt
  };
}

async function resend({ challengeId, purpose = "customer" }) {
  const code = issueCode();
  const challenge = await db.withTransaction(async (client) => {
    const current = await registrationOtpRepository.findByIdForUpdate(challengeId, { client });
    assertActiveChallenge(current);
    assertChallengePurpose(current, purpose);
    return registrationOtpRepository.replaceCode(challengeId, {
      codeHash: hashCode(code),
      codeExpiresAt: new Date(Date.now() + OTP_TTL_MS)
    }, { client });
  });
  await sendOtp(challenge.email, code, purpose);
  return {
    challengeId: challenge.id,
    step: "email_otp",
    deliveryTarget: maskEmail(challenge.email),
    expiresAt: challenge.codeExpiresAt
  };
}

async function verify({ challengeId, code, ipAddress, userAgent, purpose = "customer", surface = "app", onVerified }) {
  const result = await db.withTransaction(async (client) => {
    const challenge = await registrationOtpRepository.findByIdForUpdate(challengeId, { client });
    assertActiveChallenge(challenge);
    assertChallengePurpose(challenge, purpose);
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
      surface,
      ipAddress,
      userAgent,
      client
    });
    const additional = onVerified ? await onVerified({ user, sessionResult, client }) : {};
    return { user, sessionResult, ...additional };
  });

  if (result.invalid) throw invalidCode();
  return result;
}

function assertChallengePurpose(challenge, purpose) {
  if ((challenge.purpose || "customer") !== purpose) {
    throw invalidCode("That verification code could not be verified. Check it and try again.");
  }
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
  restartUnverified,
  start,
  verify
};
