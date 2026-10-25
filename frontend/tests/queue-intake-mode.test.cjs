require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {queueIntakeMode,queueWorkPresentation,legacyQueueWork,showResourceManagement}=require('../src/vendor/queueIntakeMode.ts');
const current=extra=>({optedIn:true,tenantSlug:'free-vendor',entitlementTenantSlug:'free-vendor',loaded:true,locationSlug:'main',setup:{scope:'free-vendor:main',ready:false},entitlements:{queueSystemAccess:true,serviceBookingAccess:false,monthlyTickets:500},plan:{planSlug:'free',subscriptionStatus:'active'},...extra});
test('queue setup readiness, not booking permission or menu visibility, selects resource intake',()=>{
 assert.equal(queueIntakeMode(current()),'legacy');
 assert.equal(queueIntakeMode(current({setup:{scope:'free-vendor:main',ready:true}})),'resource');
 assert.equal(queueIntakeMode(current({entitlements:{queueSystemAccess:true,serviceBookingAccess:true}})),'legacy');
 assert.equal(queueIntakeMode(current({setup:{scope:'old-vendor:main',ready:true}})),'legacy');
 assert.equal(queueIntakeMode(current({setup:{scope:'free-vendor:main',ready:true},optedIn:false})),'legacy');
 assert.equal(queueIntakeMode(current({setup:{scope:'free-vendor:main',ready:true},entitlements:{queueSystemAccess:false,serviceBookingAccess:true}})),'legacy');
});
test('initial loading and scope changes fail safe, ordinary background refresh retains known setup',()=>{
 for(const change of [{loaded:false},{entitlements:undefined},{entitlementTenantSlug:undefined},{entitlementTenantSlug:'previous-pro'},{tenantSlug:''}])assert.equal(queueIntakeMode(current(change)),'loading');
 assert.equal(queueIntakeMode(current({setup:{scope:'free-vendor:main',ready:true},loaded:true})),'resource');
 assert.equal(queueIntakeMode(current({locationSlug:'other',setup:{scope:'free-vendor:main',ready:true}})),'legacy');
});
test('dashboard integrates scoped mode across intake, dialog, dispatch and both ticket presentations',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');
 assert.equal((source.match(/localPoolDemoClientEnabled/g)||[]).length,1,'global opt-in only imported, never used directly as tenant mode');
 assert.match(source,/clientTenantSlug: selectedTenantSlug/);
 assert.match(source,/loaded: effectiveEntitlementsQuery\.isSuccess && !effectiveEntitlementsQuery\.isPlaceholderData/);
 assert.match(source,/const dispatchSnapshot = workPresentation\.resourceCounters \? localPoolDispatchSnapshot/);
 assert.match(source,/function renderQueuePage\(\) \{\s*if \(intakeMode === "loading"\)/);
 assert.match(source,/!resourceQueueEnabled && <QueueButton[\s\S]*?Add walk-in/);
 assert.match(source,/workPresentation\.resourceCounters \? <CounterQueueControls/);
 assert.match(source,/resourceManagementEnabled && selectedTenantSlug && selectedLocationSlug \? <NamedQueuePanel/);
 assert.match(source,/!resourceQueueEnabled \? <LiveQueueSummary/);
 assert.match(source,/!resourceQueueEnabled && queueView === "current"/);
 assert.match(source,/<WalkInDialog linearMode=\{resourceQueueEnabled\}/);
 assert.match(source,/function renderWalkInDialog\(\) \{\s*if \(intakeMode === "loading"\) return null/);
 assert.match(source,/const localPoolQuery = useLocalPoolOperations\(token, selectedTenantSlug, selectedLocationSlug, canLoadProtectedDashboard && currentSection === "queue"\)/);
 assert.match(source,/vendorDashboardQueue\.createWalkInTicket\(token, selectedTenantSlug, locationQuery, walkInForm\)/);
});

test('booking entitlement loss preserves old V4 management alongside generic intake and safe legacy targets',()=>{
 const mode=queueIntakeMode(current());assert.equal(mode,'legacy');
 const v4=queueWorkPresentation({resourceIntake:false,managementAllowed:true,resourceTicketIds:['v4'],currentTicketId:'v4'});assert.equal(v4.resourceCounters,true);assert.equal(v4.newRequest,'walkIn');
 const mixed=queueWorkPresentation({resourceIntake:false,managementAllowed:true,resourceTicketIds:['v4'],currentTicketId:'basic'});assert.equal(mixed.resourceCounters,false);assert.equal(mixed.currentResource,false);
 assert.equal(queueWorkPresentation({resourceIntake:false,managementAllowed:true,resourceTicketIds:['v4'],currentTicketId:null}).resourceCounters,true);
 assert.equal(queueWorkPresentation({resourceIntake:false,managementAllowed:true,resourceTicketIds:[],currentTicketId:'basic'}).resourceCounters,false);
 const projected=legacyQueueWork({calledTickets:[{id:'v4',serviceStartedAt:'now'},{id:'basic',serviceStartedAt:null}]},['v4']);assert.deepEqual(projected.calledTickets.map(t=>t.id),['basic']);
 const {counterCommandWrite}=require('../src/vendor/queueCounterCommands.ts');
 const scope={token:'test',tenant:'free',location:'main'};
 const serve=counterCommandWrite({kind:'legacy',action:'serve',ticketId:'basic',body:{ticketId:'basic',counterSlug:'desk',expectedCounterId:'counter-1'}},scope,'serve-key');assert.match(serve.path,/\/queue\/current\/serve\?location=main$/);assert.equal(serve.body.ticketId,'basic');
 const finish=counterCommandWrite({kind:'plan',action:'complete',planId:'v4-plan',body:{allocationGroupId:'group',counterSlug:'desk',expectedCounterId:'counter-1'}},scope,'finish-key');assert.match(finish.path,/\/queue\/plans\/v4-plan\/complete\?location=main$/);
 assert.equal(showResourceManagement({managementOnly:true,activeReady:true,draftsReady:true,activeCount:0,draftCount:0,hasMore:false,transient:false}),false);
 for(const change of [{activeCount:1},{draftCount:1},{transient:true},{activeReady:false},{hasMore:true}])assert.equal(showResourceManagement({managementOnly:true,activeReady:true,draftsReady:true,activeCount:0,draftCount:0,hasMore:false,transient:false,...change}),true);
});

test('actual management-only panel hides verified empty data but renders existing V4 commands without a new-intake callback',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{QueryClient,QueryClientProvider}=require('@tanstack/react-query'),Module=require('node:module');
 const original=Module._load;let captured;
 Module._load=function(name,parent,...rest){if(parent?.filename.endsWith('/NamedQueuePanel.tsx')){
  if(name==='./RequestCallErrorToasts')return {RequestCallErrorToasts:()=>null};
  if(name==='./SavedRequestDrafts')return {SavedRequestDrafts:p=>p.children({})};
  if(name==='./NamedQueueOperations')return {NamedQueueOperations:p=>{captured=p;return React.createElement('div',null,p.plans.map(plan=>React.createElement('span',{key:plan.id},plan.id+' '+plan.allowedActions.join(' '))));}};
 }return original.call(this,name,parent,...rest);};
 let NamedQueuePanel;try{delete require.cache[require.resolve('../src/vendor/NamedQueuePanel.tsx')];({NamedQueuePanel}=require('../src/vendor/NamedQueuePanel.tsx'));}finally{Module._load=original;}
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 const token='test',tenant='free',location='main';
 client.setQueryData(['named-queue-options',token,tenant,location],{services:[],catalogRevision:'r'});
 client.setQueryData(['queue-options-v4',token,tenant,location],{services:[],catalogRevision:'r',capabilities:{publication:true},serviceHoursWindow:{timezone:'Asia/Manila'}});
 for(const key of ['named-queue-active','named-queue-drafts','skipped-queue-plans'])client.setQueryData([key,token,tenant,location],{pages:[{plans:[],nextCursor:null}],pageParams:[undefined]});
 const props={token,tenant,location,counterSlug:'desk',managementOnly:true,onEditForm(){},onCloseForm(){},onBusy(){},onTicketIds(){},onNotice(){}};
 const render=()=>renderToStaticMarkup(React.createElement(QueryClientProvider,{client},React.createElement(NamedQueuePanel,props)));
 try{assert.equal(render(),'');client.setQueryData(['named-queue-active',token,tenant,location],{pages:[{plans:[{id:'v4-existing',ticketId:'ticket-v4',contractVersion:4,state:'published',allowedActions:['complete','interrupt','cancelProtection']}],nextCursor:null}],pageParams:[undefined]});const html=render();assert.match(html,/v4-existing complete interrupt cancelProtection/);assert.equal(typeof captured.onPlanAction,'function');assert.equal(typeof captured.onChildAction,'function');assert.doesNotMatch(html,/New service request/);}finally{client.clear();}
 const source=fs.readFileSync(path.resolve(__dirname,'../src/vendor/NamedQueuePanel.tsx'),'utf8');
 assert.match(source,/!plan&&managementOnly/);assert.match(source,/managementOnly&&!editor.plan/);assert.match(source,/const intakeAvailable=!managementOnly/);
 const page=fs.readFileSync(path.resolve(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');
 assert.match(page,/resourceManagementEnabled && selectedTenantSlug && selectedLocationSlug \? <SkippedQueueRequests/);
 assert.match(page,/<NamedQueuePanel[^\n]*managementOnly=\{!resourceQueueEnabled\}/);
 assert.match(page,/!resourceQueueEnabled && workPresentation.resourceCounters[\s\S]*?onClick=\{\(\)=>setWalkInDialogOpen\(true\)\}/);
 assert.match(page,/snapshot=\{legacyCounterSnapshot\}/);
});

test('complete scoped inventories gate page-two V4 targets without locking ordinary background refresh',()=>{
 const {fullInventoryReady,scopedResourceIds}=require('../src/vendor/queueIntakeMode.ts');
 const complete={isSuccess:true,hasNextPage:false,isFetchingNextPage:false};
 const partial={...complete,hasNextPage:true};
 for(const [a,b] of [[partial,complete],[complete,partial],[{...complete,isFetchingNextPage:true},complete],[{...complete,isSuccess:false},complete]])assert.equal(fullInventoryReady(a,b),false);
 assert.equal(fullInventoryReady(complete,complete),true,'successful empty inventory settles');
 assert.equal(fullInventoryReady({...complete,isFetching:true},{...complete,isFetching:true}),true,'ordinary background refresh retains readiness');
 const scope='free:main',selected='v4-page-two';
 assert.equal(fullInventoryReady(partial,complete),false,'legacy actions locked until page two is inventoried');
 const inventory={scope,ids:['v4-page-one',selected]};
 assert.equal(queueWorkPresentation({resourceIntake:false,managementAllowed:true,resourceTicketIds:scopedResourceIds(scope,inventory),currentTicketId:selected}).resourceCounters,true);
 assert.deepEqual(scopedResourceIds('other:main',inventory),[],'scope switch immediately clears prior IDs');
 const panel=fs.readFileSync(path.resolve(__dirname,'../src/vendor/NamedQueuePanel.tsx'),'utf8');
 assert.match(panel,/const inventoryReady=fullInventoryReady\(active,skipped\)/);
 const publish=panel.indexOf("idsRef.current(ids?ids.split(','):[],inventoryScope)");
 assert.ok(publish>=0&&publish<panel.indexOf('managementReady.current?.(inventoryReady,inventoryScope)'),'IDs publish before readiness');
 const page=fs.readFileSync(path.resolve(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');
 assert.equal((page.match(/if\(scope===localPoolScopeRef.current\)/g)||[]).length,3,'IDs, inventory and setup callbacks reject stale scope');
 assert.match(page,/namedManagementRead.scope !== localPoolScope \|\| !namedManagementRead.ready/);
});
