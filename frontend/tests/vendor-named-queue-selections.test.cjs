require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {updateCourtSelection,updateExtraSelection,removedNamedSelections,namedSelectionScheduleIssues,namedSelectionInput}=require('../src/vendor/namedQueueSelectionDraft.ts');
const {NamedQueueSelectionSummary}=require('../src/vendor/NamedQueueSelectionSummary.tsx');
const selections=[{serviceSelectionId:'rental',serviceId:'pickleball',courts:[{courtSelectionId:'court-one',resourceMemberId:'member-one',durationMinutes:'180',extras:[{extraSelectionId:'equipment-one',serviceId:'equipment',quantity:'1',durationMinutes:'60'},{extraSelectionId:'trainer-one',serviceId:'trainer',quantity:'1',durationMinutes:'60'}]},{courtSelectionId:'court-two',resourceMemberId:'member-two',durationMinutes:'180',extras:[]},{courtSelectionId:'court-three',resourceMemberId:'member-three',durationMinutes:'60',extras:[{extraSelectionId:'equipment-three',serviceId:'equipment',quantity:'1',durationMinutes:'30'}]}]}];
test('nested edits preserve parent-specific extra identities and independent durations',()=>{
 const edited=updateExtraSelection(selections,'rental','court-three','equipment-three',{durationMinutes:'45'});
 assert.equal(edited[0].courts[2].extras[0].durationMinutes,'45');
 assert.equal(edited[0].courts[0].extras[0].durationMinutes,'60');
 assert.equal(edited[0].courts[2].durationMinutes,'60');
 assert.equal(selections[0].courts[2].extras[0].durationMinutes,'30');
 const court=updateCourtSelection(selections,'rental','court-two',{durationMinutes:'120'});
 assert.equal(court[0].courts[1].durationMinutes,'120');assert.equal(court[0].courts[1].courtSelectionId,'court-two');
 assert.equal(court[0].courts[0],selections[0].courts[0]);
});
test('reorder preserves identity while extra removal or reparenting remains explicit',()=>{
 const reordered=[{...selections[0],courts:[...selections[0].courts].reverse()}];
 assert.deepEqual(removedNamedSelections(selections,reordered),[]);
 const changed=[{...selections[0],courts:selections[0].courts.map(court=>court.courtSelectionId==='court-one'?{...court,extras:court.extras.filter(extra=>extra.extraSelectionId!=='equipment-one')}:court)}];
 assert.deepEqual(removedNamedSelections(selections,changed),['equipment-one']);
 const reparented=[{...changed[0],courts:changed[0].courts.map(court=>court.courtSelectionId==='court-three'?{...court,extras:[...court.extras,selections[0].courts[0].extras[0]]}:court)}];
 assert.deepEqual(removedNamedSelections(selections,reparented),['equipment-one']);
});
test('named review nests extras under their court and never infers occupancy from requested duration',()=>{
 const html=renderToStaticMarkup(React.createElement(NamedQueueSelectionSummary,{selections:[{id:'rental',serviceName:'Pickleball court rental',courts:[{id:'court-one',resourceName:'Court 1',durationLabel:'180 minutes',extras:[{id:'equipment-one',name:'Basic equipment',durationLabel:'60 minutes'},{id:'trainer-one',name:'Trainer',durationLabel:'60 minutes'}]},{id:'court-three',resourceName:'Court 3',durationLabel:'60 minutes',extras:[{id:'equipment-three',name:'Basic equipment',durationLabel:'30 minutes'}]}]}]}));
 assert.match(html,/Extras for Court 1/);assert.match(html,/Extras for Court 3/);
 assert.match(html,/Review each resource/);assert.match(html,/Expected end times do not release/);
 assert.equal((html.match(/<strong>Basic equipment<\/strong>/g)||[]).length,2);
 assert.doesNotMatch(html,/Reserved|Released|Available now|PHP|₱/);
});

