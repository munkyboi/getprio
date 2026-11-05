require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {durationCountIssue, QueueDurationCount, durationTotalLabel} = require('../src/vendor/QueueDurationCount.tsx');
const policy = {revision:'duration-2',mode:'adjustable',visible:true,baseMinutes:60,minCount:1,maxCount:7,stepCount:2,defaultCount:1};
test('duration counts reject fractions, bounds and off-step input without coercing it', () => {
  for (const value of ['', '1.5', '0', '8', '2']) assert.ok(durationCountIssue(value, policy), value);
  assert.equal(durationCountIssue('3', policy), undefined);
  assert.ok(durationCountIssue('3', {...policy, mode:'fixed'}));
});
test('duration count shows configured multiplication and requires review after revision changes', () => {
  const props = {label:'Duration for resource 1',value:'3',policy,capturedRevision:policy.revision,disabled:false,onChange:()=>{}};
  const html = renderToStaticMarkup(React.createElement(QueueDurationCount, props));
  assert.match(html, /<strong>3 hours<\/strong>/);
  assert.match(html, /3 × 60 min/);
  assert.match(html, /independently of resource quantity/);
  const stale = renderToStaticMarkup(React.createElement(QueueDurationCount, {...props,capturedRevision:'duration-1'}));
  assert.match(stale, /Duration policy changed/);
  assert.doesNotMatch(stale, /180 minutes total/);
  const invalid = renderToStaticMarkup(React.createElement(QueueDurationCount, {...props,value:'2'}));
  assert.match(invalid, /value="2"/);
  assert.match(invalid, /Total duration requires review/);assert.doesNotMatch(invalid, /<strong>/);
});
const {selectionInputV4,selectionIssuesV4}=require('../src/vendor/QueueSelectionFieldsV4.tsx');
const {policyInput}=require('../src/vendor/QueueServicePolicyEditor.tsx');
test('v4 adapter preserves count policy and tree identity without transmitting minutes',()=>{
 const rows=[{serviceSelectionId:'root',serviceId:'one',courts:[{courtSelectionId:'resource',resourceMemberId:'named',resourceQuantity:'1',durationMinutes:'999',durationCount:'3',durationPolicyRevision:'old',extras:[{extraSelectionId:'extra',serviceId:'two',quantity:'2',durationCount:'1',durationPolicyRevision:'extra-policy',durationMinutes:'888'}]}]}];
 const input=selectionInputV4(rows);
 assert.equal(input.length,1);assert.equal(input[0].resources[0].quantity,1);assert.equal(input[0].resources[0].durationCount,3);assert.equal(input[0].resources[0].durationPolicyRevision,'old');
 assert.equal(input[0].resources[0].extras[0].extraSelectionId,'extra');assert.doesNotMatch(JSON.stringify(input),/durationMinutes|999|888/);
 const options={services:[{id:'one',durationPolicy:policy,quantityMin:1,quantityMax:1,assignmentPolicy:{mode:'named'},resourceMembers:[{id:'named',isActive:true}],extras:[]}]};
 assert.ok(selectionIssuesV4(rows,options).includes('Review the resource duration count and policy.'));
 assert.ok(selectionIssuesV4([...rows,{...rows[0],serviceSelectionId:'duplicate'}],options).some(issue=>issue.includes('root service once')));
});
test('amendment adapter drops malformed legacy extra rows while preserving valid resource fields',()=>{
 const rows=[{serviceSelectionId:'root',serviceId:'one',courts:[{courtSelectionId:'resource',resourceMemberId:'named',resourceQuantity:'1',durationCount:'2',durationPolicyRevision:policy.revision,extras:[{extraSelectionId:'empty',serviceId:'legacy-extra',quantity:'',durationCount:'',durationPolicyRevision:'old'},{extraSelectionId:'valid',serviceId:'basic',quantity:'1',durationCount:'1',durationPolicyRevision:policy.revision}]}]}];
 const input=selectionInputV4(rows);assert.deepEqual(input[0].resources[0].extras.map(extra=>extra.extraSelectionId),['valid']);
 const legacy={...rows[0],courts:rows[0].courts.map(court=>({...court,durationMinutes:'',extras:court.extras.map(extra=>({...extra,durationMinutes:extra.extraSelectionId==='valid'?'60':''}))}))};
 const {namedSelectionInput}=require('../src/vendor/namedQueueSelectionDraft.ts');
 const legacyInput=namedSelectionInput([legacy]);assert.deepEqual(legacyInput[0].resources[0].extras.map(extra=>extra.extraSelectionId),['valid']);
});
test('policy editing requires explicit numeric configuration and retains supported execution boundary',()=>{
 const draft={labels:{service:'Service',resources:'Resources',duration:'Duration',extras:'Extras'},assignment:'automatic',mode:'adjustable',visible:true,duration:{baseMinutes:'30',minCount:'1',maxCount:'6',stepCount:'1',defaultCount:'2'},extras:[],executionConfirmed:true};
 assert.equal(policyInput(draft).duration.baseMinutes,30);assert.equal(policyInput(draft).execution.extraContainment,'within_parent');
 assert.throws(()=>policyInput({...draft,duration:{...draft.duration,baseMinutes:''}}),/positive whole/);
 assert.throws(()=>policyInput({...draft,duration:{...draft.duration,defaultCount:'1.5'}}),/positive whole/);
 assert.throws(()=>policyInput({...draft,assignment:''}),/Choose assignment/);
});
test('fixed and hidden administration policies require explicit consistent counts',()=>{
 const draft={labels:{service:'Service',resources:'Resources',duration:'Duration',extras:'Extras'},assignment:'automatic',mode:'fixed',visible:false,duration:{baseMinutes:'30',minCount:'2',maxCount:'2',stepCount:'1',defaultCount:'2'},extras:[],executionConfirmed:true};
 assert.equal(policyInput(draft).duration.visible,false);
 assert.throws(()=>policyInput({...draft,mode:'adjustable'}),/Hidden duration/);
 assert.throws(()=>policyInput({...draft,duration:{...draft.duration,maxCount:'3'}}),/Fixed duration/);
 assert.throws(()=>policyInput({...draft,duration:{...draft.duration,baseMinutes:'300'}}),/bounds/);
});
test('fixed visible duration stays read-only and hidden duration still displays its explicit total',()=>{
 const fixed={...policy,mode:'fixed',minCount:3,maxCount:3,stepCount:1,defaultCount:3};
 const props={label:'Duration',value:'3',policy:fixed,capturedRevision:fixed.revision,disabled:false,onChange:()=>{}};
 assert.match(renderToStaticMarkup(React.createElement(QueueDurationCount,props)),/readonly=""/);
 const hidden=renderToStaticMarkup(React.createElement(QueueDurationCount,{...props,policy:{...fixed,visible:false}}));
 assert.doesNotMatch(hidden,/<input/);assert.match(hidden,/3 × 60 min/);
});
test('policy validation identifies the hidden section that needs review',()=>{
 const {PolicyValidationError}=require('../src/vendor/QueueServicePolicyEditor.tsx');
 const draft={labels:{service:'Service',resources:'Resources',duration:'Duration',extras:'Extras'},assignment:'automatic',mode:'adjustable',visible:true,duration:{baseMinutes:'30',minCount:'1',maxCount:'6',stepCount:'1',defaultCount:'2'},extras:[],executionConfirmed:true};
 for(const [change,section] of [[{duration:{...draft.duration,baseMinutes:'1.5'}},'duration'],[{labels:{...draft.labels,service:''}},'general'],[{assignment:''},'resources'],[{mode:''},'duration'],[{executionConfirmed:false},'resources']])assert.throws(()=>policyInput({...draft,...change}),error=>error instanceof PolicyValidationError&&error.section===section);
});
test('duration input group preserves native count constraints and described help without premature errors',()=>{
 const html=renderToStaticMarkup(React.createElement(QueueDurationCount,{label:'Duration count',value:'1.5',policy,capturedRevision:policy.revision,disabled:false,onChange:()=>{}}));
 assert.match(html,/data-slot="input-group"/);assert.match(html,/type="number"/);assert.match(html,/min="1" max="7" step="2"/);assert.match(html,/aria-describedby="[^"]+-help"/);assert.match(html,/value="1.5"/);assert.doesNotMatch(html,/aria-invalid="true"/);assert.doesNotMatch(html,/90 minutes total/);
});
test('nested v4 array fields use semantic legends without losing resource and extra identities',()=>{
 const {QueueSelectionFieldsV4}=require('../src/vendor/QueueSelectionFieldsV4.tsx');
 const options={services:[{id:'one',name:'Court rental',labels:{resources:'Courts',duration:'Duration'},durationPolicy:policy,quantityMin:1,quantityMax:1,assignmentPolicy:{mode:'named'},resourceMembers:[{id:'member',name:'Court1 - Borak',isActive:true}],extras:[]}]};
 const rows=[{serviceSelectionId:'root-id',serviceId:'one',courts:[{courtSelectionId:'resource-id',resourceMemberId:'member',resourceQuantity:'1',durationCount:'3',durationPolicyRevision:policy.revision,extras:[]}]}];
 const html=renderToStaticMarkup(React.createElement(QueueSelectionFieldsV4,{rows,options,busy:false,onChange:()=>{}}));
 assert.match(html,/<legend[^>]*><span>Services<\/span>/);assert.match(html,/data-slot="accordion-trigger"/);assert.match(html,/Service 1/);assert.match(html,/Resource 1/);assert.match(html,/data-resource-id="resource-id"/);assert.match(html,/Court1 - Borak/);assert.match(html,/3 × 60 min/);assert.equal(selectionInputV4(rows)[0].resources[0].resourceSelectionId,'resource-id');
});
test('an archived named member remains unavailable even when its maintenance flag is enabled',()=>{
 const rows=[{serviceSelectionId:'root',serviceId:'one',courts:[{courtSelectionId:'resource',resourceMemberId:'member',resourceQuantity:'1',durationCount:'3',durationPolicyRevision:policy.revision,extras:[]}]}];
 const options={services:[{id:'one',durationPolicy:policy,quantityMin:1,quantityMax:1,assignmentPolicy:{mode:'named'},resourceMembers:[{id:'member',isActive:true,archivedAt:'2026-10-17T00:00:00Z'}],extras:[]}]};
 assert.ok(selectionIssuesV4(rows,options).includes('Choose an available named resource.'));
 options.services[0].resourceMembers[0].archivedAt=null;
 assert.equal(selectionIssuesV4(rows,options).includes('Choose an available named resource.'),false);
});

