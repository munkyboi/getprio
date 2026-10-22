const { formatVendorService } = require("./vendorRouteHelpers");

async function handleListServices({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository, locationServiceRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
  const services = await vendorServiceRepository.listServicesByTenantId(tenant._id);
  const locationServices = await locationServiceRepository.listLocationServicesByTenantId(tenant._id);
  res.json({ services: services.map(formatVendorService), locationServices });
}

async function handleCreateService({ req, res, getAuthorizedTenant, assertTenantPermission, serviceDeactivationService }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
  const result = await serviceDeactivationService.createVendorService(tenant, req.body || {}, { actorUserId: req.user._id });
  res.status(201).json({ service: formatVendorService(result.service), locationServices: result.locationServices });
}

async function handleUpdateService({ req, res, getAuthorizedTenant, assertTenantPermission, serviceDeactivationService }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
  const result = await serviceDeactivationService.updateVendorService(tenant, req.params.serviceSlug, req.body || {}, { actorUserId: req.user._id });
  res.json({ service: formatVendorService(result.service), locationServices: result.locationServices });
}

async function handleDeleteService({ req, res, getAuthorizedTenant, assertTenantPermission, serviceDeactivationService }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
  const service = await serviceDeactivationService.deactivateVendorService(tenant, req.params.serviceSlug, { actorUserId: req.user._id });
  res.json({ service: formatVendorService(service) });
}

async function handleCheckServiceSlugAvailability({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
  const serviceSlug = req.query.serviceSlug || req.query.slug || "";
  const excludeServiceId = req.query.excludeServiceId || req.query.serviceId || null;
  const result = await vendorServiceRepository.isServiceSlugAvailable(
    tenant._id,
    serviceSlug,
    excludeServiceId
  );
  res.json({ serviceSlug: String(serviceSlug || ""), ...result });
}

module.exports = { handleListServices, handleCreateService, handleUpdateService, handleDeleteService, handleCheckServiceSlugAvailability };
