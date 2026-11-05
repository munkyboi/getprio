require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {counterCommandWrite,validateCounterContext}=require('../src/vendor/queueCounterCommands.ts');
test('late responses and inconsistent selected-counter identity cannot enable toolbar actions',()=>{
 const response={controlVersion:1,requestKey:'latest',scope:{counterSlug:'court-a',counterId:'1'},counter:{slug:'court-a',id:'1'}};
 assert.equal(validateCounterContext(response,'latest','court-a'),response);
 assert.throws(()=>validateCounterContext(response,'older','court-a'));
 assert.throws(()=>validateCounterContext(response,'latest','court-b'));
 assert.throws(()=>validateCounterContext({...response,counter:{slug:'court-a',id:'2'}},'latest','court-a'));
});
test('toolbar preserves server target, revisions and complete counter binding; Skip needs a real reason',()=>{
 const body={counterSlug:'court-a',expectedCounterId:'1',expectedTicketRevision:'7',expectedPlanRevision:'3',currentStageId:'stage',expectedStageRevision:'2',reservationGroupId:'group'};
 const scope={token:'cookie-session',tenant:'business name',location:'qa branch'};
 const command={kind:'plan',planId:'selected-plan',action:'skip',body};
 assert.throws(()=>counterCommandWrite(command,scope,'key','   '));
 assert.throws(()=>counterCommandWrite({...command,body:{...body,expectedCounterId:''}},scope,'key','No show'));
 const result=counterCommandWrite(command,scope,'same-key','  No show  ');
 assert.match(result.path,/plans\/selected-plan\/skip\?location=qa%20branch$/);
 assert.deepEqual(result.body,{...body,reason:'No show'});assert.equal(result.key,'same-key');assert.equal(body.reason,undefined);
 assert.match(counterCommandWrite({kind:'legacy',action:'callNext',body:{counterSlug:'court-a',expectedCounterId:'1'}},scope,'legacy-key').path,/\/queue\/call-next\?/);
});
