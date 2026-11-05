const { createHash } = require("node:crypto");
const db = require("../config/db");
const repository = require("../repositories/resourceCapacity");
const resourceLedger = require("../repositories/resourceLedger");
const { readAuthorizedVendorQueueActor } = require("./vendorQueueTransactionService");
const permissions = require("./permissions");
const { assertPublicTextFieldsAllowed } = require("./contentModeration");

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}
function id(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/u.test(value)) fail("Select a valid resource or service.");
  if (BigInt(value) > 9223372036854775807n) fail("Select a valid resource or service.");
  return value;
}
function units(value) {
  if (!Number.isInteger(value) || value < 1 || value > 100) fail("Units must be a whole number from 1 to 100.");
  return value;
}
async function read(scope, client) {
  const configuration = await repository.listDraftConfiguration(scope, { client });
  const services = await client.query(`
    SELECT services.id::text, services.name FROM vendor_services AS services
    JOIN location_services AS locations ON locations.service_id = services.id AND locations.tenant_id = services.tenant_id
    WHERE services.tenant_id = $1 AND locations.location_id = $2
      AND services.is_active = TRUE AND locations.is_active = TRUE ORDER BY services.name, services.id
  `, [scope.tenantId, scope.locationId]);
  const version = createHash("sha256").update(JSON.stringify(configuration)).digest("hex");
  return { ...configuration, version, services: services.rows, trackingAvailable: false };
}
async function getConfiguration(scope) {
  return db.withTransaction(async (client) => {
    // Share the branch lock with configuration writers for a coherent version.
    const branch = await client.query("SELECT id FROM store_locations WHERE tenant_id = $1 AND id = $2 FOR SHARE", [scope.tenantId, scope.locationId]);
    if (!branch.rows[0]) fail("Location not found.", 404);
    if (!await authorizeConfiguration(client, scope)) fail("Resource operation is not authorized.", 403);
    return read(scope, client);
  });
}
async function authorizeConfiguration(client, scope) {
  // Match staff/Platform membership changes: tenant before user and membership.
  await client.query("SELECT id FROM tenants WHERE id = $1 FOR SHARE", [scope.tenantId]);
  const actor = await readAuthorizedVendorQueueActor(client, scope, "tenant.location.manage", { forShare: true });
  return Boolean(actor && permissions.userHasPermission(actor, "tenant.service.manage", { tenantId: scope.tenantId }));
}
async function savePool(scope, body, current, client) {
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120) fail("Resource name must contain 1 to 120 characters.");
  const name = body.name.trim();
  const capacity = units(body.capacity);
  assertPublicTextFieldsAllowed({ name });
  if (body.poolId === undefined) {
    if (current.pools.length >= 50) fail("A location supports up to 50 resource pools.");
    await repository.createDraftPool(scope, { name, capacity }, { client });
    return true;
  }
  const poolId = id(body.poolId);
  if (!current.pools.some((item) => item.id === poolId)) fail("Resource pool not found at this location.", 404);
  if (current.requirements.some((item) => item.pool_id === poolId && item.units_required > capacity)) fail("Capacity cannot be below an existing service requirement.");
  const updated = await client.query(`UPDATE location_resource_pools SET name = $4, capacity = $5, revision = revision + 1
    WHERE tenant_id = $1 AND location_id = $2 AND id = $3 AND tracking_enabled = FALSE`, [scope.tenantId, scope.locationId, poolId, name, capacity]);
  if (updated.rowCount !== 1) fail("Resource configuration changed. Reload before saving.", 409);
  return true;
}
async function saveRequirement(scope, body, current, client) {
  const serviceId = id(body.serviceId);
  // Removal is also available for services deactivated after a mapping was saved.
  if (body.action === "removeRequirement") {
    const removed = await client.query("DELETE FROM service_resource_requirements WHERE tenant_id = $1 AND location_id = $2 AND service_id = $3", [scope.tenantId, scope.locationId, serviceId]);
    return removed.rowCount > 0;
  }
  if (!current.services.some((service) => service.id === serviceId)) fail("Select an active service offered at this location.");
  const service = await client.query(`SELECT services.id FROM vendor_services AS services
    JOIN location_services AS locations ON locations.service_id = services.id AND locations.tenant_id = services.tenant_id
    WHERE services.tenant_id = $1 AND locations.location_id = $2 AND services.id = $3
      AND services.is_active = TRUE AND locations.is_active = TRUE FOR SHARE OF services, locations`,
  [scope.tenantId, scope.locationId, serviceId]);
  if (!service.rows[0]) fail("Service availability changed. Reload before saving.", 409);
  const poolId = id(body.poolId);
  const unitsRequired = units(body.unitsRequired);
  const pool = current.pools.find((item) => item.id === poolId);
  if (!pool || unitsRequired > pool.capacity) fail("Select a resource pool with enough capacity.");
  if (!current.requirements.some((item) => item.service_id === serviceId) && current.requirements.length >= 500) fail("A location supports up to 500 service requirements.");
  await repository.setDraftRequirement(scope, { serviceId, poolId, unitsRequired }, { client });
  return true;
}
async function saveConfiguration(scope, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("Resource configuration is required.");
  const actions = {
    pool: ["action", "version", "poolId", "name", "capacity"],
    requirement: ["action", "version", "serviceId", "poolId", "unitsRequired"],
    removeRequirement: ["action", "version", "serviceId"]
  };
  const allowed = Object.hasOwn(actions, body.action) ? actions[body.action] : null;
  if (!allowed || Object.keys(body).some((key) => !allowed.includes(key))) fail("Unsupported resource configuration fields.");
  if (typeof body.version !== "string" || !/^[a-f0-9]{64}$/u.test(body.version)) fail("Reload resource configuration before saving.");
  return resourceLedger.withScopeTransaction({
    pool: db.pool, ...scope, locationKeyShareCompatible: true,
    authorize: authorizeConfiguration
  }, async (client) => {
    const current = await read(scope, client);
    if (current.version !== body.version) fail("Resource configuration changed. Reload and review it before saving.", 409);
    const changed = body.action === "pool"
      ? await savePool(scope, body, current, client)
      : await saveRequirement(scope, body, current, client);
    if (changed) await client.query("UPDATE resource_ledger_scopes SET revision = revision + 1 WHERE tenant_id = $1 AND location_id = $2", [scope.tenantId, scope.locationId]);
    return read(scope, client);
  }).catch((error) => {
    if (error.code === "23505") fail("A resource pool with that name already exists at this location.", 409);
    if (error.code === "23503") fail("The service or resource changed. Reload before saving.", 409);
    throw error;
  });
}
module.exports = { getConfiguration, saveConfiguration };
