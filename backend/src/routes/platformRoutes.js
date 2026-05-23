const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, requirePlatformAdmin } = require("../middleware/auth");
const platformRepository = require("../repositories/platform");
const queueJoinPaymentRepository = require("../repositories/queueJoinPayments");
const queueFeeService = require("../services/queueFeeService");
const queueJoinPaymentService = require("../services/queueJoinPaymentService");
const subscriptionPlanRepository = require("../repositories/subscriptionPlans");

const router = express.Router();

router.use(authenticate, requirePlatformAdmin);

router.get(
  "/overview",
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
  asyncHandler(async (_req, res) => {
    res.json({
      plans: await subscriptionPlanRepository.listPlans()
    });
  })
);

router.patch(
  "/plans/:planSlug",
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
  asyncHandler(async (_req, res) => {
    res.json({
      queueFees: await queueFeeService.listQueueFees()
    });
  })
);

router.patch(
  "/queue-fees",
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
  asyncHandler(async (_req, res) => {
    res.json({
      settings: await platformRepository.getPlatformSettings()
    });
  })
);

router.patch(
  "/settings",
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
  asyncHandler(async (req, res) => {
    res.json({
      items: await platformRepository.listTenants({ limit: req.query.limit })
    });
  })
);

router.get(
  "/subscriptions",
  asyncHandler(async (req, res) => {
    res.json({
      items: await platformRepository.listSubscriptions({ limit: req.query.limit })
    });
  })
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    res.json({
      items: await platformRepository.listUsers({ limit: req.query.limit })
    });
  })
);

router.get(
  "/billing-events",
  asyncHandler(async (req, res) => {
    res.json({
      items: await platformRepository.listBillingEvents({ limit: req.query.limit })
    });
  })
);

module.exports = router;
