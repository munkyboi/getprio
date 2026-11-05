const test=require('node:test'),assert=require('node:assert/strict');
const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
test('only selected named members affect waiting-request candidacy',async()=>{
 const service={serviceSelectionId:'service',serviceId:'1',resources:[{resourceSelectionId:'selection',resourceMemberId:'court4',quantity:1,durationCount:1,durationPolicyRevision:'1',extras:[]}]};
 const states={court3:'unavailable',court4:'available'};
 const projection=loadModuleWithMocks(require.resolve('../src/services/queueResourceConflictProjection'),{
 './queueSelectionCaptureV4':{readCatalog:async()=>({catalogRevision:'catalog',services:[]})},
 './queueNamedAvailabilityService':{evaluate:async()=>({checkedAt:new Date(),selections:[{selectionId:'selection',availability:{state:'available'},resourceMembers:Object.entries(states).map(([id,state])=>({id,availability:{state,reasonCode:'RESOURCE_OCCUPIED'}}))}]})}
 });
 assert.equal(await projection.readWaitingConflict({}, {}, {id:'draft',revision:'1'},[service]),null,'Court3 occupancy must not block a Court4 request');
 service.resources[0].resourceMemberId='court3';
 assert.equal((await projection.readWaitingConflict({}, {}, {id:'draft',revision:'1'},[service])).code,'RESOURCE_OCCUPIED');
});

test('legacy roots or extras without V4 policies preserve recorded conflicts; V4 still checks missing services',async()=>{
 const wait={code:'RESOURCE_CAPACITY_UNAVAILABLE',selectionId:'trainer',message:'Busy trainer'};
 const resource={resourceSelectionId:'court',resourceMemberId:'court1',quantity:1,durationMinutes:60,extras:[]};
 let services=[],evaluations=0;
 const projection=loadModuleWithMocks(require.resolve('../src/services/queueResourceConflictProjection'),{
  './queueSelectionCaptureV4':{readCatalog:async()=>({catalogRevision:'catalog',services})},
  './queueNamedAvailabilityService':{evaluate:async()=>{evaluations++;return {checkedAt:new Date(),selections:[{selectionId:'court',availability:{state:'unknown',reasonCode:'SERVICE_NOT_CONFIGURED',message:'Review current configuration'},resourceMembers:[]}]};}}
 });
 const input=[{serviceSelectionId:'rental',serviceId:'1',resources:[resource]}];
 assert.deepEqual(await projection.readWaitingConflict({}, {}, {},input,{contractVersion:3,resourceWait:wait}),wait);
 services=[{id:'1'}];resource.extras=[{extraSelectionId:'trainer',serviceId:'2',quantity:1,durationMinutes:60}];
 assert.deepEqual(await projection.readWaitingConflict({}, {}, {},input,{contractVersion:3,resourceWait:wait}),wait);
 assert.equal(evaluations,0,'unsupported legacy policies must not invent member conflicts');
 assert.equal((await projection.readWaitingConflict({}, {}, {},input,{contractVersion:4,resourceWait:wait})).code,'SERVICE_NOT_CONFIGURED');
 assert.equal(evaluations,1,'V4 configuration conflicts must remain visible');
 services.push({id:'2'});
 assert.equal((await projection.readWaitingConflict({}, {}, {},input,{contractVersion:3,resourceWait:wait})).code,'SERVICE_NOT_CONFIGURED');
 assert.equal(evaluations,2,'fully represented legacy selections still use live checks');
});
