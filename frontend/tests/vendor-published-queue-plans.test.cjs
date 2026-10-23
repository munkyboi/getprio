require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {PublishedQueuePlans}=require('../src/vendor/PublishedQueuePlans.tsx');
const plan={id:'p',ticketNumber:'VD-1',customer:{name:'Demo'},state:'called',workflow:{mode:'linear',configurationRevision:'1'},currentStage:{ordinal:1,state:'called',attempt:'2'},lines:[{lineId:'a',serviceName:'Court session',quantity:3,durationMinutes:180,requirements:[{poolId:'1',totalUnits:3,unitsPerQuantity:1}]}],resourceWait:null,reservationGroups:[{id:'r',state:'protected',expiresAt:'2026-10-17T02:00:00Z',members:[{id:'m',lineId:'a',units:3,startsAt:'2026-10-17T01:00:00Z',endsAt:'2026-10-17T04:00:00Z',state:'protected'}]}],allocationGroups:[],allowedActions:['start']};
const render=change=>renderToStaticMarkup(React.createElement(PublishedQueuePlans,{plans:[{...plan,...change}],busy:false,onAction(){}}));
test('published projections keep configured demand distinct from recorded reservation and allocation',()=>{
 const html=render();assert.match(html,/3 unit\(s\) · 180 minutes/);assert.match(html,/3 reservation unit\(s\)/);
 assert.doesNotMatch(html,/Holding resources/);assert.match(html,/Start service/);assert.doesNotMatch(html,/Complete service<|Call ticket</);
 assert.match(html,/Expected end does not release resources/);
});
test('resource waiting is only displayed from the authoritative reason',()=>{
 const html=render({state:'waiting',resourceWait:{message:'Three units are not free for the full interval.'},reservationGroups:[],allowedActions:[]});
 assert.match(html,/Waiting for resources: Three units/);assert.doesNotMatch(html,/reservation unit/);
 assert.doesNotMatch(render({state:'waiting',reservationGroups:[],allowedActions:[]}),/Waiting for resources:/);
});
