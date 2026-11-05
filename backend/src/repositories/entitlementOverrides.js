const db = require("../config/db");
function client(options={}) { return options.client || db.pool; }

async function create(input, options={}) {
  if (!options.client) return db.withTransaction((transactionClient) => create(input, { client: transactionClient }));
  const queryClient = client(options);
  const subscription = await queryClient.query(
    `SELECT id FROM tenant_subscriptions WHERE id=$2 AND tenant_id=$1 FOR UPDATE`,
    [input.tenantId, input.subscriptionId]
  );
  if (!subscription.rows[0]) return null;
  await queryClient.query(
    `UPDATE tenant_entitlement_overrides
     SET revoked_at=NOW(), revoked_by_user_id=$3
     WHERE subscription_id=$1 AND policy_key=$2 AND revoked_at IS NULL`,
    [input.subscriptionId, input.policyKey, input.actorId || null]
  );
  const result = await queryClient.query(
    `INSERT INTO tenant_entitlement_overrides (subscription_id,policy_key,value,reason,created_by_user_id,expires_at)
     VALUES ($1,$2,$3::jsonb,$4,$5,$6)
     RETURNING *`, [input.subscriptionId,input.policyKey,JSON.stringify(input.value),input.reason,input.actorId || null,input.expiresAt || null]
  );
  return result.rows[0] || null;
}

async function revoke(input, options={}) {
  const result = await client(options).query(
    `UPDATE tenant_entitlement_overrides o SET revoked_at=NOW(),revoked_by_user_id=$3
     FROM tenant_subscriptions s WHERE o.id=$1 AND o.subscription_id=s.id AND s.tenant_id=$2 AND o.revoked_at IS NULL RETURNING o.*`,
    [input.overrideId,input.tenantId,input.actorId || null]
  );
  return result.rows[0] || null;
}

async function listForTenant(tenantId, options={}) {
  const result = await client(options).query(
    `SELECT o.* FROM tenant_entitlement_overrides o
     JOIN tenant_subscriptions s ON s.id=o.subscription_id
     WHERE s.tenant_id=$1 ORDER BY o.created_at DESC`,
    [tenantId]
  );
  return result.rows;
}
module.exports={create,listForTenant,revoke};
