import { namedExtraExecutions } from './namedExtraExecutions';
import type { QueueChildExecutionV3, QueuePublishedSelectionPlanV3 } from '../../../shared/queueSelectionPlanV3';
export type AllocationInterval=QueuePublishedSelectionPlanV3['allocationGroups'][number]['members'][number];
export function durationInterval(member:AllocationInterval,now:number){
 const start=Date.parse(member.startedAt),end=Date.parse(member.expectedEndAt),released=member.releasedAt?Date.parse(member.releasedAt):null;
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||(released===null&&!Number.isFinite(now))||(released!==null&&(!Number.isFinite(released)||released<start))||now<start&&released===null)return null;
 const elapsed=Math.max(0,(released??now)-start),planned=end-start;
 return {elapsed,planned,percent:Math.min(100,Math.max(0,elapsed/planned*100)),overdue:released===null&&now>end,finished:released!==null};
}
export function childIntervals(plan:Pick<QueuePublishedSelectionPlanV3,'allocationGroups'>,child:QueueChildExecutionV3|null){
 if(!child)return [];
 return plan.allocationGroups.filter(group=>group.id===child.allocationGroupId).flatMap(group=>group.members).filter(member=>member.childAttemptId===child.childAttemptId&&child.allocationMemberIds.includes(member.id));
}
export function durationLabel(milliseconds:number){const seconds=Math.floor(milliseconds/1000);const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);return `${hours?`${hours}h `:''}${minutes}m ${seconds%60}s`;}
/** Counts are outcomes, never a percentage of parallel durations. */
export function requestOutcomeCounts(plan:Pick<QueuePublishedSelectionPlanV3,'allocationGroups'|'childAttempts'|'serviceSelections'>,now:number){
 const current=plan.childAttempts?.filter(child=>child.isCurrent)||plan.serviceSelections.flatMap(service=>service.resources.flatMap(resource=>[resource.execution,...resource.extras.flatMap(extra=>namedExtraExecutions(extra).map(member=>member.execution))])).filter((child):child is QueueChildExecutionV3=>Boolean(child));
 const unique=[...new Map(current.map(child=>[child.childAttemptId,child])).values()];
 return {total:unique.length,completed:unique.filter(child=>child.state==='completed').length,overdue:unique.filter(child=>child.isCurrent&&child.state==='in_service'&&childIntervals(plan,child).some(member=>durationInterval(member,now)?.overdue)).length};
}
