const db = require("../config/db");
const admission = require("./entitlementAdmissionService");
const locationServices = require("../repositories/locationServices");
const { normalizeServicePayload, normalizeLocationServicesPayload } = require("../routes/vendorRouteHelpers");
const services = require("../repositories/vendorServices");
const { withTenantCatalogTransaction, advanceBranchRevisions } = require("../repositories/resourceLedger");
const { readAuthorizedVendorQueueActor } = require("./vendorQueueTransactionService");

async function withCatalogService(tenant, serviceSlug, actorUserId, callback) {
  return withTenantCatalogTransaction({
    pool: db.pool, tenantId: String(tenant._id), actorUserId: String(actorUserId),
    authorize: async (client, scope) => Boolean(await readAuthorizedVendorQueueActor(client, scope, "tenant.service.manage", { forShare: true }))
  }, async (client, branchIds) => {
    const service = await services.findServiceByTenantAndSlug(tenant._id, serviceSlug, { client, forUpdate: true });
    if (!service) throw Object.assign(new Error("Service not found."), { statusCode: 404 });
    return callback(client, branchIds, service);
  });
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
  return withCatalogService(tenant, serviceSlug, actorUserId, async (client, branchIds, service) => {
    await admission.admit({ tenantId: tenant._id, featureKey: "booking", client });
    const payload = normalizeServicePayload(body, service);
    const mappings = await normalizeLocationServicesPayload(body, service, tenant, { client });
    const updated = await services.updateService(service._id, payload, { client });
    await mappings.reduce((previous, mapping) => previous.then(() => locationServices.upsertLocationService(mapping, { client })), Promise.resolve());
    await advanceBranchRevisions(client, String(tenant._id), branchIds);
    return { service: updated, locationServices: mappings };
  });
}

module.exports = { deactivateVendorService, updateVendorService };
