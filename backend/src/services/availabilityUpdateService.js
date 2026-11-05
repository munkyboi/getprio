const db = require("../config/db");
const { advanceBranchRevisions } = require("../repositories/resourceLedger");
const availability = require("../repositories/vendorAvailability");
const locations = require("../repositories/storeLocations");
const { normalizeAvailabilityForLocation, readAvailabilityEntry } = require("./availabilityWriterHelpers");
const { withVendorQueueTransaction } = require("./vendorQueueTransactionService");

const types = {
  block: { update: "updateBlock" },
  exception: { update: "updateException" }
};
function fail(message, statusCode) { throw Object.assign(new Error(message), { statusCode }); }
async function readRequestedLocation(tenant, value, client) {
  const slug = String(value).trim();
  const location = slug
    ? await locations.findLocationByTenantAndSlug(tenant._id, slug, { client })
    : await locations.findPrimaryLocationByTenantId(tenant._id, { client });
  if (!location) fail("Location not found.", 404);
  return location;
}

async function updateAvailabilityEntry(tenant, entryId, body, type, { actorUserId }) {
  const selected = await readAvailabilityEntry(tenant._id, entryId, type, { client: db.pool });
  const operation = types[type];
  const target = body.locationSlug ? await readRequestedLocation(tenant, body.locationSlug, db.pool) : { _id: selected.locationId };
  return withVendorQueueTransaction({
    pool: db.pool, tenant, location: { _id: selected.locationId }, actorUserId,
    permission: "tenant.availability.manage", lockTenantActivity: true, additionalLocationIds: [String(target._id)]
  }, async (client) => {
    const current = await readAvailabilityEntry(tenant._id, entryId, type, { client, forUpdate: true });
    if (current.locationId !== selected.locationId) fail("Availability location changed. Reload before editing.", 409);
    if (body.locationSlug) {
      const resolved = await readRequestedLocation(tenant, body.locationSlug, client);
      if (resolved._id !== target._id) fail("Selected location changed. Reload before editing.", 409);
    }
    const payload = await normalizeAvailabilityForLocation({ tenant, location: target, body, existing: current, type, client });
    const entry = await availability[operation.update](current._id, payload, { client });
    const branchIds = [...new Set([current.locationId, payload.locationId])];
    await advanceBranchRevisions(client, String(tenant._id), branchIds);
    return entry;
  });
}

module.exports = { updateAvailabilityEntry };
