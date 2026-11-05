require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {NamedQueueOperations}=require('../src/vendor/NamedQueueOperations.tsx');
const {namedPlanRevisions,namedChildCommand}=require('../src/vendor/namedQueueCommands.ts');
const child={childAttemptId:'court-attempt',revision:'child-r',attempt:'1',planRevision:'plan-r',stageId:'stage',stageAttemptId:'stage-attempt',selectionId:'court-one',selectionKind:'resource',parentChildAttemptId:null,parentResourceSelectionId:null,state:'in_service',isCurrent:true,startedAt:'2026-10-17T03:00:00Z',endedAt:null,satisfiedDependencyAttemptIds:[],reservationGroupId:'hold',reservationMemberIds:['h1'],allocationGroupId:'allocation',allocationMemberIds:['a1'],allowedActions:['interrupt']};
const plan={serviceHoursEligibility:{status:'not_enforced',reason:null,requiredDurationMinutes:null,serviceHoursWindow:null,nextChangeAt:null},contractVersion:3,id:'plan',ticketNumber:'VD-test',ticketRevision:'ticket-r',planRevision:'plan-r',state:'in_service',capabilities:{execution:true,childOutcomes:true},customer:{name:'Demo'},workflow:{mode:'linear',configurationRevision:'1'},currentStage:{id:'stage',revision:'stage-r',attemptId:'stage-attempt',ordinal:1,state:'in_service'},serviceSelections:[{serviceSelectionId:'service',serviceName:'Pickleball Court Rental',resources:[{resourceSelectionId:'court-one',resourceMemberName:'Court 1',durationMinutes:180,execution:child,extras:[{extraSelectionId:'equipment',serviceName:'Basic Equipment',quantity:1,durationMinutes:60,execution:{...child,childAttemptId:'extra-attempt',selectionKind:'extra',state:'completed',allocationMemberIds:['a2'],allowedActions:[]}}]}]}],reservationGroups:[],allocationGroups:[{id:'allocation',resolutionState:'partial',members:[{id:'a1',childAttemptId:'court-attempt',units:1,startedAt:'2026-10-17T03:00:00Z',expectedEndAt:'2026-10-17T06:00:00Z',releasedAt:null},{id:'a2',childAttemptId:'extra-attempt',units:1,startedAt:'2026-10-17T03:00:00Z',expectedEndAt:'2026-10-17T04:00:00Z',releasedAt:'2026-10-17T03:30:00Z'}]}],allowedActions:[],resourceWait:null};
test('child commands preserve exact ticket plan stage child and recorded group identity',()=>{
 assert.deepEqual(namedPlanRevisions(plan),{expectedTicketRevision:'ticket-r',expectedPlanRevision:'plan-r',currentStageId:'stage',expectedStageRevision:'stage-r'});
 assert.equal(namedChildCommand(plan,child).allocationGroupId,'allocation');assert.equal(namedChildCommand(plan,child).expectedChildRevision,'child-r');
 assert.throws(()=>namedChildCommand(plan,{...child,stageAttemptId:'older'}),/Refresh/);
 assert.throws(()=>namedChildCommand(plan,{...child,isCurrent:false}),/Refresh/);
 assert.throws(()=>namedChildCommand(plan,{...child,allocationGroupId:null}),/Refresh/);
});
test('partial release does not complete a court or parent and exposes only server permitted actions',()=>{
 const html=renderToStaticMarkup(React.createElement(NamedQueueOperations,{plans:[plan],busy:false,onPlanAction(){},onChildAction(){}}));
 assert.match(html,/Interrupt Court 1/);assert.doesNotMatch(html,/Complete Court 1/);
 assert.match(html,/partial/);assert.match(html,/1 member\(s\) still held/);assert.match(html,/1 explicitly released/);
 assert.match(html,/Still held/);assert.match(html,/Released/);assert.match(html,/in service/);
});
test('cancel protection appears only when the server projects that action',()=>{
 const render=allowedActions=>renderToStaticMarkup(React.createElement(NamedQueueOperations,{plans:[{...plan,allowedActions}],busy:false,onPlanAction(){},onChildAction(){}}));
 assert.match(render(['cancelProtection']),/Cancel protection/);
 assert.doesNotMatch(render([]),/Cancel protection/);
});
const {readableDuration,publishedServiceSummaries,initiallyExpandedServices}=require('../src/vendor/publishedServiceSummary.ts');
test('published summaries count frozen named members independently of quantity and duration',()=>{
 const named=structuredClone(plan);const extra=named.serviceSelections[0].resources[0].extras[0];
 extra.namedExtraVersion=1;extra.quantity=2;extra.execution=null;extra.resourceMembers=[{id:'a',name:'Trainer A'},{id:'c',name:'Trainer C'}];extra.memberExecutions=[{resourceMemberId:'a',execution:{...child,state:'completed',allowedActions:[]}},{resourceMemberId:'c',execution:{...child,state:'waiting',allowedActions:[]}}];
 const [summary]=publishedServiceSummaries(named);assert.equal(summary.resourceCount,1);assert.equal(summary.extraCount,1);assert.equal(summary.statuses,'1 in service · 1 completed · 1 waiting');assert.equal(summary.actionCount,1);
 assert.equal(readableDuration(180),'3 hours');assert.equal(readableDuration(90),'1 hour 30 minutes');assert.equal(readableDuration(45),'45 minutes');
});
test('actionable or waiting services open by default; a quiet request opens its current service',()=>{
 const multi=structuredClone(plan);const second=structuredClone(multi.serviceSelections[0]);second.serviceSelectionId='other-service';second.stageId='later-stage';second.resources[0].resourceSelectionId='other-court';second.resources[0].execution={...child,state:'waiting',allowedActions:[]};second.resources[0].extras=[];multi.serviceSelections.push(second);
 assert.deepEqual(initiallyExpandedServices(multi),['service']);
 multi.serviceSelections[0].resources[0].execution.allowedActions=[];multi.resourceWait={code:'RESOURCE_CAPACITY_UNAVAILABLE',message:'Required resource unavailable',selectionId:'other-court',parentResourceSelectionId:null};
 assert.deepEqual(initiallyExpandedServices(multi),['other-service']);
 multi.resourceWait=null;multi.currentStage.id='later-stage';assert.deepEqual(initiallyExpandedServices(multi),['other-service']);
});
test('shared service accordion preserves request actions, wait explanation and exact duration',()=>{
 const waiting={...plan,state:'waiting',allowedActions:['call'],resourceWait:{code:'RESERVATION_EXPIRED',message:'The call expired. Waiting for a new call.'}};
 const html=renderToStaticMarkup(React.createElement(NamedQueueOperations,{plans:[waiting],busy:false,onPlanAction(){},onChildAction(){}}));
 assert.match(html,/aria-expanded="true"/);assert.match(html,/data-slot="accordion-trigger"/);assert.match(html,/1 resource action/);assert.match(html,/The call expired/);assert.match(html,/3 hours/);assert.match(html,/Call request/);
});
test('multiple actionable services may open together and disabled child capability cannot advertise actions',()=>{
 const multi=structuredClone(plan);const second=structuredClone(multi.serviceSelections[0]);second.serviceSelectionId='service-two';multi.serviceSelections.push(second);assert.deepEqual(initiallyExpandedServices(multi),['service','service-two']);
 multi.capabilities.childOutcomes=false;assert.ok(publishedServiceSummaries(multi).every(summary=>summary.actionCount===0));
});
test('compact row actions retain ticket-specific accessible names and busy gating',()=>{
 const render=busy=>renderToStaticMarkup(React.createElement(NamedQueueOperations,{plans:[{...plan,allowedActions:['amend','call']}],busy,onPlanAction(){},onChildAction(){}}));
 for(const busy of [false,true]){
  const html=render(busy);
  for(const label of ['Amend request','Call request','Complete','Interrupt']){
   const button=[...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]).find(tag=>tag.includes(`aria-label="${label} for VD-test"`));
   assert.ok(button,`accessible name for ${label}`);
   assert.equal(/\sdisabled(?:=|\s|>)/.test(button),busy,`${label} busy state`);
  }
 }
});

