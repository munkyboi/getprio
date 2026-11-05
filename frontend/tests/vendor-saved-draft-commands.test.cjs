require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {savedDraftWrite,confirmedDeletedDraft}=require('../src/vendor/savedDraftCommands.ts');
const scope={token:'cookie-session',tenant:'business name',location:'qa branch'};
const draft={contractVersion:4,state:'draft',id:'draft-id',planRevision:'7',catalogRevision:'catalog-3',publishReadiness:{ready:true,blockReasons:[],provisional:true},allowedActions:['edit','publish','delete']};
test('saved publication uses the exact saved revision catalog and key, never a newly inferred revision',()=>{
 const write=savedDraftWrite(draft,'publish',scope,'publish-key');assert.equal(write.method,'POST');assert.match(write.path,/draft-id\/publish\?location=qa%20branch$/);assert.deepEqual(write.body,{expectedPlanRevision:'7',expectedCatalogRevision:'catalog-3'});assert.equal(write.key,'publish-key');
 assert.throws(()=>savedDraftWrite({...draft,publishReadiness:{ready:false}},'publish',scope,'key'));
 assert.throws(()=>savedDraftWrite({...draft,allowedActions:['edit']},'publish',scope,'key'));
 assert.throws(()=>savedDraftWrite({...draft,state:'served'},'publish',scope,'key'));
});
test('delete requires a server-authorized unpublished draft and exact revision',()=>{
 const write=savedDraftWrite(draft,'delete',scope,'delete-key');assert.equal(write.method,'DELETE');assert.match(write.path,/plans\/draft-id\?location=qa%20branch$/);assert.deepEqual(write.body,{expectedPlanRevision:'7'});
 assert.throws(()=>savedDraftWrite({...draft,state:'waiting'},'delete',scope,'key'));assert.throws(()=>savedDraftWrite({...draft,allowedActions:['edit']},'delete',scope,'key'));
 assert.equal(confirmedDeletedDraft({deletedDraft:{id:'draft-id',state:'discarded',planRevision:'8'}},'draft-id'),true);
 for(const response of [null,{deletedDraft:{id:'other',state:'discarded',planRevision:'8'}},{deletedDraft:{id:'draft-id',state:'draft',planRevision:'8'}}])assert.equal(confirmedDeletedDraft(response,'draft-id'),false);
});
