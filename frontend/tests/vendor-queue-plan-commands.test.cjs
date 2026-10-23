require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {planRevisionInput,recordedPlanGroup}=require('../src/vendor/queuePlanCommands.ts');
const plan={ticketRevision:'opaque-ticket',planRevision:'opaque-plan',currentStage:{id:'stage',revision:'opaque-stage',attemptId:'attempt'},reservationGroups:[{id:'old',state:'cancelled',planRevision:'older',stageAttemptId:'attempt'},{id:'hold',state:'protected',planRevision:'opaque-plan',stageAttemptId:'attempt'}],allocationGroups:[{id:'released',releasedAt:'date',stageAttemptId:'attempt'},{id:'actual',releasedAt:null,stageAttemptId:'attempt'}]};
test('commands retain exact ticket, plan and stage revisions and recorded current-attempt group IDs',()=>{
 assert.deepEqual(planRevisionInput(plan),{expectedTicketRevision:'opaque-ticket',expectedPlanRevision:'opaque-plan',currentStageId:'stage',expectedStageRevision:'opaque-stage'});
 assert.equal(recordedPlanGroup(plan,'reservation'),'hold');assert.equal(recordedPlanGroup(plan,'allocation'),'actual');
});
test('ambiguous or stale resource group identity fails closed instead of recomputing demand',()=>{
 assert.throws(()=>recordedPlanGroup({...plan,reservationGroups:[{...plan.reservationGroups[1],stageAttemptId:'old-attempt'}]},'reservation'),/need review/);
 assert.throws(()=>recordedPlanGroup({...plan,allocationGroups:[plan.allocationGroups[1],{...plan.allocationGroups[1],id:'duplicate'}]},'allocation'),/need review/);
});
