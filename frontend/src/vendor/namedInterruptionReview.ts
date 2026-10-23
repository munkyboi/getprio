import type { QueueChildExecutionV3, QueuePublishedSelectionPlanV3 } from '../../../shared/queueSelectionPlanV3';
import type { QueuePublishedSelectionPlanV4 } from '../../../shared/queueSelectionPlanV4';
import { namedExtraExecutions } from './namedExtraExecutions';
import { namedChildCommand } from './namedQueueCommands';

type Plan = QueuePublishedSelectionPlanV3 | QueuePublishedSelectionPlanV4;
type Selection = { child: QueueChildExecutionV3; name: string; kind: 'resource' | 'extra'; courtId: string; durationMinutes: number };
export type InterruptionItem = Selection & { allocationIds: string[]; units: number; plannedMinutes: number | null };
export type InterruptionReview = { plan: Plan; primary: InterruptionItem; affected: InterruptionItem[]; otherActive: InterruptionItem[]; body: ReturnType<typeof namedChildCommand> & { interruptedExtras: Array<{childAttemptId:string;expectedChildRevision:string}> } };
const mismatch = () => Error('Refresh this request to reconcile its active resources before interruption.');

export function buildInterruptionReview(plan: Plan, primaryAttemptId: string): InterruptionReview {
  const selections: Selection[] = [];
  for (const service of plan.serviceSelections) for (const resource of service.resources) {
    if (resource.execution) selections.push({child:resource.execution,name:resource.resourceMemberName || service.serviceName,kind:'resource',courtId:resource.resourceSelectionId,durationMinutes:resource.durationMinutes});
    for (const extra of resource.extras) for (const member of namedExtraExecutions(extra)) {
      if (member.execution) selections.push({child:member.execution,name:member.name,kind:'extra',courtId:resource.resourceSelectionId,durationMinutes:extra.durationMinutes});
    }
  }
  const current = selections.filter(item=>item.child.isCurrent && item.child.planRevision===plan.planRevision && item.child.stageAttemptId===plan.currentStage.attemptId && item.child.state==='in_service');
  const primary = current.filter(item=>item.child.childAttemptId===primaryAttemptId);
  if (primary.length!==1 || !plan.capabilities.childOutcomes || !primary[0].child.allowedActions.includes('interrupt')) throw mismatch();
  const body = namedChildCommand(plan,primary[0].child);
  const groups = plan.allocationGroups.filter(group=>group.id===body.allocationGroupId && group.stageAttemptId===plan.currentStage.attemptId && !group.releasedAt);
  if(groups.length!==1)throw mismatch();
  const group=groups[0], liveMembers=group.members.filter(member=>!member.releasedAt);
  if(!liveMembers.length || new Set(liveMembers.map(member=>member.id)).size!==liveMembers.length)throw mismatch();
  const active: InterruptionItem[] = current.filter(item=>item.child.allocationGroupId===group.id).map(item=>{
    const members=liveMembers.filter(member=>member.childAttemptId===item.child.childAttemptId);
    const recorded=[...item.child.allocationMemberIds].sort();
    if(!members.length || JSON.stringify(members.map(member=>member.id).sort())!==JSON.stringify(recorded) || members.some(member=>member.selectionId!==item.child.selectionId || !Number.isFinite(member.units) || member.units<=0))throw mismatch();
    const intervals=members.map(member=>(Date.parse(member.expectedEndAt)-Date.parse(member.startedAt))/60000);
    return {...item,allocationIds:members.map(member=>member.id).sort(),units:members.reduce((sum,member)=>sum+member.units,0),plannedMinutes:intervals.every(minutes=>Number.isFinite(minutes)&&minutes>0)?Math.max(...intervals):Number.isFinite(item.durationMinutes)?item.durationMinutes:null};
  });
  if(new Set(active.map(item=>item.child.childAttemptId)).size!==active.length || liveMembers.some(member=>!active.some(item=>item.allocationIds.includes(member.id))))throw mismatch();
  const selected=active.find(item=>item.child.childAttemptId===primaryAttemptId);
  if(!selected)throw mismatch();
  const extras=selected.kind==='resource'?current.filter(item=>item.kind==='extra'&&item.courtId===selected.courtId):[];
  if(extras.some(item=>item.child.allocationGroupId!==group.id || item.child.parentResourceSelectionId!==selected.courtId))throw mismatch();
  const affected=active.filter(item=>item.child.childAttemptId===primaryAttemptId || extras.some(extra=>extra.child.childAttemptId===item.child.childAttemptId));
  const otherActive=active.filter(item=>!affected.includes(item));
  return {plan,primary:selected,affected:[selected,...affected.filter(item=>item!==selected)],otherActive,body:{...body,interruptedExtras:extras.map(item=>({childAttemptId:item.child.childAttemptId,expectedChildRevision:item.child.revision}))}};
}

export function interruptionFingerprint(review: InterruptionReview) {
  return JSON.stringify({body:review.body,affected:review.affected.map(item=>({name:item.name,child:item.child.childAttemptId,ids:item.allocationIds,units:item.units,minutes:item.plannedMinutes})),otherActive:review.otherActive.map(item=>({name:item.name,child:item.child.childAttemptId,ids:item.allocationIds}))});
}

export function confirmedInterruption(review: InterruptionReview, latest: Plan, reason: string) {
  if(!reason.trim())throw Error('Enter a reason for resource interruption.');
  const current=buildInterruptionReview(latest,review.primary.child.childAttemptId);
  if(interruptionFingerprint(current)!==interruptionFingerprint(review))throw Error('The active resources changed. Close this dialog and review the request again.');
  return {...current.body,reason:reason.trim()};
}
