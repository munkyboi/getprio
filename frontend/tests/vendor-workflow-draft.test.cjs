require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {workflowDraftIssues,moveWorkflowStage}=require('../src/vendor/queueWorkflowDraft.ts');
const counters=[{id:'counter',name:'Dispatch'}],services=[{id:'court',name:'Court'},{id:'equipment',name:'Equipment'}];
const draft={mode:'multi_station',stations:[{stationId:'station-a',name:'Court station',serviceCounterIds:['counter']},{stationId:'station-b',name:'Equipment station',serviceCounterIds:['counter']}],stages:[{stageId:'stage-a',stationId:'station-a',label:'Court',serviceIds:['court']},{stageId:'stage-b',stationId:'station-b',label:'Equipment',serviceIds:['equipment']}]};
test('workflow draft validates service ownership and station references independently of counters',()=>{
 assert.deepEqual(workflowDraftIssues(draft,counters,services),[]);
 assert.match(workflowDraftIssues({...draft,stages:[draft.stages[0],{...draft.stages[1],serviceIds:['court'],stationId:'counter'}]},counters,services).join(' '),/only one stage/);
 assert.match(workflowDraftIssues({...draft,stages:[{...draft.stages[0],stationId:'counter'}]},counters,services).join(' '),/available station/);
 assert.match(workflowDraftIssues(draft,[],[]).join(' '),/unavailable counters/);
 assert.match(workflowDraftIssues(draft,[],[]).join(' '),/unavailable services/);
});
test('reordering stages preserves identities and assignment records without mutating the stored draft',()=>{
 const moved=moveWorkflowStage(draft,'stage-a',1);
 assert.deepEqual(moved.stages.map(stage=>stage.stageId),['stage-b','stage-a']);
 assert.equal(moved.stages[1],draft.stages[0]);assert.equal(moved.stations,draft.stations);
 assert.deepEqual(draft.stages.map(stage=>stage.stageId),['stage-a','stage-b']);
 assert.equal(moveWorkflowStage(draft,'stage-a',-1),draft);
});
