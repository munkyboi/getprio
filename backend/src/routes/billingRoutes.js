const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const tenantRepository = require("../repositories/tenants");
const asyncHandler = require("../middleware/asyncHandler");
const {
  authenticate,
  userHasTenantAccess,
  assertTenantPermission
} = require("../middleware/auth");
const billingService = require("../services/billingService");
const usageCreditService = require("../services/usageCreditService");
const usageCreditRepository = require("../repositories/usageCredits");
const subscriptionLifecycleService = require("../services/subscriptionLifecycleService");
const subscriptionLifecycleRepository = require("../repositories/subscriptionLifecycle");
const privilegedTransactionService = require("../services/privilegedTransactionService");
const privilegedPreviewService = require("../services/privilegedPreviewService");
const db = require("../config/db");
const securityAuditService = require("../services/securityAuditService");
const { requireIdempotency } = require("../middleware/idempotency");
const releaseControls = require("../config/releaseControls");
const { assertReleaseControl, requireReleaseControl } = require("../middleware/releaseControl");

const router = express.Router();
const billingHttpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown"),
  message: { message: "Too many billing requests. Please try again later." }
});
router.use(billingHttpLimiter);

async function getAuthorizedTenant(user, tenantSlug) {
  const tenant = await tenantRepository.findTenantBySlug(String(tenantSlug).toLowerCase());
  if (!tenant) {
    const error = new Error("Tenant not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!userHasTenantAccess(user, tenant._id)) {
    const error = new Error("You do not have access to that tenant.");
    error.statusCode = 403;
    throw error;
  }

  return tenant;
}

function authorizeTenant(permission) {
  return asyncHandler(async (req, _res, next) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, permission);
    req.authorizedTenant = tenant;
    next();
  });
}

router.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    res.json(await billingService.getBillingOverview(null));
  })
);

router.get("/credit-packs", authenticate, requireReleaseControl("usageCreditCatalog"), asyncHandler(async (_req, res) => res.json({ packs: await usageCreditService.listCatalog() })));
router.get("/capabilities", authenticate, (_req, res) => {
  res.json({ vendorCapacityExperience: releaseControls.vendorCapacityExperience });
});

router.post("/tenant/:tenantSlug/commercial-actions/preview", authenticate, asyncHandler(async (req,res)=>{
  const action=String(req.body.action || "");
  const permissionByAction={"credit.checkout":"tenant.credits.purchase","credit.refund.request":"tenant.credits.refund_request","subscription.checkout":"tenant.billing.manage"};
  if(!permissionByAction[action]) throw Object.assign(new Error("Commercial action is not allowlisted."),{statusCode:400});
  const controlByAction={"credit.checkout":"usageCreditCheckout","credit.refund.request":"usageCreditRefunds"};
  if(controlByAction[action]) assertReleaseControl(controlByAction[action]);
  const tenant=await getAuthorizedTenant(req.user,req.params.tenantSlug);
  assertTenantPermission(req.user,tenant._id,permissionByAction[action]);
  const preview=await privilegedPreviewService.resolvePreview({action,target:String(tenant._id),payload:req.body.payload || {}});
  const confirmation=await privilegedTransactionService.issueConfirmation({actorId:req.user._id,session:req.auth.session,action,target:String(tenant._id),reason:req.body.reason,payload:preview.payload,previewRevision:preview.revision});
  res.json({preview,confirmation});
}));

async function consumeCommercialConfirmation(req,tenant,action,payload){
  return db.withTransaction(async(client)=>{
    const preview=await privilegedPreviewService.resolvePreview({action,target:String(tenant._id),payload},{client,lock:true});
    return privilegedTransactionService.consumeConfirmation({token:req.get("x-transaction-confirmation"),actorId:req.user._id,session:req.auth.session,action,target:String(tenant._id),reason:req.body.reason,payload,previewRevision:req.body.previewRevision,currentPreviewRevision:preview.revision},{client});
  });
}

router.get(
  "/tenant/:tenantSlug/capacity",
  authenticate,
  requireReleaseControl("vendorCapacityExperience"),
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    const commercial = (() => {
      try { assertTenantPermission(req.user, tenant._id, "tenant.capacity.read_commercial"); return true; }
      catch { assertTenantPermission(req.user, tenant._id, "tenant.capacity.read_operational"); return false; }
    })();
    res.json({ capacity: await usageCreditService.getTenantCapacity(tenant._id, commercial), commercial });
  })
);

router.get(
  "/tenant/:tenantSlug/credit-purchases",
  authenticate,
  requireReleaseControl("usageCreditCheckout"),
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.capacity.read_commercial");
    res.json({ purchases: await usageCreditRepository.listPurchases(tenant._id) });
  })
);

router.post(
  "/tenant/:tenantSlug/credit-checkout",
  authenticate,
  requireReleaseControl("usageCreditCheckout"),
  authorizeTenant("tenant.credits.purchase"),
  requireIdempotency("tenant.credit_checkout.create"),
  asyncHandler(async (req, res) => {
    const tenant = req.authorizedTenant;
    const payload={packCode:req.body.packCode}; await consumeCommercialConfirmation(req,tenant,"credit.checkout",payload);
    const result=await usageCreditService.createCheckout({ tenant, user: req.user, packCode: req.body.packCode, purchaseKey: req.get("idempotency-key"), requestOrigin: req.get("origin") });
    await securityAuditService.record({actorId:req.user._id,actorRole:"vendor",sessionId:req.auth.sessionId,tenantId:tenant._id,action:"credit.checkout",resourceType:"tenant",resourceId:tenant._id,reason:req.body.reason,outcome:"pending",afterState:{purchaseId:result.purchaseId}});
    res.status(201).json(result);
  })
);

