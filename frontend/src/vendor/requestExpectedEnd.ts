import type { QueuePublishedSelectionPlanV3, QueueChildExecutionV3 } from '../../../shared/queueSelectionPlanV3';
import type { QueuePublishedSelectionPlanV4 } from '../../../shared/queueSelectionPlanV4';
import { childIntervals, durationInterval } from './requestDuration';
import { namedExtraExecutions } from './namedExtraExecutions';
export function expectedEndCountdown(remainingMs:number){
 if(remainingMs===0)return 'Due now';
 const minutes=Math.ceil(Math.abs(remainingMs)/60000),hours=Math.floor(minutes/60),remainder=minutes%60;
 const duration=[hours?`${hours}hr`:'',remainder?`${remainder}min`:''].filter(Boolean).join(' ');
 return remainingMs>0?`in ${duration}`:`${duration} overdue`;
}
/** This is active work's recorded end, never a forecast for unstarted stages or resource release. */
export function requestExpectedEnd(plan:QueuePublishedSelectionPlanV3|QueuePublishedSelectionPlanV4,now:number,timeZone:string|undefined){
 if(plan.state!=='in_service'||!Number.isFinite(now)||!timeZone)return null;
 const stage=plan.currentStage,stageStart=Date.parse(stage.startedAt||'');
 if(stage.state!=='in_service'||!Number.isFinite(stageStart)||stageStart>now)return null;
 const attempts=plan.childAttempts?.length?plan.childAttempts:plan.serviceSelections.flatMap(service=>service.resources.flatMap(resource=>[resource.execution,...resource.extras.flatMap(extra=>namedExtraExecutions(extra).map(member=>member.execution))])).filter((child):child is QueueChildExecutionV3=>Boolean(child));
 const children=[...new Map(attempts.filter(child=>child.isCurrent&&child.state==='in_service'&&child.stageId===stage.id&&child.stageAttemptId===stage.attemptId).map(child=>[child.childAttemptId,child])).values()];
 if(!children.length)return null;
 const scoped={allocationGroups:plan.allocationGroups.filter(group=>group.stageAttemptId===stage.attemptId&&!group.releasedAt&&!group.outcome&&['open','partial'].includes(group.resolutionState))};
 const ends:number[]=[];
 for(const child of children){
  const members=childIntervals(scoped,child);
  if(!members.length||members.length!==new Set(child.allocationMemberIds).size)return null;
  for(const member of members){
   if(member.releasedAt||!durationInterval(member,now)||Date.parse(member.startedAt)<stageStart)return null;
   ends.push(Date.parse(member.expectedEndAt));
  }
 }
 const end=Math.max(...ends);let label:string;
 try{label=new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(end)).toLowerCase();}catch{return null;}
 const futureStage=plan.stages.some(other=>other.ordinal>stage.ordinal&&!['completed','skipped','superseded'].includes(other.state));
 const pendingCurrent=plan.serviceSelections.filter(service=>service.stageId===stage.id).some(service=>service.resources.some(resource=>!resource.execution||!['in_service','completed'].includes(resource.execution.state)||resource.extras.some(extra=>namedExtraExecutions(extra).some(member=>!member.execution||!['in_service','completed'].includes(member.execution.state)))));
 const workOnly=futureStage||pendingCurrent;
 return {end,iso:new Date(end).toISOString(),label,workOnly,countdown:expectedEndCountdown(end-now),overdue:now>end};
}
