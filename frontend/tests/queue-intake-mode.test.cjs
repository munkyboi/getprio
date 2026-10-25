require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {queueIntakeMode}=require('../src/vendor/queueIntakeMode.ts');
const current=extra=>({optedIn:true,tenantSlug:'free-vendor',entitlementTenantSlug:'free-vendor',loaded:true,entitlements:{queueSystemAccess:true,serviceBookingAccess:false,monthlyTickets:500},plan:{planSlug:'free',subscriptionStatus:'active'},...extra});
test('actual service-catalog entitlement selects presentation, never plan name or a booking grant',()=>{
 assert.equal(queueIntakeMode(current()),'legacy');
 assert.equal(queueIntakeMode(current({entitlements:{serviceBookingAccess:true},plan:{planSlug:'pro',subscriptionStatus:'active'}})),'resource');
 assert.equal(queueIntakeMode(current({entitlements:{serviceBookingAccess:true}})),'resource','server grant wins over free label');
 assert.equal(queueIntakeMode(current({plan:{planSlug:'pro',subscriptionStatus:'active'}})),'legacy','pro label cannot invent a catalog grant');
 assert.equal(queueIntakeMode(current({optedIn:false,entitlements:{serviceBookingAccess:true}})),'legacy');
});
test('loading, failed/placeholder data and tenant switching never inherit another tenant intake mode',()=>{
 for(const change of [{loaded:false},{entitlements:undefined},{entitlementTenantSlug:undefined},{entitlementTenantSlug:'previous-pro'},{tenantSlug:''}])assert.equal(queueIntakeMode(current(change)),'loading');
 assert.equal(queueIntakeMode(current({tenantSlug:'new-free',entitlementTenantSlug:'old-pro',entitlements:{serviceBookingAccess:true}})),'loading');
 assert.equal(queueIntakeMode(current({tenantSlug:'new-free',entitlementTenantSlug:'new-free'})),'legacy');
 assert.equal(queueIntakeMode(current({tenantSlug:'pro',entitlementTenantSlug:'pro',entitlements:{serviceBookingAccess:true}})),'resource');
 assert.equal(queueIntakeMode(current({entitlements:{serviceBookingAccess:true},loaded:true})),'resource','background refetch retains scoped successful mode');
});
test('dashboard integrates scoped mode across intake, dialog, dispatch and both ticket presentations',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');
 assert.equal((source.match(/localPoolDemoClientEnabled/g)||[]).length,1,'global opt-in only imported, never used directly as tenant mode');
 assert.match(source,/clientTenantSlug: selectedTenantSlug/);
 assert.match(source,/loaded: effectiveEntitlementsQuery\.isSuccess && !effectiveEntitlementsQuery\.isPlaceholderData/);
 assert.match(source,/const dispatchSnapshot = resourceQueueEnabled \? localPoolDispatchSnapshot/);
 assert.match(source,/function renderQueuePage\(\) \{\s*if \(intakeMode === "loading"\)/);
 assert.match(source,/!resourceQueueEnabled && <QueueButton[\s\S]*?Add walk-in/);
 assert.match(source,/resourceQueueEnabled \? <CounterQueueControls/);
 assert.match(source,/resourceQueueEnabled && selectedTenantSlug && selectedLocationSlug \? <NamedQueuePanel/);
 assert.match(source,/!resourceQueueEnabled \? <LiveQueueSummary/);
 assert.match(source,/!resourceQueueEnabled && queueView === "current"/);
 assert.match(source,/<WalkInDialog linearMode=\{resourceQueueEnabled\}/);
 assert.match(source,/function renderWalkInDialog\(\) \{\s*if \(intakeMode === "loading"\) return null/);
 assert.match(source,/const localPoolQuery = useLocalPoolOperations\(token, selectedTenantSlug, selectedLocationSlug, canLoadProtectedDashboard && currentSection === "queue"\)/);
 assert.match(source,/vendorDashboardQueue\.createWalkInTicket\(token, selectedTenantSlug, locationQuery, walkInForm\)/);
});
