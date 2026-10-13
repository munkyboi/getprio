require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { CounterTickets, LiveQueueSummary, LiveQueueIntake, QueueCopyField } = require('../src/vendor/LiveQueueWidgets.tsx');
const fixture = require('./fixtures/vendor-live-queue.json');
const render = (component,props) => renderToStaticMarkup(React.createElement(component,props));
const ticketProps = {snapshot:fixture,disabled:false,onSelect(){},onEnd(){}};

test('counter overview shows concurrent tickets with individual service controls',()=>{
  const html=render(CounterTickets,ticketProps);
  assert.match(html,/QA001/); assert.match(html,/QA002/);
  assert.match(html,/Manage QA001/); assert.match(html,/Manage QA002/);
  assert.match(html,/Complete service[^]*for QA001/);
  assert.match(html,/Interrupt service[^]*for QA001/);
  assert.doesNotMatch(html,/Complete service[^<]*for QA002/);
  assert.match(html,/Manage each counter’s ticket independently/);
  assert.doesNotMatch(html,/units occupied|available resources/);
  assert.doesNotMatch(html,/OLD001/);
});
test('closed queue still exposes authorized resolution of existing service timing',()=>{
  const html=render(CounterTickets,{...ticketProps,snapshot:{...fixture,queueDay:{...fixture.queueDay,state:'closed',isClosed:true}}});
  assert.match(html,/Complete service/);assert.match(html,/Interrupt service/);
  assert.doesNotMatch(html,/disabled=""/);
});
test('busy state disables every counter action while retaining both tickets',()=>{
  const html=render(CounterTickets,{...ticketProps,disabled:true});
  assert.equal((html.match(/\sdisabled=""/g)||[]).length,4);
  assert.match(html,/QA001/);assert.match(html,/QA002/);
});
test('summary distinguishes ticket timing from waiting estimates and unknown values',()=>{
  const html=render(LiveQueueSummary,{snapshot:fixture});
  assert.match(html,/Counter tickets/);assert.match(html,/1 with service started/);assert.match(html,/5 min estimated wait/);
  assert.doesNotMatch(html,/resource units|available capacity/);
  const empty=render(LiveQueueSummary,{snapshot:null});assert.match(empty,/Estimate unavailable/);
});
test('intake describes waiting threshold and explicit resume policy',()=>{
  const html=render(LiveQueueIntake,{waitingCount:10,threshold:10,resumeWaitingCount:8,autoResumeEnabled:true,stateLabel:'Paused',state:'paused'});
  assert.match(html,/10 of 10 waiting tickets/);assert.match(html,/automatically at 8 waiting tickets or fewer/);
  assert.match(html,/aria-label="Waiting tickets before auto-pause"/);
});
test('public links use accessible copy controls and disable copying absent URLs',()=>{
  const html=render(QueueCopyField,{label:'Queue board URL',value:'',onClick(){}});
  assert.match(html,/aria-label="Copy Queue board URL"/);assert.match(html,/readonly=""/);assert.match(html,/disabled=""/);
});

const QueueLifecycleTray = require('../src/vendor/QueueLifecycleTray.tsx').default;
const trayProps = {snapshot:fixture,locationName:'Main',canOperate:true,busyAction:'',async onRefresh(){},async onExtend(){return true},async onCloseNow(){return true}};
test('auto-close distinguishes ordinary, final and reconciliation-error warnings',()=>{
  const warning=(minutes,error=null)=>render(QueueLifecycleTray,{...trayProps,snapshot:{...fixture,queueDay:{...fixture.queueDay,state:'open',autoClosePhase:'warning',currentClosesAt:new Date(Date.now()+minutes*60000).toISOString(),reconciliationError:error}}});
  const ordinary=warning(10), final=warning(2), failed=warning(10,'Reconciliation failed');
  assert.match(ordinary,/data-severity="warning"/);assert.match(ordinary,/aria-live="polite"/);
  for(const html of [final,failed]){assert.match(html,/data-severity="urgent"/);assert.match(html,/v:text-destructive/);assert.match(html,/aria-live="assertive"/);}
  assert.match(failed,/Queue status needs attention/);assert.match(failed,/Retry status/);
});
