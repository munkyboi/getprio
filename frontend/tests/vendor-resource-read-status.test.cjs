require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {ResourceReadStatus}=require('../src/vendor/ResourceReadStatus.tsx');
const render=(state,refreshing=false)=>renderToStaticMarkup(React.createElement(ResourceReadStatus,{state,refreshing,onRetry(){}}));
test('unavailable reconciliation is explicit and retry locks while refreshing',()=>{
 assert.match(render('unavailable'),/Resource status unavailable/);assert.match(render('unavailable'),/Retry resource status/);
 assert.doesNotMatch(render('unavailable'),/disabled=""/);assert.match(render('unavailable',true),/disabled=""/);
 assert.match(render('checking'),/role="status"/);assert.match(render('checking'),/Checking resource reconciliation/);assert.equal(render('ready'),'');
});
test('explicit not-applicable status is neutral and never a ready or retry claim',()=>{const html=render('not_applicable');assert.match(html,/not available for this business/);assert.doesNotMatch(html,/Resource status unavailable|Retry resource status|healthy/);});
