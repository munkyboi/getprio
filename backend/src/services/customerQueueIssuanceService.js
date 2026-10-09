const resourceLedger = require("../repositories/resourceLedger");
const queueFeeService = require("./queueFeeService");
const queueFees = require("../repositories/queueFees");
const entitlementAdmission = require("./entitlementAdmissionService");

async function withCustomerQueueIssuance({ pool, tenant, location, userId }, callback) {
  if (!location) throw Object.assign(new Error("Location not found."), { statusCode: 404 });
  // Existing ticket persistence still converts IDs to numbers. Fail closed
  // before it can round an otherwise valid PostgreSQL BIGINT identity.
  for (const value of [tenant._id, location._id, userId].filter(value => value != null)) {
    if (!Number.isSafeInteger(Number(value))) {
      throw Object.assign(new Error("Queue identity requires reconciliation."), { statusCode: 400 });
    }
  }
  let currentTenant;
  let currentLocation;
  return resourceLedger.withTicketIssuanceTransaction({
    pool, tenantId: String(tenant._id), locationId: String(location._id),
    actorUserId: userId == null ? null : String(userId),
    authorize: async (client, scope) => {
      const branch = (await client.query(`SELECT is_active,slug,timezone,queue_lifecycle_mode
        FROM store_locations WHERE tenant_id=$1 AND id=$2`, [scope.tenantId, scope.locationId])).rows[0];
      const policy = (await client.query(`SELECT is_active,auto_pause_enabled,auto_pause_threshold,queue_prefix
        FROM tenants WHERE id=$1 FOR SHARE`, [scope.tenantId])).rows[0];
      if (!branch?.is_active || !policy?.is_active) {
        throw Object.assign(new Error("This business or location is inactive."), { statusCode: 409 });
      }
      if (!["legacy", "shadow", "enforced"].includes(branch.queue_lifecycle_mode)) {
        throw Object.assign(new Error("Queue mode requires reconciliation."), { statusCode: 409 });
      }
      if (scope.actorUserId) {
        const customer = await client.query(`SELECT id FROM users WHERE id=$1
          AND deletion_requested_at IS NULL AND platform_access_suspended_at IS NULL FOR SHARE`, [scope.actorUserId]);
        if (!customer.rows.length) return false;
      }
      const subscription = await queueFeeService.assertTenantCanAcceptCustomerJoins(scope.tenantId, { client, forShare: true });
      await entitlementAdmission.admit({ tenantId: scope.tenantId, featureKey: "queue", client });
      const fee = await queueFees.findQueueFeeByPlan(subscription.planSlug, { client, forShare: true });
      if (!fee) throw Object.assign(new Error("Queue fee policy requires reconciliation."), { statusCode: 409 });
      if (fee?.enabled && Number(fee.amountCents) > 0) {
        throw Object.assign(new Error("This queue now requires payment. Restart your join to continue to checkout."), {
          statusCode: 409, code: "QUEUE_PAYMENT_REQUIRED"
        });
      }
      currentTenant = { ...tenant, autoPauseEnabled: policy.auto_pause_enabled,
        autoPauseThreshold: policy.auto_pause_threshold, queuePrefix: policy.queue_prefix };
      currentLocation = { ...location, slug: branch.slug, timezone: branch.timezone,
        queueLifecycleMode: branch.queue_lifecycle_mode };
      return true;
    }
  }, client => callback(client, { tenant: currentTenant, location: currentLocation }));
}

module.exports = { withCustomerQueueIssuance };
