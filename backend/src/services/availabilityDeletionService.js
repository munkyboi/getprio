const db = require("../config/db");
const availability = require("../repositories/vendorAvailability");
const { withVendorQueueTransaction } = require("./vendorQueueTransactionService");

const types = {
  block: { find: "findBlockByTenantAndId", remove: "deleteBlock", label: "Availability block" },
  exception: { find: "findExceptionByTenantAndId", remove: "deleteException", label: "Availability exception" }
};
function fail(message, statusCode) {
  throw Object.assign(new Error(message), { statusCode });
}
async function deleteAvailabilityEntry(tenant, entryId, type, { actorUserId }) {
  if (!Object.hasOwn(types, type) || !/^[1-9]\d*$/u.test(String(entryId)) || !Number.isSafeInteger(Number(entryId))) {
    fail("Select a valid availability entry.", 400);
  }
  const operation = types[type];
  const selected = await availability[operation.find](tenant._id, entryId, { client: db.pool });
  if (!selected) fail(`${operation.label} not found.`, 404);
  return withVendorQueueTransaction({
    pool: db.pool, tenant, location: { _id: selected.locationId }, actorUserId,
    permission: "tenant.availability.manage", lockTenantActivity: true
  }, async (client) => {
    const current = await availability[operation.find](tenant._id, entryId, { client, forUpdate: true });
    if (!current) fail(`${operation.label} not found.`, 404);
    if (String(current.locationId) !== String(selected.locationId)) fail("Availability location changed. Reload before deleting.", 409);
    await availability[operation.remove](current._id, { client });
    await client.query("UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
      [tenant._id, selected.locationId]);
    return current;
  });
}

module.exports = { deleteAvailabilityEntry };
