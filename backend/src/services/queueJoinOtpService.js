const crypto = require("crypto");
const env = require("../config/env");
const db = require("../config/db");
const otpRepository = require("../repositories/queueJoinOtps");
const notificationService = require("./notificationService");
const { createTicket } = require("./queueService");
const { normalizePhilippineMobileNumber } = require("../utils/phone");

const OTP_TTL_MINUTES = 15;
const OTP_RESEND_COOLDOWN_MINUTES = 3;

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
    await notificationService.sendEmail({
      to: target,
      subject: `${tenant.name}: verification code`,
      text: message,
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

async function requestJoinOtp({ tenant, payload }) {
  const sanitizedPayload = sanitizeJoinPayload(payload);
  const delivery = getDeliveryTarget(sanitizedPayload);
  const code = createOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const otp = await otpRepository.createOtp({
    tenantId: tenant._id,
    codeHash: hashOtpCode(code),
    deliveryChannel: delivery.channel,
    deliveryTarget: delivery.target,
    payload: sanitizedPayload,
    expiresAt
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
    resendAvailableAt: new Date(new Date(otp.createdAt).getTime() + OTP_RESEND_COOLDOWN_MINUTES * 60 * 1000),
    deliveryChannel: otp.deliveryChannel,
    deliveryTarget: otp.deliveryTarget
  };
}

async function resendJoinOtp({ tenant, otpId }) {
  const previousOtp = await otpRepository.findOtpById(otpId);

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

  const resendAvailableAt = new Date(
    new Date(previousOtp.createdAt).getTime() + OTP_RESEND_COOLDOWN_MINUTES * 60 * 1000
  );
  if (resendAvailableAt.getTime() > Date.now()) {
    const error = new Error("Please wait before requesting a new verification code.");
    error.statusCode = 429;
    error.retryAfterSeconds = Math.ceil((resendAvailableAt.getTime() - Date.now()) / 1000);
    throw error;
  }

  return requestJoinOtp({
    tenant,
    payload: previousOtp.payload
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

    if (new Date(otp.expiresAt).getTime() <= Date.now()) {
      const error = new Error("This verification code has expired. Please request a new code.");
      error.statusCode = 400;
      throw error;
    }

    if (otp.codeHash !== hashOtpCode(normalizedCode)) {
      const error = new Error("That verification code is incorrect. Please try again.");
      error.statusCode = 400;
      throw error;
    }

    payload = sanitizeJoinPayload(otp.payload);
    await otpRepository.markOtpUsed(otp._id, { client });
  });

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
  requestJoinOtp,
  resendJoinOtp,
  verifyJoinOtp,
  verifyJoinOtpAndCreateTicket
};
