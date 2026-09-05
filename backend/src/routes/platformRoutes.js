const businessCategories = require("../repositories/businessCategories");
const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, requirePlatformPermission } = require("../middleware/auth");
const platformRepository = require("../repositories/platform");
const platformRecords = require("../repositories/platformRecords");
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
const privilegedTransactionService = require("../services/privilegedTransactionService");
const privilegedPreviewService = require("../services/privilegedPreviewService");
const { validatePlanMutation } = require("../services/planPolicyService");
const { requireIdempotency } = require("../middleware/idempotency");
const securityAuditService = require("../services/securityAuditService");
const securityAuditRepository = require("../repositories/securityAudit");
const usageCreditService = require("../services/usageCreditService");
const usageCreditRepository = require("../repositories/usageCredits");
const subscriptionLifecycleService = require("../services/subscriptionLifecycleService");
const subscriptionLifecycleRepository = require("../repositories/subscriptionLifecycle");
const { isValidTimeZone, normalizeTimeZone } = require("../utils/timezones");
const { getGlobalPermissions } = require("../services/permissions");
const entitlementOverrideRepository = require("../repositories/entitlementOverrides");
const allowanceLedgerRepository = require("../repositories/allowanceLedger");
const releaseControls = require("../config/releaseControls");
const { assertReleaseControl, requireReleaseControl } = require("../middleware/releaseControl");
const db = require("../config/db");

const router = express.Router();

router.use(authenticate);

router.get("/business-categories", requirePlatformPermission("platform.settings.manage"), asyncHandler(async (_req, res) => {
  res.json({ items: await businessCategories.list(true) });
}));
router.post("/business-categories", requirePlatformPermission("platform.settings.manage"), asyncHandler(async (req, res) => {
  res.status(201).json({ category: await businessCategories.save(null, req.body, { actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId }) });
}));
router.patch("/business-categories/:categoryId", requirePlatformPermission("platform.settings.manage"), asyncHandler(async (req, res) => {
  res.json({ category: await businessCategories.save(req.params.categoryId, req.body, { actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId }) });
}));


router.get("/capabilities", requirePlatformPermission("platform.plan_policy.read"), (_req, res) => {
  res.json({
    planMatrix: true,
    planPolicyMutations: releaseControls.planPolicyMutations,
    usageCreditCatalog: releaseControls.usageCreditCatalog,
    usageCreditAdministration: releaseControls.usageCreditGrants,
    usageCreditCases: releaseControls.usageCreditRefunds || releaseControls.usageCreditDisputes,
    tenantOverrides: releaseControls.entitlementOverrides
  });
});

const PRIVILEGED_ACTIONS = new Set([
  "credit.pack.publish", "credit.grant", "credit.revoke",
  "credit.refund.resolve", "credit.dispute.open", "credit.dispute.resolve",
  "plan.defaults.publish", "queue.fees.publish", "subscription.transition", "subscription.suspend"
  , "entitlement.override.publish", "entitlement.override.revoke", "allowance.reverse", "allowance.reconcile"
]);

const PRIVILEGED_ACTION_CONTROLS = Object.freeze({
  "credit.pack.publish": "usageCreditCatalog",
  "credit.grant": "usageCreditGrants",
  "credit.revoke": "usageCreditGrants",
  "credit.refund.resolve": "usageCreditRefunds",
  "credit.dispute.open": "usageCreditDisputes",
  "credit.dispute.resolve": "usageCreditDisputes",
  "plan.defaults.publish": "planPolicyMutations",
  "queue.fees.publish": "planPolicyMutations",
  "subscription.transition": "subscriptionLifecycle",
  "subscription.suspend": "subscriptionLifecycle",
  "entitlement.override.publish": "entitlementOverrides",
  "entitlement.override.revoke": "entitlementOverrides",
  "allowance.reverse": "allowanceRepairs",
  "allowance.reconcile": "allowanceRepairs"
});