const {requestReviewDuration} = require('../src/vendor/NamedQueuePlanDialog.tsx');
test('request review derives reloaded counts only from a matching valid policy', () => {
 const reloaded = {durationMinutes:'',durationCount:'3',durationPolicyRevision:policy.revision};
 assert.equal(requestReviewDuration(reloaded,policy), '3 × 60 minutes = 180 minutes');
 for (const count of ['1.5','0','8','2']) assert.match(requestReviewDuration({...reloaded,durationCount:count},policy), /Review/);
 assert.match(requestReviewDuration({...reloaded,durationPolicyRevision:'old'},policy), /Review/);
 assert.match(requestReviewDuration(reloaded), /Review/);
 assert.equal(requestReviewDuration({durationMinutes:'45'}), '45 minutes');
});

test('duration emphasis uses correct hour and minute units',()=>{
 assert.equal(durationTotalLabel(180),'3 hours');assert.equal(durationTotalLabel(60),'1 hour');
 assert.equal(durationTotalLabel(90),'1 hour 30 minutes');assert.equal(durationTotalLabel(1),'1 minute');
});
test('named quantity remains canonical while only pooled resource quantity is editable',()=>{
 const {QueueSelectionFieldsV4}=require('../src/vendor/QueueSelectionFieldsV4.tsx');
 const rows=[{serviceSelectionId:'root',serviceId:'one',courts:[{courtSelectionId:'resource',resourceMemberId:'member',resourceQuantity:'1',durationCount:'3',durationPolicyRevision:policy.revision,extras:[]}]}];
 const option={id:'one',name:'Court rental',labels:{resources:'Courts',duration:'Duration'},durationPolicy:policy,quantityMin:1,quantityMax:4,assignmentPolicy:{mode:'named'},resourceMembers:[{id:'member',name:'Court1',isActive:true}],extras:[]};
 const render=mode=>renderToStaticMarkup(React.createElement(QueueSelectionFieldsV4,{rows,options:{services:[{...option,assignmentPolicy:{mode}}]},busy:false,onChange:()=>{}}));
 assert.doesNotMatch(render('named'),/Resource quantity for/);assert.equal(selectionInputV4(rows)[0].resources[0].quantity,1);
 assert.match(render('automatic'),/Resource quantity for/);
});
test('extra groups retain configurable quantities and protect required selections after header removal moves',()=>{
 const {QueueSelectionFieldsV4}=require('../src/vendor/QueueSelectionFieldsV4.tsx');
 const rows=[{serviceSelectionId:'root',serviceId:'one',courts:[{courtSelectionId:'resource',resourceMemberId:'member',resourceQuantity:'1',durationCount:'3',durationPolicyRevision:policy.revision,extras:[{extraSelectionId:'extra-stable',serviceId:'basic',quantity:'1',durationCount:'1',durationPolicyRevision:policy.revision,durationMinutes:''}]}]}];
 const extra={serviceId:'basic',name:'Equipment',configured:true,assignmentPolicy:{mode:'automatic'},resourceMembers:[],quantityMin:1,quantityMax:8,selectionRequirement:'optional',resourceReady:true,labels:{duration:'Duration'},durationPolicy:policy};
 const root={id:'one',name:'Court rental',labels:{resources:'Courts',duration:'Duration'},durationPolicy:policy,quantityMin:1,quantityMax:1,assignmentPolicy:{mode:'named'},resourceMembers:[{id:'member',name:'Court1',isActive:true}]};
 const render=change=>renderToStaticMarkup(React.createElement(QueueSelectionFieldsV4,{rows,options:{services:[{...root,extras:[{...extra,...change}]}]},busy:false,onChange:()=>{}}));
 assert.match(render({}),/Quantity<span[^>]*> for service 1, resource 1, extra 1/);
 assert.doesNotMatch(render({quantityMax:1}),/Quantity<span[^>]*> for service 1, resource 1, extra 1/);
 const required=render({selectionRequirement:'required'}).match(/<button[^>]*aria-label="Remove Equipment[^>]*>/)[0];
 assert.match(required,/disabled/);
 const transported=selectionInputV4(rows)[0].resources[0].extras[0]; assert.equal(transported.extraSelectionId,'extra-stable');assert.equal(transported.quantity,1);
});

const {countPolicyIntersection}=require('../src/vendor/durationCountPolicy.ts');
const {requestDurationFit}=require('../src/vendor/requestDurationFit.ts');
test('shared duration counts intersect min-based steps and fixed policies without first-policy clamping',()=>{
 const one={...policy,minCount:2,maxCount:20,stepCount:3,defaultCount:2};
 const two={...policy,minCount:3,maxCount:20,stepCount:2,defaultCount:3};
 assert.deepEqual(countPolicyIntersection([one,two]),{min:5,max:17,step:6,fixed:false});
 assert.equal(countPolicyIntersection([{...one,mode:'fixed'},{...two,mode:'fixed'}]),null);
 assert.equal(countPolicyIntersection([one,two],4),null);
 assert.deepEqual(countPolicyIntersection([one,two],5),{min:5,max:5,step:1,fixed:true});
});
function hoursFixture({mode='linear',remaining=120,counts=['1','1'],bases=[30,60],stages}={}){
 const observedAt='2026-10-20T10:00:00.000Z';
 const makePolicy=base=>({...policy,minCount:1,maxCount:10,stepCount:1,defaultCount:1,baseMinutes:base});
 const options={contractVersion:4,catalogRevision:'stable',serviceHoursWindow:{status:'open',observedAt,timezone:'Asia/Manila',opensAt:'2026-10-20T09:00:00.000Z',closesAt:new Date(Date.parse(observedAt)+remaining*60000).toISOString(),remainingWholeMinutes:remaining,provisional:true},workflow:{mode,stages:stages||[{stageId:'a',serviceIds:['one']},{stageId:'b',serviceIds:['two']}]},services:bases.map((base,index)=>({id:index?'two':'one',durationPolicy:makePolicy(base),extras:[]}))};
 const rows=counts.map((count,index)=>({serviceSelectionId:`root-${index}`,serviceId:index?'two':'one',courts:[{courtSelectionId:`resource-${index}`,durationCount:count,resourceQuantity:'99',extras:[]}]}));
 return {rows,options};
}
test('store-window fitting uses parallel max and ordered stage maxima, never quantities or contained extra time',()=>{
 const {rows,options}=hoursFixture();rows[0].courts[0].extras.push({durationCount:'1',durationBaseMinutes:15,quantity:'7'});
 const parallel=requestDurationFit(rows,options,100,100);
 assert.equal(parallel.state,'open');assert.equal(parallel.duration,60);assert.equal(parallel.countBounds.max,2);
 const ordered=requestDurationFit(rows,{...options,workflow:{...options.workflow,mode:'multi_station'}},100,100);
 assert.equal(ordered.state,'open');assert.equal(ordered.duration,90);assert.equal(ordered.countBounds.max,1);
});
test('exact closing is allowed and one millisecond of elapsed request time removes an overlong count',()=>{
 const {rows,options}=hoursFixture({remaining:60,counts:['1'],bases:[60]});
 assert.equal(requestDurationFit(rows,options,100,100).state,'open');
 assert.equal(requestDurationFit(rows,options,100,101).state,'no_fit');
 assert.equal(requestDurationFit(rows,options,100,3600100).state,'closed');
});
test('request-start monotonic anchor includes network time and invalid metadata remains unknown',()=>{
 const {rows,options}=hoursFixture({remaining:61,counts:['1'],bases:[60]});
 assert.equal(requestDurationFit(rows,options,100,60101).state,'no_fit');
 assert.equal(requestDurationFit(rows,options,undefined,100).state,'unknown');
 assert.equal(requestDurationFit(rows,{...options,serviceHoursWindow:undefined},100,100).state,'unknown');
 assert.equal(requestDurationFit(rows,{...options,serviceHoursWindow:{...options.serviceHoursWindow,timezone:'invalid-zone'}},100,100).state,'unknown');
});
test('ambiguous ordered root mapping fails closed and standalone resource rows use their own root ID',()=>{
 const {rows,options}=hoursFixture({mode:'multi_station'});
 assert.equal(requestDurationFit(rows,{...options,workflow:{mode:'multi_station',stages:[]}},100,100).state,'unknown');
 assert.equal(requestDurationFit(rows,{...options,workflow:{mode:'multi_station',stages:[{stageId:'a',serviceIds:['one','two']},{stageId:'b',serviceIds:['one']}]}},100,100).state,'unknown');
 options.services[0].extras=[{serviceId:'extra-root',durationPolicy:options.services[0].durationPolicy}];
 rows[0].serviceId='extra-root';rows[0].directResource=true;options.workflow.stages[0].serviceIds=['extra-root'];
 assert.equal(requestDurationFit(rows,options,100,100).state,'open');
});
test('hours presentation preserves an over-limit typed value and blocks increasing without truncation',()=>{
 const html=renderToStaticMarkup(React.createElement(QueueDurationCount,{label:'Duration count',value:'7',policy,capturedRevision:policy.revision,disabled:false,onChange(){},withStepper:true,bounds:{min:1,max:3,step:2,fixed:false},hours:{closesLabel:'8:00 PM',maximumMinutes:180,message:'Review the duration count.'}}));
 assert.match(html,/value="7"/);assert.match(html,/max="3"/);assert.match(html,/Closes at 8:00 PM/);assert.match(html,/Maximum before closing: 3 hours/);assert.match(html,/aria-label="Increase duration count"[^>]*disabled/);
});
test('minimum-no-fit, incompatible fixed counts and invalid typed counts stay distinct',()=>{
 const fixture=hoursFixture({remaining:60,counts:['2'],bases:[60]});
 fixture.options.services[0].durationPolicy={...fixture.options.services[0].durationPolicy,minCount:2,defaultCount:2};
 assert.equal(requestDurationFit(fixture.rows,fixture.options,100,100).state,'no_fit');
 const mixed=hoursFixture();mixed.options.services[0].durationPolicy={...mixed.options.services[0].durationPolicy,mode:'fixed',defaultCount:1};mixed.options.services[1].durationPolicy={...mixed.options.services[1].durationPolicy,mode:'fixed',defaultCount:2};
 assert.equal(requestDurationFit(mixed.rows,mixed.options,100,100).state,'incompatible');
 const invalid=hoursFixture({counts:['1.5']});const fit=requestDurationFit(invalid.rows,invalid.options,100,100);assert.equal(fit.state,'open');assert.match(fit.message,/Enter a valid duration to check whether this request fits before closing/);assert.equal(invalid.rows[0].courts[0].durationCount,'1.5');
});
test('global count remains repairable when a hidden fixed first policy has an invalid preserved value',()=>{
 const html=renderToStaticMarkup(React.createElement(QueueDurationCount,{label:'Duration count',value:'9',policy:{...policy,visible:false,mode:'fixed',defaultCount:1},capturedRevision:policy.revision,disabled:false,onChange(){},withStepper:true,bounds:{min:1,max:1,step:1,fixed:true},validationIssue:'Review the duration count.'}));
 assert.match(html,/<input[^>]*value="9"/);assert.doesNotMatch(html,/readonly=""/);assert.match(html,/aria-label="Increase duration count"[^>]*disabled/);
});

test('store-hours form warnings explain different next steps without changing fitting states or typed values',()=>{
 const selected=hoursFixture({remaining:120,counts:['3','3']});const selectedFit=requestDurationFit(selected.rows,selected.options,100,100);assert.equal(selectedFit.state,'open');assert.equal(selectedFit.message,"There isn't enough time before closing. Choose a shorter duration.");assert.equal(selectedFit.countBounds.max,2);assert.equal(selected.rows[0].courts[0].durationCount,'3');
 const minimum=hoursFixture({remaining:10});assert.equal(requestDurationFit(minimum.rows,minimum.options,100,100).message,"There isn't enough time for this request before closing. Save it as a draft or choose different resources.");
 const closed=hoursFixture();closed.options.serviceHoursWindow.status='closed';const closedFit=requestDurationFit(closed.rows,closed.options,100,100);assert.equal(closedFit.state,'closed');assert.equal(closedFit.message,"We're closed right now. Save this request as a draft and come back during opening hours.");
 const unknown=hoursFixture();delete unknown.options.serviceHoursWindow;const unknownFit=requestDurationFit(unknown.rows,unknown.options,100,100);assert.equal(unknownFit.state,'unknown');assert.equal(unknownFit.message,"We couldn't check the opening hours. Refresh hours to try again.");
 const incompatible=hoursFixture();incompatible.options.services[0].durationPolicy={...incompatible.options.services[0].durationPolicy,mode:'fixed',defaultCount:1};incompatible.options.services[1].durationPolicy={...incompatible.options.services[1].durationPolicy,mode:'fixed',defaultCount:2};assert.equal(requestDurationFit(incompatible.rows,incompatible.options,100,100).message,'These resources need different durations. Review your selections.');
});
