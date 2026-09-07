const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { authenticate } = require("../src/middleware/auth");
const asyncHandler = require("../src/middleware/asyncHandler");
const { requireIdempotency } = require("../src/middleware/idempotency");
const env = require("../src/config/env");
const tenantRepository = require("../src/repositories/tenants");
const locationRepository = require("../src/repositories/storeLocations");
const queueFeeService = require("../src/services/queueFeeService");
const queueJoinPaymentService = require("../src/services/queueJoinPaymentService");
const queueJoinOtpService = require("../src/services/queueJoinOtpService");
const otpRepository = require("../src/repositories/queueJoinOtps");
const paymentRepository = require("../src/repositories/queueJoinPayments");
const entitlementAdmissionService = require("../src/services/entitlementAdmissionService");
const storeHoursService = require("../src/services/storeHoursService");
const { assertQueueIntakeOpen, getQueueSnapshot } = require("../src/services/queueService");
const { normalizePhilippineMobileNumber } = require("../src/utils/phone");

const router = express.Router();
const mobileQueueLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown"),
  message: { message: "Too many mobile queue requests. Please try again later." }
});
router.use(mobileQueueLimiter);
router.use(authenticate);

function buildMobilePaymentReturnUrl() {
  const configuredBaseUrl = env.mobilePaymentReturnUrl ||
    (new URL(env.appBaseUrl).protocol === "https:"
      ? env.appBaseUrl
      : env.mobileQrBaseUrl);
  const baseUrl = new URL(configuredBaseUrl);
  if (baseUrl.protocol !== "https:") return null;
  baseUrl.pathname = "/payment/return";
  baseUrl.search = "";
  baseUrl.hash = "";
  return baseUrl.toString();
}

function normalizeQrId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    const error = new Error("A valid queue QR id is required.");
    error.statusCode = 400;
    error.code = "INVALID_QUEUE_QR_ID";
    throw error;
  }
  return id;
}

async function resolveLocationOrThrow(id) {
  const location = await locationRepository.findLocationByQueueJoinId(id);
  if (!location || !location.isActive) {
    const error = new Error("This queue QR code is no longer active.");
    error.statusCode = 404;
    error.code = "QUEUE_QR_NOT_FOUND";
    throw error;
  }
  const tenant = await tenantRepository.findTenantById(location.tenantId);
  if (!tenant || !tenant.isActive) {
    const error = new Error("This vendor is no longer available.");
    error.statusCode = 404;
    error.code = "VENDOR_NOT_FOUND";
    throw error;
  }
  return { location, tenant };
}

async function resolveDirectLocationOrThrow(tenantSlug, locationSlug) {
  const normalizedTenantSlug = String(tenantSlug || "").trim().toLowerCase();
  if (!normalizedTenantSlug) {
    const error = new Error("A vendor slug is required.");
    error.statusCode = 400;
    error.code = "VENDOR_SLUG_REQUIRED";
    throw error;
  }

  const tenant = await tenantRepository.findTenantBySlug(normalizedTenantSlug, { activeOnly: true });
  if (!tenant || !tenant.isActive) {
    const error = new Error("This vendor is no longer available.");
    error.statusCode = 404;
    error.code = "VENDOR_NOT_FOUND";
    throw error;
  }

  const normalizedLocationSlug = String(locationSlug || "").trim();
  const location = normalizedLocationSlug
    ? await locationRepository.findLocationByTenantAndSlug(tenant._id, normalizedLocationSlug)
    : await locationRepository.findPrimaryLocationByTenantId(tenant._id);
  if (!location || !location.isActive) {
    const error = new Error("This queue location is no longer available.");
    error.statusCode = 404;
    error.code = "LOCATION_NOT_FOUND";
    throw error;
  }

  return { location, tenant };
}

async function resolveQueueState(location, tenant) {
  const capabilities = await entitlementAdmissionService.resolvePublicCapabilities(tenant._id);
  let queueFee = { enabled: false, amountCents: 0, currency: "PHP", displayAmount: "PHP 0.00" };
  let feeError = null;
  try {
    queueFee = await queueFeeService.getQueueFeeForTenant(tenant._id);
  } catch (error) {
    feeError = error;
  }
  const snapshot = feeError ? null : await getQueueSnapshot(tenant, { location });

  let availabilityError = null;
  if (capabilities.queue && !feeError) {
    try {
      if (location.queueLifecycleMode !== "enforced") {
        await storeHoursService.assertLocationOpenForCustomerJoin(location);
      }
      await assertQueueIntakeOpen(tenant, location);
    } catch (error) {
      if (Number(error.statusCode) >= 400 && Number(error.statusCode) < 500) {
        availabilityError = error;
      } else {
        throw error;
      }
    }
  }

  const joinable = Boolean(capabilities.queue && !feeError && !availabilityError);
  return {
    location,
    tenant,
    capabilities,
    snapshot,
    queueFee,
    joinable,
    unavailableReason: feeError
      ? feeError.message
      : !capabilities.queue
        ? "Queueing is not available for this vendor."
        : availabilityError
          ? availabilityError.message
          : null
  };
}

