const { createHash } = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

// The caller must already own the location-first transaction and current grant.
async function execute(client, scope, { operationKey, action, target, payload }, mutate) {
  if (typeof operationKey !== 'string' || !/^[\x21-\x7e]{1,120}$/u.test(operationKey)) {
    throw Object.assign(new Error('Idempotency-Key is required.'), { statusCode: 400, code: 'INVALID_COMMAND' });
  }
  const hash = createHash('sha256').update(JSON.stringify(canonical({ action, target, payload }))).digest('hex');
  const args = [scope.tenantId, scope.locationId, scope.actorUserId, operationKey];
  const prior = (await client.query('SELECT payload_hash,result FROM queue_plan_command_receipts WHERE tenant_id=$1 AND location_id=$2 AND actor_user_id=$3 AND operation_key=$4', args)).rows[0];
  if (prior) {
    if (prior.payload_hash !== hash) throw Object.assign(new Error('This key was used for a different command.'), { statusCode: 409, code: 'IDEMPOTENCY_CONFLICT' });
    return prior.result;
  }
  const result = await mutate();
  await client.query('INSERT INTO queue_plan_command_receipts(tenant_id,location_id,actor_user_id,operation_key,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)', [...args, hash, JSON.stringify(result)]);
  return result;
}

module.exports = { execute };
