require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {createCompletionReview}=require('../src/vendor/namedCompletionReview.ts');
const plan={id:'request-1',ticketNumber:'VD001',ticketRevision:'ticket-r',planRevision:'plan-r',capabilities:{childOutcomes:true},currentStage:{id:'stage-1',revision:'stage-r',attemptId:'attempt-1'},allocationGroups:[{id:'old',stageAttemptId:'attempt-0',releasedAt:null},{id:'allocation-1',stageAttemptId:'attempt-1',releasedAt:null}]};
const child={childAttemptId:'child-1',revision:'child-r',isCurrent:true,planRevision:'plan-r',stageAttemptId:'attempt-1',allocationGroupId:'allocation-1',allowedActions:['complete']};
function harness(execute){let visible=null,locked=false,keys=0;const commands=[];const review=createCompletionReview({onChange:value=>visible=value,execute:execute|| (async command=>{commands.push(command);}),isLocked:()=>locked,createKey:()=>`key-${++keys}`});return {review,commands,get visible(){return visible;},get keys(){return keys;},lock(value){locked=value;}};}
for(const target of [{plan,label:'VD001'},{plan,child,label:'Court 1'}]){
 test(`${target.child?'child':'plan'} completion opens without issuing a command; idle dismissal never completes`,async()=>{
  const h=harness();
  for(const dismissal of ['Cancel','Escape','Close','backdrop']){
   h.review.open(target);assert.equal(h.visible,target);assert.equal(h.commands.length,0);assert.equal(h.keys,0);
   h.review.dismiss();assert.equal(h.visible,null,dismissal);await h.review.confirm();assert.equal(h.commands.length,0);
  }
 });
 test(`${target.child?'child':'plan'} confirmation retains exact revision/allocation identity and idempotency key`,async()=>{
  const h=harness();h.review.open(target);await h.review.confirm();
  assert.deepEqual(h.commands,[{kind:'command',id:'request-1',action:'complete',key:'key-1',body:{expectedTicketRevision:'ticket-r',expectedPlanRevision:'plan-r',currentStageId:'stage-1',expectedStageRevision:'stage-r',...(target.child?{childAttemptId:'child-1',expectedChildRevision:'child-r',allocationGroupId:'allocation-1'}:{allocationGroupId:'allocation-1',completeAll:true})}}]);
  h.review.reset();assert.equal(h.visible,null);
 });
}
test('busy/uncertain lock protects review and prevents a new command/key',async()=>{
 const h=harness();h.review.open({plan,label:'VD001'});h.lock(true);h.review.dismiss();assert.ok(h.visible);await h.review.confirm();assert.equal(h.commands.length,0);assert.equal(h.keys,0);
 h.lock(false);h.review.dismiss();assert.equal(h.visible,null);
});
test('concurrent confirmation cannot dispatch a duplicate write',async()=>{
 let release;const commands=[];const h=harness(command=>{commands.push(command);return new Promise(resolve=>release=resolve);});h.review.open({plan,label:'VD001'});
 const first=h.review.confirm();await h.review.confirm();h.review.dismiss();assert.ok(h.visible);assert.equal(commands.length,1);release();await first;
});
test('stale child, disallowed action and ambiguous allocation fail before any write',()=>{
 const h=harness();
 for(const target of [{plan:{...plan,capabilities:{childOutcomes:false}},label:'VD001'},{plan:{...plan,allocationGroups:[]},label:'VD001'},{plan:{...plan,allocationGroups:[plan.allocationGroups[1],plan.allocationGroups[1]]},label:'VD001'},{plan,child:{...child,planRevision:'old'},label:'Court 1'},{plan,child:{...child,allowedActions:[]},label:'Court 1'}])assert.throws(()=>h.review.open(target),/Refresh|refresh/);
 assert.equal(h.commands.length,0);assert.equal(h.keys,0);assert.equal(h.visible,null);
});
