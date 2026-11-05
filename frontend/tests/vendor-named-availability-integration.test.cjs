require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {namedAvailabilityRequest,acceptedNamedAvailability}=require('../src/vendor/queueNamedAvailability.ts');
const {namedExtraExecutions}=require('../src/vendor/namedExtraExecutions.ts');
const {namedQueueForm}=require('../src/vendor/namedQueueForm.ts');
const {selectionInputV4,selectionIssuesV4,QueueSelectionFieldsV4}=require('../src/vendor/QueueSelectionFieldsV4.tsx');
const {namedSelectionReduction}=require('../src/vendor/namedQueueSelectionDraft.ts');
const duration={revision:'d1',mode:'adjustable',visible:true,baseMinutes:30,minCount:1,maxCount:4,stepCount:1,defaultCount:1};
const member=id=>({id,name:`Member ${id}`,isActive:true,archivedAt:null,availability:{state:'occupied'}});
const extra={serviceId:'trainers',name:'Trainers',configured:true,resourceReady:true,selectionRequirement:'optional',quantityMin:1,quantityMax:3,labels:{resources:'Trainers',duration:'Duration'},durationPolicy:duration,assignmentPolicy:{mode:'named'},resourceMembers:[member('A'),member('B'),member('C')]};
const policy={id:'courts',name:'Courts',quantityMin:1,quantityMax:1,labels:{resources:'Courts',duration:'Duration'},durationPolicy:duration,assignmentPolicy:{mode:'named'},resourceMembers:[member('court')],extras:[extra]};
const options={catalogRevision:'catalog1',capabilities:{namedExtraMembers:{version:1}},services:[policy]};
const rows=()=>[{serviceSelectionId:'root',serviceId:'courts',courts:[{courtSelectionId:'court-row',resourceMemberId:'court',resourceQuantity:'1',durationMinutes:'30',durationCount:'1',durationPolicyRevision:'d1',extras:[{extraSelectionId:'extra-row',serviceId:'trainers',quantity:'2',durationMinutes:'30',durationCount:'1',durationPolicyRevision:'d1',resourceMemberIds:['A','B']}]}]}];
test('whole-tree interval preview includes pooled demand and scoped own draft only',()=>{
 const input=selectionInputV4(rows()); input.push({serviceSelectionId:'pooled',serviceId:'pool',resources:[{resourceSelectionId:'pool-row',resourceMemberId:null,quantity:2,durationCount:1,durationPolicyRevision:'p1',extras:[]}]});
 const request=namedAvailabilityRequest(input,'catalog1','request1','own-plan');
 assert.equal(request.serviceSelections,input);assert.equal(request.draftId,'own-plan');assert.equal(request.requests.length,3);
 assert.deepEqual(request.requests[1].resourceMemberIds,['A','B']);assert.equal(request.requests[1].parentServiceId,'courts');assert.equal(request.requests[2].quantity,2);assert.deepEqual(request.requests[2].resourceMemberIds,[]);
 assert.equal('draftId' in namedAvailabilityRequest(input,'catalog1','request2'),false);
 const response={contractVersion:4,availabilityVersion:1,requestKey:'request1',catalogRevision:'catalog1',currentCatalogRevision:'catalog1'};
 assert.equal(acceptedNamedAvailability(response,request),true);
 for(const patch of [{requestKey:'old'},{catalogRevision:'old'},{currentCatalogRevision:'new'},{availabilityVersion:2}])assert.equal(acceptedNamedAvailability({...response,...patch},request),false);
});
test('named extra IDs survive transport and reload; quantity reduction retains promised names',()=>{
 const source=rows(),input=selectionInputV4(source);
 const plan={contractVersion:4,state:'draft',customer:{name:'QA',email:'',phone:''},notes:'',catalogRevision:'catalog1',serviceSelections:input};
 assert.deepEqual(namedQueueForm(plan).selections[0].courts[0].extras[0].resourceMemberIds,['A','B']);
 const reduced=structuredClone(source);reduced[0].courts[0].extras[0].quantity='1';
 assert.deepEqual(selectionInputV4(reduced)[0].resources[0].extras[0].resourceMemberIds,['A','B']);
 assert.equal(namedSelectionReduction(source,reduced),true);
 const replaced=structuredClone(source);replaced[0].courts[0].extras[0].resourceMemberIds=['A','C'];assert.equal(namedSelectionReduction(source,replaced),true);
 const reordered=structuredClone(source);reordered[0].courts[0].extras[0].resourceMemberIds.reverse();assert.equal(namedSelectionReduction(source,reordered),false);
});
test('exact named quantity and catalog eligibility validate independently from temporary occupancy',()=>{
 assert.deepEqual(selectionIssuesV4(rows(),options),[]);
 for(const ids of [['A'],['A','B','C'],['A','A'],['A','missing']]){const invalid=rows();invalid[0].courts[0].extras[0].resourceMemberIds=ids;assert.ok(selectionIssuesV4(invalid,options).length);}
 const html=renderToStaticMarkup(React.createElement(QueueSelectionFieldsV4,{rows:rows(),options,busy:false,onChange(){}}));
 assert.match(html,/Search names/);assert.match(html,/Member A/);assert.match(html,/Member B/);assert.match(html,/2\/2/);
});
test('named published groups expose frozen individual outcomes and automatic extras retain one execution',()=>{
 const group={extraSelectionId:'extra',serviceName:'Trainers',namedExtraVersion:1,execution:null,resourceMembers:[{id:'A',name:'Frozen A'},{id:'B',name:'Frozen B'}],memberExecutions:[{resourceMemberId:'A',execution:{childAttemptId:'attempt-A'}},{resourceMemberId:'B',execution:{childAttemptId:'attempt-B'}}]};
 assert.deepEqual(namedExtraExecutions(group).map(x=>[x.name,x.execution.childAttemptId]),[['Trainers · Frozen A','attempt-A'],['Trainers · Frozen B','attempt-B']]);
 assert.deepEqual(namedExtraExecutions({extraSelectionId:'auto',serviceName:'Equipment',execution:{childAttemptId:'pooled'}}),[{id:'auto',memberName:'Equipment',name:'Equipment',execution:{childAttemptId:'pooled'}}]);
});

test('maintenance and archived parent resources retain their recorded catalog name',()=>{
 for(const patch of [{isActive:false},{archivedAt:'2026-10-17'}]){
  const catalog={...options,services:[{...policy,resourceMembers:[{...member('court'),name:'Court kept by name',...patch}]}]};
  const html=renderToStaticMarkup(React.createElement(QueueSelectionFieldsV4,{rows:rows(),options:catalog,busy:false,onChange(){}}));
  assert.match(html,/Court kept by name/);assert.match(html,patch.archivedAt?/Archived/:/Maintenance/);
 }
});
