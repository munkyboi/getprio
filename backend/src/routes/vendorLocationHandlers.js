async function handleCreateLocation({
  req,
  res,
  getAuthorizedTenant,
  assertTenantPermission,
  billingService,
  storeLocationRepository,
  normalizeLocationPayload,
  formatLocation
}) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
  const billing = await billingService.getBillingOverview(tenant._id);
  const activeLocationLimit = billing.subscription?.entitlements?.locations || 1;
  const existingLocations = await storeLocationRepository.listLocationsByTenantId(tenant._id);
  const activeCount = existingLocations.filter((location) => location.isActive).length;

  if (req.body.isActive !== false && activeCount >= activeLocationLimit) {
    const error = new Error("Active location limit exceeded for this subscription plan.");
    error.statusCode = 403;
    throw error;
  }

  const locationPayload = normalizeLocationPayload(req.body || {});
  const location = await storeLocationRepository.createLocation({
    tenantId: tenant._id,
    ...locationPayload,
    timezone: locationPayload.timezone || "Asia/Manila"
  });
  await storeLocationRepository.createDefaultHours(location._id);

  res.status(201).json({ location: await formatLocation(location, tenant) });
}

async function handleUpdateLocation({
  req,
  res,
  getAuthorizedTenant,
  assertTenantPermission,
  billingService,
  storeLocationRepository,
  normalizeLocationPayload,
  formatLocation,
  getLocationForTenant
}) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
  const location = await getLocationForTenant(tenant, req.params.locationSlug);
  if (req.body.isActive === true && !location.isActive) {
    const billing = await billingService.getBillingOverview(tenant._id);
    const activeLocationLimit = billing.subscription?.entitlements?.locations || 1;
    const existingLocations = await storeLocationRepository.listLocationsByTenantId(tenant._id);
    const activeCount = existingLocations.filter((locationItem) => locationItem.isActive).length;

    if (activeCount >= activeLocationLimit) {
      const error = new Error("Active location limit exceeded for this subscription plan.");
      error.statusCode = 403;
      throw error;
    }
  }

  const updatedLocation = await storeLocationRepository.updateLocation(
    location._id,
    normalizeLocationPayload(req.body || {}, location)
  );

  res.json({ location: await formatLocation(updatedLocation, tenant) });
}

async function handleCheckLocationSlugAvailability({
  req,
  res,
  getAuthorizedTenant,
  assertTenantPermission,
  storeLocationRepository
}) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
  const locationSlug = req.query.location || req.query.slug || "";
  const excludeLocationId = req.query.excludeLocationId || req.query.locationId || null;
  const result = await storeLocationRepository.isLocationSlugAvailable(
    tenant._id,
    locationSlug,
    excludeLocationId
  );
  res.json({ locationSlug: String(locationSlug || ""), ...result });
}

module.exports = {
  handleCreateLocation,
  handleUpdateLocation,
  handleCheckLocationSlugAvailability
};
