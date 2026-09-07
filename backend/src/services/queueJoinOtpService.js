const crypto = require("crypto");
const env = require("../config/env");
const db = require("../config/db");
const otpRepository = require("../repositories/queueJoinOtps");
const notificationService = require("./notificationService");
const { createTicket } = require("./queueService");
const { normalizePhilippineMobileNumber } = require("../utils/phone");
const securityRateLimitService = require("./securityRateLimitService");
const { queueOtpEmail } = require("./queueEmailTemplates");

const OTP_TTL_MINUTES = 15;
const OTP_RESEND_COOLDOWN_MINUTES = 5;
const OTP_RESEND_DELAYS_SECONDS = Object.freeze([300, 450, 675]);
const OTP_MAX_RESENDS = 3;
const OTP_MAX_INCORRECT_ATTEMPTS = 5;
const OTP_RESTART_LOCKOUT_MINUTES = 30;

function createOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtpCode(code) {
  return crypto
    .createHmac("sha256", env.jwtSecret)
    .update(String(code).trim())
    .digest("hex");
}

function normalizeOtpCode(code) {
  return String(code || "").replace(/\D/g, "");
}

function getDeliveryTarget(payload) {
  const email = String(payload.customerEmail || "").trim();
  const phone = normalizePhilippineMobileNumber(payload.customerPhone);

  if (email) {
    return {
      channel: "email",
      target: email
    };
  }

  if (phone) {
    return {
      channel: "sms",
      target: phone
    };
  }

  const error = new Error("Enter an email or phone number so we can send your verification code.");
  error.statusCode = 400;
  throw error;
}

function sanitizeJoinPayload(payload) {
  return {
    userId: payload.userId || null,
    customerName: String(payload.customerName || "").trim(),
    customerEmail: String(payload.customerEmail || "").trim(),
    customerPhone: normalizePhilippineMobileNumber(payload.customerPhone),
    notifyByEmail: Boolean(payload.notifyByEmail),
    notifyBySms: Boolean(payload.notifyBySms),
    joinChannel: payload.joinChannel || "online",
    locationSlug: String(payload.locationSlug || "").trim() || undefined,
    notes: String(payload.notes || "").trim()
  };
}

async function deliverOtp({ tenant, channel, target, code }) {
  const message = `${tenant.name}: Your GetPrio verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`;

  if (channel === "email") {
    const email = queueOtpEmail({ tenant, code, expiresMinutes: OTP_TTL_MINUTES });
    await notificationService.sendEmail({
      to: target,
      ...email,
      tenantId: tenant._id,
      purpose: "join_otp"
    });
    return;
  }

  await notificationService.sendSms({
    to: target,
    body: message
  });
}

async function requestJoinOtp({ tenant, payload, chainId = null, parentOtpId = null, resendOrdinal = 0 }) {
  const sanitizedPayload = sanitizeJoinPayload(payload);
  const delivery = getDeliveryTarget(sanitizedPayload);
  if (!chainId && resendOrdinal === 0) {
    const targetHash = crypto.createHash("sha256").update(`${tenant._id}:${delivery.channel}:${delivery.target.toLowerCase()}`).digest("hex");
    await securityRateLimitService.consume({ bucketKey: `queue-otp-start:${targetHash}`, limit: 5, windowSeconds: 60 * 60, blockedMessage: "We’ve received several verification requests for these details. Please wait a little while before trying again." });
  }
  const code = createOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const otp = await otpRepository.createOtp({
    tenantId: tenant._id,
    codeHash: hashOtpCode(code),
    deliveryChannel: delivery.channel,
    deliveryTarget: delivery.target,
    payload: sanitizedPayload,
    expiresAt,
    chainId,
    parentOtpId,
    resendOrdinal
  });

  await deliverOtp({
    tenant,
    channel: delivery.channel,
    target: delivery.target,
    code
  });

  return {
    otpId: otp._id,
    expiresAt: otp.expiresAt,
    resendAvailableAt: resendOrdinal < OTP_MAX_RESENDS
      ? new Date(new Date(otp.createdAt).getTime() + OTP_RESEND_DELAYS_SECONDS[resendOrdinal] * 1000)
      : null,
    resendOrdinal: otp.resendOrdinal,
    resendsRemaining: OTP_MAX_RESENDS - otp.resendOrdinal,
    deliveryChannel: otp.deliveryChannel,
    deliveryTarget: otp.deliveryTarget
  };
}

