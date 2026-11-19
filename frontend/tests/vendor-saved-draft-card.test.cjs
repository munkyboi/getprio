require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {SavedRequestDraftCard}=require('../src/vendor/SavedRequestDraftCard.tsx');
const props={state:'draft',name:'Own QA draft',revision:'4',serviceCount:1,readiness:{ready:true,reasons:[]},canPublish:true,canDelete:true,canEdit:true,busy:false,onEdit(){},onPublish(){},onDelete(){}};
const render=extra=>renderToStaticMarkup(React.createElement(SavedRequestDraftCard,{...props,...extra}));
test('ready saved drafts expose explicit Publish and authorized named trash action',()=>{
 const html=render({});assert.match(html,/>Publish request</);assert.match(html,/Ready to publish/);assert.match(html,/aria-label="Delete draft for Own QA draft"/);assert.doesNotMatch(html,/<button[^>]* disabled=""[^>]*>Publish request/);
});
test('incomplete or unknown readiness stays visible with disabled publication and reasons',()=>{
 const html=render({readiness:{ready:false,reasons:['Choose a resource.']}});assert.match(html,/Choose a resource/);assert.match(html,/<button[^>]* disabled=""[^>]*>Publish request/);
 assert.match(render({readiness:undefined}),/Refresh this draft/);assert.doesNotMatch(render({canDelete:false}),/Delete draft for/);
});
test('stale published records cannot expose draft actions, and pending state disables publication',()=>{
 assert.equal(render({state:'served'}),'');assert.match(render({busy:true}),/<button[^>]* disabled=""[^>]*>Publish request/);
});

test('a reconciliation-only draft cannot offer editing without a server action',()=>{
 const html=render({canEdit:false,canPublish:false,canDelete:false,readiness:{ready:false,reasons:['This draft requires reconciliation.']}});
 assert.match(html,/<button[^>]*aria-label="Edit service request for Own QA draft"[^>]* disabled=""|<button[^>]* disabled=""[^>]*aria-label="Edit service request for Own QA draft"/);
 assert.doesNotMatch(html,/aria-label="Delete draft/);assert.match(html,/requires reconciliation/);
});
