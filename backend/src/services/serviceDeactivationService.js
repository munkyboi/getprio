const db = require("../config/db");
const services = require("../repositories/vendorServices");
const { withTenantCatalogTransaction, advanceBranchRevisions } = require("../repositories/resourceLedger");
const { readAuthorizedVendorQueueActor } = require("./vendorQueueTransactionService");

async function deactivateVendorService(tenant, serviceSlug, { actorUserId }) {
  return withTenantCatalogTransaction({
    pool: db.pool, tenantId: String(tenant._id), actorUserId: String(actorUserId),
    authorize: async (client, scope) => Boolean(await readAuthorizedVendorQueueActor(client, scope, "tenant.service.manage", { forShare: true }))
  }, async (client, branchIds) => {
    const service = await services.findServiceByTenantAndSlug(tenant._id, serviceSlug, { client, forUpdate: true });
    if (!service) throw Object.assign(new Error("Service not found."), { statusCode: 404 });
    if (!service.isActive) return service;
    const updated = await services.deactivateService(service._id, { client });
    await advanceBranchRevisions(client, String(tenant._id), branchIds);
    return updated;
  });
}

module.exports = { deactivateVendorService };
