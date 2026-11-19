const db=require('../config/db');
const ledger=require('../repositories/resourceLedger');
const receipts=require('../repositories/queueCommandReceipt');
const fixture=require('./localFixtureTenantScope');
const minimum=require('./queueResourceMinimumFeasibility');
const workflows=require('./queueWorkflowService');
const {readAuthorizedVendorQueueActor}=require('./vendorQueueTransactionService');
const permissions=require('./permissions');
const events=require('./queueEvents');
const reason=(code,message)=>({code,message});
function fail(block,statusCode=409){throw Object.assign(new Error(block.message),{code:block.code,statusCode});}
const unavailable=()=>reason('LOCAL_ACTIVATION_UNAVAILABLE','Local resource activation is unavailable for this location.');
async function capability(client,scope){
 if(scope.localRequest!==true||!await fixture.read(client,scope)||!await authorize(client,scope))return false;
 const row=(await client.query(`SELECT to_regclass('public.queue_plan_command_receipts') IS NOT NULL AS receipts,
   NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.location_resource_pools'::regclass AND conname='resource_pools_tracking_disabled_check') AS tracking_supported`)).rows[0];
 return row?.receipts===true&&row?.tracking_supported===true;
}
async function readSetup(client,scope){
 return (await client.query(`SELECT s.id::text,s.name,r.pool_id::text,r.units_required,p.capacity,p.tracking_enabled,
   to_jsonb(p)->>'archived_at' AS archived_at,q.configuration,
   (SELECT count(*)::int FROM resource_pool_members m WHERE m.tenant_id=p.tenant_id AND m.location_id=p.location_id AND m.pool_id=p.id AND m.is_active AND (to_jsonb(m)->>'archived_at') IS NULL) AS active_members
   FROM vendor_services s JOIN location_services l ON(l.service_id,l.tenant_id)=(s.id,s.tenant_id)
   JOIN service_resource_requirements r ON(r.service_id,r.tenant_id,r.location_id)=(s.id,s.tenant_id,l.location_id)
   JOIN location_resource_pools p ON(p.id,p.tenant_id,p.location_id)=(r.pool_id,r.tenant_id,r.location_id)
   LEFT JOIN queue_service_policies q ON(q.service_id,q.tenant_id,q.location_id)=(s.id,s.tenant_id,l.location_id)
   WHERE s.tenant_id=$1 AND l.location_id=$2 AND s.is_active AND l.is_active ORDER BY s.id`,[scope.tenantId,scope.locationId])).rows;
}
function configured(row,targetPoolId,rows,workflow){return minimum.evaluate(row,rows,{activatingPoolId:targetPoolId,workflow}).requestable;}

async function blocker(client,scope,pool,rows){
 if(pool.archived_at)return reason('RESOURCE_POOL_ARCHIVED','Archived resources cannot enable tracking.');
 if(!Number.isInteger(pool.capacity)||pool.capacity<1||pool.capacity>100)return reason('RESOURCE_CAPACITY_INVALID','Review the resource capacity before enabling tracking.');
 const invalid=(await client.query('SELECT 1 FROM service_resource_requirements WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND (units_required<1 OR units_required>$4) LIMIT 1',[scope.tenantId,scope.locationId,pool.id,pool.capacity])).rows;
 if(invalid.length)return reason('RESOURCE_REQUIREMENT_INVALID','Review service resource quantities before enabling tracking.');
 const live=(await client.query(`SELECT 1 FROM resource_allocations WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND released_at IS NULL
   UNION ALL SELECT 1 FROM resource_ledger_reservations WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND state='protected' LIMIT 1`,[scope.tenantId,scope.locationId,pool.id])).rows;
 if(live.length)return reason('RESOURCE_LIVE_WORK','Resolve existing resource allocations or protection before enabling tracking.');
 const workflow=await workflows.read(client,scope);
 if(!rows.some(row=>row.pool_id===String(pool.id)&&configured(row,String(pool.id),rows,workflow)))return reason('SERVICE_POLICY_SETUP_REQUIRED','Save an explicit service policy with ready required extras for a mapped service before enabling tracking.');
 return null;
}
async function describe(client,scope,pools){
 const available=await capability(client,scope);const rows=available?await readSetup(client,scope):[];const states=[];
 for(const pool of pools){
  const block=pool.tracking_enabled?null:!available?unavailable():await blocker(client,scope,pool,rows);
  states.push({poolId:String(pool.id),poolRevision:String(pool.revision),status:pool.tracking_enabled?'enabled':!available?'unavailable':block?'blocked':'ready',blockReason:block});
 }
 return {capability:'local-resource-activation-v1',available,pools:states};
}

