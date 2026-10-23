require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {serviceHoursCallAllowed,serviceHoursNotice}=require('../src/vendor/queueServiceHoursPresentation.ts');
const {ServiceHoursNotice}=require('../src/vendor/ServiceHoursNotice.tsx');
const eligibility=status=>({status,reason:null,requiredDurationMinutes:null,serviceHoursWindow:null,nextChangeAt:null});
test('hours presentation trusts server status only and never classifies historical requests as fits',()=>{
 for(const status of ['fits','not_enforced'])assert.equal(serviceHoursCallAllowed(eligibility(status)),true);
 for(const status of ['does_not_fit','unavailable'])assert.equal(serviceHoursCallAllowed(eligibility(status)),false);
 assert.equal(serviceHoursCallAllowed(undefined),false);
 const historical=serviceHoursNotice(eligibility('not_enforced'));assert.match(historical.label,/Earlier request/);assert.doesNotMatch(historical.label,/fits|conflict/i);
 const html=renderToStaticMarkup(React.createElement(ServiceHoursNotice,{eligibility:eligibility('not_enforced')}));assert.equal(html,'');
});
test('blocked row/card warning shows the hours reason separately from resource conflicts',()=>{
 const data={...eligibility('does_not_fit'),reason:{code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS',message:'This request cannot finish before closing.'}};
 const html=renderToStaticMarkup(React.createElement(ServiceHoursNotice,{eligibility:data}));
 assert.match(html,/Not enough time before closing/);assert.match(html,/There isn&#x27;t enough time before closing/);assert.match(html,/data-variant="warning"/);assert.doesNotMatch(html,/Resource conflict|Waiting for resources/);
 const unknown=renderToStaticMarkup(React.createElement(ServiceHoursNotice,{}));assert.match(unknown,/Opening hours unavailable/);
});

test('published request notices distinguish closed, too-long and unknown hours without draft-only actions or contract changes',()=>{
 const closed={...eligibility('does_not_fit'),reason:{code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS',message:'internal duration policy diagnostic'},serviceHoursWindow:{status:'closed'}};const before=JSON.stringify(closed);const notice=serviceHoursNotice(closed);assert.equal(notice.message,"We're closed right now. This request can't be called until we're open.");assert.doesNotMatch(notice.message,/draft|shorter/);assert.equal(serviceHoursCallAllowed(closed),false);assert.equal(JSON.stringify(closed),before);
 const unavailable={...eligibility('unavailable'),reason:{code:'STORE_HOURS_UNAVAILABLE',message:'internal hours diagnostic'}};assert.equal(serviceHoursNotice(unavailable).message,"We couldn't check the opening hours. Refresh to try again.");assert.equal(serviceHoursCallAllowed(unavailable),false);
 const other={...eligibility('unavailable'),reason:{code:'FUTURE_DISTINCT_REASON',message:'A specific new reason.'}};assert.equal(serviceHoursNotice(other).message,'A specific new reason.');assert.equal(serviceHoursCallAllowed(other),false);
});
