function invalid(message,statusCode=400,code='INVALID_COUNTER_BINDING'){throw Object.assign(new Error(message),{statusCode,code});}
function validate(body,{call=false}={}){
 const hasId=Object.hasOwn(body||{},'expectedCounterId'),hasSlug=Object.hasOwn(body||{},'counterSlug');
 if(!hasId&&(!hasSlug||call))return false;
 if(!hasId||!hasSlug||typeof body.expectedCounterId!=='string'||!/^[1-9]\d{0,18}$/u.test(body.expectedCounterId)||BigInt(body.expectedCounterId)>9223372036854775807n||typeof body.counterSlug!=='string'||!body.counterSlug.trim()||body.counterSlug.length>160)invalid('Provide both the selected counter slug and expected counter ID.');
 return true;
}
async function assert(client,scope,ticket,body,{status="called"}={}){
 if(!validate(body))return;
 const counter=(await client.query('SELECT id::text,slug FROM service_counters WHERE tenant_id=$1 AND location_id=$2 AND id=$3 FOR SHARE',[scope.tenantId,scope.locationId,body.expectedCounterId])).rows[0];
 if(!counter||counter.slug!==body.counterSlug)invalid('The selected counter changed. Refresh before continuing.',409,'COUNTER_CONTEXT_CHANGED');
 if(!ticket||ticket.status!==status||String(ticket.serviceCounterId)!==counter.id)invalid('This ticket is no longer called at the selected counter.',409,'CURRENT_TICKET_CHANGED');
 const current=(await client.query("SELECT id FROM tickets WHERE tenant_id=$1 AND location_id=$2 AND id=$3 AND service_counter_id=$4 AND status=$5 FOR UPDATE",[scope.tenantId,scope.locationId,ticket._id,counter.id,status])).rows[0];
 if(!current)invalid('The selected counter ticket changed. Refresh before continuing.',409,'CURRENT_TICKET_CHANGED');
}
module.exports={validate,assert};
