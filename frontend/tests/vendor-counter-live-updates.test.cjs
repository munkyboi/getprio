require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {QueryClient,QueryObserver}=require('@tanstack/react-query');
const {refreshCounterRequests,subscribeCounterUpdates}=require('../src/vendor/queueCounterLiveUpdates.ts');
test('authenticated SSE refreshes counter, conflicts and same-ID details without polling; reconnect reconciles missed updates',async()=>{
 const original=global.EventSource;let source;
 class Source extends EventTarget {constructor(url,options){super();this.url=url;this.options=options;source=this;}close(){this.closed=true;}}
 global.EventSource=Source;const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 const keys=['queue-counter-controls','queue-counter-resource-conflicts','queue-counter-next-plan','queue-counter-next-eligible-plan','queue-counter-request-details'];
 let revision=1;const observers=keys.map(key=>new QueryObserver(client,{queryKey:[key,'session','tenant','location','same-plan'],queryFn:async()=>revision}));
 const stop=observers.map(o=>o.subscribe(()=>{}));await Promise.all(observers.map(o=>o.refetch()));
 let refreshed;const cleanup=subscribeCounterUpdates('/stream',()=>{refreshed=refreshCounterRequests(client,'session','tenant','location');});
 try{assert.equal(source.options.withCredentials,true);revision=2;source.dispatchEvent(new Event('queue-plans-updated'));await refreshed;assert.ok(observers.every(o=>o.getCurrentResult().data===2));revision=3;source.dispatchEvent(new Event('open'));await refreshed;assert.ok(observers.every(o=>o.getCurrentResult().data===3));cleanup();assert.equal(source.closed,true);revision=4;source.dispatchEvent(new Event('queue-plans-updated'));assert.ok(observers.every(o=>o.getCurrentResult().data===3));}finally{cleanup();stop.forEach(fn=>fn());client.clear();global.EventSource=original;}
});
test('stream health requires exact authorized ready and is isolated by token/location with gap recovery',()=>{
 const {queueStreamScope,queueStreamHealthy}=require('../src/vendor/queueCounterLiveUpdates.ts');
 const original=global.EventSource;const sources=[];const timers=new Map();let timerId=0,now=0,reads=0;
 class Source extends EventTarget {constructor(){super();this.handlers=new Map();sources.push(this);}addEventListener(n,fn){super.addEventListener(n,fn);this.handlers.set(n,fn);}removeEventListener(n,fn){super.removeEventListener(n,fn);this.handlers.delete(n);}close(){this.closed=true;}}
 global.EventSource=Source;
 const scope=queueStreamScope('session','tenant','location'),other=queueStreamScope('other-session','tenant','location');
 const cleanup=subscribeCounterUpdates('/stream',()=>reads++,{scope,locationId:'location-id',clock:()=>now,schedule:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},cancel:id=>timers.delete(id)});
 try{
  const first=sources[0];assert.equal(queueStreamHealthy(scope),false);
  first.dispatchEvent(new Event('open'));assert.equal(reads,1);assert.equal(queueStreamHealthy(scope),false);
  first.dispatchEvent(new Event('heartbeat'));assert.equal(queueStreamHealthy(scope),false);
  first.dispatchEvent(new MessageEvent('ready',{data:JSON.stringify({locationId:'other'})}));assert.equal(queueStreamHealthy(scope),false);
  first.dispatchEvent(new MessageEvent('ready',{data:JSON.stringify({locationId:'location-id'})}));assert.equal(queueStreamHealthy(scope),true);assert.equal(queueStreamHealthy(other),false);
  const oldReady=first.handlers.get('ready');const before=reads;
  first.dispatchEvent(new MessageEvent('queue-plans-updated',{data:JSON.stringify({locationId:'other'})}));assert.equal(reads,before);
  first.dispatchEvent(new MessageEvent('queue-plans-updated',{data:JSON.stringify({locationId:'location-id'})}));assert.equal(reads,before+1);
  now=61000;const [id,timer]=[...timers.entries()][0];timers.delete(id);timer.fn();assert.equal(queueStreamHealthy(scope),false);assert.equal(first.closed,true);
  const [retryId,retry]=[...timers.entries()][0];timers.delete(retryId);retry.fn();assert.equal(sources.length,2);
  oldReady(new MessageEvent('ready',{data:JSON.stringify({locationId:'location-id'})}));assert.equal(queueStreamHealthy(scope),false);
  sources[1].dispatchEvent(new MessageEvent('ready',{data:JSON.stringify({locationId:'location-id'})}));assert.equal(queueStreamHealthy(scope),true);
  cleanup();assert.equal(queueStreamHealthy(scope),false);assert.equal(sources[1].closed,true);assert.equal(timers.size,0);
 }finally{cleanup();global.EventSource=original;}
});
test('an hours invalidation during an active read queues one fresh read instead of being lost while polling is suppressed',async()=>{
 const {createCounterReadQueue}=require('../src/vendor/queueCounterLiveUpdates.ts');let reads=0,finish;
 const queue=createCounterReadQueue(()=>{reads++;return new Promise(resolve=>{finish=resolve;});});
 const turn=()=>new Promise(resolve=>setImmediate(resolve));
 queue.update();await turn();assert.equal(reads,1);
 queue.update();queue.update();finish();await turn();assert.equal(reads,2);
 queue.update();queue.dispose();finish();await turn();assert.equal(reads,2);
});

