const {
  formatVendorService,
  normalizeLocationServicesPayload,
  normalizeServicePayload
} = require("./vendorRouteHelpers");

async function handleListServices({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository, locationServiceRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
  const services = await vendorServiceRepository.listServicesByTenantId(tenant._id);
  const locationServices = await locationServiceRepository.listLocationServicesByTenantId(tenant._id);
  res.json({ services: services.map(formatVendorService), locationServices });
}

async function handleCreateService({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository, locationServiceRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
  const service = await vendorServiceRepository.createService({
    tenantId: tenant._id,
    ...normalizeServicePayload(req.body || {})
  });
  const locationServices = await normalizeLocationServicesPayload(req.body || {}, service, tenant);
  for (const locationService of locationServices) {
    await locationServiceRepository.upsertLocationService({
      ...locationService,
      serviceId: service._id
    });
  }
  res.status(201).json({ service: formatVendorService(service), locationServices });
}

async function handleUpdateService({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository, locationServiceRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
  const service = await vendorServiceRepository.findServiceByTenantAndSlug(
    tenant._id,
    req.params.serviceSlug
  );
  if (!service) {
    const error = new Error("Service not found.");
    error.statusCode = 404;
    throw error;
  }
  const updatedService = await vendorServiceRepository.updateService(
    service._id,
    normalizeServicePayload(req.body || {}, service)
  );
  const locationServices = await normalizeLocationServicesPayload(req.body || {}, updatedService, tenant);
  for (const locationService of locationServices) {
    await locationServiceRepository.upsertLocationService({
      ...locationService,
      serviceId: updatedService._id
    });
  }
  res.json({ service: formatVendorService(updatedService), locationServices });
}

async function handleDeleteService({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
  const service = await vendorServiceRepository.findServiceByTenantAndSlug(
    tenant._id,
    req.params.serviceSlug
  );
  if (!service) {
    const error = new Error("Service not found.");
    error.statusCode = 404;
    throw error;
  }
  const deactivatedService = await vendorServiceRepository.deactivateService(service._id);
  res.json({ service: formatVendorService(deactivatedService) });
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
