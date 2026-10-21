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
