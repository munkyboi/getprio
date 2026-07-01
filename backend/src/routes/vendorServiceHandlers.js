const { formatVendorService, normalizeServicePayload } = require("./vendorRouteHelpers");

async function handleListServices({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
  const services = await vendorServiceRepository.listServicesByTenantId(tenant._id);
  res.json({ services: services.map(formatVendorService) });
}

async function handleCreateService({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
  const service = await vendorServiceRepository.createService({
    tenantId: tenant._id,
    ...normalizeServicePayload(req.body || {})
  });
  res.status(201).json({ service: formatVendorService(service) });
}

async function handleUpdateService({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository }) {
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
  res.json({ service: formatVendorService(updatedService) });
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

module.exports = { handleListServices, handleCreateService, handleUpdateService, handleDeleteService };
