const db = require("../config/db");
const capture = require("./queueSelectionCaptureV4");
const policy = require("./queueServicePolicyV4");
const { readAuthorizedVendorQueueActor } = require("./vendorQueueTransactionService");
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const ID=/^[1-9]\d{0,18}$/u;
function fail(code,message,statusCode=400){throw Object.assign(new Error(message),{code,statusCode});}
function fields(value,allowed){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k));}
function validate(body){
  if(!fields(body,['requestKey','catalogRevision','draftId','requests','serviceSelections'])||typeof body.requestKey!=='string'||!/^[\x21-\x7e]{1,120}$/u.test(body.requestKey)||typeof body.catalogRevision!=='string'||!/^[a-f0-9]{64}$/u.test(body.catalogRevision)||!Array.isArray(body.requests)||body.requests.length>100||(body.draftId!==undefined&&!UUID.test(body.draftId)))fail('INVALID_AVAILABILITY_REQUEST','Provide a bounded availability request with its accepted catalog revision.');
  if(body.serviceSelections!==undefined)capture.validateSelections(body.serviceSelections);
  const seen=new Set();
  for(const item of body.requests){
    if(!fields(item,['selectionId','serviceId','parentServiceId','quantity','durationCount','durationPolicyRevision','resourceMemberIds'])||typeof item.selectionId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/u.test(item.selectionId)||seen.has(item.selectionId)||typeof item.serviceId!=='string'||!ID.test(item.serviceId)||BigInt(item.serviceId)>9223372036854775807n||(item.parentServiceId!==undefined&&(typeof item.parentServiceId!=='string'||!ID.test(item.parentServiceId)||BigInt(item.parentServiceId)>9223372036854775807n)))fail('INVALID_AVAILABILITY_REQUEST','Selection IDs must be unique and service identifiers must be scoped identifiers.');
    const ids=item.resourceMemberIds||[];
    if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'||!UUID.test(id))||new Set(ids).size!==ids.length)fail('INVALID_AVAILABILITY_REQUEST','Named availability member IDs must be unique and bounded.');
    seen.add(item.selectionId);
  }
}
function result(state,reasonCode,message,checkedAt,startsAt,endsAt,availableUnits=null){return {state,availableUnits,reasonCode,message,checkedAt,startsAt,endsAt,provisional:true};}
function fits(capacity,allocations,reservations,demands,start,end){
  const events=[];let used=allocations.reduce((n,a)=>n+a.units,0);
  for(const row of [...reservations,...demands]){
    const left=Math.max(start,row.starts_at.getTime()),right=Math.min(end,row.ends_at.getTime());
    if(left<right)events.push([left,row.units],[right,-row.units]);
  }
  events.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  for(const [,units] of events){used+=units;if(used>capacity)return false;}
  return used<=capacity;
}
// Internal evaluator: the adapter holds the scoped branch/grant read locks.
async function evaluate(client,scope,body){
  validate(body);
  const checkedAt=(await client.query('SELECT clock_timestamp() AS at')).rows[0].at;
  const catalog=await capture.readCatalog(client,scope),byService=new Map(catalog.services.map(s=>[s.id,s]));
  const mapping=(await client.query(`SELECT r.service_id::text,r.pool_id::text,r.units_required,p.capacity,p.tracking_enabled,
    to_jsonb(p)->>'archived_at' AS archived_at FROM service_resource_requirements r JOIN location_resource_pools p
    ON(p.id,p.tenant_id,p.location_id)=(r.pool_id,r.tenant_id,r.location_id)
    WHERE r.tenant_id=$1 AND r.location_id=$2 AND r.service_id=ANY($3::bigint[])`,[scope.tenantId,scope.locationId,[...new Set(body.requests.map(r=>r.serviceId))]])).rows;
  const ownGroups=[];
  let ownTicketId=null;
  if(body.draftId){
    const draft=(await client.query(`SELECT d.state,p.ticket_id::text,p.revision::text,p.stage_attempt_id,p.contract_version,t.status,a.started_at
      FROM queue_plan_drafts d LEFT JOIN ticket_service_plans p ON(p.ticket_id,p.tenant_id,p.location_id)=(d.published_ticket_id,d.tenant_id,d.location_id)
      LEFT JOIN tickets t ON(t.id,t.tenant_id,t.location_id)=(p.ticket_id,p.tenant_id,p.location_id)
      LEFT JOIN queue_stage_attempts a ON a.id=p.stage_attempt_id WHERE d.id=$3 AND d.tenant_id=$1 AND d.location_id=$2`,[scope.tenantId,scope.locationId,body.draftId])).rows[0];
    if(!draft)fail('PLAN_NOT_FOUND','Request not found at this branch.',404);
    ownTicketId=draft.ticket_id||null;
    if(draft.state==='published'&&[3,4].includes(draft.contract_version)&&draft.status==='called'&&!draft.started_at){
      const groups=(await client.query(`SELECT id,expected_members FROM queue_reservation_groups WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3
        AND plan_revision=$4 AND stage_attempt_id=$5 AND execution_model='nested' AND state='protected' AND expires_at>$6`,[scope.tenantId,scope.locationId,draft.ticket_id,draft.revision,draft.stage_attempt_id,checkedAt])).rows;
      if(groups.length===1){
        const group=groups[0],rows=(await client.query('SELECT id::text,child_attempt_id,line_id,state FROM resource_ledger_reservations WHERE tenant_id=$1 AND location_id=$2 AND group_id=$3',[scope.tenantId,scope.locationId,group.id])).rows;
        const children=(await client.query('SELECT id,selection_id,state FROM queue_child_attempts WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND plan_revision=$4 AND stage_attempt_id=$5 AND is_current',[scope.tenantId,scope.locationId,draft.ticket_id,draft.revision,draft.stage_attempt_id])).rows;
        const allocated=(await client.query('SELECT 1 FROM queue_allocation_groups WHERE reservation_group_id=$1 LIMIT 1',[group.id])).rows.length;
        if(!allocated&&rows.length>0&&rows.length===group.expected_members.length&&children.length===rows.length&&rows.every(r=>r.state==='protected'&&group.expected_members.some(e=>e.reservationId===r.id&&e.childAttemptId===r.child_attempt_id&&e.lineId===r.line_id))&&children.every(c=>c.state==='protected'&&rows.some(r=>r.child_attempt_id===c.id&&r.line_id===c.selection_id)))ownGroups.push(group.id);
      }
    }
  }
  const pools=[...new Set(mapping.map(r=>r.pool_id))];
  const allocations=(await client.query(`SELECT pool_id::text,units,resource_member_id,ticket_id::text FROM resource_allocations
    WHERE tenant_id=$1 AND location_id=$2 AND pool_id=ANY($3::bigint[]) AND released_at IS NULL
      AND ($4::bigint IS NULL OR ticket_id IS DISTINCT FROM $4::bigint) LIMIT 5001`,[scope.tenantId,scope.locationId,pools,ownTicketId])).rows;
  const reservations=(await client.query(`SELECT r.pool_id::text,r.units,r.resource_member_id,r.starts_at,r.ends_at,r.group_id,g.expires_at,g.state AS group_state
    FROM resource_ledger_reservations r LEFT JOIN queue_reservation_groups g ON(g.id,g.tenant_id,g.location_id)=(r.group_id,r.tenant_id,r.location_id)
    WHERE r.tenant_id=$1 AND r.location_id=$2 AND r.pool_id=ANY($3::bigint[]) AND r.state='protected'
      AND (r.group_id IS NULL OR NOT(r.group_id=ANY($4::uuid[]))) LIMIT 5001`,[scope.tenantId,scope.locationId,pools,ownGroups])).rows;
  if(allocations.length>5000||reservations.length>5000)fail('AVAILABILITY_BOUNDS_EXCEEDED','Availability cannot be confirmed within the bounded ledger window.',503);
  const selections=body.requests.map(request=>{
    const service=byService.get(request.serviceId),parent=request.parentServiceId?byService.get(request.parentServiceId):service,
      pool=mapping.find(r=>r.service_id===request.serviceId);
    let issue=null,duration=null,stageId='linear';
    if(body.catalogRevision!==catalog.catalogRevision)issue={code:'CATALOG_ACCEPTANCE_REQUIRED',message:'The catalog changed. Explicitly review its current configuration.'};
    else if(!service||!parent||!pool||!service.resourceReady||pool.archived_at||!pool.tracking_enabled)issue={code:'RESOURCE_CONFIGURATION_UNAVAILABLE',message:'The current scoped resource configuration cannot confirm availability.'};
    else if(request.parentServiceId&&!parent.extras.some(e=>e.serviceId===request.serviceId&&e.configured))issue={code:'EXTRA_NOT_ELIGIBLE',message:'This extra is not eligible under the current parent policy.'};
    else if(!Number.isInteger(request.quantity)||request.quantity<1||request.quantity>100||(!request.parentServiceId&&service.assignmentPolicy.mode==='named'&&request.quantity!==1))issue={code:'INCOMPLETE_QUANTITY',message:'Provide a valid quantity before checking availability.'};
    else if(service.assignmentPolicy.mode==='named'&&pool.units_required!==1)issue={code:'NAMED_RESOURCE_REQUIREMENT_INVALID',message:'Named resources require one configured pool unit each.'};
    else try{duration=policy.duration(request.durationCount,request.durationPolicyRevision,{duration:service.durationPolicy,revision:service.durationPolicy.revision});}catch(error){issue={code:error.code||'INVALID_DURATION_POLICY',message:error.message};}
    if(catalog.workflow.mode==='multi_station'){
      const stages=catalog.workflow.stages.filter(s=>s.serviceIds.includes(request.parentServiceId||request.serviceId));
      if(stages.length!==1)issue={code:'WORKFLOW_SERVICE_UNASSIGNED',message:'Review the workflow stage for this selection.'};else stageId=stages[0].stageId;
    }
    const endsAt=duration?new Date(checkedAt.getTime()+duration.durationMinutes*60000):null;
    return {request,service,pool,stageId,issue,endsAt,duration};
  });
  for(const selection of selections){
    if(!selection.issue&&selections.some(other=>other.stageId===selection.stageId&&other.pool?.pool_id===selection.pool?.pool_id&&other.service?.assignmentPolicy.mode!==selection.service.assignmentPolicy.mode))
      selection.issue={code:'EXTRA_RESOURCE_CONFLICT',message:'Anonymous and named demand cannot prove distinct physical members in the same simultaneous pool.'};
  }
  // Compare the complete editor tree to the flattened batch so a missing
  // sibling/extra cannot falsely report spare shared capacity.
  const expected=[];
  for(const root of body.serviceSelections||[])for(const resource of root.resources){
    expected.push({selectionId:resource.resourceSelectionId,serviceId:root.serviceId,quantity:resource.quantity,durationCount:resource.durationCount,durationPolicyRevision:resource.durationPolicyRevision,resourceMemberIds:resource.resourceMemberId?[resource.resourceMemberId]:[]});
    for(const extra of resource.extras)expected.push({selectionId:extra.extraSelectionId,serviceId:extra.serviceId,parentServiceId:root.serviceId,quantity:extra.quantity,durationCount:extra.durationCount,durationPolicyRevision:extra.durationPolicyRevision,resourceMemberIds:extra.resourceMemberIds||[]});
  }
  const sameRequest=(a,b)=>['selectionId','serviceId','parentServiceId','quantity','durationCount','durationPolicyRevision'].every(k=>a[k]===b[k])&&JSON.stringify([...a.resourceMemberIds].sort((left, right) => left < right ? -1 : Number(left > right)))===JSON.stringify([...(b.resourceMemberIds||[])].sort((left, right) => left < right ? -1 : Number(left > right)));
  const completeBatch=body.serviceSelections!==undefined&&expected.length===body.requests.length&&expected.every(e=>body.requests.some(r=>sameRequest(e,r)));
  const contextIncomplete=!completeBatch||selections.some(s=>s.issue);
  const output=selections.map(selection=>{
    const {request,service,pool,stageId,issue,endsAt,duration}=selection;
    const start=checkedAt.getTime(),end=endsAt?.getTime()||start;
    const active=allocations.filter(a=>a.pool_id===pool?.pool_id),held=reservations.filter(r=>r.pool_id===pool?.pool_id);
    const pendingExpiry=held.some(r=>r.ends_at<=checkedAt||(r.group_id&&(!r.expires_at||r.expires_at<=checkedAt||r.group_state!=='protected')));
    const validHolds=held.filter(r=>r.starts_at<endsAt&&r.ends_at>checkedAt);
    const observedAvailableUnits = pool
      ? Math.max(0, Number(pool.capacity) - active.reduce((total, row) => total + Number(row.units || 0), 0) - validHolds.reduce((total, row) => total + Number(row.units || 0), 0))
      : null;
    const demands=selections.filter(s=>s.stageId===stageId&&s.pool?.pool_id===pool?.pool_id&&s.duration&&!s.issue).map(s=>({starts_at:checkedAt,ends_at:s.endsAt,units:s.request.quantity*s.pool.units_required}));
    let aggregate=result('available',null,'Provisional interval capacity is available.',checkedAt,checkedAt,endsAt,observedAvailableUnits);
    if(issue)aggregate=result('unknown',issue.code,issue.message,checkedAt,checkedAt,endsAt);
    else if(contextIncomplete)aggregate=result('unknown','INCOMPLETE_AVAILABILITY_CONTEXT','Complete or review the other durations and quantities before checking aggregate capacity.',checkedAt,checkedAt,endsAt);
    else if(pendingExpiry)aggregate=result('unknown','RESERVATION_EXPIRY_PENDING','Stored protection needs expiry/reconciliation. Refresh the queue before selecting new resources.',checkedAt,checkedAt,endsAt);
    else if(!fits(pool.capacity,active,validHolds,demands,start,end))aggregate=result('unavailable','RESOURCE_CAPACITY_UNAVAILABLE','The combined requested interval does not have enough protected pool capacity.',checkedAt,checkedAt,endsAt,observedAvailableUnits);
    const selected=request.resourceMemberIds||[],allMembers=service?.assignmentPolicy.mode==='named'?service.resourceMembers:[];
    const candidates=allMembers.filter(m=>(m.isActive&&!m.archivedAt)||selected.includes(m.id));
    const members=candidates.map(member=>{
      let availability=aggregate;
      if(member.archivedAt)availability=result('unavailable','RESOURCE_MEMBER_ARCHIVED','This resource is archived.',checkedAt,checkedAt,endsAt);
      else if(!member.isActive)availability=result('unavailable','RESOURCE_MAINTENANCE','This resource is temporarily disabled for named selection.',checkedAt,checkedAt,endsAt);
      else if(!issue&&!contextIncomplete&&!pendingExpiry){
        if(active.some(a=>a.resource_member_id===member.id))availability=result('unavailable','RESOURCE_OCCUPIED','This resource remains occupied until its recorded service is explicitly released.',checkedAt,checkedAt,endsAt);
        else if(validHolds.some(r=>r.resource_member_id===member.id))availability=result('unavailable','RESOURCE_PROTECTED','This resource is protected during the requested interval.',checkedAt,checkedAt,endsAt);
        else if(active.some(a=>!a.resource_member_id)||validHolds.some(r=>!r.resource_member_id))availability=result('unknown','ANONYMOUS_RESOURCE_USAGE','Anonymous pool usage cannot prove this specific resource is free.',checkedAt,checkedAt,endsAt);
        else if(held.some(r=>r.resource_member_id===member.id))availability=result('unknown','NAMED_PROTECTION_REQUIRES_REVIEW','A recorded named promise must be reconciled before a new claim.',checkedAt,checkedAt,endsAt);
        else if(selections.some(other=>other!==selection&&other.stageId===stageId&&(other.request.resourceMemberIds||[]).includes(member.id)))availability=result('unavailable','NAMED_RESOURCE_DUPLICATE','This member is already selected in another simultaneous resource or extra group.',checkedAt,checkedAt,endsAt);
      }
      return {...member,availability};
    });
    for(const id of selected)if(!members.some(m=>m.id===id))members.push({id,name:'Unavailable resource',revision:'',isActive:false,archivedAt:null,availability:result('unavailable','MEMBER_NOT_IN_POOL','This selected ID is not a current member of the scoped service pool.',checkedAt,checkedAt,endsAt)});
    return {selectionId:request.selectionId,serviceId:request.serviceId,stageId,startAssumption:catalog.workflow.mode==='multi_station'?'provisional_stage_start':'current_stage_start',quantity:request.quantity,durationCount:request.durationCount,durationPolicyRevision:request.durationPolicyRevision,durationMinutes:duration?.durationMinutes||null,startsAt:checkedAt,endsAt,configurationValid:!issue,availability:aggregate,resourceMembers:members};
  });
  return {contractVersion:4,availabilityVersion:1,requestKey:body.requestKey,catalogRevision:body.catalogRevision,currentCatalogRevision:catalog.catalogRevision,checkedAt,commonStartAt:checkedAt,provisional:true,refreshAfterMs:15000,excludedOwnProtection:ownGroups.length===1,selections:output};
}
async function preview({tenant,location,actorUserId},body){
  validate(body);const scope={tenantId:String(tenant._id),locationId:String(location._id),actorUserId:String(actorUserId)};
  return db.withTransaction(async client=>{
    await client.query("SET LOCAL statement_timeout='3000ms'");
    const branch=(await client.query('SELECT l.id,l.is_active,t.is_active AS tenant_active FROM store_locations l JOIN tenants t ON t.id=l.tenant_id WHERE l.tenant_id=$1 AND l.id=$2 FOR SHARE OF l,t',[scope.tenantId,scope.locationId])).rows[0];
    if(!branch)fail('LOCATION_NOT_FOUND','Location not found.',404);
    if(!branch.is_active||!branch.tenant_active)fail('RESOURCE_SCOPE_INACTIVE','Availability cannot be confirmed for an inactive business or branch.',409);
    if(!await readAuthorizedVendorQueueActor(client,scope,'tenant.queue.operate',{forShare:true}))fail('NOT_AUTHORIZED','Availability access is not authorized.',403);
    return evaluate(client,scope,body);
  });
}
module.exports={preview,evaluate,validate};