router.get(
  "/queue-join/resolve",
  asyncHandler(async (req, res) => {
    const { location, tenant } = await resolveLocationOrThrow(normalizeQrId(req.query.id));
    const state = await resolveQueueState(location, tenant);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      locationQrId: location.queueJoinId,
      vendorName: tenant.name,
      vendorSlug: tenant.slug,
      locationName: location.name,
      locationSlug: location.slug,
      joinable: state.joinable,
      unavailableReason: state.unavailableReason,
      amountCents: state.queueFee.amountCents,
      fee: state.queueFee.amountCents,
      currency: state.queueFee.currency,
      snapshot: state.snapshot
    });
  })
);

async function assertJoinable(location, tenant) {
  const state = await resolveQueueState(location, tenant);
  if (!state.joinable) {
    throw Object.assign(new Error(state.unavailableReason || "This queue is not available right now."), {
      statusCode: 409, code: "QUEUE_JOIN_UNAVAILABLE"
    });
  }
}

async function startEmailVerification(req, res, location, tenant, joinChannel) {
  await assertJoinable(location, tenant);
  if (!req.user.email) {
    throw Object.assign(new Error("Add an email address to your account before joining a queue."), {
      statusCode: 400, code: "QUEUE_EMAIL_REQUIRED"
    });
  }
  const challenge = await queueJoinOtpService.requestJoinOtp({
    tenant,
    payload: {
      userId: req.user._id,
      customerName: req.user.displayName || req.user.name,
      customerEmail: req.user.email,
      customerPhone: normalizePhilippineMobileNumber(req.user.phone),
      notifyByEmail: false,
      notifyBySms: false,
      joinChannel,
      locationSlug: location.slug,
      notes: null
    }
  });
  res.status(201).json({ ...challenge, otpRequired: true, tenantSlug: tenant.slug, locationSlug: location.slug });
}

router.post(
  "/queue-join",
  requireIdempotency("mobile.queue_join"),
  asyncHandler(async (req, res) => {
    const { location, tenant } = await resolveLocationOrThrow(normalizeQrId(req.body?.id));
    await startEmailVerification(req, res, location, tenant, "qr");
  })
);

router.post(
  "/queue-join/direct",
  requireIdempotency("mobile.queue_join_direct"),
  asyncHandler(async (req, res) => {
    const { location, tenant } = await resolveDirectLocationOrThrow(req.body?.tenantSlug, req.body?.locationSlug);
    await startEmailVerification(req, res, location, tenant, "online");
  })
);

async function resolveOwnedOtp(req) {
  const otpId = String(req.body?.otpId || "");
  const otp = /^[1-9]\d*$/.test(otpId) ? await otpRepository.findOtpById(otpId) : null;
  if (!otp || String(otp.payload?.userId || "") !== String(req.user._id)) {
    throw Object.assign(new Error("Verification code not found. Please start again."), { statusCode: 404 });
  }
  const tenant = await tenantRepository.findTenantById(otp.tenantId);
  if (!tenant?.isActive) {
    throw Object.assign(new Error("This vendor is no longer available."), { statusCode: 404 });
  }
  const location = await locationRepository.findLocationByTenantAndSlug(tenant._id, otp.payload.locationSlug);
  if (!location?.isActive) {
    throw Object.assign(new Error("This queue location is no longer available."), { statusCode: 404 });
  }
  await assertJoinable(location, tenant);
  return { tenant, location, otpId };
}

router.post(
  "/queue-join/otp/verify",
  requireIdempotency("mobile.queue_join_otp_verify"),
  asyncHandler(async (req, res) => {
    const { tenant, location, otpId } = await resolveOwnedOtp(req);
    const payload = await queueJoinOtpService.verifyJoinOtp({ tenant, otpId, code: req.body?.code });
    const result = await queueJoinPaymentService.handleVerifiedJoin({
      tenant, otpId,
      payload: { ...payload, mobileReturnUrl: buildMobilePaymentReturnUrl() }
    });
    if (result.requiresPayment) {
      res.status(201).json({
        paymentRequired: true,
        paymentAttemptId: result.payment.id,
        checkoutUrl: result.checkoutSession.checkoutUrl,
        tenantSlug: tenant.slug,
        locationSlug: location.slug,
        payment: result.payment,
        queueFee: result.queueFee
      });
      return;
    }
    res.status(201).json({ ...result, tenantSlug: tenant.slug, locationSlug: location.slug });
  })
);

router.post(
  "/queue-join/otp/resend",
  requireIdempotency("mobile.queue_join_otp_resend"),
  asyncHandler(async (req, res) => {
    const { tenant, location, otpId } = await resolveOwnedOtp(req);
    const challenge = await queueJoinOtpService.resendJoinOtp({ tenant, otpId });
    res.status(201).json({ ...challenge, otpRequired: true, tenantSlug: tenant.slug, locationSlug: location.slug });
  })
);

router.post(
  "/queue-join/:paymentId/sync",
  asyncHandler(async (req, res) => {
    const payment = await paymentRepository.findPaymentById(req.params.paymentId);
    if (!payment || String(payment.payload?.userId || "") !== String(req.user._id)) {
      const error = new Error("Queue join payment not found.");
      error.statusCode = 404;
      throw error;
    }
    const tenant = await tenantRepository.findTenantById(payment.tenantId);
    if (!tenant || (req.body?.tenantSlug && req.body.tenantSlug !== tenant.slug)) {
      const error = new Error("Queue join payment not found.");
      error.statusCode = 404;
      throw error;
    }
    const result = await queueJoinPaymentService.syncQueueJoinPayment({
      tenant,
      paymentId: payment._id
    });
    res.json(result);
  })
);

module.exports = router;
