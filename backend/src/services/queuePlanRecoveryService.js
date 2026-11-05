const { randomUUID } = require('node:crypto');
function fail(code,message){throw Object.assign(new Error(message),{code,statusCode:409});}
async function emit(client,scope,ticket,action,stage,reason,queueEvent,readTicket,previousStageAttemptId){
 const updated=await readTicket(ticket._id);
 if(!updated||updated.status!==(action==='skip'?'skipped':'waiting'))fail("INVALID_STATE","The recovered ticket state needs reconciliation.");
 await queueEvent(client,updated,action==='skip'?'ticket_skipped':'ticket_requeued',scope.actorUserId,
  {reason,planRecoveryVersion:1,stageId:stage.stage_id,stageAttemptId:stage.id,...(previousStageAttemptId?{previousStageAttemptId}:{}),recallOrderPolicy:'preserve_original_band_age_sequence'},ticket.status);
}
async function skip(client,{scope,ticket,p,stage,body,queueEvent,readTicket}){
 if(ticket.status!=='called'||stage.state!=='called'||stage.started_at||ticket.serviceEndedAt)fail('SKIP_NOT_AVAILABLE','Only the current called, unstarted stage may be skipped. Use Interrupt for started work.');
 const tuple=[scope.tenantId,scope.locationId,ticket._id],now=(await client.query('SELECT clock_timestamp() AS at')).rows[0].at;
 const groups=(await client.query("SELECT * FROM queue_reservation_groups WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND stage_attempt_id=$4 AND plan_revision=$5 AND state='protected' FOR UPDATE",[...tuple,stage.id,p.revision])).rows;
 if(groups.length!==1||groups[0].id!==body.reservationGroupId||groups[0].expires_at<=now)fail('STALE_RESERVATION','Refresh the exact current unexpired protection before skipping.');
 const group=groups[0],members=(await client.query('SELECT * FROM resource_ledger_reservations WHERE tenant_id=$1 AND location_id=$2 AND group_id=$3 ORDER BY id FOR UPDATE',[scope.tenantId,scope.locationId,group.id])).rows;
 const allocated=(await client.query('SELECT 1 FROM resource_allocations WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND (child_stage_attempt_id=$4 OR group_id IN(SELECT id FROM queue_allocation_groups WHERE stage_attempt_id=$4)) LIMIT 1',[...tuple,stage.id])).rows;
 const allocationGroup=(await client.query('SELECT 1 FROM queue_allocation_groups WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND stage_attempt_id=$4 LIMIT 1',[...tuple,stage.id])).rows;
 if(allocated.length||allocationGroup.length)fail('SKIP_NOT_AVAILABLE','This stage already has an allocation. Use its explicit outcomes.');
 if(!members.length||members.length!==group.expected_members.length||members.some(m=>m.state!=='protected'||!group.expected_members.some(e=>String(e.reservationId)===String(m.id)&&e.lineId===m.line_id&&(e.childAttemptId||null)===(m.child_attempt_id||null))))fail('INVALID_RESERVATION','The complete recorded promise needs reconciliation before Skip.');
 const children=(await client.query('SELECT * FROM queue_child_attempts WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND plan_revision=$4 AND stage_attempt_id=$5 AND is_current ORDER BY selection_id FOR UPDATE',[...tuple,p.revision,stage.id])).rows;
 if([3,4].includes(p.contract_version)&&(children.length!==members.length||children.some(c=>c.state!=='protected'||c.started_at||c.ended_at||!members.some(m=>m.child_attempt_id===c.id))))fail('INVALID_RESERVATION','Current protected child attempts do not match the recorded promise.');
 await client.query("UPDATE resource_ledger_reservations SET state='cancelled' WHERE group_id=$1 AND state='protected'",[group.id]);
 await client.query("UPDATE queue_reservation_groups SET state='skipped' WHERE id=$1",[group.id]);
 if(children.length)await client.query("UPDATE queue_child_attempts SET state='skipped',ended_at=$2,revision=revision+1 WHERE id=ANY($1::uuid[])",[children.map(c=>c.id),now]);
 await client.query("UPDATE queue_stage_attempts SET state='skipped',ended_at=$2,skipped_at=$2,skipped_reason=$3,skipped_by_user_id=$4,revision=revision+1 WHERE id=$1",[stage.id,now,body.reason.trim(),scope.actorUserId]);
 // Retain the last called counter/time as history; status frees the counter.
 // Original priority band, sequence, age and parent service clocks are untouched.
 await client.query("UPDATE tickets SET status='skipped',skipped_at=$4,rejoin_deadline_at=NULL,updated_at=$4 WHERE tenant_id=$1 AND location_id=$2 AND id=$3",[...tuple,now]);
 await client.query('UPDATE ticket_service_plans SET resource_wait=NULL WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3',tuple);
 await emit(client,scope,ticket,'skip',stage,body.reason.trim(),queueEvent,readTicket);
}
async function recall(client,{scope,tenant,location,ticket,p,stage,body,queue,queueEvent,readTicket}){
 if(ticket.status!=='skipped'||stage.state!=='skipped'||stage.started_at||ticket.terminalAt||ticket.serviceEndedAt)fail('RECALL_NOT_AVAILABLE','Only an unresolved skipped stage may be recalled.');
 const branch=(await client.query('SELECT l.is_active,l.timezone,l.queue_lifecycle_mode,t.is_active AS tenant_active FROM store_locations l JOIN tenants t ON t.id=l.tenant_id WHERE l.tenant_id=$1 AND l.id=$2',[scope.tenantId,scope.locationId])).rows[0];
 if(!branch?.is_active||!branch.tenant_active)fail('RESOURCE_SCOPE_INACTIVE','This business or branch is inactive.');
 const observedAt=(await client.query('SELECT clock_timestamp() AS at')).rows[0].at,today=require('./queueHelpers').getDateKey(observedAt,branch.timezone||'Asia/Manila');
 const currentLocation={...location,queueLifecycleMode:branch.queue_lifecycle_mode,timezone:branch.timezone||'Asia/Manila'};
 const day=await queue.assertQueueIntakeOpen(tenant,currentLocation,{client,queueDateKey:today});
 const dateKey=day?.businessDate?String(day.businessDate).replaceAll('-',''):today;
 if(String(ticket.queueDateKey||ticket.dateKey)!==dateKey||(day&&String(ticket.currentQueueDayId)!==String(day._id)))fail('RECALL_QUEUE_DAY_CHANGED','Recall is limited to the same open Queue Day.');
 const policy=(await client.query('SELECT auto_pause_enabled,auto_pause_threshold FROM tenants WHERE id=$1',[scope.tenantId])).rows[0];
 await queue.assertWaitingIntakeCapacityAvailable({...tenant,autoPauseEnabled:policy.auto_pause_enabled,autoPauseThreshold:policy.auto_pause_threshold},location,{client,queueDateKey:dateKey});
 const tuple=[scope.tenantId,scope.locationId,ticket._id];
 if((await client.query("SELECT 1 FROM resource_ledger_reservations WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND state='protected' LIMIT 1",tuple)).rows.length||(await client.query('SELECT 1 FROM resource_allocations WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND released_at IS NULL LIMIT 1',tuple)).rows.length)fail('INVALID_STATE','Resolve unexpected live resource records before Recall.');
 const children=(await client.query('SELECT * FROM queue_child_attempts WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND plan_revision=$4 AND stage_attempt_id=$5 AND is_current ORDER BY CASE WHEN selection_kind=\'resource\' THEN 0 ELSE 1 END,selection_id FOR UPDATE',[...tuple,p.revision,stage.id])).rows;
 if([3,4].includes(p.contract_version)&&(!children.length||children.some(c=>c.state!=='skipped'||c.started_at||!c.ended_at)))fail('INVALID_STATE','The skipped attempt history needs reconciliation.');
 const stageId=randomUUID();
 await client.query(`INSERT INTO queue_stage_attempts(id,tenant_id,location_id,ticket_id,stage_id,attempt,ordinal,state,station_id,station_snapshot,label,assigned_user_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,'waiting',$8,$9::jsonb,$10,$11)`,[stageId,...tuple,stage.stage_id,String(BigInt(stage.attempt)+1n),stage.ordinal,stage.station_id,JSON.stringify(stage.station_snapshot),stage.label,stage.assigned_user_id]);
 if(children.length)await client.query('UPDATE queue_child_attempts SET is_current=FALSE,revision=revision+1 WHERE id=ANY($1::uuid[])',[children.map(c=>c.id)]);
 const parentIds=new Map();
 for(const child of children){const id=randomUUID();parentIds.set(child.selection_id,id);
  await client.query(`INSERT INTO queue_child_attempts(id,ticket_id,plan_revision,selection_id,selection_kind,tenant_id,location_id,stage_id,stage_attempt_id,parent_child_attempt_id,parent_executed_selection_id,pool_id,units,duration_minutes,resource_member_id,attempt,state)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'waiting')`,[id,ticket._id,p.revision,child.selection_id,child.selection_kind,scope.tenantId,scope.locationId,stage.stage_id,stageId,child.selection_kind==='extra'?parentIds.get(child.parent_executed_selection_id):null,child.parent_executed_selection_id,child.pool_id,child.units,child.duration_minutes,child.resource_member_id,String(BigInt(child.attempt)+1n)]);
 }
 await client.query('UPDATE ticket_service_plans SET stage_attempt_id=$4,resource_wait=NULL WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3',[...tuple,stageId]);
 await client.query("UPDATE tickets SET status='waiting',service_counter_id=NULL,called_at=NULL,notified_called_at=NULL,customer_confirmed_at=NULL,rejoin_deadline_at=NULL,updated_at=clock_timestamp() WHERE tenant_id=$1 AND location_id=$2 AND id=$3",tuple);
 await emit(client,scope,ticket,'recall',{...stage,id:stageId},body.reason.trim(),queueEvent,readTicket,stage.id);
}
module.exports={skip,recall};
