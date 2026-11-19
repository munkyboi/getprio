const resolver = require("./entitlementResolver");
const admission = require("./entitlementAdmissionService");
const catalog = require("./serviceDeactivationService");
const services = require("../repositories/vendorServices");
const locations = require("../repositories/storeLocations");
const mappings = require("../repositories/locationServices");
const { normalizeServicePayload } = require("../routes/vendorRouteHelpers");
const { advanceBranchRevisions } = require("../repositories/resourceLedger");

const SERVICE_FIELDS = ["name", "slug", "imageUrl", "description", "durationMinutes", "isActive", "sortOrder"];
const LOCATION_FIELDS = ["locationSlug", "isActive", "sortOrder"];
function rejectUnknown(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) {
    throw Object.assign(new Error("Queue setup accepts queue service fields only. Use booking settings for booking options."), {statusCode:400,code:"QUEUE_SERVICE_FIELDS_INVALID"});
  }
}
function validateQueuePayload(body) {
  rejectUnknown(body, [...SERVICE_FIELDS, "locationServices"]);
  for (const field of ["name","slug","imageUrl","description"]) if(Object.hasOwn(body,field)&&typeof body[field]!=="string") throw Object.assign(new Error(`${field} must be text.`),{statusCode:400});
  for (const field of ["durationMinutes","sortOrder"]) if(Object.hasOwn(body,field)&&!Number.isSafeInteger(body[field])) throw Object.assign(new Error(`${field} must be a whole number.`),{statusCode:400});
  if(Object.hasOwn(body,"isActive")&&typeof body.isActive!=="boolean") throw Object.assign(new Error("isActive must be true or false."),{statusCode:400});
  if (Object.hasOwn(body,"locationServices")) {
    if (!Array.isArray(body.locationServices)) throw Object.assign(new Error("locationServices must be a list."), {statusCode:400});
    const slugs = new Set();
    for (const entry of body.locationServices) {
      rejectUnknown(entry, LOCATION_FIELDS);
      if (typeof entry.locationSlug !== "string" || !entry.locationSlug.trim() || slugs.has(entry.locationSlug.trim())) throw Object.assign(new Error("Each location must have a unique locationSlug."), {statusCode:400});
      slugs.add(entry.locationSlug.trim());
      if (Object.hasOwn(entry) && entry.priceAmountCents !== null && (!Number.isSafeInteger(entry.priceAmountCents) || entry.priceAmountCents < 0)) throw Object.assign(new Error("Location price must be a non-negative whole number or null."),{statusCode:400});
      if (Object.hasOwn(entry,"sortOrder") && !Number.isSafeInteger(entry.sortOrder)) throw Object.assign(new Error("Location list order must be a whole number."),{statusCode:400});
      if (Object.hasOwn(entry,"isActive") && typeof entry.isActive !== "boolean") throw Object.assign(new Error("Location availability must be true or false."),{statusCode:400});
      if (Object.hasOwn(entry) && entry.priceDisplay !== null && typeof entry.priceDisplay !== "string") throw Object.assign(new Error("Location price display must be text or null."),{statusCode:400});
    }
  }
  return body;
}
async function save(client, branchIds, tenant, body, current) {
  validateQueuePayload(body);
  // Feature/lifecycle admission only: configuration neither spends nor checks ticket/booking allowance.
  const currentPolicy=await resolver.resolveTenantPolicy(tenant._id,{client,lockPolicy:true,queueTypePolicy:true});
  resolver.assertFeature(currentPolicy,'queue');
  await admission.admit({tenantId:tenant._id,featureKey:"queue",client,lockPolicy:true});
  const previousQueue = current ? Object.fromEntries(SERVICE_FIELDS.map(key=>[key,current[key]])) : null;
  const normalized = normalizeServicePayload({...previousQueue,...body},previousQueue);
  // Never write any booking columns on the queue update path, even unchanged/default values.
  const queueChanges = Object.fromEntries(SERVICE_FIELDS.map(key=>[key,normalized[key]]));
  const service = current ? await services.updateService(current._id,queueChanges,{client}) : await services.createService({tenantId:tenant._id,...queueChanges},{client});
  const locationServices = [];
  for (const entry of body.locationServices || []) {
    const location = await locations.findLocationByTenantAndSlug(tenant._id,entry.locationSlug.trim(),{client});
    if (!location || !location.isActive) throw Object.assign(new Error("An active location in this business is required."),{statusCode:404});
    locationServices.push(await mappings.upsertQueueLocationService({tenantId:tenant._id,locationId:location._id,serviceId:service._id,...entry},{client}));
  }
  await advanceBranchRevisions(client,String(tenant._id),branchIds);
  return {service,locationServices};
}
function createQueueService(tenant,body,{actorUserId}) {
  return catalog.withCatalog(tenant,actorUserId,(client,branches)=>save(client,branches,tenant,body,null));
}
function updateQueueService(tenant,slug,body,{actorUserId}) {
  return catalog.withCatalogService(tenant,slug,actorUserId,(client,branches,current)=>save(client,branches,tenant,body,current));
}
module.exports={createQueueService,updateQueueService,validateQueuePayload,SERVICE_FIELDS,LOCATION_FIELDS};