function assertPrivilegedActionEnabled(action) {
  const controlName = PRIVILEGED_ACTION_CONTROLS[action];
  if (controlName) assertReleaseControl(controlName);
}

router.post(
  "/privileged-actions/preview",
  asyncHandler(async (req, res) => {
    const action = String(req.body.action || "");
    if (!PRIVILEGED_ACTIONS.has(action)) throw Object.assign(new Error("Privileged action is not allowlisted."), { statusCode: 400 });
    assertPrivilegedActionEnabled(action);
    const permissionByAction = {
      "credit.pack.publish": "platform.credit_catalog.manage", "credit.grant": "platform.credit_grants.manage", "credit.revoke": "platform.credit_revocations.manage",
      "credit.refund.resolve": "platform.credit_adjustments.manage", "credit.dispute.open": "platform.credit_disputes.manage", "credit.dispute.resolve": "platform.credit_disputes.manage",
      "plan.defaults.publish": "platform.plans.manage", "queue.fees.publish": "platform.queue_fees.manage", "subscription.transition": "platform.subscription_lifecycle.manage", "subscription.suspend": "platform.subscription_lifecycle.manage"
      , "entitlement.override.publish": "platform.entitlement_overrides.manage", "entitlement.override.revoke": "platform.entitlement_overrides.manage", "allowance.reverse": "platform.credit_adjustments.manage", "allowance.reconcile": "platform.credit_reconcile"
    };
    if (!getGlobalPermissions(req.user).has(permissionByAction[action])) throw Object.assign(new Error("You do not have permission to preview this action."), { statusCode: 403 });
    const target = String(req.body.target || "");
    const reason = String(req.body.reason || "");
    const preview = await privilegedPreviewService.resolvePreview({ action, target, payload: req.body.payload || {} });
    const confirmation = await privilegedTransactionService.issueConfirmation({ actorId: req.user._id, session: req.auth.session, action, target, reason, payload: preview.payload, previewRevision: preview.revision });
    res.json({ preview, confirmation });
  })
);

// Compatibility alias for the first Usage Credit dashboard client.
router.post(
  "/credit-actions/preview",
  requirePlatformPermission("platform.credit_catalog.manage"),
  asyncHandler(async (req, res) => {
    const action = String(req.body.action || "");
    if (!["credit.pack.publish", "credit.grant", "credit.revoke"].includes(action)) throw Object.assign(new Error("Credit action is not allowlisted."), { statusCode: 400 });
    assertPrivilegedActionEnabled(action);
    const target = String(req.body.target || "");
    const preview = await privilegedPreviewService.resolvePreview({ action, target, payload: req.body.payload || {} });
    const confirmation = await privilegedTransactionService.issueConfirmation({ actorId: req.user._id, session: req.auth.session, action, target, reason: req.body.reason, payload: preview.payload, previewRevision: preview.revision });
    res.json({ preview, confirmation });
  })
);

async function executeCreditConfirmation(req, action, target, payload, callback) {
  return db.withTransaction(async (client) => {
    const preview = await privilegedPreviewService.resolvePreview({ action, target: String(target), payload }, { client, lock: true });
    await privilegedTransactionService.consumeConfirmation({ token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session, action, target: String(target), reason: req.body.reason, payload, previewRevision: req.body.previewRevision, currentPreviewRevision: preview.revision }, { client });
    return callback(client);
  });
}

router.get("/credit-packs", requirePlatformPermission("platform.credit_commerce.read"), requireReleaseControl("usageCreditCatalog"), asyncHandler(async (_req, res) => res.json({ packs: await usageCreditService.listCatalog() })));

router.patch(
  "/credit-packs/:code",
  requirePlatformPermission("platform.credit_catalog.manage"),
  requireReleaseControl("usageCreditCatalog"),
  requireIdempotency("platform.credit_pack.publish"),
  asyncHandler(async (req, res) => {
    const payload = { code: req.params.code, name: req.body.name, state: req.body.state, ticketUnits: req.body.ticketUnits, journeyUnits: req.body.journeyUnits, priceCents: req.body.priceCents };
    const pack = await executeCreditConfirmation(req, "credit.pack.publish", req.params.code, payload, (client) => usageCreditService.publishPack(req.params.code, req.body, req.user._id, { client }));
    await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "credit.pack.publish", resourceType: "usage_credit_pack", resourceId: pack.code, reason: req.body.reason, outcome: "success", afterState: pack });
    res.json({ pack });
  })
);