router.post(
  "/tenant/:tenantSlug/credit-purchases/:purchaseId/sync",
  authenticate,
  requireReleaseControl("usageCreditCheckout"),
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.credits.purchase");
    res.json(await usageCreditService.syncCheckout(req.params.purchaseId, tenant._id));
  })
);

router.post(
  "/tenant/:tenantSlug/credit-purchases/:purchaseId/refund",
  authenticate,
  requireReleaseControl("usageCreditRefunds"),
  authorizeTenant("tenant.credits.refund_request"),
  requireIdempotency("tenant.credit_refund.request"),
  asyncHandler(async (req, res) => {
    const tenant = req.authorizedTenant;
    const payload={purchaseId:req.params.purchaseId}; await consumeCommercialConfirmation(req,tenant,"credit.refund.request",payload);
    const purchase=await usageCreditService.requestRefund(req.params.purchaseId, tenant._id, req.user._id, req.body.reason);
    await securityAuditService.record({actorId:req.user._id,actorRole:"vendor",sessionId:req.auth.sessionId,tenantId:tenant._id,action:"credit.refund.request",resourceType:"usage_credit_purchase",resourceId:req.params.purchaseId,reason:req.body.reason,outcome:"pending",afterState:{status:purchase.status}});
    res.status(202).json({ purchase });
  })
);

router.get(
  "/tenant/:tenantSlug/subscription",
  authenticate,
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.billing.read");
    res.json(await billingService.getBillingOverview(tenant._id));
  })
);

router.get(
  "/tenant/:tenantSlug/subscription-transitions",
  authenticate,
  requireReleaseControl("subscriptionLifecycle"),
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.billing.read");
    res.json({ items: await subscriptionLifecycleRepository.listTransitions(tenant._id) });
  })
);

router.post(
  "/tenant/:tenantSlug/subscription-transitions/preview",
  authenticate,
  requireReleaseControl("subscriptionLifecycle"),
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.billing.manage");
    const reason = String(req.body.reason || "").trim();
    const payload = { toPlanSlug: req.body.toPlanSlug };
    const preview = await privilegedPreviewService.resolvePreview({ action: "subscription.transition.request", target: tenant._id, payload });
    const confirmation = await privilegedTransactionService.issueConfirmation({ actorId: req.user._id, session: req.auth.session, action: "subscription.transition.request", target: tenant._id, reason, payload, previewRevision: preview.revision });
    res.json({ preview, confirmation });
  })
);

router.post(
  "/tenant/:tenantSlug/subscription-transitions",
  authenticate,
  requireReleaseControl("subscriptionLifecycle"),
  authorizeTenant("tenant.billing.manage"),
  requireIdempotency("tenant.subscription_transition.create"),
  asyncHandler(async (req, res) => {
    const tenant = req.authorizedTenant;
    const reason = String(req.body.reason || "").trim();
    if (reason.length < 8) throw Object.assign(new Error("Please provide a clear reason for this plan change."), { statusCode: 400 });
    const transition = await db.withTransaction(async(client)=>{
      const payload={toPlanSlug:req.body.toPlanSlug};
      const preview=await privilegedPreviewService.resolvePreview({action:"subscription.transition.request",target:tenant._id,payload},{client,lock:true});
      await privilegedTransactionService.consumeConfirmation({ token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session, action: "subscription.transition.request", target: tenant._id, reason, payload, previewRevision: req.body.previewRevision,currentPreviewRevision:preview.revision },{client});
      return subscriptionLifecycleService.requestTransition({ tenantId: tenant._id, toPlanSlug: req.body.toPlanSlug, reason, actorId: req.user._id, vendorRequested: true, metadata: { requestedBy: "vendor" } },{client});
    });
    await securityAuditService.record({actorId:req.user._id,actorRole:"vendor",sessionId:req.auth.sessionId,tenantId:tenant._id,action:"subscription.transition.request",resourceType:"subscription_transition",resourceId:transition.id,reason,outcome:transition.status,afterState:transition});
    res.status(201).json({ transition });
  })
);

router.post(
  "/tenant/:tenantSlug/checkout",
  authenticate,
  authorizeTenant("tenant.billing.manage"),
  requireIdempotency("tenant.subscription_checkout.create"),
  asyncHandler(async (req, res) => {
    const tenant = req.authorizedTenant;
    const { planSlug, billingInterval } = req.body;
    const payload={planSlug,billingInterval}; await consumeCommercialConfirmation(req,tenant,"subscription.checkout",payload);
    const checkout = await billingService.createPayMongoCheckout({
      tenant,
      user: req.user,
      planSlug,
      billingInterval,
      requestOrigin: req.get("origin")
    });

    await securityAuditService.record({actorId:req.user._id,actorRole:"vendor",sessionId:req.auth.sessionId,tenantId:tenant._id,action:"subscription.checkout",resourceType:"tenant",resourceId:tenant._id,reason:req.body.reason,outcome:"pending",afterState:{checkoutSessionId:checkout.checkoutSession?.id,planSlug}});
    res.status(201).json(checkout);
  })
);

router.post(
  "/tenant/:tenantSlug/checkout/:checkoutId/sync",
  authenticate,
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.billing.manage");
    const result = await billingService.syncPayMongoCheckout({
      tenant,
      checkoutId: req.params.checkoutId
    });

    res.json(result);
  })
);

module.exports = router;
