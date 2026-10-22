require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { resourceDashboardModel, poolUtilization, dashboardScopeKey } = require('../src/vendor/resourceDashboardModel.ts');
const scope = {tenantSlug:'sports',locationSlug:'courts',tenantId:'tenant-a',locationId:'location-a'};
function observation(overrides={}) {
  return {contractVersion:'local-resource-operations-v1',localDemo:true,scope:{tenantId:'tenant-a',locationId:'location-a'},asOf:'2026-10-20T15:00:00.000Z',ledgerRevision:'revision-8',readyWaitingCount:1,
    pools:[{id:'courts',name:'Courts',capacity:4,revision:'r1',trackingEnabled:true,archivedAt:null,availabilityQuality:'observed',availabilityReasonCodes:[],allocatedUnits:3,protectedUnitsNow:1,availableUnits:0,overdueUnits:2,overCapacity:false}],
    waiting:[{id:'waiting-a'},{id:'waiting-a'},{id:'waiting-b'}],called:[{id:'called-a'}],activeSessions:[{ticketId:'active-a'},{ticketId:'active-a'},{ticketId:'active-b'}],
    reconciliation:{required:false,issues:[]},...overrides};
}
test('scope guard rejects foreign business/location and incomplete data rather than reusing it',()=>{
  for(const changed of [{tenantId:'other'},{locationId:'other'}]) assert.throws(()=>resourceDashboardModel(observation({scope:{...observation().scope,...changed}}),scope),/selected business and location/);
  assert.throws(()=>resourceDashboardModel(observation({asOf:'invalid'}),scope),/incomplete/);
  assert.throws(()=>resourceDashboardModel(observation({pools:[{...observation().pools[0],allocatedUnits:NaN}]}),scope),/capacity data/);
  assert.notEqual(dashboardScopeKey(scope),dashboardScopeKey({...scope,locationId:'other'}));
});
test('loaded counts deduplicate IDs while current waiting and active allocation observations remain separate',()=>{
 const model=resourceDashboardModel(observation(),scope);
 assert.equal(model.loadedWaiting,2);assert.equal(model.loadedCalled,1);assert.equal(model.readyToCall,1);assert.equal(model.requestsWithAllocations,2);
 assert.equal(model.waitingTotal,undefined);assert.equal(model.inServiceTotal,undefined);
});
test('overdue remains inside allocated units and capacity never sums unlike pools',()=>{
 const data=observation();data.pools.push({...data.pools[0],id:'equipment',name:'Equipment',capacity:20,allocatedUnits:10,protectedUnitsNow:0,availableUnits:10,overdueUnits:0});
 const model=resourceDashboardModel(data,scope);
 assert.equal(model.pools[0].allocatedUnits,3);assert.equal(poolUtilization(model.pools[0]),75);assert.equal(poolUtilization(model.pools[1]),50);assert.equal(model.totalCapacity,undefined);
 assert.match(model.attention.find(item=>item.title.includes('overdue')).detail,/Review overdue resources/);
});
test('zero capacity and disabled tracking never produce a percentage; overcapacity stays above 100%',()=>{
 const pool=observation().pools[0];assert.equal(poolUtilization({...pool,capacity:0}),null);assert.equal(poolUtilization({...pool,trackingEnabled:false}),null);assert.equal(poolUtilization({...pool,allocatedUnits:6}),150);
});
test('global reconciliation without a pool ID remains visible and cannot imply all-clear',()=>{
 const model=resourceDashboardModel(observation({pools:[],reconciliation:{required:true,issues:[{code:'unknown-allocation'}]}}),scope);
 assert.equal(model.reconciliationRequired,true);assert.equal(model.attention.length,1);assert.equal(model.attention[0].poolId,null);assert.match(model.attention[0].title,/need review/);
});

test('older runtimes and unknown protection quality cannot claim available capacity or healthy pools',()=>{
 const data=observation();delete data.pools[0].availabilityQuality;const model=resourceDashboardModel(data,scope);
 assert.equal(model.pools[0].availabilityQuality,'unknown');assert.equal(poolUtilization(model.pools[0]),null);assert.equal(model.attentionPoolCount,null);
 assert.ok(model.attention.some(item=>item.title.includes('availability unknown')));
 const expired=resourceDashboardModel(observation({pools:[{...observation().pools[0],availabilityQuality:'unknown',availabilityReasonCodes:['protection_expired']}]}),scope);
 assert.equal(expired.pools[0].protectedUnitsNow,1);assert.equal(expired.pools[0].availableUnits,0);assert.equal(expired.attentionPoolCount,null);
});
test('malformed overdue subset and over-capacity marker are rejected',()=>{
 const pool=observation().pools[0];
 for(const change of [{overdueUnits:4},{overCapacity:'false'},{revision:''}])assert.throws(()=>resourceDashboardModel(observation({pools:[{...pool,...change}]}),scope),/capacity data/);
});

test('SSE hints ignore explicit other-location payloads and permit tenant-scoped invalidation',()=>{
 const {dashboardHintMatchesLocation}=require('../src/vendor/resourceDashboardModel.ts');
 assert.equal(dashboardHintMatchesLocation(JSON.stringify({locationId:'location-a'}),'location-a'),true);
 assert.equal(dashboardHintMatchesLocation(JSON.stringify({locationId:'other'}),'location-a'),false);
 assert.equal(dashboardHintMatchesLocation(JSON.stringify({type:'queue-plans-updated'}),'location-a'),true);
});