router.get("/credit-purchases", requirePlatformPermission("platform.credit_commerce.read"), asyncHandler(async (_req, res) => {
  const [purchases, cases] = await Promise.all([usageCreditRepository.listPurchases(null), usageCreditRepository.listCases()]);
  res.json({ purchases, ...cases });
}));

router.get("/tenants/:tenantId/capacity", requirePlatformPermission("platform.capacity.read"), asyncHandler(async (req, res) => {
  if (!/^\d{1,18}$/.test(req.params.tenantId)) return res.status(400).json({ message: "Invalid tenant ID." });
  const tenant = await tenantRepository.findTenantById(req.params.tenantId);
  if (!tenant) return res.status(404).json({ message: "Tenant not found." });
  res.json({
    tenant: { id: String(tenant._id), name: tenant.name, slug: tenant.slug },
    capacity: await usageCreditService.getTenantCapacity(req.params.tenantId, true)
  });
}));
router.get("/tenants/:tenantId/entitlement-overrides", requirePlatformPermission("platform.plan_policy.read"), requireReleaseControl("entitlementOverrides"), asyncHandler(async (req,res) => {
  res.json({ overrides: await entitlementOverrideRepository.listForTenant(req.params.tenantId) });
}));

router.get("/security-audit-events", requirePlatformPermission("platform.security_audit.read"), asyncHandler(async (req,res) => {
  const result = req.query.page !== undefined ? await platformRecords.listRecords("audit", req.query) : null;
  const items = result ? result.items : await securityAuditRepository.listEvents({ limit: req.query.limit, tenantId: req.query.tenantId });
  await securityAuditService.record({ actorId:req.user._id, actorRole:"platform_admin", sessionId:req.auth.sessionId, action:"security.audit.read", resourceType:"security_audit", resourceId:req.query.tenantId || "platform", reason:"Platform audit review", outcome:"success", metadata:{returned:items.length} });
  res.json(result || { items });
}));

router.post(
  "/tenants/:tenantId/credit-grants",
  requirePlatformPermission("platform.credit_grants.manage"),
  requireReleaseControl("usageCreditGrants"),
  requireIdempotency("platform.credit_grant.create"),
  asyncHandler(async (req, res) => {
    const payload = { tenantId: req.params.tenantId, ticketUnits: req.body.ticketUnits, journeyUnits: req.body.journeyUnits, expiresAt: req.body.expiresAt || null };
    const lots = await executeCreditConfirmation(req, "credit.grant", req.params.tenantId, payload, (client) => usageCreditService.grant({ ...req.body, ...payload }, req.user._id, { client }));
    await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "credit.grant", resourceType: "tenant", resourceId: req.params.tenantId, reason: req.body.reason, outcome: "success", afterState: { lots } });
    res.status(201).json({ lots });
  })
);

router.post(
  "/credit-lots/:lotId/revoke",
  requirePlatformPermission("platform.credit_revocations.manage"),
  requireReleaseControl("usageCreditGrants"),
  requireIdempotency("platform.credit_lot.revoke"),
  asyncHandler(async (req, res) => {
    const payload = { lotId: req.params.lotId, units: req.body.units };
    const lot = await executeCreditConfirmation(req, "credit.revoke", req.params.lotId, payload, (client) => usageCreditService.revoke(payload, { client }));
    await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "credit.revoke", resourceType: "usage_credit_lot", resourceId: req.params.lotId, reason: req.body.reason, outcome: "success", afterState: lot });
    res.json({ lot });
  })
);

