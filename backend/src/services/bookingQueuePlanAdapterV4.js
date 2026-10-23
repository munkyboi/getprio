const {randomUUID}=require('node:crypto');
const selections=require('./bookingSelectionServiceV4');
const workflows=require('./queueWorkflowService');
const children=require('../repositories/queueSelectionRepository');
// The existing booking check-in writer owns authorization, payment/window and
// branch locks, ticket allowance, linked-ticket uniqueness and the transaction.
async function captureLinkedPlan(client,{tenant,location,ticket,booking,actorUserId,actorRole}){
 const scope={tenantId:String(tenant._id),locationId:String(location._id)};
 const record=await selections.assertCurrentProtection(client,booking);
 if(!record)throw Object.assign(new Error('The booking selections need reconciliation.'),{statusCode:409,code:'BOOKING_CAPTURE_MISSING'});
 const snapshot=record.snapshot;
 await selections.assertSchedule(client,scope,snapshot.captured.items,snapshot.scheduledStartAt,{allowPast:true});
 const captured=structuredClone(snapshot.captured);
 const workflow=await workflows.readVersion(client,scope,captured.workflow.configurationRevision);
 if(workflow.mode!=='linear')throw Object.assign(new Error('This booking workflow needs staff review.'),{statusCode:409,code:'BOOKING_WORKFLOW_UNSUPPORTED'});
 const draftId=randomUUID(),stageId=randomUUID(),attemptId=randomUUID();
 for(const item of captured.items){item.stageId=stageId;item.storeHoursEnforcementVersion=1;}
 for(const service of captured.serviceSelections)service.stageId=stageId;
 await client.query(`INSERT INTO queue_plan_drafts(id,tenant_id,location_id,created_by_user_id,state,customer,notes,published_ticket_id,service_selections,selection_contract_version,catalog_revision)
 VALUES($1,$2,$3,$4,'published',$5::jsonb,$6,$7,$8::jsonb,4,$9)`,[draftId,scope.tenantId,scope.locationId,actorUserId,
 JSON.stringify({name:booking.customerName,email:booking.customerEmail||'',phone:booking.customerPhone||''}),booking.notes||'',ticket._id,JSON.stringify(snapshot.internalSelections),snapshot.catalogVersion]);
 await client.query(`INSERT INTO queue_stage_attempts(id,tenant_id,location_id,ticket_id,stage_id,attempt,ordinal,state,label)
 VALUES($1,$2,$3,$4,$5,1,1,'waiting','Booked service')`,[attemptId,scope.tenantId,scope.locationId,ticket._id,stageId]);
 await client.query(`INSERT INTO ticket_service_plans(ticket_id,tenant_id,location_id,source,booking_id,execution_mode,items,created_by_user_id,
 contract_version,stage_id,stage_attempt_id,workflow_mode,workflow_configuration_revision,service_selections)
 VALUES($1,$2,$3,'booking',$4,'parallel',$5::jsonb,$6,4,$7,$8,'linear',$9,$10::jsonb)`,
 [ticket._id,scope.tenantId,scope.locationId,booking._id,JSON.stringify(captured.items),actorUserId,stageId,attemptId,workflow.configurationRevision,JSON.stringify(captured.serviceSelections)]);
 await client.query(`INSERT INTO queue_plan_versions(id,draft_id,tenant_id,location_id,ticket_id,revision,workflow_mode,stage_id,lines_snapshot,
 actor_user_id,reason,workflow_configuration_revision,service_selections)
 VALUES($1,$2,$3,$4,$5,1,'linear',$6,$7::jsonb,$8,'Booking arrival',$9,$10::jsonb)`,[randomUUID(),draftId,scope.tenantId,scope.locationId,ticket._id,stageId,JSON.stringify(captured.items),actorUserId,workflow.configurationRevision,JSON.stringify(captured.serviceSelections)]);
 await children.captureChildren(client,scope,{ticketId:ticket._id,planRevision:'1',captured,stageAttempts:new Map([[stageId,attemptId]]),firstStageId:stageId});
 await client.query(`INSERT INTO queue_plan_events(tenant_id,location_id,actor_user_id,draft_id,event_type,new_revision,snapshot,actor_role)
 VALUES($1,$2,$3,$4,'booking_arrived',1,$5::jsonb,$6)`,[scope.tenantId,scope.locationId,actorUserId,draftId,JSON.stringify({bookingId:booking._id,bookingSelectionRevision:record.revision,ticketId:ticket._id}),actorRole]);
 // No Queue hold or resource allocation: Call and explicit Start own those.
 return{draftId,stageId,stageAttemptId:attemptId};
}
module.exports={captureLinkedPlan};
