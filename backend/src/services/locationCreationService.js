const db = require("../config/db");
const locations = require("../repositories/storeLocations");
const platform = require("../repositories/platform");
const policy = require("../repositories/locationCreationPolicy");
const { normalizeLocationPayload } = require("../routes/vendorRouteHelpers");
const { withTenantCatalogTransaction, advanceBranchRevisions } = require("../repositories/resourceLedger");
const { readAuthorizedVendorQueueActor } = require("./vendorQueueTransactionService");

async function createVendorLocation(tenant, body, { actorUserId }) {
  try {
    return await withTenantCatalogTransaction({
      pool: db.pool, tenantId: String(tenant._id), actorUserId: String(actorUserId),
      authorize: async (client, scope) => Boolean(await readAuthorizedVendorQueueActor(client, scope, "tenant.location.manage", { forShare: true }))
    }, async (client, branchIds) => {
      const payload = normalizeLocationPayload(body);
      if (payload.isActive !== false) {
        const limit = await policy.readLocationCreationLimit(tenant._id, { client });
        const existing = await locations.listLocationsByTenantId(tenant._id, { client });
        if (existing.filter(location => location.isActive).length >= limit) {
          throw Object.assign(new Error("Active location limit exceeded for this subscription plan."), { statusCode: 403 });
        }
      }
      const settings = await platform.getPlatformSettings({ client });
      const location = await locations.createLocation({ ...payload, tenantId: tenant._id, timezone: payload.timezone || settings.defaultTimezone }, { client });
      await locations.createDefaultHours(location._id, { client });
      await advanceBranchRevisions(client, String(tenant._id), [...branchIds, location._id]);
      return location;
    });
  } catch (error) {
    if (error.code === "55P03") throw Object.assign(new Error("Location policy is changing. Reload before saving."), { statusCode: 409, code: "LOCATION_POLICY_BUSY" });
    throw error;
  }
}

module.exports = { createVendorLocation };
