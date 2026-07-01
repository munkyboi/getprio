const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, requirePlatformPermission } = require("../middleware/auth");
const platformRepository = require("../repositories/platform");
const queueJoinPaymentRepository = require("../repositories/queueJoinPayments");
const tenantRepository = require("../repositories/tenants");
const billingRepository = require("../repositories/billing");
const queueFeeService = require("../services/queueFeeService");
const queueJoinPaymentService = require("../services/queueJoinPaymentService");
const subscriptionPlanRepository = require("../repositories/subscriptionPlans");

const router = express.Router();

router.use(authenticate);

router.get(
  "/overview",
  requirePlatformPermission("platform.billing.read"),
  asyncHandler(async (_req, res) => {
    const [totals, queueFees, recentPayments, analytics] = await Promise.all([
      platformRepository.getOverviewTotals(),
      queueFeeService.listQueueFees(),
      platformRepository.listRecentPayments({ limit: 10 }),
      platformRepository.getOverviewAnalytics()
    ]);

    res.json({
      totals,
      queueFees,
      recentPayments: recentPayments.map(queueJoinPaymentService.formatPayment),
      analytics
    });
  })
);

router.get(
  "/plans",
  requirePlatformPermission("platform.billing.read"),
  asyncHandler(async (_req, res) => {
    res.json({
      plans: await subscriptionPlanRepository.listPlans()
    });
  })
);

router.patch(
  "/plans/:planSlug",
  requirePlatformPermission("platform.plans.manage"),
  asyncHandler(async (req, res) => {
    if (req.body.plan?.slug !== req.params.planSlug) {
      const error = new Error("Plan slug mismatch.");
      error.statusCode = 400;
      throw error;
    }

    const plan = await subscriptionPlanRepository.updatePlan(req.body.plan, req.user?._id);
    if (!plan) {
      const error = new Error("Plan not found.");
      error.statusCode = 404;
      throw error;
    }

    res.json({ plan });
  })
);

router.get(
  "/queue-fees",
  requirePlatformPermission("platform.billing.read"),
  asyncHandler(async (_req, res) => {
    res.json({
      queueFees: await queueFeeService.listQueueFees()
    });
  })
);

router.patch(
  "/queue-fees",
  requirePlatformPermission("platform.queue_fees.manage"),
  asyncHandler(async (req, res) => {
    res.json({
      queueFees: await queueFeeService.updateQueueFees({
        queueFees: req.body.queueFees,
        user: req.user
      })
    });
  })
);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

router.get(
  "/settings",
  requirePlatformPermission("platform.settings.manage"),
  asyncHandler(async (_req, res) => {
    res.json({
      settings: await platformRepository.getPlatformSettings()
    });
  })
);

router.patch(
  "/settings",
  requirePlatformPermission("platform.settings.manage"),
  asyncHandler(async (req, res) => {
    const enterpriseInquiryEmail = normalizeEmail(req.body.enterpriseInquiryEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enterpriseInquiryEmail)) {
      const error = new Error("A valid enterprise inquiry email is required.");
      error.statusCode = 400;
      throw error;
    }

    res.json({
      settings: await platformRepository.updatePlatformSettings({
        enterpriseInquiryEmail,
        userId: req.user?._id
      })
    });
  })
);

router.get(
  "/queue-join-payments",
  requirePlatformPermission("platform.billing.read"),
  asyncHandler(async (req, res) => {
    const payments = await queueJoinPaymentRepository.listPayments({
      status: req.query.status,
      limit: req.query.limit
    });

    res.json({
      items: payments.map(queueJoinPaymentService.formatPayment)
    });
  })
);

router.get(
  "/tenants",
  requirePlatformPermission("platform.tenants.read"),
  asyncHandler(async (req, res) => {
    res.json({
      items: await platformRepository.listTenants({ limit: req.query.limit })
    });
  })
);

router.get(
  "/subscriptions",
  requirePlatformPermission("platform.billing.read"),
  asyncHandler(async (req, res) => {
    res.json({
      items: await billingRepository.listSubscriptions({ limit: req.query.limit })
    });
  })
);

router.post(
  "/subscriptions",
  requirePlatformPermission("platform.billing.manage"),
  asyncHandler(async (req, res) => {
    const { tenantId, planSlug, status, provider, providerCustomerId, providerSubscriptionId, providerCheckoutSessionId, billingInterval, currentPeriodStart, currentPeriodEnd, entitlements, metadata } = req.body || {};
    const tenant = await tenantRepository.findTenantById(tenantId);
    if (!tenant) {
      const error = new Error("Tenant not found.");
      error.statusCode = 404;
      throw error;
    }

    const plan = await subscriptionPlanRepository.findPlanBySlug(planSlug);
    if (!plan) {
      const error = new Error("Subscription plan not found.");
      error.statusCode = 404;
      throw error;
    }

    const subscription = await billingRepository.createTenantSubscription({
      tenantId: tenant._id,
      planSlug: plan.slug,
      status,
      provider,
      providerCustomerId,
      providerSubscriptionId,
      providerCheckoutSessionId,
      billingInterval,
      currentPeriodStart,
      currentPeriodEnd,
      entitlements: entitlements || plan.entitlements,
      metadata
    });

    res.status(201).json({ subscription });
  })
);

router.patch(
  "/subscriptions/:subscriptionId",
  requirePlatformPermission("platform.billing.manage"),
  asyncHandler(async (req, res) => {
    const subscription = await billingRepository.updateTenantSubscription(req.params.subscriptionId, req.body || {});
    if (!subscription) {
      const error = new Error("Subscription not found.");
      error.statusCode = 404;
      throw error;
    }

    res.json({ subscription });
  })
);

router.post(
  "/subscriptions/:subscriptionId/suspend",
  requirePlatformPermission("platform.billing.manage"),
  asyncHandler(async (req, res) => {
    const subscription = await billingRepository.updateTenantSubscription(req.params.subscriptionId, {
      status: "suspended"
    });
    if (!subscription) {
      const error = new Error("Subscription not found.");
      error.statusCode = 404;
      throw error;
    }

    res.json({ subscription });
  })
);

router.delete(
  "/subscriptions/:subscriptionId",
  requirePlatformPermission("platform.billing.manage"),
  asyncHandler(async (req, res) => {
    const subscription = await billingRepository.deleteTenantSubscription(req.params.subscriptionId);
    if (!subscription) {
      const error = new Error("Subscription not found.");
      error.statusCode = 404;
      throw error;
    }

    res.json({ subscription });
  })
);

router.get(
  "/users",
  requirePlatformPermission("platform.users.read"),
  asyncHandler(async (req, res) => {
    res.json({
      items: await platformRepository.listUsers({ limit: req.query.limit })
    });
  })
);

router.get(
  "/billing-events",
  requirePlatformPermission("platform.billing.read"),
  asyncHandler(async (req, res) => {
    res.json({
      items: await platformRepository.listBillingEvents({ limit: req.query.limit })
    });
  })
);

module.exports = router;
