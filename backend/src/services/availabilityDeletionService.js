const db = require("../config/db");
const availability = require("../repositories/vendorAvailability");
const { readAvailabilityEntry } = require("./availabilityWriterHelpers");
const { withVendorQueueTransaction } = require("./vendorQueueTransactionService");

const types = {
  block: { remove: "deleteBlock" },
  exception: { remove: "deleteException" }
};
function fail(message, statusCode) {
  throw Object.assign(new Error(message), { statusCode });
}
async function deleteAvailabilityEntry(tenant, entryId, type, { actorUserId }) {
  const selected = await readAvailabilityEntry(tenant._id, entryId, type, { client: db.pool });
  const operation = types[type];
  return withVendorQueueTransaction({
    pool: db.pool, tenant, location: { _id: selected.locationId }, actorUserId,
    permission: "tenant.availability.manage", lockTenantActivity: true
  }, async (client) => {
    const current = await readAvailabilityEntry(tenant._id, entryId, type, { client, forUpdate: true });
    if (String(current.locationId) !== String(selected.locationId)) fail("Availability location changed. Reload before deleting.", 409);
    await availability[operation.remove](current._id, { client });
    await client.query("UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
      [tenant._id, selected.locationId]);
    return current;
  });
}

module.exports = { deleteAvailabilityEntry };
