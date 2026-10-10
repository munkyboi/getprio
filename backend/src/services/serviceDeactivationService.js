const db = require("../config/db");
const admission = require("./entitlementAdmissionService");
const locationServices = require("../repositories/locationServices");
const { normalizeServicePayload, normalizeLocationServicesPayload } = require("../routes/vendorRouteHelpers");
const services = require("../repositories/vendorServices");
const { withTenantCatalogTransaction, advanceBranchRevisions } = require("../repositories/resourceLedger");
const { readAuthorizedVendorQueueActor } = require("./vendorQueueTransactionService");

async function withCatalog(tenant, actorUserId, callback) {
  return withTenantCatalogTransaction({
    pool: db.pool, tenantId: String(tenant._id), actorUserId: String(actorUserId),
    authorize: async (client, scope) => Boolean(await readAuthorizedVendorQueueActor(client, scope, "tenant.service.manage", { forShare: true }))
  }, callback);
}

async function withCatalogService(tenant, serviceSlug, actorUserId, callback) {
  return withCatalog(tenant, actorUserId, async (client, branchIds) => {
    const service = await services.findServiceByTenantAndSlug(tenant._id, serviceSlug, { client, forUpdate: true });
    if (!service) throw Object.assign(new Error("Service not found."), { statusCode: 404 });
    return callback(client, branchIds, service);
  });
}

async function saveCatalogDefinition(client, branchIds, tenant, body, currentService = null) {
  await admission.admit({ tenantId: tenant._id, featureKey: "booking", client, lockPolicy: true });
  const payload = normalizeServicePayload(body, currentService);
  const mappings = await normalizeLocationServicesPayload(body, currentService, tenant, { client });
  const service = currentService
    ? await services.updateService(currentService._id, payload, { client })
    : await services.createService({ tenantId: tenant._id, ...payload }, { client });
  const locationServiceMappings = mappings.map(mapping => ({ ...mapping, serviceId: service._id }));
  await locationServiceMappings.reduce((previous, mapping) => previous.then(() => locationServices.upsertLocationService(mapping, { client })), Promise.resolve());
  await advanceBranchRevisions(client, String(tenant._id), branchIds);
  return { service, locationServices: locationServiceMappings };
}

async function createVendorService(tenant, body, { actorUserId }) {
  return withCatalog(tenant, actorUserId, (client, branchIds) => saveCatalogDefinition(client, branchIds, tenant, body));
}

async function deactivateVendorService(tenant, serviceSlug, { actorUserId }) {
  return withCatalogService(tenant, serviceSlug, actorUserId, async (client, branchIds, service) => {
    if (!service.isActive) return service;
    const updated = await services.deactivateService(service._id, { client });
    await advanceBranchRevisions(client, String(tenant._id), branchIds);
    return updated;
  });
}

async function updateVendorService(tenant, serviceSlug, body, { actorUserId }) {
  return withCatalogService(tenant, serviceSlug, actorUserId, (client, branchIds, service) => saveCatalogDefinition(client, branchIds, tenant, body, service));
}

module.exports = { createVendorService, deactivateVendorService, updateVendorService };
