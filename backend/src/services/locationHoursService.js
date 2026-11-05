const db = require("../config/db");
const locations = require("../repositories/storeLocations");
const { withVendorQueueTransaction } = require("./vendorQueueTransactionService");

async function replaceLocationHours(tenant, location, hours, { actorUserId }) {
  return withVendorQueueTransaction({
    pool: db.pool, tenant, location, actorUserId,
    permission: "tenant.location.manage", lockTenantActivity: true
  }, async (client) => {
    const updatedHours = await locations.replaceHours(location._id, hours, { client });
    await client.query("UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
      [tenant._id, location._id]);
    return updatedHours;
  });
}

module.exports = { replaceLocationHours };
