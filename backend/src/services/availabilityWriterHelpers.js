const availability = require("../repositories/vendorAvailability");
const services = require("../repositories/vendorServices");
const locations = require("../repositories/storeLocations");
const payloads = require("./availabilityPayloadService");

async function readAvailabilityEntry(tenantId, entryId, type, options) {
  const readers = { block: "findBlockByTenantAndId", exception: "findExceptionByTenantAndId" };
  if (!Object.hasOwn(readers, type) || !/^[1-9]\d*$/u.test(String(entryId)) || !Number.isSafeInteger(Number(entryId))) {
    throw Object.assign(new Error("Select a valid availability entry."), { statusCode: 400 });
  }
  const entry = await availability[readers[type]](tenantId, entryId, options);
  if (!entry) throw Object.assign(new Error(`Availability ${type} not found.`), { statusCode: 404 });
  return entry;
}

async function normalizeAvailabilityForLocation({ tenant, location, body, existing = null, type, client }) {
  if (existing?.serviceId && !Object.hasOwn(body, "serviceSlug")) {
    const retainedService = await services.findServiceByTenantAndId(tenant._id, existing.serviceId, { client, forShare: true });
    if (!retainedService) throw Object.assign(new Error("Service not found."), { statusCode: 404 });
  }
  const normalize = type === "block" ? payloads.normalizeAvailabilityBlockPayload : payloads.normalizeAvailabilityExceptionPayload;
  return normalize(tenant, { ...body, locationSlug: String(location._id) }, existing, {
    findServiceByTenantAndSlug: (tenantId, slug) => services.findServiceByTenantAndSlug(tenantId, slug, { client, forShare: true })
  }, async () => location, {
    listHoursByLocationId: (locationId) => locations.listHoursByLocationId(locationId, { client })
  });
}

module.exports = { normalizeAvailabilityForLocation, readAvailabilityEntry };
