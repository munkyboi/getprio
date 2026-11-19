require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {requestStatusIntent}=require('../src/vendor/requestStatusIntent.ts');
const {RequestStatusBadge}=require('../src/vendor/RequestStatusBadge.tsx');
const groups={secondary:['draft','pending','superseded','expired'],warning:['waiting','pending_carry_over','paused','interrupted','partial','mixed','skipped','unserved'],info:['called','protected','in_service','awaiting_handoff','open','converted'],success:['served','completed','released'],destructive:['cancelled','canceled','terminated']};
test('request and child lifecycle states have one consistent semantic intent',()=>{
 for(const [intent,states] of Object.entries(groups))for(const state of states)assert.equal(requestStatusIntent(state),intent,state);
 assert.equal(requestStatusIntent('In Service'),'info');assert.equal(requestStatusIntent('unknown future state'),'secondary');assert.equal(requestStatusIntent('__proto__'),'secondary');
});
test('status badges preserve explicit state text and use scoped outlined treatment',()=>{
 for(const [intent,states] of Object.entries(groups))for(const state of states){
  const html=renderToStaticMarkup(React.createElement(RequestStatusBadge,{state}));assert.match(html,/request-status-badge/);assert.ok(html.includes(state.replaceAll('_',' ')));assert.ok(html.includes(`data-variant="${intent}"`));assert.doesNotMatch(html,/data-variant="critical"/);
 }
 const html=renderToStaticMarkup(React.createElement(RequestStatusBadge,{state:'skipped',label:'Skipped'}));assert.match(html,/>Skipped<\/span>/);
});
