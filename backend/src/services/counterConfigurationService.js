const db = require("../config/db");
const ledger = require("../repositories/resourceLedger");
const counters = require("../repositories/serviceCounters");
const assignments = require("../repositories/tenantMembershipLocations");
const billing = require("../repositories/billing");
const { readAuthorizedVendorQueueActor } = require("./vendorQueueTransactionService");

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}
function id(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) fail("Invalid counter assignment identifier.");
  const result = String(value ?? "");
  if (!/^[1-9]\d{0,18}$/u.test(result) || BigInt(result) > 9223372036854775807n) fail("Invalid counter assignment identifier.");
  return result;
}

// Preserve getTenantEntitlements: active subscription only, subscription JSON
// overrides plan JSON. Commercial overrides do not participate in this quota.
// NOWAIT prevents subscription-first writers waiting for tenant FK/grant locks
// from forming a cycle with this location-first administration transaction.
async function counterLimit(client, tenantId) {
  await client.query("SELECT id FROM tenant_subscriptions WHERE tenant_id=$1 ORDER BY id FOR UPDATE NOWAIT", [tenantId]);
  const subscription = await billing.getActiveSubscriptionByTenantId(tenantId, { client });
  if (subscription?.status !== "active") return 0;
  // Read policy from the locking statement itself. An absent plan locks no
  // row, so a second read could consume a newly inserted, unlocked plan.
  const plan = (await client.query("SELECT slug,entitlements FROM subscription_plans WHERE slug=$1 FOR SHARE NOWAIT", [subscription.planSlug])).rows[0];
  return Number({ ...plan?.entitlements, ...subscription.entitlements }.counters || 0);
}

async function lockAssignees(client, tenantId, userIds) {
  if (!Array.isArray(userIds)) fail("Select valid counter assignments.");
  const ids = [...new Set(userIds.map(id))].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  if (!ids.length) return ids;
  const result = await client.query(`SELECT u.id::text FROM users u JOIN tenant_memberships m
    ON m.user_id=u.id AND m.tenant_id=$1 AND m.is_active=TRUE
    WHERE u.id=ANY($2::bigint[]) AND u.deletion_requested_at IS NULL
      AND u.platform_access_suspended_at IS NULL AND m.role IN ('owner','admin','staff')
    ORDER BY u.id FOR SHARE OF u,m`, [tenantId, ids]);
  if (result.rows.length !== ids.length) fail("Select active members of this vendor for counter assignments.");
  return ids;
}

async function saveAssignments(client, scope, counter, userIds) {
  const ids = await lockAssignees(client, scope.tenantId, userIds);
  const previous = [...counter.assignedUserIds].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  const changed = JSON.stringify(previous) !== JSON.stringify(ids);
  if (changed) await counters.replaceAssignments(counter._id, ids, { client });
  // Explicit branch grants created by the existing counter form are retained
  // when a counter assignment is removed; do not invent revocation semantics.
  const missing = await client.query(`SELECT m.id FROM tenant_memberships m
    WHERE m.tenant_id=$1 AND m.user_id=ANY($2::bigint[]) AND m.role='staff' AND m.is_active=TRUE
      AND NOT EXISTS (SELECT 1 FROM tenant_membership_locations a
        WHERE a.tenant_membership_id=m.id AND a.location_id=$3)`, [scope.tenantId, ids, scope.locationId]);
  await assignments.ensureUserLocationAssignments({ userIds: ids, tenantId: scope.tenantId,
    locationId: scope.locationId, assignedByUserId: scope.actorUserId }, { client });
  return changed || missing.rows.length > 0;
}

async function saveCounter(client, scope, current, data) {
  const isActive = data.isActive !== false;
  // Creation keeps the existing quota check even for inactive counters.
  if (!current || (isActive && !current.isActive)) {
    const limit = await counterLimit(client, scope.tenantId);
    const existing = await counters.listCountersByLocationId(scope.locationId, { client });
    if (existing.filter(counter => counter.isActive).length >= limit) fail("Counter limit exceeded for this subscription plan.", 403);
  }
  const changed = !current || current.name !== data.name || current.slug !== data.slug || current.isActive !== isActive;
  let counter = current;
  if (!current) counter = await counters.createCounter({ ...scope, name: data.name, slug: data.slug, isActive }, { client });
  else if (changed) counter = await counters.updateCounter(current._id, { name: data.name, slug: data.slug, isActive }, { client });
  const assignmentsChanged = await saveAssignments(client, scope, current || counter, data.assignedUserIds || []);
  // Existing write responses return no aggregated assignedUserIds.
  return { counter: { ...counter, assignedUserIds: [] }, changed: changed || assignmentsChanged };
}

async function applyMutation(client, scope, { action, counterSlug, data }) {
  const current = action === "create" ? null
    : await counters.findCounterByLocationAndSlug(scope.locationId, counterSlug, { client });
  if (action !== "create" && (!current || current.tenantId !== scope.tenantId)) fail("Counter not found.", 404);
  let result = { changed: true };
  if (action === "delete") {
    // FK SET NULL preserves existing legacy called-ticket attribution.
    // No allocation/reservation release is performed by administration.
    await counters.deleteCounter(current._id, { client });
  } else result = await saveCounter(client, scope, current, data);
  if (result.changed) await client.query("UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2", [scope.tenantId, scope.locationId]);
  return result.counter;
}

function createCounterConfigurationService({ pool = db.pool } = {}) {
  async function mutate({ tenantId, locationId, actorUserId, action, counterSlug, data = {} }) {
    const scope = { tenantId: id(tenantId), locationId: id(locationId), actorUserId: id(actorUserId) };
    if (!["create", "update", "delete"].includes(action)) fail("Invalid counter action.");
    try {
      return await ledger.withScopeTransaction({ pool, ...scope, locationKeyShareCompatible: true,
        authorize: async (client, current) => {
          // Fence FK-backed subscription insertion/replacement, including an
          // absent subscription. Shared locks would allow an unseen new row.
          await client.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [current.tenantId]);
          return Boolean(await readAuthorizedVendorQueueActor(client, current, "tenant.counter.manage", { forShare: true }));
        }
      }, async client => {
        return applyMutation(client, scope, { action, counterSlug, data });
      });
    } catch (error) {
      if (error.code === "55P03") throw Object.assign(new Error("Counter policy is changing. Reload before saving."), { statusCode: 409, code: "COUNTER_POLICY_BUSY" });
      throw error;
    }
  }
  return { mutate };
}
module.exports = { createCounterConfigurationService, ...createCounterConfigurationService() };
