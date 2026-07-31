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
const organizerCampaignRepository = require("../repositories/organizerCampaigns");
const ratingRepository = require("../repositories/ratings");
const queueDayRepository = require("../repositories/queueDays");
const queueNotificationOutboxRepository = require("../repositories/queueNotificationOutbox");
const paymentProofStorageService = require("../services/paymentProofStorageService");
const queueDayLifecycleService = require("../services/queueDayLifecycleService");
const { isValidTimeZone, normalizeTimeZone } = require("../utils/timezones");

const router = express.Router();

router.use(authenticate);

router.get(
  "/queue-lifecycle/diagnostics",
  requirePlatformPermission("platform.queue_lifecycle.read"),
  asyncHandler(async (req, res) => {
    res.json({
      queueDays: await queueDayRepository.listDiagnostics({
        state: req.query.state,
        limit: req.query.limit
      })
    });
  })
);

router.post(
  "/queue-lifecycle/:queueDayId/reconcile",
  requirePlatformPermission("platform.queue_lifecycle.reconcile"),
  asyncHandler(async (req, res) => {
    const result = await queueDayLifecycleService.reconcileQueueDayById(req.params.queueDayId);
    res.json({ queueDay: result.queueDay, outcomes: result.outcomes, idempotent: result.idempotent });
  })
);

router.post(
  "/queue-lifecycle/notifications/:outboxId/requeue",
  requirePlatformPermission("platform.queue_notifications.requeue"),
  asyncHandler(async (req, res) => {
    const notification = await queueNotificationOutboxRepository.requeue(req.params.outboxId);
    if (!notification) {
      const error = new Error("Retryable notification intent not found.");
      error.statusCode = 404;
      throw error;
    }
    res.json({ notification });
  })
);

router.post(
  "/queue-lifecycle/repair/preview",
  requirePlatformPermission("platform.queue_lifecycle.repair"),
  asyncHandler(async (req, res) => {
    const action = String(req.body?.action || "");
    if (!["reconcile_overdue_queue_day", "requeue_notification"].includes(action)) {
      const error = new Error("Repair action is not allowlisted.");
      error.statusCode = 400;
      throw error;
    }
    res.json({
      preview: {
        action,
        targetId: String(req.body?.targetId || ""),
        requiresMfa: true,
        mutatesCustomerIdentity: false
      }
    });
  })
);

router.post(
  "/queue-lifecycle/repair/execute",
  requirePlatformPermission("platform.queue_lifecycle.repair"),
  asyncHandler(async (req, res) => {
    if (req.get("x-mfa-confirmed") !== "true") {
      const error = new Error("Recent MFA confirmation is required.");
      error.statusCode = 403;
      throw error;
    }
    const action = String(req.body?.action || "");
    const targetId = req.body?.targetId;
    if (action === "reconcile_overdue_queue_day") {
      const result = await queueDayLifecycleService.reconcileQueueDayById(targetId);
      res.json({ action, targetId: String(targetId), idempotent: result.idempotent });
      return;
    }
    if (action === "requeue_notification") {
      const notification = await queueNotificationOutboxRepository.requeue(targetId);
      if (!notification) {
        const error = new Error("Retryable notification intent not found.");
        error.statusCode = 404;
        throw error;
      }
      res.json({ action, targetId: String(targetId), notification });
      return;
    }
    const error = new Error("Repair action is not allowlisted.");
    error.statusCode = 400;
    throw error;
  })
);

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
    const defaultTimezone = normalizeTimeZone(req.body.defaultTimezone, "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enterpriseInquiryEmail)) {
      const error = new Error("A valid enterprise inquiry email is required.");
      error.statusCode = 400;
      throw error;
    }
    if (!isValidTimeZone(defaultTimezone)) {
      const error = new Error("A valid default timezone is required.");
      error.statusCode = 400;
      throw error;
    }

    res.json({
      settings: await platformRepository.updatePlatformSettings({
        enterpriseInquiryEmail,
        defaultTimezone,
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
  "/campaign-reports",
  requirePlatformPermission("platform.users.read"),
  asyncHandler(async (_req, res) => res.json({ items: await organizerCampaignRepository.listReports() }))
);

router.patch(
  "/campaign-reports/:reportId",
  requirePlatformPermission("platform.settings.manage"),
  asyncHandler(async (req, res) => {
    const status = req.body?.status;
    if (!["reviewing", "resolved", "dismissed"].includes(status)) { const error = new Error("Invalid report status."); error.statusCode = 400; throw error; }
    res.json({ report: await organizerCampaignRepository.updateReportStatus({ reportId: req.params.reportId, status }) });
  })
);

router.get(
  "/campaign-reports/:reportId/contributions/:contributionId/evidence",
  requirePlatformPermission("platform.settings.manage"),
  asyncHandler(async (req, res) => {
    const report = await organizerCampaignRepository.findReportById(req.params.reportId);
    if (!report || !["open", "reviewing"].includes(report.report_status)) { const error = new Error("Active campaign report not found."); error.statusCode = 404; throw error; }
    const contribution = await organizerCampaignRepository.findContributionById(req.params.contributionId);
    if (!contribution || String(contribution.campaignId) !== String(report.campaign_id)) { const error = new Error("Evidence not found."); error.statusCode = 404; throw error; }
    const evidence = req.query.kind === "reimbursement"
      ? await organizerCampaignRepository.findReimbursementEvidenceByContributionId(contribution.id)
      : await organizerCampaignRepository.findContributionEvidenceById(contribution.id);
    if (!evidence?.object_key) { const error = new Error("Evidence not found."); error.statusCode = 404; throw error; }
    await organizerCampaignRepository.recordEvent({ campaignId: report.campaign_id, eventType: "campaign_evidence_viewed", actorUserId: req.user?._id, actorRole: "platform_admin", source: "platform", metadata: { reportId: report.id, contributionId: contribution.id, kind: req.query.kind === "reimbursement" ? "reimbursement" : "contribution" } });
    res.json(await paymentProofStorageService.createCampaignEvidenceViewAccess({ objectKey: evidence.object_key, fileName: evidence.file_name, contentType: evidence.content_type, sizeBytes: evidence.size_bytes }));
  })
);

router.patch(
  "/campaigns/:campaignId/freeze",
  requirePlatformPermission("platform.settings.manage"),
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || "").trim();
    if (!reason) { const error = new Error("Freeze reason is required."); error.statusCode = 400; throw error; }
    if (reason.length > 500) { const error = new Error("Freeze reason must be 500 characters or fewer."); error.statusCode = 400; throw error; }
    res.json({ campaign: await organizerCampaignRepository.freezeCampaign({ campaignId: req.params.campaignId, actorUserId: req.user?._id, reason }) });
  })
);

router.get(
  "/rating-disputes",
  requirePlatformPermission("platform.users.read"),
  asyncHandler(async (_req, res) => res.json({ items: await ratingRepository.listDisputes() }))
);

router.patch(
  "/rating-disputes/:disputeId",
  requirePlatformPermission("platform.settings.manage"),
  asyncHandler(async (req, res) => {
    const status = req.body?.status;
    const moderationStatus = req.body?.moderationStatus;
    if (!["resolved", "dismissed"].includes(status) || !["active", "hidden"].includes(moderationStatus)) {
      const error = new Error("Choose a valid dispute resolution."); error.statusCode = 400; throw error;
    }
    const dispute = await ratingRepository.resolveDispute({ disputeId: req.params.disputeId, actorUserId: req.user?._id, status, moderationStatus });
    if (!dispute) { const error = new Error("Rating dispute not found."); error.statusCode = 404; throw error; }
    res.json({ dispute });
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
