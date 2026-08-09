const db = require("../config/db");
const { buildPayloadDigest } = require("./privilegedTransactionService");

async function queryState(action, target, options = {}) {
  const client = options.client || db.pool;
  const lock = options.lock ? " FOR UPDATE" : "";
  switch (action) {
    case "plan.defaults.publish":
      return (await client.query(`SELECT slug,policy_revision,entitlements,updated_at FROM subscription_plans WHERE slug=$1${lock}`, [target])).rows;
    case "queue.fees.publish":
      return (await client.query(`SELECT plan_slug,enabled,amount_cents,currency,updated_at FROM queue_fee_settings ORDER BY plan_slug${lock}`)).rows;
    case "subscription.transition":
    case "subscription.transition.request":
      return (await client.query(`SELECT id,plan_slug,status,current_period_start,current_period_end,updated_at FROM tenant_subscriptions WHERE tenant_id=$1 AND status IN ('active','past_due','unpaid','suspended') ORDER BY updated_at${lock}`, [target])).rows;
    case "subscription.suspend":
      return (await client.query(`SELECT id,tenant_id,plan_slug,status,updated_at FROM tenant_subscriptions WHERE id=$1${lock}`, [target])).rows;
    case "credit.pack.publish":
      return (await client.query(`SELECT id,code,state,current_revision,updated_at FROM usage_credit_packs WHERE code=$1${lock}`, [target])).rows;
    case "credit.grant":
      return (await client.query(`SELECT id,plan_slug,status,current_period_end,updated_at FROM tenant_subscriptions WHERE tenant_id=$1 AND status IN ('active','past_due','unpaid','suspended') ORDER BY updated_at${lock}`, [target])).rows;
    case "credit.revoke":
      return (await client.query(`SELECT id,tenant_id,resource_key,granted_units,revoked_units,frozen_units,status,updated_at FROM usage_credit_lots WHERE id=$1${lock}`, [target])).rows;
    case "credit.refund.resolve":
    case "credit.dispute.open":
      return (await client.query(`SELECT id,tenant_id,status,amount_cents,currency,updated_at FROM usage_credit_purchases WHERE id=$1${lock}`, [target])).rows;
    case "credit.dispute.resolve":
      return (await client.query(`SELECT id,purchase_id,status,resolved_at FROM usage_credit_disputes WHERE provider_dispute_id=$1${lock}`, [target])).rows;
    case "entitlement.override.publish":
      return (await client.query(`SELECT o.id,o.subscription_id,o.policy_key,o.value,o.expires_at,o.revoked_at FROM tenant_entitlement_overrides o JOIN tenant_subscriptions s ON s.id=o.subscription_id WHERE s.tenant_id=$1 AND o.revoked_at IS NULL ORDER BY o.id${lock}`, [target])).rows;
    case "entitlement.override.revoke":
      return (await client.query(`SELECT id,subscription_id,policy_key,value,expires_at,revoked_at FROM tenant_entitlement_overrides WHERE id=$1${lock}`, [target])).rows;
    case "allowance.reverse":
      return (await client.query(`SELECT id,usage_account_id,allowance_period_id,operation_type,signed_units,created_at FROM allowance_operations WHERE id=$1${lock}`, [target])).rows;
    case "allowance.reconcile":
      return (await client.query(`SELECT id,resource_key,created_at FROM usage_accounts WHERE tenant_id=$1 ORDER BY id${lock}`, [target])).rows;
    case "credit.checkout":
    case "credit.refund.request":
    case "subscription.checkout":
      return (await client.query(`SELECT id,plan_slug,status,current_period_end,updated_at FROM tenant_subscriptions WHERE tenant_id=$1 AND status IN ('active','past_due','unpaid','suspended') ORDER BY updated_at${lock}`, [target])).rows;
    default:
      throw Object.assign(new Error("Server preview state is not defined for this action."), { statusCode: 400, code: "PREVIEW_ACTION_UNSUPPORTED" });
  }
}

async function resolvePreview({ action, target, payload }, options = {}) {
  const state = await queryState(String(action), String(target), options);
  const revision = `server-${buildPayloadDigest({ action: String(action), target: String(target), state }).slice(0, 32)}`;
  return { action: String(action), target: String(target), payload: payload || {}, state, revision };
}

module.exports = { resolvePreview };
