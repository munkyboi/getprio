const locations = require('../repositories/storeLocations');
const {resolveEffectiveStoreInterval} = require('./queueDayTime');
const {normalizeTimeZone} = require('../utils/timezones');

function unavailable(message = 'The service request hours could not be verified. Refresh before continuing.') {
  return Object.assign(new Error(message), {code:'STORE_HOURS_UNAVAILABLE',statusCode:409});
}
function windowAt({now,timezone,hours}) {
  const observed = new Date(now);
  if (!Number.isFinite(observed.getTime())) throw unavailable();
  const zone = normalizeTimeZone(timezone);
  const result = {status:'unavailable',observedAt:observed.toISOString(),timezone:zone,
    opensAt:null,closesAt:null,remainingWholeMinutes:null,provisional:true};
  try {
    const interval = resolveEffectiveStoreInterval({now:observed,timezone:zone,hours});
    if (!interval) return {...result,status:'closed'};
    return {...result,status:'open',opensAt:interval.opensAt.toISOString(),closesAt:interval.closesAt.toISOString(),
      remainingWholeMinutes:Math.max(0,Math.floor((interval.closesAt.getTime()-observed.getTime())/60000))};
  } catch { return result; }
}
async function readWindow(client,scope,{observedAt}={}) {
  // Callers already hold the normal authorized branch transaction lock. Read
  // clock_timestamp AFTER that lock; transaction-start time may be stale.
  const row = (await client.query('SELECT timezone,clock_timestamp() AS observed_at FROM store_locations WHERE tenant_id=$1 AND id=$2',
    [scope.tenantId,scope.locationId])).rows[0];
  if (!row) throw unavailable();
  // observedAt is INTERNAL only: ledger guards bind to their DB-generated
  // p.observed_at, the exact timestamp written on reservations/allocations.
  const hours = await locations.listHoursByLocationId(scope.locationId,{client});
  return windowAt({now:observedAt===undefined?row.observed_at:observedAt,timezone:row.timezone,hours});
}
function stageDurations(items,workflow) {
  if (!Array.isArray(items)||!items.length||!workflow||!['linear','multi_station'].includes(workflow.mode)) throw unavailable();
  const ids = new Set();
  for (const item of items) {
    if (!item||typeof item.selectionId!=='string'||!item.selectionId||ids.has(item.selectionId)
      ||!['resource','extra'].includes(item.selectionKind)||(item.executionMode!==undefined&&item.executionMode!=='parallel')||!Number.isSafeInteger(item.durationMinutes)
      ||item.durationMinutes<1||item.durationMinutes>480) throw unavailable();
    ids.add(item.selectionId);
  }
  const roots=items.filter(item=>item.selectionKind==='resource');
  if (!roots.length) throw unavailable();
  const stages=workflow.mode==='linear'?[{stageId:null}]:workflow.stages;
  if (!Array.isArray(stages)||!stages.length||stages.length>20) throw unavailable();
  const stageIds=new Set(),serviceIds=new Set();
  if (workflow.mode==='multi_station') for(const stage of stages) {
    if (!stage||typeof stage.stageId!=='string'||!stage.stageId||stageIds.has(stage.stageId)
      ||!Array.isArray(stage.serviceIds)||!stage.serviceIds.length
      ||Object.hasOwn(stage,'dependsOn')||Object.hasOwn(stage,'dependencies')) throw unavailable();
    stageIds.add(stage.stageId);
    for(const serviceId of stage.serviceIds){if(serviceIds.has(serviceId))throw unavailable();serviceIds.add(serviceId);}
  }
  for(const root of roots) {
    if (typeof root.serviceSelectionId!=='string'||!root.serviceSelectionId||typeof root.serviceId!=='string') throw unavailable();
    if (workflow.mode==='multi_station' && !stages.some(stage=>stage.stageId===root.stageId&&stage.serviceIds.includes(root.serviceId))) throw unavailable();
  }
  for(const extra of items.filter(item=>item.selectionKind==='extra')) {
    const parent=roots.find(root=>root.selectionId===extra.parentResourceSelectionId);
    if (!parent||extra.serviceSelectionId!==parent.serviceSelectionId||extra.durationMinutes>parent.durationMinutes
      ||(workflow.mode==='multi_station'&&extra.stageId!==parent.stageId)) throw unavailable();
  }
  return stages.flatMap(stage=>{
    const selected=workflow.mode==='linear'?roots:roots.filter(root=>root.stageId===stage.stageId);
    // Resources in one stage start together; quantities and contained extras
    // consume capacity, not additional elapsed minutes.
    return selected.length?[{stageId:stage.stageId,durationMinutes:Math.max(...selected.map(item=>item.durationMinutes))}]:[];
  });
}
function durationMinutes(items,workflow) {
  return stageDurations(items,workflow).reduce((sum,stage)=>sum+stage.durationMinutes,0);
}
function assertFits(window,minutes) {
  if (!Number.isSafeInteger(minutes)||minutes<1||window?.status==='unavailable') throw unavailable();
  const start=new Date(window?.observedAt).getTime(),close=new Date(window?.closesAt).getTime();
  if (window?.status!=='open'||!Number.isFinite(start)||!Number.isFinite(close)||start+minutes*60000>close) {
    throw Object.assign(new Error('The selected duration must finish within the current store hours. Choose a shorter duration or try another operating window.'),
      {code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS',statusCode:409,serviceHoursWindow:window});
  }
  return window;
}
async function assertPlanFits(client,scope,items,workflow) {
  const minutes=durationMinutes(items,workflow);
  return assertFits(await readWindow(client,scope),minutes);
}
function provenance(items) {
  if (!Array.isArray(items)||!items.some(item=>item&&Object.hasOwn(item,'storeHoursEnforcementVersion'))) return 'historical';
  if (!items.length||items.some(item=>!item||item.storeHoursEnforcementVersion!==1)) throw unavailable('The request hours-policy snapshot needs reconciliation. Refresh before continuing.');
  return 'enforced';
}
function tagItems(items) {
  for (const item of items) item.storeHoursEnforcementVersion=1;
  return items;
}
function remainingDuration(items,workflow,attempts,current,{retrySelectionId}={}) {
  const durations=stageDurations(items,workflow);
  const required=workflow.mode==='linear'?[...new Set(items.map(item=>item.stageId))]:durations.map(stage=>stage.stageId);
  if (required.length!==durations.length||required.some(id=>typeof id!=='string'||!id)||!Array.isArray(attempts)||attempts.length!==required.length) throw unavailable();
  const ordered=required.map((stageId,index)=>{
    const matches=attempts.filter(row=>row.stage_id===stageId);
    if(matches.length!==1||Number(matches[0].ordinal)!==index+1)throw unavailable();
    return matches[0];
  });
  const index=ordered.findIndex(row=>row.id===current.id&&row.stage_id===current.stage_id);
  if(index<0||ordered.some((row,at)=>at<index?row.state!=='completed':at>index&&row.state!=='pending'))throw unavailable();
  let currentMinutes=durations[index].durationMinutes;
  if(retrySelectionId!==undefined){
    const root=items.find(item=>item.selectionId===retrySelectionId&&item.selectionKind==='resource'&&item.stageId===current.stage_id);
    if(!root)throw unavailable();
    currentMinutes=root.durationMinutes;
  }
  return currentMinutes+durations.slice(index+1).reduce((sum,stage)=>sum+stage.durationMinutes,0);
}
async function assertRemainingPlanFits(client,scope,plan,current,{retryChildId,retrySelectionId,observedAt}={}) {
  if (provenance(plan.items)!=='enforced') return;
  const workflow=await require('./queueWorkflowService').readVersion(client,scope,plan.workflow_configuration_revision);
  const attempts=await require('./queueStageService').latestStages(client,scope,plan.ticket_id);
  if(current.stage_id!==plan.stage_id||current.id!==plan.stage_attempt_id)throw unavailable();
  if(retryChildId!==undefined){
    const child=(await client.query(`SELECT selection_id,selection_kind,stage_id,plan_revision::text FROM queue_child_attempts
      WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND id=$4 AND is_current=TRUE`,
      [scope.tenantId,scope.locationId,plan.ticket_id,retryChildId])).rows[0];
    if(!child||child.selection_kind!=='resource'||child.stage_id!==current.stage_id||child.plan_revision!==String(plan.revision))throw unavailable();
    retrySelectionId=child.selection_id;
  }
  return assertFits(await readWindow(client,scope,{observedAt}),remainingDuration(plan.items,workflow,attempts,current,{retrySelectionId}));
}
async function assertLedgerPlanFits(client,tuple,plan,children,{retry=false}={}) {
  if(plan.contract_version!==4||provenance(plan.items)!=='enforced')return;
  const roots=retry?children.filter(child=>child.selection_kind==='resource'):[];
  if(retry&&roots.length!==1)throw unavailable();
  return assertRemainingPlanFits(client,{tenantId:String(tuple[0]),locationId:String(tuple[1])},plan,
    {id:plan.stage_attempt_id,stage_id:plan.stage_id},
    {observedAt:plan.observed_at,...(retry?{retrySelectionId:roots[0].selection_id}:{})});
}
module.exports={assertLedgerPlanFits,windowAt,readWindow,stageDurations,durationMinutes,assertFits,assertPlanFits,provenance,tagItems,remainingDuration,assertRemainingPlanFits};
