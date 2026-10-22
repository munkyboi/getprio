import type { QueueChildCommandInputV3, QueueChildExecutionV3, QueuePublishedSelectionPlanV3 } from '../../../shared/queueSelectionPlanV3';
export function namedPlanRevisions(plan:Pick<QueuePublishedSelectionPlanV3,'ticketRevision'|'planRevision'|'currentStage'>){return {expectedTicketRevision:plan.ticketRevision,expectedPlanRevision:plan.planRevision,currentStageId:plan.currentStage.id,expectedStageRevision:plan.currentStage.revision};}
export function namedChildCommand(plan:Pick<QueuePublishedSelectionPlanV3,'ticketRevision'|'planRevision'|'currentStage'>,child:QueueChildExecutionV3):QueueChildCommandInputV3 {
 if(!child.isCurrent||child.planRevision!==plan.planRevision||child.stageAttemptId!==plan.currentStage.attemptId||!child.allocationGroupId)throw Error('Refresh this request to review the recorded child allocation.');
 return {...namedPlanRevisions(plan),childAttemptId:child.childAttemptId,expectedChildRevision:child.revision,allocationGroupId:child.allocationGroupId};
}