async function resendJoinOtp({ tenant, otpId }) {
  const requestedOtp = await otpRepository.findOtpById(otpId);
  const previousOtp = requestedOtp?.chainId
    ? await otpRepository.findLatestForChain(requestedOtp.chainId)
    : requestedOtp;

  if (!previousOtp || previousOtp.tenantId !== String(tenant._id)) {
    const error = new Error("Verification code not found. Please request a new code.");
    error.statusCode = 404;
    throw error;
  }

  if (previousOtp.usedAt) {
    const error = new Error("This verification code was already used. Please start again.");
    error.statusCode = 400;
    throw error;
  }

  if (previousOtp.lockedUntil && new Date(previousOtp.lockedUntil).getTime() > Date.now()) {
    const error = new Error("For your security, verification is paused after several unsuccessful attempts. Please try again later.");
    error.statusCode = 429;
    error.code = "QUEUE_OTP_RESTART_LOCKED";
    error.retryAfterSeconds = Math.ceil((new Date(previousOtp.lockedUntil).getTime() - Date.now()) / 1000);
    throw error;
  }

  if (previousOtp.resendOrdinal >= OTP_MAX_RESENDS) {
    const error = new Error("You've reached the resend limit. Please try joining the queue again later.");
    error.statusCode = 429;
    error.code = "QUEUE_OTP_RESEND_LIMIT";
    throw error;
  }

  const resendAvailableAt = new Date(
    new Date(previousOtp.createdAt).getTime() + OTP_RESEND_DELAYS_SECONDS[previousOtp.resendOrdinal] * 1000
  );
  if (resendAvailableAt.getTime() > Date.now()) {
    const error = new Error("Your next code will be available shortly. Please wait for the countdown to finish.");
    error.statusCode = 429;
    error.retryAfterSeconds = Math.ceil((resendAvailableAt.getTime() - Date.now()) / 1000);
    throw error;
  }

  return requestJoinOtp({
    tenant,
    payload: previousOtp.payload,
    chainId: previousOtp.chainId,
    parentOtpId: previousOtp._id,
    resendOrdinal: previousOtp.resendOrdinal + 1
  });
}

async function verifyJoinOtp({ tenant, otpId, code }) {
  const normalizedCode = normalizeOtpCode(code);
  if (normalizedCode.length !== 6) {
    const error = new Error("Enter the 6-digit verification code.");
    error.statusCode = 400;
    throw error;
  }

  let payload;
  let verificationFailure = null;

  await db.withTransaction(async (client) => {
    const otp = await otpRepository.findOtpByIdForUpdate(otpId, { client });

    if (!otp || otp.tenantId !== String(tenant._id)) {
      const error = new Error("Verification code not found. Please request a new code.");
      error.statusCode = 404;
      throw error;
    }

    if (otp.usedAt) {
      const error = new Error("This verification code was already used. Please request a new code.");
      error.statusCode = 400;
      throw error;
    }

    if (otp.lockedUntil && new Date(otp.lockedUntil).getTime() > Date.now()) {
      const error = new Error("For your security, verification is paused after several unsuccessful attempts. Please try again later.");
      error.statusCode = 429;
      error.code = "QUEUE_OTP_RESTART_LOCKED";
      throw error;
    }

    if (new Date(otp.expiresAt).getTime() <= Date.now()) {
      const error = new Error("This verification code has expired. Please request a new code.");
      error.statusCode = 400;
      throw error;
    }

    if (otp.codeHash !== hashOtpCode(normalizedCode)) {
      const result = await otpRepository.recordIncorrectAttempt(otp.chainId, otp._id, { client });
      const error = new Error(result.locked
        ? "For your security, verification is paused after several unsuccessful attempts. Please try again later."
        : `That code doesn't match. Please check it and try again${result.attempts < OTP_MAX_INCORRECT_ATTEMPTS ? ` (${OTP_MAX_INCORRECT_ATTEMPTS - result.attempts} attempts left)` : ""}.`);
      error.statusCode = 400;
      if (result.locked) { error.statusCode = 429; error.code = "QUEUE_OTP_RESTART_LOCKED"; error.retryAfterSeconds = OTP_RESTART_LOCKOUT_MINUTES * 60; }
      verificationFailure = error;
      return;
    }

    payload = { ...sanitizeJoinPayload(otp.payload), otpChainId: otp.chainId };
    await otpRepository.markOtpUsed(otp._id, { client });
  });

  if (verificationFailure) throw verificationFailure;

  return payload;
}

async function verifyJoinOtpAndCreateTicket({ tenant, otpId, code }) {
  const payload = await verifyJoinOtp({ tenant, otpId, code });
  return createTicket({
    tenant,
    ...payload
  });
}

module.exports = {
  OTP_TTL_MINUTES,
  OTP_RESEND_COOLDOWN_MINUTES,
  OTP_RESEND_DELAYS_SECONDS,
  OTP_MAX_RESENDS,
  OTP_MAX_INCORRECT_ATTEMPTS,
  OTP_RESTART_LOCKOUT_MINUTES,
  requestJoinOtp,
  resendJoinOtp,
  verifyJoinOtp,
  verifyJoinOtpAndCreateTicket
};