test('extras may be shorter than the court but cannot outlast their own parent',()=>{
 assert.deepEqual(namedSelectionScheduleIssues(selections),[]);
 const tooLong=updateExtraSelection(selections,'rental','court-three','equipment-three',{durationMinutes:'90'});
 const issues=namedSelectionScheduleIssues(tooLong);
 assert.equal(issues.length,1);assert.equal(issues[0].courtSelectionId,'court-three');assert.equal(issues[0].extraSelectionId,'equipment-three');
 assert.deepEqual(namedSelectionScheduleIssues(updateExtraSelection(selections,'rental','court-three','equipment-three',{durationMinutes:'60'})),[]);
});

test('v3 nested adapter preserves resource and parent-scoped extra identities without authoritative demand or pricing',()=>{
 const input=namedSelectionInput(selections);
 assert.equal(input.length,1);assert.equal(input[0].resources.length,3);
 assert.equal(input[0].resources[0].resourceSelectionId,'court-one');assert.equal(input[0].resources[0].resourceMemberId,'member-one');
 assert.equal(input[0].resources[0].quantity,1);assert.equal(input[0].resources[0].durationMinutes,180);
 assert.equal(input[0].resources[2].quantity,1);assert.equal(input[0].resources[2].durationMinutes,60);
 assert.equal(input[0].resources[0].extras[0].extraSelectionId,'equipment-one');assert.equal(input[0].resources[2].extras[0].extraSelectionId,'equipment-three');
 assert.equal(input[0].resources[0].extras[0].quantity,1);
 assert.equal('poolId' in input[0].resources[0],false);assert.equal('price' in input[0],false);
});
test('nested form keeps duration choices per child and shows an invalid retained extra instead of clamping',()=>{
 const {NamedQueueSelectionFields}=require('../src/vendor/NamedQueueSelectionFields.tsx');
 const bad=updateExtraSelection(selections,'rental','court-three','equipment-three',{durationMinutes:'90'});
 const html=renderToStaticMarkup(React.createElement(NamedQueueSelectionFields,{selections:bad,options:[{id:'pickleball',name:'Pickleball court rental',durationOptionsMinutes:[60,120,180],resourceMembers:[{id:'member-one',name:'Court 1'},{id:'member-two',name:'Court 2'},{id:'member-three',name:'Court 3'}],extras:[{id:'equipment',name:'Basic equipment',quantityMin:1,quantityMax:8,durationOptionsMinutes:[30,60,90,120]},{id:'trainer',name:'Trainer',quantityMin:1,quantityMax:4,durationOptionsMinutes:[30,60]}]}],busy:false,onChange(){}}));
 assert.match(html.replace(/<[^>]*>/g,''),/Extra duration for service 1, resource 3, extra 1/);
 assert.match(html,/90 minutes · Review duration/);assert.match(html,/cannot outlast its configured duration/);
 assert.match(html,/One named resource/);assert.match(html,/do not reserve resources/);
});

test('shared resource editor labels are business neutral while configured service and resource names remain visible',()=>{
 const {NamedQueueSelectionFields}=require('../src/vendor/NamedQueueSelectionFields.tsx');
 const html=renderToStaticMarkup(React.createElement(NamedQueueSelectionFields,{selections:[{serviceSelectionId:'service',serviceId:'consultation',courts:[{courtSelectionId:'resource',resourceMemberId:'room',durationMinutes:'60',extras:[]}]}],options:[{id:'consultation',name:'Consultation',durationOptionsMinutes:[60],resourceMembers:[{id:'room',name:'Room A'}],extras:[]}],busy:false,onChange(){}}));
 const text=html.replace(/<[^>]*>/g,'');
 assert.match(text,/Consultation/);assert.match(text,/Room A/);assert.match(text,/Add resource/);
 assert.doesNotMatch(text,/court|rental|pickleball/i);
 assert.doesNotMatch(html,/aria-label="[^"]*(?:Courts|Rental)/);
});
