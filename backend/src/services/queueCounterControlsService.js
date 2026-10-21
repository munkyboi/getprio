const { createHash } = require('node:crypto');
const db = require('../config/db');
const tickets = require('../repositories/tickets');
const days = require('../repositories/queueDays');
const closures = require('../repositories/queueDayClosures');
const { getDateKey } = require('./queueHelpers');
const { readAuthorizedVendorQueueActor } = require('./vendorQueueTransactionService');
const { userHasPermission } = require('./permissions');
const projection = require('../repositories/queuePlanProjection');
const hoursEligibility = require('./queueServiceHoursEligibilityService');
const serviceHours = require('./queueServiceHoursService');
function fail(code,message,statusCode=400){throw Object.assign(new Error(message),{code,statusCode});}
function validate(params){if(!params||typeof params.counterSlug!=='string'||!params.counterSlug.trim()||params.counterSlug.length>160||typeof params.requestKey!=='string'||!/^[\x21-\x7e]{1,120}$/u.test(params.requestKey))fail('INVALID_COUNTER_CONTEXT','Select a counter and provide a bounded request key.');}
const blocked=(code,message)=>({enabled:false,blockReason:{code,message},command:null});
const available=(command)=>({enabled:true,blockReason:null,command});
async function target(client,scope,ticket,options={}){
 if(!ticket)return null;
 const identity=(await client.query("SELECT COALESCE(to_jsonb(p)->>'contract_version','1') AS version FROM ticket_service_plans p WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3",[scope.tenantId,scope.locationId,ticket._id])).rows[0];
 const summary={serviceHoursEligibility:{...hoursEligibility.NOT_ENFORCED},kind:'legacy',ticketId:String(ticket._id),ticketNumber:ticket.ticketNumber,customerName:ticket.customerDisplayName||ticket.customerName||'',state:ticket.status,serviceStartedAt:ticket.serviceStartedAt||null,joinChannel:ticket.joinChannel||null,customerConfirmedAt:ticket.customerConfirmedAt||null};
 if(!['2','3','4'].includes(identity?.version))return {...summary,ticket};
 const draft=(await client.query("SELECT * FROM queue_plan_drafts WHERE tenant_id=$1 AND location_id=$2 AND published_ticket_id=$3 AND state='published'",[scope.tenantId,scope.locationId,ticket._id])).rows[0];
 if(!draft)return {...summary,kind:'unknown',blockReason:{code:'PLAN_RECONCILIATION_REQUIRED',message:'This request needs its recorded plan reconciled.'}};
 let plan=await projection.read(client,scope,draft,options);
 if(plan.state==='waiting'&&!plan.resourceWait&&Array.isArray(plan.serviceSelections)){
  const projectedWait=await require('./queueResourceConflictProjection').readWaitingConflict(client,scope,draft,plan.serviceSelections);
  if(projectedWait)plan={...plan,resourceWait:projectedWait};
 }
 return {...summary,kind:'plan',planId:plan.id,contractVersion:plan.contractVersion,state:plan.state,plan,ticket};
}
async function findNextEligible(client,scope,{queueOpen,counter,dateKey,window}){
 if(!queueOpen||!counter.is_active)return null;
 const waiting=await tickets.listReadyWaitingTickets(scope.tenantId,{client,locationId:scope.locationId,serviceCounterId:counter.id,dateKey});
 const options={window:window||await serviceHours.readWindow(client,scope)};
 for(const ticket of waiting){
  const candidate=await target(client,scope,ticket,options);
  if(candidate?.kind==='unknown')continue;
  if(candidate?.kind==='plan'){
   if(candidate.plan.state!=='waiting'||!candidate.plan.allowedActions.includes('call'))continue;
   if(candidate.plan.resourceWait||hoursEligibility.blocks(candidate.plan.serviceHoursEligibility))continue;
  }
  return candidate;
 }
 return null;
}
function publicTarget(value){if(!value)return null;const {ticket,plan,...safe}=value;return {...safe,...(plan?{currentStage:plan.currentStage,allowedActions:plan.allowedActions,capabilities:plan.capabilities,resourceWait:plan.resourceWait,serviceHoursEligibility:plan.serviceHoursEligibility}: {})};}
async function evaluate(client,context,params,actor){
 validate(params);const scope={tenantId:String(context.tenant._id),locationId:String(context.location._id),actorUserId:String(context.actorUserId),actorRole:actor.tenantMemberships[0].role};
 const branch=(await client.query('SELECT l.*,t.is_active AS tenant_active FROM store_locations l JOIN tenants t ON t.id=l.tenant_id WHERE l.tenant_id=$1 AND l.id=$2',[scope.tenantId,scope.locationId])).rows[0];
 if(!branch)fail('LOCATION_NOT_FOUND','Location not found.',404);
 const counter=(await client.query('SELECT id::text,slug,name,is_active FROM service_counters WHERE tenant_id=$1 AND location_id=$2 AND slug=$3',[scope.tenantId,scope.locationId,params.counterSlug])).rows[0];
 if(!counter)fail('COUNTER_NOT_FOUND','Select an existing counter at this branch.',404);
 const observedAt=(await client.query('SELECT clock_timestamp() AS at')).rows[0].at;
 const day=branch.queue_lifecycle_mode==='enforced'?await days.findLatestByLocation(scope.tenantId,scope.locationId,{client,state:'open'}):null;
 const dateKey=day?day.businessDate.replaceAll('-',''):getDateKey(observedAt,branch.timezone||context.location.timezone);
 const closure=branch.queue_lifecycle_mode==='enforced'?null:await closures.findActiveClosure(scope.tenantId,scope.locationId,dateKey,{client});
 const queueOpen=branch.queue_lifecycle_mode==='enforced'?Boolean(day&&day.currentClosesAt>observedAt):!closure;
 // Dispatch occupancy ends once real scoped resource allocation backs started
 // service. The ticket and its allocations remain available to request outcomes.
 const currentTicket=await tickets.findCurrentCalledTicket(scope.tenantId,{client,locationId:scope.locationId,serviceCounterId:counter.id,excludeAllocatedService:true});
 const fifoTicket=queueOpen&&counter.is_active?await tickets.peekNextWaitingTicket(scope.tenantId,{client,locationId:scope.locationId,serviceCounterId:counter.id,dateKey}):null;
 const hoursWindow=await serviceHours.readWindow(client,scope,{observedAt});
 const fifo=await target(client,scope,fifoTicket,{window:hoursWindow});
 const nextTicket=await findNextEligible(client,scope,{queueOpen,counter,dateKey,window:hoursWindow});
 const current=await target(client,scope,currentTicket,{window:hoursWindow}),next=nextTicket,binding={counterSlug:counter.slug,expectedCounterId:counter.id};
 const canOperate=userHasPermission(actor,'tenant.queue.operate',{tenantId:scope.tenantId}),canResolve=userHasPermission(actor,'tenant.ticket.update_state',{tenantId:scope.tenantId});
 const actions=Object.fromEntries(['callNext','callNextEligible','start','complete','interrupt','skip','confirm','manageRequest'].map(action=>[action,blocked('NO_CURRENT_TICKET','No called request at this counter.')]));
 const writeCommand=(value,action,extra={})=>value.kind==='plan'?{kind:'plan',planId:value.plan.id,action,body:{expectedTicketRevision:value.plan.ticketRevision,expectedPlanRevision:value.plan.planRevision,currentStageId:value.plan.currentStage.id,expectedStageRevision:value.plan.currentStage.revision,...binding,...extra}}:{kind:'legacy',ticketId:value.ticketId,action,body:{ticketId:value.ticketId,...binding,...extra}};
 let callBlock=!branch.is_active||!branch.tenant_active?{code:'RESOURCE_SCOPE_INACTIVE',message:'The business or branch is inactive.'}:!queueOpen?{code:'QUEUE_DAY_CLOSED',message:'Open the current Queue Day before calling customers.'}:!counter.is_active?{code:'COUNTER_INACTIVE',message:'Select an active counter before calling customers.'}:current?{code:'COUNTER_OCCUPIED',message:'Resolve this counter’s current call before calling the next customer.'}:!canOperate?{code:'NOT_AUTHORIZED',message:'You cannot operate this queue.'}:null;
 async function actorBlock(value){if(value.kind!=='plan'||value.plan.workflow.mode!=='multi_station')return null;const stage=(await client.query('SELECT * FROM queue_stage_attempts WHERE id=$1',[value.plan.currentStage.attemptId])).rows[0];try{await require('./queueStageService').assertActor(client,scope,stage,actor,{_id:counter.id});return null;}catch(error){return {code:error.code||'FORBIDDEN_SCOPE',message:error.message};}}
 async function callAction(value){
  let reason=callBlock;
  if(!reason&&!value)reason={code:'NO_READY_WAITING_TICKET',message:'No waiting request is ready for this counter.'};
  if(!reason&&value.kind==='unknown')reason=value.blockReason;
  if(!reason&&value.kind==='plan'){
   reason=hoursEligibility.blocks(value.plan.serviceHoursEligibility)?value.plan.serviceHoursEligibility.reason:await actorBlock(value);
   if(!reason&&value.plan.resourceWait)reason=value.plan.resourceWait;
   if(!reason&&!value.plan.allowedActions.includes('call'))reason={code:'REQUEST_NOT_CALLABLE',message:'Refresh the request’s current stage before calling.'};
  }
  return reason?blocked(reason.code,reason.message):available(value.kind==='plan'?writeCommand(value,'call'):{kind:'legacy',action:'callNext',body:binding});
 }
 actions.callNext=await callAction(fifo);
 actions.callNextEligible=await callAction(next);
 if(actions.callNextEligible.command?.kind==='plan')actions.callNextEligible.command.body.dispatchMode='nextEligible';
 if(!current&&next?.kind==='plan')actions.manageRequest=available({kind:'openRequest',planId:next.plan.id});
 if(current){
  if(current.kind==='unknown')for(const key of ['start','complete','interrupt','skip','confirm'])actions[key]=blocked(current.blockReason.code,current.blockReason.message);
  else if(!canResolve)for(const key of ['start','complete','interrupt','skip','confirm'])actions[key]=blocked('NOT_AUTHORIZED','You cannot update this ticket’s state.');
  else if(current.kind==='plan'){
   const plan=current.plan,denied=await actorBlock(current),group=plan.reservationGroups.filter(g=>g.state==='protected'&&g.stageAttemptId===plan.currentStage.attemptId&&g.planRevision===plan.planRevision),allocation=plan.allocationGroups.filter(g=>g.stageAttemptId===plan.currentStage.attemptId&&!g.releasedAt);
   actions.manageRequest=available({kind:'openRequest',planId:plan.id});
   for(const action of ['start','skip','complete','interrupt']){
    if(action==='start'&&!current.ticket.customerConfirmedAt&&current.ticket.joinChannel!=='vendor')actions[action]=blocked('CUSTOMER_CONFIRMATION_REQUIRED','Confirm this customer through the request workflow before starting service.');
    else if(action==='start'&&(!branch.is_active||!branch.tenant_active||!branch.service_timing_enabled))actions[action]=blocked('SERVICE_START_UNAVAILABLE','This branch is not accepting service starts.');
    else if(denied)actions[action]=blocked(denied.code,denied.message);
    else if(!plan.allowedActions.includes(action))actions[action]=blocked(plan.currentStage.startedAt?'USE_RESOURCE_ACTIONS':'ACTION_NOT_AVAILABLE',plan.currentStage.startedAt?'Use this request’s explicit resource outcomes.':'This action is not available for the current request stage.');
    else if(['start','skip'].includes(action)&&group.length===1)actions[action]=available(writeCommand(current,action,{reservationGroupId:group[0].id}));
    else if(['complete','interrupt'].includes(action)&&allocation.length===1)actions[action]=available(writeCommand(current,action,{allocationGroupId:allocation[0].id}));
    else actions[action]=blocked('RESOURCE_BINDING_REQUIRED','Refresh the recorded resource group before continuing.');
   }
   actions.confirm=current.ticket.joinChannel==='vendor'||current.ticket.customerConfirmedAt?blocked('ALREADY_CONFIRMED','This ticket does not need arrival confirmation.'):current.ticket.serviceStartedAt?blocked('ALREADY_STARTED','Service is already started.'):available({kind:'scan',ticketId:current.ticketId,ticketNumber:current.ticketNumber,...binding});
   if(group.some(g=>new Date(g.expiresAt)<=observedAt))for(const action of ['start','skip'])actions[action]=blocked('RESERVATION_EXPIRED','The call protection expired. Refresh the request before calling it again.');
  }else{
   const t=current.ticket,confirmed=t.customerConfirmedAt||t.joinChannel==='vendor';
   actions.confirm=confirmed?blocked('ALREADY_CONFIRMED','This ticket is already confirmed.'):available({kind:'scan',ticketId:current.ticketId,ticketNumber:current.ticketNumber,...binding});
   actions.start=t.serviceStartedAt?blocked('ALREADY_STARTED','Service is already started.'):!confirmed?blocked('CUSTOMER_CONFIRMATION_REQUIRED','Confirm the customer before starting service.'):!branch.is_active||!branch.tenant_active?blocked('RESOURCE_SCOPE_INACTIVE','The business or branch is inactive.'):available(writeCommand(current,branch.service_timing_enabled?'start':'serve'));
   actions.skip=t.serviceStartedAt?blocked('SERVICE_ALREADY_STARTED','Use Interrupt for started work.'):available(writeCommand(current,'skip'));
   actions.complete=t.serviceStartedAt&&!t.serviceEndedAt?available(writeCommand(current,'complete')):blocked('SERVICE_NOT_STARTED','Start service before completing it.');
   actions.interrupt=t.serviceStartedAt&&!t.serviceEndedAt?available(writeCommand(current,'interrupt')):blocked('SERVICE_NOT_STARTED','Start service before interrupting it.');
  }
 }
 const result={controlVersion:1,requestKey:params.requestKey,scope:{tenantId:scope.tenantId,locationId:scope.locationId,counterId:counter.id,counterSlug:counter.slug},observedAt,counter:{id:counter.id,slug:counter.slug,name:counter.name,isActive:counter.is_active},queueDay:{id:day?._id||null,dateKey,open:queueOpen},current:publicTarget(current),fifoNext:publicTarget(fifo),next:publicTarget(next),actions,recallPolicy:'preserve_original_band_age_sequence',refreshAfterMs:15000};
 return {...result,contextKey:createHash('sha256').update(JSON.stringify({...result,requestKey:undefined,observedAt:undefined})).digest('hex')};
}
async function read(context,params){validate(params);return db.withTransaction(async client=>{
 await client.query("SET LOCAL statement_timeout='3000ms'");const scope={tenantId:String(context.tenant._id),locationId:String(context.location._id),actorUserId:String(context.actorUserId)};
 const branch=await client.query('SELECT l.id FROM store_locations l JOIN tenants t ON t.id=l.tenant_id WHERE l.tenant_id=$1 AND l.id=$2 FOR SHARE OF l,t',[scope.tenantId,scope.locationId]);if(!branch.rows.length)fail('LOCATION_NOT_FOUND','Location not found.',404);
 const actor=await readAuthorizedVendorQueueActor(client,scope,'tenant.queue.operate',{forShare:true});if(!actor)fail('NOT_AUTHORIZED','Queue controls are not authorized.',403);
 return evaluate(client,context,params,actor);
 });}
module.exports={read,evaluate,validate,findNextEligible};
