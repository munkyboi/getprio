const db = require("../config/db");
const locations = require("../repositories/storeLocations");
const platform = require("../repositories/platform");
const policy = require("../repositories/locationQuotaPolicy");
const { normalizeLocationPayload } = require("../routes/vendorRouteHelpers");
const { withTenantCatalogTransaction, advanceBranchRevisions } = require("../repositories/resourceLedger");
const { readAuthorizedVendorQueueActor } = require("./vendorQueueTransactionService");

async function changeLocationCatalog(tenant, actorUserId, mutate) {
  try {
    return await withTenantCatalogTransaction({
      pool: db.pool, tenantId: String(tenant._id), actorUserId: String(actorUserId),
      authorize: async (client, scope) => Boolean(await readAuthorizedVendorQueueActor(client, scope, "tenant.location.manage", { forShare: true }))
    }, mutate);
  } catch (error) {
    if (error.code === "55P03") throw Object.assign(new Error("Location policy is changing. Reload before saving."), { statusCode: 409, code: "LOCATION_POLICY_BUSY" });
    throw error;
  }
}

async function admitActiveLocation(tenantId, client) {
  const limit = await policy.readActiveLocationLimit(tenantId, { client });
  const existing = await locations.listLocationsByTenantId(tenantId, { client });
  if (existing.filter(location => location.isActive).length >= limit) {
    throw Object.assign(new Error("Active location limit exceeded for this subscription plan."), { statusCode: 403 });
  }
}

async function createVendorLocation(tenant, body, { actorUserId }) {
  return changeLocationCatalog(tenant, actorUserId, async (client, branchIds) => {
    const payload = normalizeLocationPayload(body);
    if (payload.isActive !== false) await admitActiveLocation(tenant._id, client);
    const settings = await platform.getPlatformSettings({ client });
    const location = await locations.createLocation({ ...payload, tenantId: tenant._id, timezone: payload.timezone || settings.defaultTimezone }, { client });
    await locations.createDefaultHours(location._id, { client });
    await advanceBranchRevisions(client, String(tenant._id), [...branchIds, location._id]);
    return location;
  });
}

async function updateVendorLocation(tenant, locationSlug, body, { actorUserId }) {
  return changeLocationCatalog(tenant, actorUserId, async (client, branchIds) => {
    const location = await locations.findLocationByTenantAndSlug(tenant._id, locationSlug, { client });
    if (!location) throw Object.assign(new Error("Location not found."), { statusCode: 404 });
    const changes = normalizeLocationPayload(body, location);
    if (Object.prototype.hasOwnProperty.call(changes, "slug") && changes.slug !== location.slug) {
      throw Object.assign(new Error("Location slug cannot be changed after creation."), { statusCode: 400 });
    }
    delete changes.slug;
    if (changes.isActive === true && !location.isActive) await admitActiveLocation(tenant._id, client);
    const updated = await locations.updateLocation(location._id, changes, { client });
    await advanceBranchRevisions(client, String(tenant._id), branchIds);
    return updated;
  });
}

module.exports = { createVendorLocation, updateVendorLocation };