test('authorized heartbeat reads a fresh snapshot; failed reads retain the actual last receipt and disposed callbacks cannot refresh',async()=>{
 const original=global.EventSource;let source,reads=0,failed=false,nextReceipt=100,refreshed;
 class Source extends EventTarget {constructor(){super();source=this;this.handlers=new Map();}addEventListener(name,handler){super.addEventListener(name,handler);this.handlers.set(name,handler);}removeEventListener(name,handler){super.removeEventListener(name,handler);}close(){this.closed=true;}}
 global.EventSource=Source;
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 const observer=new QueryObserver(client,{queryKey:['queue-counter-controls','session','tenant','location'],queryFn:async()=>{reads++;if(failed)throw new Error('read unavailable');return {observedAt:`server-${nextReceipt}`,clientReceivedAt:nextReceipt};}});
 const unsubscribe=observer.subscribe(()=>{});await observer.refetch();
 const cleanup=subscribeCounterUpdates('/stream',()=>{refreshed=refreshCounterRequests(client,'session','tenant','location');},{scope:'heartbeat-test',locationId:'location-id'});
 try{
  source.dispatchEvent(new Event('heartbeat'));assert.equal(reads,1);
  source.dispatchEvent(new MessageEvent('ready',{data:JSON.stringify({locationId:'other'})}));
  source.dispatchEvent(new Event('heartbeat'));assert.equal(reads,1);
  source.dispatchEvent(new MessageEvent('ready',{data:JSON.stringify({locationId:'location-id'})}));await refreshed;assert.equal(reads,2);
  nextReceipt=200;source.dispatchEvent(new Event('heartbeat'));await refreshed;
  assert.equal(reads,3);assert.deepEqual(observer.getCurrentResult().data,{observedAt:'server-200',clientReceivedAt:200});
  failed=true;nextReceipt=300;source.dispatchEvent(new Event('heartbeat'));await refreshed;
  assert.equal(reads,4);assert.equal(observer.getCurrentResult().isError,true);assert.deepEqual(observer.getCurrentResult().data,{observedAt:'server-200',clientReceivedAt:200});
  const staleHeartbeat=source.handlers.get('heartbeat');cleanup();staleHeartbeat(new Event('heartbeat'));await Promise.resolve();assert.equal(reads,4);
 }finally{cleanup();unsubscribe();client.clear();global.EventSource=original;}
});
