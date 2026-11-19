const { createHash } = require('node:crypto');
function prepare(options){
 if(options.operationKey===undefined)return null;
 if(typeof options.operationKey!=='string'||!/^[\x21-\x7e]{1,120}$/u.test(options.operationKey))throw Object.assign(new Error('Provide a bounded Idempotency-Key.'),{statusCode:400,code:'INVALID_IDEMPOTENCY_KEY'});
 const command={action:'legacy_call_next',counterId:options.serviceCounter?._id==null?null:String(options.serviceCounter._id),counterSlug:options.counterSlug||null,expectedCounterId:options.expectedCounterId??null,queueDateKey:options.queueDateKey||null};
 return {operationKey:options.operationKey,hash:createHash('sha256').update(JSON.stringify(command)).digest('hex')};
}
async function read(client,scope,receipt){
 if(!receipt)return null;
 const row=(await client.query('SELECT payload_hash,result FROM queue_counter_command_receipts WHERE tenant_id=$1 AND location_id=$2 AND actor_user_id=$3 AND operation_key=$4',[scope.tenantId,scope.locationId,scope.actorUserId,receipt.operationKey])).rows[0];
 if(!row)return null;
 if(row.payload_hash!==receipt.hash)throw Object.assign(new Error('This key was used for a different counter command.'),{statusCode:409,code:'IDEMPOTENCY_CONFLICT'});
 return {...row.result,replayed:true};
}
async function write(client,scope,receipt,result){if(receipt)await client.query("INSERT INTO queue_counter_command_receipts(tenant_id,location_id,actor_user_id,operation_key,command,payload_hash,result) VALUES($1,$2,$3,$4,'legacy_call_next',$5,$6::jsonb)",[scope.tenantId,scope.locationId,scope.actorUserId,receipt.operationKey,receipt.hash,JSON.stringify(result)]);return result;}
module.exports={prepare,read,write};
