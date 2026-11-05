const db = require("../config/db");
const ledger = require("../repositories/resourceLedger");
const tenants = require("../repositories/tenants");
const users = require("../repositories/users");
const permissions = require("./permissions");
const { readAuthorizedVendorQueueActor } = require("./vendorQueueTransactionService");

const QUEUE_POLICY_FIELDS = Object.freeze(["queuePrefix", "averageServiceMinutes", "autoPauseEnabled",
  "autoPauseThreshold", "autoResumeEnabled", "autoResumeVacancyPercent"]);
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function identifier(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) fail("Invalid settings identifier.");
  const text = String(value ?? "");
  if (!/^[1-9]\d{0,18}$/.test(text) || BigInt(text) > 9223372036854775807n) fail("Invalid settings identifier.");
  return text;
}
function createTenantQueueSettingsService({ pool = db.pool, tenantRepository = tenants, userRepository = users } = {}) {
  async function update({ tenantId, actorId, locationSlug, requiresContactPermission = false, resolveLocation, prepare }) {
    const vendorId = identifier(tenantId);
    const userId = identifier(actorId);
    if (typeof prepare !== "function" || typeof resolveLocation !== "function") fail("Settings require trusted preparation and location resolution.");
    return ledger.withTenantCatalogTransaction({ pool, tenantId: vendorId, actorUserId: userId,
      authorize: async (client, scope) => {
        // Acquire the profile write lock before share-held authorization. Two
        // requests for the same user's different vendors must not upgrade two
        // compatible user SHARE locks into mutually waiting profile writes.
        await client.query("SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE", [userId]);
        const actor = await readAuthorizedVendorQueueActor(client, scope, "tenant.settings.manage", { forShare: true });
        return Boolean(actor && (!requiresContactPermission || permissions.userHasPermission(actor,
          "tenant.settings.manage_contact", { tenantId: vendorId })));
      }
    }, async (client, branchIds) => {
      const options = { client };
      const tenant = await tenantRepository.findTenantById(vendorId, options);
      const actor = await userRepository.findUserById(userId, options);
      const location = await resolveLocation(tenant, locationSlug, options);
      if (location && !branchIds.includes(identifier(location._id))) fail("Location not found.", 404);
      const { tenantChanges, ownerChanges } = await prepare(tenant, actor, client);
      const policyChanged = QUEUE_POLICY_FIELDS.some(key => Object.hasOwn(tenantChanges, key) && !Object.is(tenantChanges[key], tenant[key]));
      const updatedTenant = await tenantRepository.updateTenant(vendorId, tenantChanges, options);
      const owner = await userRepository.updateUser(userId, ownerChanges, options);
      if (policyChanged) await ledger.advanceBranchRevisions(client, vendorId, branchIds);
      return { tenant: updatedTenant, owner, location };
    });
  }
  return { update };
}
module.exports = { ...createTenantQueueSettingsService(), createTenantQueueSettingsService };