router.post(
  "/credit-purchases/:purchaseId/refunds/resolve",
  requirePlatformPermission("platform.credit_adjustments.manage"),
  requireReleaseControl("usageCreditRefunds"),
  requireIdempotency("platform.credit_refund.resolve"),
  asyncHandler(async (req, res) => {
    const payload = { purchaseId: req.params.purchaseId, outcome: req.body.outcome, providerRefundId: req.body.providerRefundId || null };
    const refund = await executeCreditConfirmation(req, "credit.refund.resolve", req.params.purchaseId, payload, (client) => usageCreditService.resolveRefund(req.params.purchaseId, req.body.outcome, req.body.providerRefundId, { client }));
    await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "credit.refund.resolve", resourceType: "usage_credit_purchase", resourceId: req.params.purchaseId, reason: req.body.reason, outcome: "success", afterState: refund });
    res.json({ refund });
  })
);

router.post(
  "/credit-purchases/:purchaseId/disputes",
  requirePlatformPermission("platform.credit_disputes.manage"),
  requireReleaseControl("usageCreditDisputes"),
  requireIdempotency("platform.credit_dispute.open"),
  asyncHandler(async (req, res) => {
    const payload = { purchaseId: req.params.purchaseId, providerDisputeId: req.body.providerDisputeId };
    const dispute = await executeCreditConfirmation(req, "credit.dispute.open", req.params.purchaseId, payload, (client) => usageCreditService.openDispute(req.params.purchaseId, req.body.providerDisputeId, req.body.details, { client }));
    await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "credit.dispute.open", resourceType: "usage_credit_purchase", resourceId: req.params.purchaseId, reason: req.body.reason, outcome: "success", afterState: dispute });
    res.status(201).json({ dispute });
  })
);

router.post(
  "/credit-disputes/:providerDisputeId/resolve",
  requirePlatformPermission("platform.credit_disputes.manage"),
  requireReleaseControl("usageCreditDisputes"),
  requireIdempotency("platform.credit_dispute.resolve"),
  asyncHandler(async (req, res) => {
    const payload = { providerDisputeId: req.params.providerDisputeId, outcome: req.body.outcome };
    const dispute = await executeCreditConfirmation(req, "credit.dispute.resolve", req.params.providerDisputeId, payload, (client) => usageCreditService.resolveDispute(req.params.providerDisputeId, req.body.outcome, { client }));
    await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "credit.dispute.resolve", resourceType: "usage_credit_dispute", resourceId: req.params.providerDisputeId, reason: req.body.reason, outcome: "success", afterState: dispute });
    res.json({ dispute });
  })
);

router.post("/tenants/:tenantId/entitlement-overrides", requirePlatformPermission("platform.entitlement_overrides.manage"), requireReleaseControl("entitlementOverrides"), requireIdempotency("platform.entitlement_override.publish"), asyncHandler(async (req,res) => {
  const payload={tenantId:req.params.tenantId,subscriptionId:req.body.subscriptionId,policyKey:req.body.policyKey,value:req.body.value,expiresAt:req.body.expiresAt || null};
  if (!/^(feature\.(queue|branding|discovery|booking|campaigns)|allowance\.(queueTickets|queueEmailJourneys|serviceBookings))$/.test(String(payload.policyKey || ""))) throw Object.assign(new Error("Entitlement override key is invalid."),{statusCode:400});
  const override=await executeCreditConfirmation(req,"entitlement.override.publish",req.params.tenantId,payload,(client)=>entitlementOverrideRepository.create({...payload,reason:req.body.reason,actorId:req.user._id},{client}));
  if(!override) throw Object.assign(new Error("Subscription not found for this tenant."),{statusCode:404});
  await securityAuditService.record({actorId:req.user._id,actorRole:"platform_admin",sessionId:req.auth.sessionId,tenantId:req.params.tenantId,action:"entitlement.override.publish",resourceType:"tenant_entitlement_override",resourceId:override.id,reason:req.body.reason,outcome:"success",afterState:override});
  res.status(201).json({override});
}));

