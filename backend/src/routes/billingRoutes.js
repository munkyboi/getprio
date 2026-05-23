const express = require("express");
const tenantRepository = require("../repositories/tenants");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, userHasTenantAccess, assertTenantOwner } = require("../middleware/auth");
const billingService = require("../services/billingService");

const router = express.Router();

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

router.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    res.json(await billingService.getBillingOverview(null));
  })
);

router.get(
  "/tenant/:tenantSlug/subscription",
  authenticate,
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    res.json(await billingService.getBillingOverview(tenant._id));
  })
);

router.post(
  "/tenant/:tenantSlug/checkout",
  authenticate,
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantOwner(req.user, tenant._id);
    const { planSlug, billingInterval } = req.body;
    const checkout = await billingService.createPayMongoCheckout({
      tenant,
      user: req.user,
      planSlug,
      billingInterval
    });

    res.status(201).json(checkout);
  })
);

router.post(
  "/tenant/:tenantSlug/checkout/:checkoutId/sync",
  authenticate,
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantOwner(req.user, tenant._id);
    const result = await billingService.syncPayMongoCheckout({
      tenant,
      checkoutId: req.params.checkoutId
    });

    res.json(result);
  })
);

module.exports = router;
