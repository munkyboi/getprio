import { serviceHoursCallAllowed } from "./queueServiceHoursPresentation";
import type { QueuePublishedPlanV2 } from '../../../shared/queuePlanV2';
import type { QueuePublishedSelectionPlanV3 } from '../../../shared/queueSelectionPlanV3';
import type { QueuePublishedSelectionPlanV4 } from '../../../shared/queueSelectionPlanV4';
import type { QueueCounterTargetV1, QueueCounterActionNameV1, QueueCounterCommandV1, QueueCounterActionV1 } from '../../../shared/queueCounterControlsV1';

export type CounterCardPlan = QueuePublishedPlanV2 | QueuePublishedSelectionPlanV3 | QueuePublishedSelectionPlanV4;

/** Explicit inspection can show a blocked request; automatic candidacy stays server-selected. */
export function counterCardPlan(selected: CounterCardPlan | null, candidate: CounterCardPlan | null) {
  return selected || candidate;
}

/** Automatic candidacy comes only from this exact backend target, never the loaded picker list. */
export function counterServerCandidate(target: QueueCounterTargetV1 | null | undefined, plan: CounterCardPlan | undefined): CounterCardPlan | null {
  return plan?.state === 'waiting' && target?.planId === plan.id &&
    serviceHoursCallAllowed(target.serviceHoursEligibility) && serviceHoursCallAllowed(plan.serviceHoursEligibility) ? plan : null;
}

/** Started resource-backed plans leave the dispatch lane; legacy lifecycle remains counter-owned. */
export function counterDispatchCurrent(current:QueueCounterTargetV1|null|undefined){
 return current?.kind==='plan'&&(current.serviceStartedAt||current.state==='in_service')?null:current;
}

export function counterToolbarActions(current: QueueCounterTargetV1 | null | undefined, needsConfirmation: boolean): QueueCounterActionNameV1[] {
  current=counterDispatchCurrent(current);
  if (!current) return ['callNext','callNextEligible'];
  if (current.serviceStartedAt) return ['complete', 'interrupt'];
  return ['start', ...(needsConfirmation ? ['confirm' as const] : []), 'skip'];
}

/** The card acts on its displayed request, independent of FIFO and automatic selection. */
export function counterSelectedCall(plan: CounterCardPlan | null, counterSlug: string, counterId: string | undefined, canCall: boolean): Extract<QueueCounterCommandV1,{kind:'plan'}> | null {
  if (!plan || !canCall || !counterId || !counterSlug || plan.state !== 'waiting' || plan.resourceWait || !serviceHoursCallAllowed(plan.serviceHoursEligibility) || !plan.allowedActions.includes('call')) return null;
  return {kind:'plan', planId:plan.id, action:'call', body:{counterSlug, expectedCounterId:counterId, expectedTicketRevision:plan.ticketRevision, expectedPlanRevision:plan.planRevision, currentStageId:plan.currentStage.id, expectedStageRevision:plan.currentStage.revision, dispatchMode:'selectedRequest'}};
}

export function counterCardShowsStart(plan: CounterCardPlan | null, current: QueueCounterTargetV1 | null | undefined) {
  return Boolean(plan && current?.planId === plan.id && plan.state === 'called' && !current.serviceStartedAt);
}

export function counterCurrentStart(current:QueueCounterTargetV1|null|undefined,action:QueueCounterActionV1|undefined,counterSlug:string,counterId:string|undefined):QueueCounterCommandV1|null {
  const command=action?.command;
  if(!current||current.kind==='unknown'||current.state!=='called'||current.serviceStartedAt||!action?.enabled||!command||(command.kind!=='plan'&&command.kind!=='legacy')||command.action!=='start'||command.body.counterSlug!==counterSlug||command.body.expectedCounterId!==counterId)return null;
  if(command.kind==='plan')return current.kind==='plan'&&current.planId&&command.planId===current.planId?command:null;
  return current.kind==='legacy'&&(command.ticketId||command.body.ticketId)===current.ticketId?command:null;
}
export function counterPlanSummary(plan:CounterCardPlan|undefined|null) {
  if(!plan)return null;
  const stages=new Map<string,number>();
  if('serviceSelections' in plan){for(const service of plan.serviceSelections)stages.set(service.stageId,Math.max(stages.get(service.stageId)||0,...service.resources.map(resource=>resource.durationMinutes).filter(value=>Number.isFinite(value)&&value>0)));return {services:plan.serviceSelections.length,resources:plan.serviceSelections.reduce((count,service)=>count+service.resources.length,0),minutes:[...stages.values()].reduce((sum,value)=>sum+value,0)};}
  for(const line of plan.lines)stages.set(line.stageId,Math.max(stages.get(line.stageId)||0,Number.isFinite(line.durationMinutes)&&line.durationMinutes>0?line.durationMinutes:0));
  return {services:plan.lines.length,resources:plan.lines.reduce((count,line)=>count+line.requirements.reduce((sum,requirement)=>sum+requirement.totalUnits,0),0),minutes:[...stages.values()].reduce((sum,value)=>sum+value,0)};
}
export function counterInspectionPlans(plans:CounterCardPlan[],current:QueueCounterTargetV1|null|undefined) {
  return [...new Map(plans.filter(plan=>plan.id!==current?.planId&&(!current||plan.ticketId!==current.ticketId)).map(plan=>[plan.id,plan])).values()].sort((a,b)=>Date.parse(a.publishedAt)-Date.parse(b.publishedAt));
}

/** A new observer/scope needs a successful read; background fetches retain that same-key acceptance. */
export function counterReadReady(read:{data:unknown;isError:boolean;isFetchedAfterMount:boolean}){
 return Boolean(read.data)&&read.isFetchedAfterMount&&!read.isError;
}
function callBlocked(plan:CounterCardPlan){
 return plan.state!=='waiting'||Boolean(plan.resourceWait)||!serviceHoursCallAllowed(plan.serviceHoursEligibility)||!plan.allowedActions.includes('call');
}
/** Compare only server observation timestamps. Incomparable snapshots cannot clear a known block. */
export function counterLatestPlans(...groups:CounterCardPlan[][]){
 const plans=new Map<string,CounterCardPlan>();
 for(const plan of groups.flat()){
  const existing=plans.get(plan.id);
  if(!existing){plans.set(plan.id,plan);continue;}
  const observed=Date.parse(plan.observedAt),previous=Date.parse(existing.observedAt);
  if(Number.isFinite(observed)&&Number.isFinite(previous)&&observed!==previous){if(observed>previous)plans.set(plan.id,plan);}
  else if(callBlocked(plan)&&!callBlocked(existing))plans.set(plan.id,plan);
 }
 return [...plans.values()];
}
export function counterPickerText(ticketNumber:string,customerName:string|undefined,state:string,conflict:boolean){
 const suffix=conflict?'Resource conflict':state!=='waiting'?state.replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase()):'';
 return `${ticketNumber} · ${customerName||'Customer'}${suffix?` · ${suffix}`:''}`;
}