router.post("/tenants/:tenantId/entitlement-overrides/:overrideId/revoke", requirePlatformPermission("platform.entitlement_overrides.manage"), requireReleaseControl("entitlementOverrides"), requireIdempotency("platform.entitlement_override.revoke"), asyncHandler(async (req,res) => {
  const payload={tenantId:req.params.tenantId,overrideId:req.params.overrideId};
  const override=await executeCreditConfirmation(req,"entitlement.override.revoke",req.params.overrideId,payload,(client)=>entitlementOverrideRepository.revoke({...payload,actorId:req.user._id},{client}));
  if(!override) throw Object.assign(new Error("Active entitlement override not found."),{statusCode:404});
  await securityAuditService.record({actorId:req.user._id,actorRole:"platform_admin",sessionId:req.auth.sessionId,tenantId:req.params.tenantId,action:"entitlement.override.revoke",resourceType:"tenant_entitlement_override",resourceId:req.params.overrideId,reason:req.body.reason,outcome:"success",afterState:override});
  res.json({override});
}));

router.post("/tenants/:tenantId/allowance-operations/:operationId/reverse", requirePlatformPermission("platform.credit_adjustments.manage"), requireReleaseControl("allowanceRepairs"), requireIdempotency("platform.allowance.reverse"), asyncHandler(async (req,res) => {
  const payload={tenantId:req.params.tenantId,operationId:req.params.operationId};
  const result=await executeCreditConfirmation(req,"allowance.reverse",req.params.operationId,payload,(client)=>allowanceLedgerRepository.reverseOperation({...payload,operationKey:`platform-reversal:${req.params.operationId}`,actorUserId:req.user._id,reason:req.body.reason},{client}));
  if(!result) throw Object.assign(new Error("Allowance operation not found."),{statusCode:404});
  await securityAuditService.record({actorId:req.user._id,actorRole:"platform_admin",sessionId:req.auth.sessionId,tenantId:req.params.tenantId,action:"allowance.reverse",resourceType:"allowance_operation",resourceId:req.params.operationId,reason:req.body.reason,outcome:"success",afterState:result.operation});
  res.json(result);
}));

router.post("/tenants/:tenantId/allowance-reconciliations", requirePlatformPermission("platform.credit_reconcile"), requireReleaseControl("allowanceRepairs"), requireIdempotency("platform.allowance.reconcile"), asyncHandler(async (req,res) => {
  const payload={tenantId:req.params.tenantId,resourceKey:req.body.resourceKey,expectedUnits:Number(req.body.expectedUnits),ledgerUnits:Number(req.body.ledgerUnits)};
  const reconciliation=await executeCreditConfirmation(req,"allowance.reconcile",req.params.tenantId,payload,(client)=>allowanceLedgerRepository.recordReconciliation({...payload,details:{reason:req.body.reason,correlationId:req.correlationId}},{client}));
  await securityAuditService.record({actorId:req.user._id,actorRole:"platform_admin",sessionId:req.auth.sessionId,tenantId:req.params.tenantId,action:"allowance.reconcile",resourceType:"allowance_reconciliation",resourceId:reconciliation.id,reason:req.body.reason,outcome:reconciliation.status,afterState:reconciliation});
  res.status(201).json({reconciliation});
}));

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
    const targetId = String(req.body?.targetId || "");
    const reason = String(req.body?.reason || "");
    if (!["reconcile_overdue_queue_day", "requeue_notification"].includes(action)) {
      const error = new Error("Repair action is not allowlisted.");
      error.statusCode = 400;
      throw error;
    }
    const previewRevision = "queue-repair-v1";
    const confirmation = await privilegedTransactionService.issueConfirmation({
      actorId: req.user._id,
      session: req.auth.session,
      action,
      target: targetId,
      reason,
      payload: { action, targetId },
      previewRevision
    });
    res.json({
      preview: {
        action,
        targetId,
        requiresMfa: true,
        mutatesCustomerIdentity: false,
        revision: previewRevision
      },
      confirmation
    });
  })
);

