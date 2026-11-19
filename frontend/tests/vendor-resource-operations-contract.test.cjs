require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {QueryClient,QueryClientProvider}=require('@tanstack/react-query');
const {useResourceDashboard}=require('../src/vendor/useResourceDashboard.ts');
const {useLocalPoolOperations}=require('../src/vendor/useLocalPoolOperations.ts');
const {resourceDashboardModel}=require('../src/vendor/resourceDashboardModel.ts');
const {scopedLocalPoolData}=require('../src/vendor/localPoolState.ts');
const scope={tenantSlug:'club',locationSlug:'main',tenantId:'1',locationId:'10'};
const dto=()=>({contractVersion:'vendor-resource-operations-v1',scope:{tenantId:'1',locationId:'10'},asOf:'2026-10-25T03:00:00Z',ledgerRevision:'8',readyWaitingCount:0,pools:[],waiting:[],called:[],activeSessions:[],reconciliation:{required:false,issues:[]}});
test('real contract rejects legacy identity, malformed scope and cross-tenant/location observations',()=>{
 const real=dto();assert.equal(resourceDashboardModel(real,scope).scopeKey,JSON.stringify(['club','main','1','10']));
 for(const changed of [null,{}, {...real,contractVersion:'local-resource-operations-v1',localDemo:true},{...real,localDemo:true},{...real,scope:{tenantId:'2',locationId:'10'}},{...real,scope:{tenantId:'1',locationId:'20'}},{...real,scope:{tenantId:1,locationId:10}}])assert.throws(()=>resourceDashboardModel(changed,scope),/selected business and location/);
 const snapshot={tenant:{id:'1',slug:'club'},location:{id:'10',slug:'main'}};
 assert.equal(scopedLocalPoolData(snapshot,{...real,scope:{tenantId:'2',locationId:'10'}},'club','main'),null);
 assert.equal(scopedLocalPoolData(snapshot,real,'club','main'),real);
});
test('actual React Query hooks request real snapshot without DEV flags and reject legacy/cross-scope payloads',async()=>{
 const prior=global.fetch;let payload=dto();const calls=[];
 global.fetch=async(url)=>{calls.push(String(url));return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});};
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});let enabled;
 function Probe(){const dashboard=useResourceDashboard('offline-session',scope);useLocalPoolOperations('offline-session','club','main',true);enabled=dashboard.enabled;return React.createElement('div',null,String(enabled));}
 try{
  assert.equal(renderToStaticMarkup(React.createElement(QueryClientProvider,{client},React.createElement(Probe))),'<div>true</div>');
  const queries=client.getQueryCache().getAll();assert.equal(queries.length,2);assert.equal(enabled,true);
  for(const query of queries){const result=await query.options.queryFn({signal:new AbortController().signal});assert.ok(result);}
  assert.equal(calls.length,2);assert.ok(calls.every(url=>url.endsWith('/vendor/tenant/club/locations/main/resource-operations/snapshot')));
  payload={...dto(),contractVersion:'local-resource-operations-v1',localDemo:true};
  for(const query of queries)await assert.rejects(()=>query.options.queryFn({signal:new AbortController().signal}),/selected business and location/);
  payload={...dto(),scope:{tenantId:'2',locationId:'20'}};
  const dashboard=queries.find(q=>q.queryKey[0]==='resource-dashboard');await assert.rejects(()=>dashboard.options.queryFn({signal:new AbortController().signal}),/selected business and location/);
 }finally{client.clear();global.fetch=prior;}
});
