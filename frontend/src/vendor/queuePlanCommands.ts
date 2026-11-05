import type { QueuePlanCommandInputV2, QueuePublishedPlanV2 } from "../../../shared/queuePlanV2";
export function planRevisionInput(plan:QueuePublishedPlanV2):QueuePlanCommandInputV2 {
 return {expectedTicketRevision:plan.ticketRevision,expectedPlanRevision:plan.planRevision,currentStageId:plan.currentStage.id,expectedStageRevision:plan.currentStage.revision};
}
export function recordedPlanGroup(plan:QueuePublishedPlanV2,kind:'reservation'|'allocation'):string {
 const groups=kind==='reservation'
  ? plan.reservationGroups.filter(group=>group.state==='protected' && group.planRevision===plan.planRevision && group.stageAttemptId===plan.currentStage.attemptId)
  : plan.allocationGroups.filter(group=>group.releasedAt===null && group.stageAttemptId===plan.currentStage.attemptId);
 if(groups.length!==1)throw new Error('Resource records need review. Refresh this ticket before continuing.');
 return groups[0].id;
}