test('presentation uses exact supported KPI labels and retains last-good timestamp with stale warning',()=>{
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {ResourceDashboardView}=require('../src/vendor/ResourceDashboard.tsx');
 const model=resourceDashboardModel(observation(),scope);
 const html=renderToStaticMarkup(React.createElement(ResourceDashboardView,{model,loading:false,refreshing:false,unavailable:false,error:'Connection interrupted',stale:true,onRetry(){},onOpenQueue(){}}));
 assert.match(html,/Waiting now/);assert.match(html,/Excludes bookings scheduled for later\./);assert.match(html,/Requests using resources/);assert.match(html,/Last updated/);assert.match(html,/Connection interrupted/);assert.match(html,/Loaded waiting requests/);assert.match(html,/3 used \/ 4 units/);assert.match(html,/0 units available at last update/);assert.doesNotMatch(html,/All clear|100% healthy|Waiting requests<|In service</);
 const unavailable=renderToStaticMarkup(React.createElement(ResourceDashboardView,{loading:false,refreshing:false,unavailable:true,stale:false,onRetry(){},onOpenQueue(){}}));
 assert.match(unavailable,/Updates unavailable/);assert.match(unavailable,/No updates to show/);assert.doesNotMatch(unavailable,/Needs attention/);
});

test('stream waits for authorized ready, ignores other-location hints, reconnects gaps and disposes old callbacks',()=>{
 const {subscribeResourceDashboard}=require('../src/vendor/useResourceDashboard.ts');
 let now=0,next=1;const timers=new Map();const sources=[];const states=[];let refreshes=0;
 class FakeSource {constructor(){this.listeners=new Map();this.closed=false;sources.push(this);}addEventListener(n,f){this.listeners.set(n,f);}removeEventListener(n,f){if(this.listeners.get(n)===f)this.listeners.delete(n);}close(){this.closed=true;}emit(n,data){this.listeners.get(n)?.({data});}}
 const stop=subscribeResourceDashboard({url:'/scoped',locationId:'location-a',onState:s=>states.push(s),onRefresh:()=>refreshes++,createSource:()=>new FakeSource(),clock:()=>now,schedule:(fn,delay)=>{const id=next++;timers.set(id,{fn,delay});return id;},cancel:id=>timers.delete(id)});
 const first=sources[0];first.emit('open');assert.equal(states.at(-1),'connecting');
 first.emit('ready',JSON.stringify({}));assert.equal(states.at(-1),'connecting');
 first.emit('ready',JSON.stringify({locationId:'other'}));assert.equal(states.at(-1),'connecting');
 first.emit('ready',JSON.stringify({locationId:'location-a'}));assert.equal(states.at(-1),'connected');
 const before=refreshes;first.emit('queue-plans-updated',JSON.stringify({locationId:'other'}));assert.equal(refreshes,before);
 first.emit('queue-plans-updated',JSON.stringify({locationId:'location-a'}));assert.equal(refreshes,before+1);
 const oldReady=first.listeners.get('ready');now=61000;const gap=[...timers.entries()].find(([,t])=>t.delay===15000);timers.delete(gap[0]);gap[1].fn();assert.equal(first.closed,true);assert.equal(states.at(-1),'disconnected');
 const retry=[...timers.entries()].find(([,t])=>t.delay===5000);timers.delete(retry[0]);retry[1].fn();assert.equal(sources.length,2);assert.equal(states.at(-1),'disconnected');
 oldReady({data:JSON.stringify({locationId:'location-a'})});assert.equal(states.at(-1),'disconnected');
 stop();assert.equal(sources[1].closed,true);assert.equal(timers.size,0);
});

test('quality reason codes explain unknown availability without releasing held capacity',()=>{
 const {poolAvailabilityReason}=require('../src/vendor/resourceDashboardModel.ts');const pool=observation().pools[0];
 for(const [reason,copy] of [['pool_archived','archived'],['tracking_disabled','turned off'],['protection_expired','reservation'],['protection_inconsistent','Held capacity'],['reconciliation_required','records']])assert.match(poolAvailabilityReason({...pool,availabilityQuality:'unknown',availabilityReasonCodes:[reason]}),new RegExp(copy));
});
test('Dashboard cannot navigate users into an unavailable Live queue section',()=>{
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {ResourceDashboardView}=require('../src/vendor/ResourceDashboard.tsx');
 const html=renderToStaticMarkup(React.createElement(ResourceDashboardView,{canOpenQueue:false,loading:false,refreshing:false,unavailable:true,stale:false,onRetry(){},onOpenQueue(){}}));
 assert.match(html,/<button[^>]*disabled[^>]*title="Live queue access is unavailable for this account\."[^>]*>Live queue/);
});

test('unscopable reconciliation makes all pool availability unknown without changing recorded units',()=>{
 const model=resourceDashboardModel(observation({reconciliation:{required:true,issues:[{code:'unscopable'}]}}),scope);
 assert.equal(model.pools[0].availabilityQuality,'unknown');assert.equal(poolUtilization(model.pools[0]),null);assert.equal(model.pools[0].allocatedUnits,3);assert.equal(model.pools[0].protectedUnitsNow,1);assert.equal(model.attentionPoolCount,null);
});
