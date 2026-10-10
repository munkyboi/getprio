const db = require("../config/db");
const availability = require("../repositories/vendorAvailability");
const services = require("../repositories/vendorServices");
const locations = require("../repositories/storeLocations");
const payloads = require("./availabilityPayloadService");
const { withVendorQueueTransaction } = require("./vendorQueueTransactionService");

const types = {
  block: { normalize: payloads.normalizeAvailabilityBlockPayload, create: "createBlock" },
  exception: { normalize: payloads.normalizeAvailabilityExceptionPayload, create: "createException" }
};

async function createAvailabilityEntry(tenant, location, body, type, { actorUserId }) {
  if (!Object.hasOwn(types, type)) throw Object.assign(new Error("Select a valid availability type."), { statusCode: 400 });
  return withVendorQueueTransaction({
    pool: db.pool, tenant, location, actorUserId,
    permission: "tenant.availability.manage", lockTenantActivity: true
  }, async (client) => {
    const operation = types[type];
    const payload = await operation.normalize(tenant, { ...body, locationSlug: String(location._id) }, null, {
      findServiceByTenantAndSlug: (tenantId, slug) => services.findServiceByTenantAndSlug(tenantId, slug, { client, forShare: true })
    }, async () => location, {
      listHoursByLocationId: (locationId) => locations.listHoursByLocationId(locationId, { client })
    });
    const entry = await availability[operation.create]({ tenantId: tenant._id, ...payload }, { client });
    await client.query("UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
      [tenant._id, location._id]);
    return entry;
  });
}

module.exports = { createAvailabilityEntry };
