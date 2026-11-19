const db = require("../config/db");
const queueEvents = require("./queueEvents");
const locations = require("../repositories/storeLocations");
const { withVendorQueueTransaction } = require("./vendorQueueTransactionService");

async function replaceLocationHours(tenant, location, hours, { actorUserId }) {
  const result = await withVendorQueueTransaction({
    pool: db.pool, tenant, location, actorUserId,
    permission: "tenant.location.manage", lockTenantActivity: true
  }, async (client) => {
    const updatedHours = await locations.replaceHours(location._id, hours, { client });
    await client.query("UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
      [tenant._id, location._id]);
    return updatedHours;
  });
  queueEvents.publish(tenant.slug,{type:"queue-plans-updated",locationId:String(location._id)},{locationId:location._id});
  return result;
}

module.exports = { replaceLocationHours };
