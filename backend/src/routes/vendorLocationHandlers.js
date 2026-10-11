async function handleCreateLocation({ req, res, getAuthorizedTenant, assertTenantPermission, locationCatalogService, formatLocation }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
  const location = await locationCatalogService.createVendorLocation(tenant, req.body || {}, { actorUserId: req.user._id });
  res.status(201).json({ location: await formatLocation(location, tenant) });
}

async function handleUpdateLocation({ req, res, getAuthorizedTenant, assertTenantPermission, locationCatalogService, formatLocation }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
  const location = await locationCatalogService.updateVendorLocation(tenant, req.params.locationSlug, req.body || {}, { actorUserId: req.user._id });
  res.json({ location: await formatLocation(location, tenant) });
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
