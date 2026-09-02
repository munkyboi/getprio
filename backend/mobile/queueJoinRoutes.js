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

router.post(
  "/queue-join",
  requireIdempotency("mobile.queue_join"),
  asyncHandler(async (req, res) => {
    const { location, tenant } = await resolveLocationOrThrow(normalizeQrId(req.body?.id));
    const state = await resolveQueueState(location, tenant);
    if (!state.joinable) {
      const error = new Error(state.unavailableReason || "This queue is not available right now.");
      error.statusCode = 409;
      error.code = "QUEUE_JOIN_UNAVAILABLE";
      throw error;
    }

    const payload = {
      userId: req.user._id,
      customerName: req.user.displayName || req.user.name,
      customerEmail: req.user.email || null,
      customerPhone: normalizePhilippineMobileNumber(req.user.phone),
      notifyByEmail: false,
      notifyBySms: false,
      joinChannel: "mobile_qr",
      locationSlug: location.slug,
      mobileReturnUrl: buildMobilePaymentReturnUrl(),
      notes: null
    };
    const result = await queueJoinPaymentService.handleVerifiedJoin({
      tenant,
      otpId: null,
      payload
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

    res.status(201).json(result);
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