test('call row action uses a megaphone while preserving its accessible name',()=>{
 const html=renderToStaticMarkup(React.createElement(NamedQueueOperations,{plans:[{...plan,allowedActions:['call']}],busy:false,onPlanAction(){},onChildAction(){}}));
 const callButton=[...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match=>match[0]).find(button=>button.includes('aria-label="Call request for VD-test"'));
 assert.ok(callButton);assert.match(callButton,/tabler-icon-speakerphone/);assert.doesNotMatch(callButton,/tabler-icon-phone(?:\s|"|<)/);
});

test('waiting request row shows the server hours rejection and disables Call without a resource-conflict label',()=>{
 const waiting={...plan,state:'waiting',resourceWait:null,allowedActions:['call'],serviceHoursEligibility:{status:'does_not_fit',reason:{code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS',message:'Selected duration exceeds the remaining store hours.'},requiredDurationMinutes:180,serviceHoursWindow:null,nextChangeAt:null}};
 const html=renderToStaticMarkup(React.createElement(NamedQueueOperations,{plans:[waiting],busy:false,onPlanAction(){},onChildAction(){}}));
 assert.match(html,/Not enough time before closing/);assert.match(html,/There isn&#x27;t enough time before closing/);assert.doesNotMatch(html,/Resource conflict|Waiting for resources/);
 const call=[...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]).find(tag=>tag.includes('aria-label="Call request for VD-test"'));
 assert.ok(call);assert.match(call,/disabled/);
});
