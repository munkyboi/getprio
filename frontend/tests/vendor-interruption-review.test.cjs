require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {buildInterruptionReview,confirmedInterruption}=require('../src/vendor/namedInterruptionReview.ts');
function fixture(){
 const child=(id,selection,memberIds,parent=null,state='in_service')=>({childAttemptId:id,revision:`rev-${id}`,isCurrent:true,planRevision:'plan-r',stageAttemptId:'stage-attempt',state,selectionId:selection,parentResourceSelectionId:parent,allocationGroupId:'active-group',allocationMemberIds:memberIds,allowedActions:['interrupt']});
 const member=(id,attempt,selection,units=1,releasedAt=null)=>({id,childAttemptId:attempt,selectionId:selection,units,startedAt:'2026-10-20T01:00:00Z',expectedEndAt:'2026-10-20T02:00:00Z',releasedAt});
 return {id:'plan',ticketRevision:'ticket-r',planRevision:'plan-r',currentStage:{id:'stage',revision:'stage-r',attemptId:'stage-attempt'},capabilities:{childOutcomes:true},serviceSelections:[{serviceName:'Court rental',resources:[{resourceSelectionId:'court-1',resourceMemberName:'Court A',durationMinutes:180,execution:child('court-attempt','court-1',['court-a','court-b']),extras:[{extraSelectionId:'equipment',serviceName:'Equipment',durationMinutes:180,execution:child('equipment-attempt','equipment',['equipment-a'],'court-1')},{extraSelectionId:'trainer',serviceName:'Trainer',durationMinutes:180,namedExtraVersion:1,resourceMembers:[{id:'trainer-j',name:'Jane'},{id:'trainer-m',name:'Mark'}],memberExecutions:[{resourceMemberId:'trainer-j',execution:child('jane-attempt','trainer-j',['jane-a'],'court-1')},{resourceMemberId:'trainer-m',execution:child('mark-attempt','trainer-m',['mark-a'],'court-1')} ]},{extraSelectionId:'finished',serviceName:'Finished extra',durationMinutes:30,execution:child('finished-attempt','finished',['finished-a'],'court-1','completed')}]},{resourceSelectionId:'court-2',resourceMemberName:'Court B',durationMinutes:180,execution:child('sibling-attempt','court-2',['sibling-a']),extras:[]}]}],allocationGroups:[{id:'active-group',stageAttemptId:'stage-attempt',releasedAt:null,members:[member('court-a','court-attempt','court-1'),member('court-b','court-attempt','court-1'),member('equipment-a','equipment-attempt','equipment',4),member('jane-a','jane-attempt','trainer-j'),member('mark-a','mark-attempt','trainer-m'),member('sibling-a','sibling-attempt','court-2'),member('finished-a','finished-attempt','finished',1,'2026-10-20T01:30:00Z')]}]};
}
test('authoritative member lineage lists primary and every active dependent extra while identifying unaffected siblings',()=>{
 const review=buildInterruptionReview(fixture(),'court-attempt');
 assert.deepEqual(review.affected.map(item=>[item.name,item.units,item.plannedMinutes,item.allocationIds]),[['Court A',2,60,['court-a','court-b']],['Equipment',4,60,['equipment-a']],['Trainer · Jane',1,60,['jane-a']],['Trainer · Mark',1,60,['mark-a']]]);
 assert.deepEqual(review.otherActive.map(item=>item.name),['Court B']);
 assert.deepEqual(review.body.interruptedExtras,[{childAttemptId:'equipment-attempt',expectedChildRevision:'rev-equipment-attempt'},{childAttemptId:'jane-attempt',expectedChildRevision:'rev-jane-attempt'},{childAttemptId:'mark-attempt',expectedChildRevision:'rev-mark-attempt'}]);
 assert.equal(review.body.allocationGroupId,'active-group');assert.equal(review.body.childAttemptId,'court-attempt');
});
test('confirmed command covers exactly reviewed children and excludes completed/unaffected allocations',()=>{
 const plan=fixture(),review=buildInterruptionReview(plan,'court-attempt'),body=confirmedInterruption(review,structuredClone(plan),'  Customer asked  ');
 assert.deepEqual(body,{...review.body,reason:'Customer asked'});
 const ids=[body.childAttemptId,...body.interruptedExtras.map(item=>item.childAttemptId)];
 assert.deepEqual(ids,review.affected.map(item=>item.child.childAttemptId));assert.ok(!ids.includes('sibling-attempt'));assert.ok(!ids.includes('finished-attempt'));
});
test('selecting a leaf extra never expands interruption to the primary court or sibling extras',()=>{
 const review=buildInterruptionReview(fixture(),'jane-attempt');assert.deepEqual(review.affected.map(item=>item.name),['Trainer · Jane']);assert.deepEqual(review.body.interruptedExtras,[]);assert.equal(review.otherActive.length,4);
});
test('stale revisions, missing/extra/orphan members and wrong parent fail closed',()=>{
 for(const mutate of [p=>p.planRevision='new',p=>p.allocationGroups[0].members.shift(),p=>p.allocationGroups[0].members.push({...p.allocationGroups[0].members[0],id:'orphan',childAttemptId:'unknown'}),p=>p.serviceSelections[0].resources[0].extras[0].execution.parentResourceSelectionId='other-court',p=>p.serviceSelections[0].resources[0].execution.allocationMemberIds=['wrong'],p=>p.allocationGroups[0].releasedAt='released']){
  const plan=fixture();mutate(plan);assert.throws(()=>buildInterruptionReview(plan,'court-attempt'),/Refresh|reconcile/);
 }
});
test('changes after review block confirmation rather than sending a different release list',()=>{
 const plan=fixture(),review=buildInterruptionReview(plan,'court-attempt');
 for(const mutate of [p=>p.ticketRevision='new-ticket',p=>p.allocationGroups[0].members[0].units=3,p=>p.serviceSelections[0].resources[0].resourceMemberName='Different court',p=>p.serviceSelections[0].resources[0].extras[0].execution.revision='new-child']){
  const latest=structuredClone(plan);mutate(latest);assert.throws(()=>confirmedInterruption(review,latest,'Reason'),/changed/);
 }
 assert.throws(()=>confirmedInterruption(review,plan,'  '),/reason/);
});
