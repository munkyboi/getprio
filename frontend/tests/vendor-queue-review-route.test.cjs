require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {clearQueueReview,openQueueReview,initialQueueLocation,scopedQueueReviewId}=require('../src/vendor/queueReviewRoute.ts');
const locations=[{slug:'demo-courts',isPrimary:true},{slug:'qa-recovery-20261017',isPrimary:false}];
test('explicit context changes clear request identity and binding while preserving unrelated navigation',()=>{
 const next=new URLSearchParams(clearQueueReview('?workspace=operations&business=vd&request=old&requestLocation=qa&filter=waiting'));
 assert.equal(next.has('request'),false);assert.equal(next.has('requestLocation'),false);assert.equal(next.get('filter'),'waiting');assert.equal(next.get('business'),'vd');
});
test('review links bind a request to its authorized branch and bootstrap that branch before fetching',()=>{
 const search=openQueueReview('?workspace=operations&business=vd','qa-request','qa-recovery-20261017');
 assert.equal(initialQueueLocation(locations,search),'qa-recovery-20261017');
 assert.equal(scopedQueueReviewId(search,'qa-recovery-20261017'),'qa-request');
 assert.equal(scopedQueueReviewId(search,'demo-courts'),null);
 assert.equal(initialQueueLocation(locations,openQueueReview('','hidden-request','inaccessible')),'demo-courts');
 assert.equal(scopedQueueReviewId(openQueueReview('','hidden-request','inaccessible'),'demo-courts'),null);
});
test('old unbound links retain genuine not-found/error handling; empty selection uses normal primary branch',()=>{
 assert.equal(scopedQueueReviewId('?request=legacy','demo-courts'),'legacy');
 assert.equal(initialQueueLocation(locations,'?requestLocation=qa-recovery-20261017'),'demo-courts');
 assert.equal(initialQueueLocation([],''),'');
});

const {clearConfirmedDraftSelection}=require('../src/vendor/queueReviewRoute.ts');
test('confirmed draft cleanup cannot clear a newer request or a different branch selection',()=>{
 const selected=openQueueReview('?workspace=operations','deleted-draft','qa-branch');
 assert.equal(new URLSearchParams(clearConfirmedDraftSelection(selected,'deleted-draft','qa-branch')).has('request'),false);
 assert.equal(clearConfirmedDraftSelection(selected,'another-draft','qa-branch'),selected);
 assert.equal(clearConfirmedDraftSelection(selected,'deleted-draft','another-branch'),selected);
 const newer=openQueueReview(selected,'new-request','qa-branch');assert.equal(clearConfirmedDraftSelection(newer,'deleted-draft','qa-branch'),newer);
});