router.post(
  "/queue-lifecycle/repair/execute",
  requirePlatformPermission("platform.queue_lifecycle.repair"),
  asyncHandler(async (req, res) => {
    const action = String(req.body?.action || "");
    const targetId = String(req.body?.targetId || "");
    await privilegedTransactionService.consumeConfirmation({
      token: req.get("x-transaction-confirmation"),
      actorId: req.user._id,
      session: req.auth.session,
      action,
      target: targetId,
      reason: req.body?.reason,
      payload: { action, targetId },
      previewRevision: req.body?.previewRevision
    });
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
  requireReleaseControl("planPolicyMutations"),
  requireIdempotency("platform.plan.update"),
  asyncHandler(async (req, res) => {
    if (req.body.plan?.slug !== req.params.planSlug) {
      const error = new Error("Plan slug mismatch.");
      error.statusCode = 400;
      throw error;
    }

    validatePlanMutation(req.body.plan);
    const plan = await db.withTransaction(async (client) => {
      const preview = await privilegedPreviewService.resolvePreview({ action: "plan.defaults.publish", target: req.params.planSlug, payload: { plan: req.body.plan } }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({
        token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session,
        action: "plan.defaults.publish", target: req.params.planSlug, reason: req.body.reason,
        payload: { plan: req.body.plan }, previewRevision: req.body.previewRevision,
        currentPreviewRevision: preview.revision
      }, { client });
      const beforeState = await subscriptionPlanRepository.findPlanBySlug(req.params.planSlug, { client });
      const updatedPlan = await subscriptionPlanRepository.updatePlan(req.body.plan, req.user?._id, { client });
      if (!updatedPlan) {
        const error = new Error("Plan not found.");
        error.statusCode = 404;
        throw error;
      }
      await securityAuditService.record({
        actorId: req.user._id,
        actorRole: "platform_admin",
        sessionId: req.auth.sessionId,
        action: "platform.plan.update",
        resourceType: "subscription_plan",
        resourceId: updatedPlan.slug,
        reason: req.body.reason || "Plan policy update",
        outcome: "success",
        beforeState,
        afterState: updatedPlan
      }, { client });
      return updatedPlan;
    });
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
  requireReleaseControl("planPolicyMutations"),
  requireIdempotency("platform.queue_fees.update"),
  asyncHandler(async (req, res) => {
    const queueFees = await db.withTransaction(async (client) => {
      const payload = { queueFees: req.body.queueFees };
      const preview = await privilegedPreviewService.resolvePreview({ action: "queue.fees.publish", target: "all-plans", payload }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({
        token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session,
        action: "queue.fees.publish", target: "all-plans", reason: req.body.reason,
        payload, previewRevision: req.body.previewRevision, currentPreviewRevision: preview.revision
      }, { client });
      const beforeState = await queueFeeService.listQueueFees({ client });
      const updatedQueueFees = await queueFeeService.updateQueueFees({ queueFees: req.body.queueFees, user: req.user }, { client });
      await securityAuditService.record({
        actorId: req.user._id,
        actorRole: "platform_admin",
        sessionId: req.auth.sessionId,
        action: "platform.queue_fees.update",
        resourceType: "queue_fee_policy",
        resourceId: "all-plans",
        reason: req.body.reason || "Queue fee policy update",
        outcome: "success",
        beforeState,
        afterState: updatedQueueFees
      }, { client });
      return updatedQueueFees;
    });
    res.json({ queueFees });
  })
);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMobileApprovedHosts(value) {
  if (!Array.isArray(value)) {
    const error = new Error("mobileApprovedHosts must be an array.");
    error.statusCode = 400;
    throw error;
  }
  const hosts = [...new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  if (hosts.length > 20) {
    const error = new Error("At most 20 mobile HTTPS hosts may be maintained.");
    error.statusCode = 400;
    throw error;
  }
  for (const host of hosts) {
    try {
      const url = new URL(`https://${host}`);
      if (url.hostname !== host || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error();
    } catch {
      const error = new Error("Each mobile approved host must be a hostname with no path and no credentials.");
      error.statusCode = 400;
      throw error;
    }
  }
  return hosts;
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
    const mobileApprovedHosts = Object.prototype.hasOwnProperty.call(req.body, "mobileApprovedHosts")
      ? normalizeMobileApprovedHosts(req.body.mobileApprovedHosts)
      : undefined;
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
        mobileApprovedHosts,
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
    res.json(req.query.page !== undefined ? await platformRecords.listRecords("tenants", req.query) : {
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
  requirePlatformPermission("platform.subscription_lifecycle.manage"),
  requireReleaseControl("subscriptionLifecycle"),
  requireIdempotency("platform.subscription_transition.create"),
  asyncHandler(async (req, res) => {
    const { tenantId, planSlug, reason, metadata } = req.body || {};
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

    const transition = await db.withTransaction(async (client) => {
      const payload = { tenantId: String(tenantId), planSlug };
      const preview = await privilegedPreviewService.resolvePreview({ action: "subscription.transition", target: tenantId, payload }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({ token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session, action: "subscription.transition", target: tenantId, reason, payload, previewRevision: req.body.previewRevision, currentPreviewRevision: preview.revision }, { client });
      return subscriptionLifecycleService.requestTransition({ tenantId: tenant._id, toPlanSlug: plan.slug, reason: String(reason || "Platform subscription lifecycle change"), actorId: req.user._id, metadata }, { client });
    });
    res.status(201).json({ transition });
  })
);

router.patch(
  "/subscriptions/:subscriptionId",
  requirePlatformPermission("platform.subscription_lifecycle.manage"),
  asyncHandler(async (_req, _res) => {
    const error = new Error("Direct subscription edits are retired. Create a lifecycle transition instead.");
    error.statusCode = 405;
    error.code = "SUBSCRIPTION_TRANSITION_REQUIRED";
    throw error;
  })
);

router.post(
  "/subscriptions/:subscriptionId/suspend",
  requirePlatformPermission("platform.subscription_lifecycle.manage"),
  requireReleaseControl("subscriptionLifecycle"),
  requireIdempotency("platform.subscription.suspend"),
  asyncHandler(async (req, res) => {
    const payload = { subscriptionId: req.params.subscriptionId };
    const subscription = await db.withTransaction(async (client) => {
      const preview = await privilegedPreviewService.resolvePreview({ action: "subscription.suspend", target: req.params.subscriptionId, payload }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({ token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session, action: "subscription.suspend", target: req.params.subscriptionId, reason: req.body.reason, payload, previewRevision: req.body.previewRevision, currentPreviewRevision: preview.revision }, { client });
      return subscriptionLifecycleService.suspendSubscription(req.params.subscriptionId, { reason: req.body.reason, actorId: req.user._id }, { client });
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
  asyncHandler(async (_req, _res) => {
    const error = new Error("Subscription history cannot be deleted. Use a lifecycle transition or corrective event.");
    error.statusCode = 405;
    error.code = "SUBSCRIPTION_DELETE_RETIRED";
    throw error;
  })
);

router.get("/subscription-transitions", requirePlatformPermission("platform.billing.read"), requireReleaseControl("subscriptionLifecycle"), asyncHandler(async (req, res) => res.json({ items: await subscriptionLifecycleRepository.listTransitions(req.query.tenantId || null) })));

router.post(
  "/subscription-transitions/execute-due",
  requirePlatformPermission("platform.subscription_lifecycle.manage"),
  requireReleaseControl("subscriptionLifecycle"),
  requireIdempotency("platform.subscription_transition.execute_due"),
  asyncHandler(async (_req, res) => res.json(await subscriptionLifecycleService.executeDue()))
);

router.get(
  "/users",
  requirePlatformPermission("platform.users.read"),
  asyncHandler(async (req, res) => {
    res.json(req.query.page !== undefined ? await platformRecords.listRecords("users", req.query) : {
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
