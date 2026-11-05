const hours = require('./queueServiceHoursService');
const {performance} = require('node:perf_hooks');
const NOT_ENFORCED = Object.freeze({status:'not_enforced',reason:null,requiredDurationMinutes:null,serviceHoursWindow:null,nextChangeAt:null});
const UNKNOWN = {code:'STORE_HOURS_UNAVAILABLE',message:'The request hours could not be verified. Refresh before calling this request.'};
function evaluate(plan,workflow,attempts,window) {
  let minutes=null;
  try {
    if(hours.provenance(plan?.items)==='historical')return {...NOT_ENFORCED};
    const current=attempts.find(stage=>stage.id===plan.stage_attempt_id&&stage.stage_id===plan.stage_id);
    if(!current)throw Error('Current stage missing');
    minutes=hours.remainingDuration(plan.items,workflow,attempts,current);
    hours.assertFits(window,minutes);
    return {status:'fits',reason:null,requiredDurationMinutes:minutes,serviceHoursWindow:window,
      // Exact closing is allowed. Eligibility changes on the following millisecond.
      nextChangeAt:new Date(new Date(window.closesAt).getTime()-minutes*60000+1).toISOString()};
  } catch(error) {
    const noFit=error.code==='SERVICE_DURATION_EXCEEDS_STORE_HOURS';
    return {status:noFit?'does_not_fit':'unavailable',reason:noFit?{code:error.code,message:error.message}:UNKNOWN,
      requiredDurationMinutes:minutes,serviceHoursWindow:window||null,nextChangeAt:null};
  }
}
function blocks(value){return value?.status==='does_not_fit'||value?.status==='unavailable';}
async function readMany(client,scope,plans,{window,getWindow}={}) {
  const result=new Map();const enforced=[];
  for(const plan of plans){try{if(hours.provenance(plan.items)==='historical'){result.set(String(plan.ticket_id),{...NOT_ENFORCED});continue;}}catch{/* Malformed provenance must stay in the enforced eligibility path. */}enforced.push(plan);}
  if(!enforced.length)return result;
  window=window||await (getWindow?getWindow():hours.readWindow(client,scope));
  const ids=enforced.map(plan=>String(plan.ticket_id));
  const workflows=(await client.query('SELECT revision::text,mode,stations,stages FROM queue_workflow_versions WHERE tenant_id=$1 AND location_id=$2 AND revision::text=ANY($3::text[])',
    [scope.tenantId,scope.locationId,[...new Set(enforced.map(plan=>String(plan.workflow_configuration_revision)))]] )).rows;
  const stages=(await client.query(`SELECT DISTINCT ON(ticket_id,stage_id) * FROM queue_stage_attempts WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=ANY($3::bigint[]) ORDER BY ticket_id,stage_id,attempt DESC`,[scope.tenantId,scope.locationId,ids])).rows;
  for(const plan of enforced){const required=new Set(Array.isArray(plan.items)?plan.items.map(item=>item?.stageId):[]);
    result.set(String(plan.ticket_id),evaluate(plan,workflows.find(row=>String(row.revision)===String(plan.workflow_configuration_revision)),
      stages.filter(stage=>String(stage.ticket_id)===String(plan.ticket_id)&&required.has(stage.stage_id)&&stage.state!=='superseded'),window));}
  return result;
}
async function read(client,scope,plan,options){return (await readMany(client,scope,[plan],options)).get(String(plan.ticket_id));}
async function forTickets(client,scope,ticketIds){
  const plans=(await client.query('SELECT ticket_id::text,items,workflow_configuration_revision::text,stage_id,stage_attempt_id FROM ticket_service_plans WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=ANY($3::bigint[])',[scope.tenantId,scope.locationId,ticketIds])).rows;
  const values=await readMany(client,scope,plans);
  return new Map(ticketIds.map(id=>[String(id),values.get(String(id))||{...NOT_ENFORCED}]));
}
// Signature intentionally excludes DB observation/countdown jitter. It represents
// eligibility only; normal queue mutations already carry their own scoped hint.
function signature(entries,complete){return JSON.stringify({complete,entries:entries.map(([id,value])=>[String(id),value.status,value.reason?.code||null,value.requiredDurationMinutes,value.serviceHoursWindow?.status||null,value.serviceHoursWindow?.opensAt||null,value.serviceHoursWindow?.closesAt||null])});}
async function sample(client,scope){
  const started=performance.now();
  const window=await hours.readWindow(client,scope);
  const now=new Date(window.observedAt).getTime();
  const digest=require('node:crypto').createHash('sha256');
  let cursor='0',count=0,next=null;
  for(;;){
    const rows=(await client.query(`SELECT p.ticket_id::text,p.items,p.workflow_configuration_revision::text,p.stage_id,p.stage_attempt_id FROM tickets t JOIN ticket_service_plans p ON(p.tenant_id,p.location_id,p.ticket_id)=(t.tenant_id,t.location_id,t.id) WHERE t.tenant_id=$1 AND t.location_id=$2 AND t.status='waiting' AND t.id>$3::bigint ORDER BY t.id LIMIT 1001`,[scope.tenantId,scope.locationId,cursor])).rows;
    const batch=rows.slice(0,1000);
    const entries=[...await readMany(client,scope,batch,{window})];
    digest.update(signature(entries,true));
    for(const [,value] of entries){const at=new Date(value.nextChangeAt).getTime();if(Number.isFinite(at)&&at>now&&(next===null||at<next))next=at;}
    count+=batch.length;
    if(performance.now()-started>2000)
      return {signature:null,observedAt:window.observedAt,nextChangeAt:null,complete:false};
    if(rows.length<=1000)return {signature:digest.digest('hex'),observedAt:window.observedAt,nextChangeAt:next===null?null:new Date(next).toISOString(),complete:true};
    // Never advertise a healthy unchanged stream from a partial scope. If the
    // complete batched scan exceeds this per-connection work budget, the stream
    // closes and the consumer resumes its existing recovery polling.
    if(count>=10000)
      return {signature:null,observedAt:window.observedAt,nextChangeAt:null,complete:false};
    cursor=String(batch[batch.length-1].ticket_id);
  }
}

module.exports={NOT_ENFORCED,evaluate,blocks,read,readMany,forTickets,signature,sample};
