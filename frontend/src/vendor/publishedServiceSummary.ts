import type { QueuePublishedSelectionPlanV3 } from '../../../shared/queueSelectionPlanV3';
import type { QueuePublishedSelectionPlanV4 } from '../../../shared/queueSelectionPlanV4';
import { namedExtraExecutions } from './namedExtraExecutions';
type Plan=QueuePublishedSelectionPlanV3|QueuePublishedSelectionPlanV4;
export function readableDuration(minutes:number){const hours=Math.floor(minutes/60),remaining=minutes%60;return [hours?`${hours} ${hours===1?'hour':'hours'}`:'',remaining?`${remaining} ${remaining===1?'minute':'minutes'}`:''].filter(Boolean).join(' ')||'0 minutes';}
export function publishedServiceSummaries(plan:Plan){return plan.serviceSelections.map(service=>{
 const children=service.resources.flatMap(resource=>[resource.execution,...resource.extras.flatMap(extra=>namedExtraExecutions(extra).map(member=>member.execution))]);
 const counts=new Map<string,number>();for(const child of children){const state=child?.state.replaceAll('_',' ')||'not recorded';counts.set(state,(counts.get(state)||0)+1);}
 const actionCount=plan.capabilities.childOutcomes?children.reduce((count,child)=>count+(child?.allowedActions.length||0),0):0;
 const waiting=Boolean(plan.resourceWait&&((!plan.resourceWait.selectionId&&service.stageId===plan.currentStage.id)||service.resources.some(resource=>resource.resourceSelectionId===plan.resourceWait?.selectionId||resource.resourceSelectionId===plan.resourceWait?.parentResourceSelectionId||resource.extras.some(extra=>extra.extraSelectionId===plan.resourceWait?.selectionId))));
 return {id:service.serviceSelectionId,resourceCount:service.resources.length,extraCount:service.resources.reduce((count,resource)=>count+resource.extras.length,0),statuses:[...counts].map(([state,count])=>`${count} ${state}`).join(' · '),actionCount,attention:waiting||actionCount>0||children.some(child=>child?.state==='interrupted')};
});}
export function initiallyExpandedServices(plan:Plan){const summaries=publishedServiceSummaries(plan);const attention=summaries.filter(service=>service.attention).map(service=>service.id);if(attention.length)return attention;const current=plan.serviceSelections.find(service=>service.stageId===plan.currentStage.id);return current?[current.serviceSelectionId]:summaries.slice(0,1).map(service=>service.id);}
