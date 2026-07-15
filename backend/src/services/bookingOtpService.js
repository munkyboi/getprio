const crypto = require("crypto");
const env = require("../config/env");
const db = require("../config/db");
const bookingOtpRepository = require("../repositories/bookingOtps");
const notificationService = require("./notificationService");
const { assertPublicTextFieldsAllowed } = require("./contentModeration");
const { normalizePhilippineMobileNumber } = require("../utils/phone");

const OTP_TTL_MINUTES = 15;
const OTP_RESEND_COOLDOWN_MINUTES = 3;

function createOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function createVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashSecret(value) {
  return crypto
    .createHmac("sha256", env.jwtSecret)
    .update(String(value).trim())
    .digest("hex");
}

function normalizeOtpCode(code) {
  return String(code || "").replace(/\D/g, "");
}

function sanitizeBookingPayload(payload) {
  const bookingQuantity = Number(payload.bookingQuantity || 1);
  if (!Number.isInteger(bookingQuantity) || bookingQuantity < 1 || bookingQuantity > 24) {
    const error = new Error("bookingQuantity must be between 1 and 24.");
    error.statusCode = 400;
    throw error;
  }

  const sanitized = {
    tenantSlug: String(payload.tenantSlug || "").trim().toLowerCase(),
    locationSlug: String(payload.locationSlug || "").trim().toLowerCase(),
    serviceSlug: String(payload.serviceSlug || "").trim().toLowerCase(),
    scheduledStartAt: String(payload.scheduledStartAt || "").trim(),
    bookingQuantity,
    customerName: String(payload.customerName || "").trim(),
    customerEmail: String(payload.customerEmail || "").trim().toLowerCase(),
    customerPhone: normalizePhilippineMobileNumber(payload.customerPhone),
    notifyBySms: Boolean(payload.notifyBySms),
    notes: String(payload.notes || "").trim()
  };
  if (Array.isArray(payload.bundleItems)) {
    const seen = new Set();
    sanitized.bundleItems = payload.bundleItems.map((item) => {
      const serviceSlug = String(item?.serviceSlug || "").trim().toLowerCase();
      const itemQuantity = Number(item?.bookingQuantity || bookingQuantity);
      if (!serviceSlug || seen.has(serviceSlug) || !Number.isInteger(itemQuantity) || itemQuantity < 1 || itemQuantity > 24) {
        const error = new Error("Booking bundle items are invalid.");
        error.statusCode = 400;
        throw error;
      }
      seen.add(serviceSlug);
      return { serviceSlug, bookingQuantity: itemQuantity };
    });
  }
  assertPublicTextFieldsAllowed({ "Customer name": sanitized.customerName, "Booking notes": sanitized.notes });
  return sanitized;
}

function getDeliveryTarget(payload, requestedChannel) {
  if (requestedChannel === "sms") {
    if (!payload.customerPhone) {
      const error = new Error("Enter a phone number to receive your booking verification code.");
      error.statusCode = 400;
      throw error;
    }

    return { channel: "sms", target: payload.customerPhone };
  }

  if (payload.customerEmail) {
    return { channel: "email", target: payload.customerEmail };
  }

  if (payload.customerPhone) {
    return { channel: "sms", target: payload.customerPhone };
  }

  const error = new Error("Enter an email or phone number so we can verify your booking request.");
  error.statusCode = 400;
  throw error;
}

async function deliverOtp({ tenant, channel, target, code }) {
  const message = `${tenant.name}: Your GetPrio booking verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`;

  if (channel === "email") {
    await notificationService.sendEmail({
      to: target,
      subject: `${tenant.name}: booking verification code`,
      text: message,
      tenantId: tenant._id,
      purpose: "booking_otp"
    });
    return;
  }

  await notificationService.sendSms({
    to: target,
    body: message
  });
}

async function requestBookingOtp({ tenant, payload, channel }) {
  const sanitizedPayload = sanitizeBookingPayload(payload);
  const delivery = getDeliveryTarget(sanitizedPayload, channel);
  const code = createOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  const otp = await bookingOtpRepository.createOtp({
    tenantId: tenant._id,
    codeHash: hashSecret(code),
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

async function resendBookingOtp({ tenant, otpId }) {
  const previousOtp = await bookingOtpRepository.findOtpById(otpId);

  if (!previousOtp || previousOtp.tenantId !== String(tenant._id)) {
    const error = new Error("Verification code not found. Please request a new code.");
    error.statusCode = 404;
    throw error;
  }

  if (previousOtp.consumedAt) {
    const error = new Error("This booking verification was already used. Please start again.");
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

  return requestBookingOtp({
    tenant,
    payload: previousOtp.payload,
    channel: previousOtp.deliveryChannel
  });
}

async function verifyBookingOtp({ tenant, otpId, code }) {
  const normalizedCode = normalizeOtpCode(code);
  if (normalizedCode.length !== 6) {
    const error = new Error("Enter the 6-digit verification code.");
    error.statusCode = 400;
    throw error;
  }

  let verifiedOtp;
  const verificationToken = createVerificationToken();

  await db.withTransaction(async (client) => {
    const otp = await bookingOtpRepository.findOtpByIdForUpdate(otpId, { client });

    if (!otp || otp.tenantId !== String(tenant._id)) {
      const error = new Error("Verification code not found. Please request a new code.");
      error.statusCode = 404;
      throw error;
    }

    if (otp.consumedAt) {
      const error = new Error("This booking verification was already used. Please start again.");
      error.statusCode = 400;
      throw error;
    }

    if (new Date(otp.expiresAt).getTime() <= Date.now()) {
      const error = new Error("This verification code has expired. Please request a new code.");
      error.statusCode = 400;
      throw error;
    }

    if (otp.codeHash !== hashSecret(normalizedCode)) {
      const error = new Error("That verification code is incorrect. Please try again.");
      error.statusCode = 400;
      throw error;
    }

    verifiedOtp = await bookingOtpRepository.markOtpVerified(
      otp._id,
      { verificationTokenHash: hashSecret(verificationToken) },
      { client }
    );
  });

  return {
    verified: true,
    bookingVerificationToken: verificationToken,
    contactVerifiedAt: verifiedOtp.verifiedAt,
    contactVerificationChannel: verifiedOtp.deliveryChannel
  };
}

async function getVerifiedBookingPayload({ tenant, token }) {
  const tokenHash = hashSecret(token);
  const otp = await bookingOtpRepository.findVerifiedTokenForUpdate(tokenHash);

  if (!otp || otp.tenantId !== String(tenant._id) || !otp.verifiedAt) {
    const error = new Error("Booking verification is required before submitting this request.");
    error.statusCode = 400;
    throw error;
  }

  if (otp.consumedAt) {
    const error = new Error("This booking verification was already used. Please start again.");
    error.statusCode = 400;
    throw error;
  }

  if (new Date(otp.expiresAt).getTime() <= Date.now()) {
    const error = new Error("This booking verification has expired. Please start again.");
    error.statusCode = 400;
    throw error;
  }

  return {
    otpId: otp._id,
    payload: sanitizeBookingPayload(otp.payload),
    contactVerifiedAt: otp.verifiedAt,
    contactVerificationChannel: otp.deliveryChannel
  };
}

async function consumeBookingVerificationToken(otpId, options = {}) {
  return bookingOtpRepository.markTokenConsumed(otpId, options);
}

module.exports = {
  OTP_TTL_MINUTES,
  OTP_RESEND_COOLDOWN_MINUTES,
  requestBookingOtp,
  resendBookingOtp,
  verifyBookingOtp,
  getVerifiedBookingPayload,
  consumeBookingVerificationToken
};
