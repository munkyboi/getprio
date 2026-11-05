require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {counterCardPlan,counterServerCandidate,counterToolbarActions,counterSelectedCall,counterCardShowsStart}=require('../src/vendor/queueCounterCard.ts');
const candidate={id:'vd006',ticketNumber:'VD006',state:'waiting',resourceWait:null,serviceHoursEligibility:{status:'not_enforced',reason:null,requiredDurationMinutes:null,serviceHoursWindow:null,nextChangeAt:null},allowedActions:['call'],ticketRevision:'4',planRevision:'2',currentStage:{id:'stage6',revision:'3'}};
const blocked={...candidate,id:'vd005',ticketNumber:'VD005',resourceWait:{code:'RESOURCE_OCCUPIED',message:'Court3 is occupied'}};
test('explicit request selection shows its own state and conflict even when another request is eligible',()=>{
 assert.equal(counterCardPlan(blocked,candidate),blocked);
 assert.equal(counterCardPlan(null,candidate),candidate);

});
test('toolbar hides current-ticket actions until called, and confirmation is remote-only',()=>{
 assert.deepEqual(counterToolbarActions(null,false),['callNext','callNextEligible']);
 const called={ticketId:'7',state:'called',serviceStartedAt:null};
 assert.deepEqual(counterToolbarActions(called,false),['start','skip']);
 assert.deepEqual(counterToolbarActions(called,true),['start','confirm','skip']);
 assert.deepEqual(counterToolbarActions({...called,serviceStartedAt:'2026-10-20T12:00:00Z'},true),['complete','interrupt']);
});
test('card call targets the selected request instead of the automatic candidate, retaining safe revisions',()=>{
 const selected={...candidate,id:'vd007',ticketNumber:'VD007'};
 const command=counterSelectedCall(selected,'court-dispatch','1',true);
 assert.equal(command.planId,'vd007');assert.equal(command.body.dispatchMode,'selectedRequest');
 assert.equal(command.body.expectedTicketRevision,selected.ticketRevision);assert.equal(command.body.currentStageId,selected.currentStage.id);
 assert.equal(counterSelectedCall(blocked,'court-dispatch','1',true),null);
 assert.equal(counterSelectedCall(selected,'court-dispatch','1',false),null);
 assert.equal(counterSelectedCall({...selected,state:'called'},'court-dispatch','1',true),null);
});
test('card Start only appears for the selected counter’s called request and disappears after service starts',()=>{
 const plan={...candidate,state:'called'};
 const current={ticketId:'6',planId:plan.id,serviceStartedAt:null};
 assert.equal(counterCardShowsStart(plan,current),true);
 assert.equal(counterCardShowsStart({...plan,id:'other-request'},current),false);
 assert.equal(counterCardShowsStart(candidate,current),false);
 assert.equal(counterCardShowsStart(plan,{...current,serviceStartedAt:'2026-10-20T12:00:00Z'}),false);
 assert.equal(counterCardShowsStart(plan,null),false);
});

test('automatic card never manufactures a candidate from a loaded request when backend next is empty or mismatched',()=>{
 assert.equal(counterServerCandidate(null,candidate,false),null);
 assert.equal(counterServerCandidate({planId:'other',serviceHoursEligibility:candidate.serviceHoursEligibility},candidate,false),null);
 assert.equal(counterServerCandidate({planId:candidate.id,serviceHoursEligibility:candidate.serviceHoursEligibility},candidate,false),candidate);
 assert.equal(counterServerCandidate({planId:candidate.id,serviceHoursEligibility:candidate.serviceHoursEligibility},candidate),candidate,'next remains displayable while a separate current ticket occupies the counter');
});
test('manual blocked request stays inspectable but hours rejection and unknown cannot build Call',()=>{
 for(const status of ['does_not_fit','unavailable']){
  const selected={...candidate,serviceHoursEligibility:{...candidate.serviceHoursEligibility,status,reason:{code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS',message:'This request cannot finish before closing.'}}};
  assert.equal(counterCardPlan(selected,candidate),selected);
  assert.equal(counterSelectedCall(selected,'court-dispatch','1',true),null);
  assert.equal(counterServerCandidate({planId:selected.id,serviceHoursEligibility:selected.serviceHoursEligibility},selected,false),null);
 }
 assert.equal(counterSelectedCall({...candidate,serviceHoursEligibility:undefined},'court-dispatch','1',true),null);
 assert.ok(counterSelectedCall({...candidate,serviceHoursEligibility:{...candidate.serviceHoursEligibility,status:'fits'}},'court-dispatch','1',true));
});
