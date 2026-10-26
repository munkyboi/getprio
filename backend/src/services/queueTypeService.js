const db = require('../config/db');
const ledger = require('../repositories/resourceLedger');
const receipts = require('../repositories/queueCommandReceipt');
const resolver = require('./entitlementResolver');
const permissions = require('./permissions');
const audit = require('./securityAuditService');
const events = require('./queueEvents');
const workflows = require('./queueWorkflowService');
const minimum = require('./queueResourceMinimumFeasibility');
const {readAuthorizedVendorQueueActor} = require('./vendorQueueTransactionService');
const TYPES = ['simple','resource','workflow'];
const fail = (code,message,statusCode=409) => {throw Object.assign(new Error(message),{code,message,statusCode});};
function capabilities(policy) {
 const simple = policy.lifecycle?.state === 'active' && policy.features?.queue?.enabled === true;
 return {simple,resource:simple && policy.features?.resourceQueue?.enabled === true,workflow:simple && policy.features?.workflowQueue?.enabled === true};
}
function validate(body) {
 if (!body || Object.keys(body).some(key=>!['type','expectedRevision','confirmedFutureOnly','reason'].includes(key)) || !TYPES.includes(body.type) || typeof body.expectedRevision!=='string' || !/^[1-9]\d{0,18}$/.test(body.expectedRevision) || body.confirmedFutureOnly!==true || (body.reason!==undefined && (typeof body.reason!=='string'||body.reason.length>500))) fail('INVALID_COMMAND','Choose a queue type and confirm that it applies to future requests only.',400);
}
async function read(client,scope,{lock=false}={}) {
 const row=(await client.query(`SELECT l.slug,t.slug AS tenant_slug,to_jsonb(l)->>'queue_type' AS queue_type,to_jsonb(l)->>'queue_type_revision' AS revision
 FROM store_locations l JOIN tenants t ON t.id=l.tenant_id WHERE l.id=$2 AND t.id=$1 AND l.is_active AND t.is_active ${lock?'FOR UPDATE OF l':''}`,[scope.tenantId,scope.locationId])).rows[0];
 if(!row)fail('LOCATION_NOT_FOUND','Location not found.',404);
 const policy=await resolver.resolveTenantPolicy(scope.tenantId,{client,lockPolicy:lock,queueTypePolicy:true});
 const caps=capabilities(policy);
 // Configuration readiness never depends on current resource occupancy.
 const rows=(await client.query(`SELECT s.id::text,r.pool_id::text,r.units_required,p.capacity,p.tracking_enabled,
 to_jsonb(p)->>'archived_at' AS archived_at,q.configuration,
 (SELECT count(*)::int FROM resource_pool_members m WHERE m.tenant_id=p.tenant_id AND m.location_id=p.location_id AND m.pool_id=p.id AND m.is_active AND (to_jsonb(m)->>'archived_at') IS NULL) AS active_members
 FROM vendor_services s JOIN location_services ls ON ls.service_id=s.id AND ls.tenant_id=s.tenant_id
 JOIN service_resource_requirements r ON (r.service_id,r.tenant_id,r.location_id)=(s.id,s.tenant_id,ls.location_id)
 JOIN location_resource_pools p ON (p.id,p.tenant_id,p.location_id)=(r.pool_id,r.tenant_id,r.location_id)
 LEFT JOIN queue_service_policies q ON (q.service_id,q.tenant_id,q.location_id)=(s.id,s.tenant_id,ls.location_id)
 WHERE s.tenant_id=$1 AND ls.location_id=$2 AND s.is_active AND ls.is_active`,[scope.tenantId,scope.locationId])).rows;
 const workflow=await workflows.read(client,scope);
 const configured=rows.some(row=>minimum.evaluate(row,rows,{workflow:{mode:'linear',stages:[]}}).requestable);
 const offered=(await client.query('SELECT s.id::text FROM vendor_services s JOIN location_services l ON l.service_id=s.id AND l.tenant_id=s.tenant_id WHERE s.tenant_id=$1 AND l.location_id=$2 AND s.is_active AND l.is_active',[scope.tenantId,scope.locationId])).rows;
 const workflowReady=workflow.mode==='multi_station' && workflow.stages.length>=2 && new Set(workflow.stages.map(stage=>stage.stationId)).size>=2 && workflow.stages.every(stage=>workflow.stations.some(station=>station.stationId===stage.stationId)) && (caps.resource||workflow.stages.every(stage=>stage.resourceRequirement?.kind==='none')) && workflow.stages.every(stage=>stage.serviceIds.some(id=>offered.some(row=>row.id===id)&&(stage.resourceRequirement?.kind==='none'||rows.some(row=>row.id===id&&row.configuration?.assignment?.mode!=='named'&&minimum.evaluate(row,rows,{workflow}).requestable))));

 return {contract:'queue-type-v1',scope:{tenantSlug:row.tenant_slug,locationSlug:row.slug},type:TYPES.includes(row.queue_type)?row.queue_type:'simple',revision:row.revision||'1',futureAdmissionsOnly:true,capabilities:caps,
 readiness:{simple:{ready:true,reason:null},resource:{ready:configured,reason:configured?null:'Configure a service, resource pool and queue policy first.'},workflow:{ready:workflowReady,reason:workflowReady?null:'Configure every station, required stage and resource policy before enabling Workflow Queue.'}},
 notice:'This setting applies to future requests only. Existing requests and reservations keep their original setup.'};
}
async function get(context) {
 const scope={tenantId:String(context.tenant._id),locationId:String(context.location._id),actorUserId:String(context.actorUserId)};
 return db.withTransaction(async client=>{if(!await readAuthorizedVendorQueueActor(client,scope,'tenant.queue.read',{forShare:true}))fail('FORBIDDEN','Queue read access is required.',403);return read(client,scope);});
}
async function put(context,body,operationKey) {
 validate(body);const scope={tenantId:String(context.tenant._id),locationId:String(context.location._id),actorUserId:String(context.actorUserId)};
 let actor,changed=false;
 const result=await ledger.withScopeTransaction({pool:db.pool,...scope,authorize:async(client,locked)=>{
 actor=await readAuthorizedVendorQueueActor(client,locked,'tenant.location.manage',{forShare:true});
 return Boolean(actor&&['owner','admin'].includes(actor.tenantMemberships[0].role)&&permissions.userHasPermission(actor,'tenant.service.manage',{tenantId:scope.tenantId}));
 }},async client=>receipts.execute(client,scope,{operationKey,action:'location_queue_type',target:scope.locationId,payload:body},async()=>{
 const before=await read(client,scope,{lock:true});
 if(before.revision!==body.expectedRevision)fail('STALE_REVISION','The queue setting changed. Refresh and review it again.');
 if(!before.capabilities[body.type])fail('QUEUE_TYPE_NOT_INCLUDED','Your current plan does not include this queue type.',403);
 if(!before.readiness[body.type].ready)fail('QUEUE_TYPE_NOT_READY',before.readiness[body.type].reason);
 const schema=(await client.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='store_locations' AND column_name='queue_type_revision' AND table_schema=current_schema()) AS ready")).rows[0];
 if(!schema?.ready)fail('QUEUE_TYPE_MIGRATION_REQUIRED','Queue type configuration is not available yet.');
 if(before.type!==body.type){
 await client.query('UPDATE store_locations SET queue_type=$3,queue_type_revision=queue_type_revision+1 WHERE tenant_id=$1 AND id=$2',[scope.tenantId,scope.locationId,body.type]);changed=true;
 await audit.record({actorId:scope.actorUserId,actorRole:actor.tenantMemberships[0].role,tenantId:scope.tenantId,action:'vendor.queue_type.update',resourceType:'store_location',resourceId:scope.locationId,outcome:'success',beforeState:{type:before.type,revision:before.revision},afterState:{type:body.type,revision:String(BigInt(before.revision)+1n)},metadata:{futureAdmissionsOnly:true,reason:body.reason||null}},{client});
 }
 return read(client,scope);
 }));
 if(changed)events.publish(context.tenant.slug,{type:'queue-plans-updated',locationId:scope.locationId},{locationId:scope.locationId});
 return result;
}
async function execution(client,scope,{lock=true}={}) {
 const row=(await client.query(`SELECT COALESCE(to_jsonb(l)->>'queue_type','simple') AS type FROM store_locations l WHERE tenant_id=$1 AND id=$2 ${lock?'FOR SHARE':''}`,[scope.tenantId,scope.locationId])).rows[0];
 if(!row||!TYPES.includes(row.type))fail('LOCATION_NOT_FOUND','Queue location not found.',404);
 const policy=await resolver.resolveTenantPolicy(scope.tenantId,{client,lockPolicy:lock,queueTypePolicy:true});
 return {type:row.type,capabilities:capabilities(policy),policy};
}
async function assertConfiguration(client,scope,feature='resource') {
 const state=await execution(client,scope);
 if(!state.capabilities[feature])fail(state.policy.restriction?.code||'QUEUE_TYPE_NOT_INCLUDED',state.policy.restriction?.message||'Your current plan does not include this queue setup.',403);
 return state;
}
async function assertAdmission(client,scope,expectedType='simple') {
 const state=await execution(client,scope);
 if(state.type!==expectedType)fail('QUEUE_TYPE_ADMISSION_REQUIRED',`This location uses ${state.type} requests. Use its supported request flow.`,409);
 if(!state.capabilities[state.type])fail(state.policy.restriction?.code||'QUEUE_TYPE_NOT_INCLUDED',state.policy.restriction?.message||'Your current plan does not include new requests for this queue type.',403);
 return state;
}
async function assertAmendment(client,scope,oldItems,newItems,workflowMode) {
 const state=await execution(client,scope);
 const expected=workflowMode==='multi_station'?'workflow':'resource';
 const allowed=state.type===expected && state.capabilities[expected] && (!newItems.some(item=>item.resource?.known)||state.capabilities.resource);
 if(allowed)return;
 for(const item of newItems){
  const old=oldItems.find(value=>(value.selectionId||value.lineId)===(item.selectionId||item.lineId));
  if(!old||old.serviceId!==item.serviceId||old.stageId!==item.stageId||old.resource?.poolId!==item.resource?.poolId||old.resourceMemberId!==item.resourceMemberId||item.quantity>old.quantity||item.durationMinutes>old.durationMinutes||Number(item.resource?.totalUnits||0)>Number(old.resource?.totalUnits||0))fail('QUEUE_TYPE_WIND_DOWN_ONLY','This request can be reduced or resolved, but its original resources and duration cannot be extended on the current plan.',403);
 }
}
module.exports={get,put,read,validate,capabilities,execution,assertConfiguration,assertAdmission,assertAmendment};