async function authorize(client,scope){
 await client.query('SELECT id FROM tenants WHERE id=$1 FOR SHARE',[scope.tenantId]);
 const actor=await readAuthorizedVendorQueueActor(client,scope,'tenant.location.manage',{forShare:true});
 return actor&&['owner','admin'].includes(actor.tenantMemberships[0].role)&&permissions.userHasPermission(actor,'tenant.service.manage',{tenantId:scope.tenantId})?actor:null;
}
async function activate(scope,poolId,body,operationKey,readConfiguration){
 if(typeof poolId!=='string'||!/^[1-9]\d{0,18}$/u.test(poolId)||BigInt(poolId)>9223372036854775807n||!body||Object.keys(body).some(key=>!['expectedPoolRevision','configurationVersion'].includes(key))||typeof body.expectedPoolRevision!=='string'||!/^[1-9]\d{0,18}$/u.test(body.expectedPoolRevision)||typeof body.configurationVersion!=='string'||!/^[a-f0-9]{64}$/u.test(body.configurationVersion))fail(reason('INVALID_COMMAND','Refresh the resource revision and configuration before enabling tracking.'),400);
 if(scope.localRequest!==true)fail(unavailable(),404);
 let actor,changed=false,tenantSlug;
 const result=await ledger.withScopeTransaction({pool:db.pool,...scope,locationKeyShareCompatible:true,authorize:async(client,locked)=>{actor=await authorize(client,locked);return Boolean(actor);}},async client=>{
   if(!await capability(client,scope))fail(unavailable(),404);
   return receipts.execute(client,scope,{operationKey,action:'local_resource_pool_activate',target:poolId,payload:body},async()=>{
    const current=await readConfiguration(scope,client);
    if(current.version!==body.configurationVersion)fail(reason('STALE_REVISION','Resource configuration changed. Refresh before enabling tracking.'));
    await client.query('SELECT revision FROM resource_ledger_scopes WHERE tenant_id=$1 AND location_id=$2 FOR UPDATE',[scope.tenantId,scope.locationId]);
    const pool=(await client.query('SELECT *,id::text FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2 AND id=$3 FOR UPDATE',[scope.tenantId,scope.locationId,poolId])).rows[0];
    if(!pool)fail(reason('RESOURCE_NOT_FOUND','Resource pool not found at this location.'),404);
    if(String(pool.revision)!==body.expectedPoolRevision)fail(reason('STALE_REVISION','Resource pool changed. Refresh before enabling tracking.'));
    const block=await blocker(client,scope,pool,await readSetup(client,scope));if(block)fail(block);
    if(!pool.tracking_enabled){
     await client.query('UPDATE location_resource_pools SET tracking_enabled=TRUE,revision=revision+1 WHERE tenant_id=$1 AND location_id=$2 AND id=$3',[scope.tenantId,scope.locationId,poolId]);
     await client.query('UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2',[scope.tenantId,scope.locationId]);changed=true;
    }
    tenantSlug=(await client.query('SELECT slug FROM tenants WHERE id=$1',[scope.tenantId])).rows[0]?.slug;
    return {...await readConfiguration(scope,client),activation:{poolId,actorUserId:String(scope.actorUserId),actorRole:actor.tenantMemberships[0].role,beforeRevision:String(pool.revision),afterRevision:String(Number(pool.revision)+(pool.tracking_enabled?0:1)),enabled:true}};
   });
 });
 if(changed&&tenantSlug)events.publish(tenantSlug,{type:'queue-plans-updated',locationId:String(scope.locationId)},{locationId:scope.locationId});
 return result;
}
module.exports={describe,activate,configured,capability,blocker};
