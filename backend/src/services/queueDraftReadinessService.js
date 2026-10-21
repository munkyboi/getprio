const serviceHours = require("./queueServiceHoursService");
const captures={3:require('./queueSelectionCapture'),4:require('./queueSelectionCaptureV4')};
const maintenance=require('./platformMaintenanceService'),entitlements=require('./entitlementAdmissionService'),hours=require('./storeHoursService'),queue=require('./queueService');
const { captureLines, assignStages } = require('./queuePlanCatalog');
const workflows = require('./queueWorkflowService');
const { assertPublicTextFieldsAllowed } = require('./contentModeration');
function blocked(code,message){throw Object.assign(new Error(message),{code,statusCode:409});}
// Only reads captured configuration and admission policy. Never checks resource
// occupancy: a busy resource may still publish as Waiting without a hold.
async function decorate(client,scope,context,plan){
 if(plan.state!=='draft')return plan;
 const reasons=[];
 const linked=Boolean(plan.ticketId)||(await client.query("SELECT 1 FROM queue_plan_versions WHERE tenant_id=$1 AND location_id=$2 AND draft_id=$3 LIMIT 1",[scope.tenantId,scope.locationId,plan.id])).rows.length>0;
 try{
  if(linked)blocked('PLAN_RECONCILIATION_REQUIRED','This draft has publication history. Refresh its authoritative request.');
  if(!plan.customer.name?.trim())blocked('CUSTOMER_NAME_REQUIRED','Add the customer name before publishing.');
  if(!plan.catalogRevision)blocked('CATALOG_ACCEPTANCE_REQUIRED','Review and save the current catalog before publishing.');
  assertPublicTextFieldsAllowed({'Customer name':plan.customer.name,Notes:plan.notes});
  const workflow=await workflows.read(client,scope);
  let captured;
  if(plan.contractVersion===2){const items=await captureLines(client,scope,plan.lines,plan.catalogRevision,{allowStagePools:workflow.mode==='multi_station'});await assignStages(client,scope,workflow,items);}
  else captured=await captures[plan.contractVersion].capture(client,scope,plan.serviceSelections,plan.catalogRevision);
  if(plan.contractVersion===4)await serviceHours.assertPlanFits(client,scope,captured.items,captured.workflow);
  await maintenance.assertNewIntake({client});
  await entitlements.admit({tenantId:scope.tenantId,featureKey:'queue',client});
  const policy=(await client.query('SELECT l.is_active,l.queue_lifecycle_mode,l.timezone,t.is_active AS tenant_active,t.auto_pause_enabled,t.auto_pause_threshold FROM store_locations l JOIN tenants t ON t.id=l.tenant_id WHERE l.tenant_id=$1 AND l.id=$2',[scope.tenantId,scope.locationId])).rows[0];
  if(!policy?.is_active||!policy.tenant_active)blocked('RESOURCE_SCOPE_INACTIVE','This business or branch is inactive.');
  const location={...context.location,queueLifecycleMode:policy.queue_lifecycle_mode,timezone:policy.timezone};
  const tenant={...context.tenant,autoPauseEnabled:policy.auto_pause_enabled,autoPauseThreshold:policy.auto_pause_threshold};
  const day=await queue.assertQueueIntakeOpen(tenant,location,{client});
  await hours.assertLocationOpenForCustomerJoin(location,{client});
  const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
  const dateKey=day?.businessDate?String(day.businessDate).replaceAll('-',''):require('./queueHelpers').getDateKey(now,location.timezone);
  await queue.assertWaitingIntakeCapacityAvailable(tenant,location,{client,queueDateKey:dateKey,issuance:true});
 }catch(error){if(!(error.statusCode>=400&&error.statusCode<500))throw error;reasons.push({code:error.code||'PUBLICATION_NOT_AVAILABLE',message:error.message});}
 return {...plan,allowedActions:linked?[]:['edit','delete',...(reasons.length?[]:['publish'])],publishReadiness:{ready:reasons.length===0,blockReasons:reasons,provisional:true}};
}
module.exports={decorate};
