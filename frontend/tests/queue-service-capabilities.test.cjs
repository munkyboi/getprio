require('tsx/cjs');const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {canAccessVendorSection}=require('../src/lib/vendorDashboardNavigation.js');
const {getPlanHighlights}=require('../src/utils/subscriptionPlans.ts');
test('Vendor services and bookings require booking capability while queue remains independently accessible',()=>{
 const free={queueSystemAccess:true,serviceBookingAccess:false};assert.equal(canAccessVendorSection('services',free),false);assert.equal(canAccessVendorSection('bookings',free),false);assert.equal(canAccessVendorSection('queue',free),true);assert.equal(canAccessVendorSection('services',{}),false);
 assert.equal(canAccessVendorSection('services',{serviceBookingAccess:true}),true);
});
test('plan highlights derive queue and booking copy from current entitlement fields',()=>{
 const free={features:{queue:true,booking:false},allowances:{queueTickets:500,serviceBookings:0},entitlements:{monthlyTickets:500,serviceBookingAccess:false}};const highlights=getPlanHighlights(free);assert.ok(highlights.includes('500 Queue Tickets/mo'));assert.ok(!highlights.some(x=>/service booking/.test(x)));
 assert.ok(getPlanHighlights({...free,features:{queue:true,booking:true},entitlements:{monthlyTickets:500,serviceBookingAccess:true},allowances:{queueTickets:500,serviceBookings:1000}}).includes('1,000 service bookings/mo'));
});
test('Vendor service setup uses the current catalog client and requestable queue readiness',()=>{
 const api=fs.readFileSync(path.join(__dirname,'../src/api/vendorDashboardCatalog.ts'),'utf8');assert.match(api,/function getServices/);assert.match(api,/function saveService/);assert.match(api,/\/vendor\/tenant\/\$\{tenantSlug\}\/services/);
 const page=fs.readFileSync(path.join(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');assert.match(page,/SaveVendorServiceRequest/);assert.match(page,/editingServiceSlug/);assert.match(page,/vendorDashboardCatalog\.saveService/);
 const panel=fs.readFileSync(path.join(__dirname,'../src/vendor/NamedQueuePanel.tsx'),'utf8');assert.match(panel,/resourceSetup\?\.services.some\(service=>service.requestable\)/);assert.match(panel,/setupCallback.current\?\.\(configuredForIntake,inventoryScope\)/);assert.doesNotMatch(panel.match(/const configuredForIntake=.*;/)[0],/isFetching|availability/);
});

test('actual catalog client sends the current full service request for Free and Pro tenants',async()=>{
 const {loadModuleWithMocks}=require('../../backend/tests/helpers/loadModuleWithMocks.cjs');const calls=[];
 const api=loadModuleWithMocks(require.resolve('../src/api/vendorDashboardCatalog.ts'),{'./client':{apiRequest:async(url,options)=>{calls.push({url,options});return{service:{id:'2'}};}}});
 const body={name:'Court',durationMinutes:30,manualPaymentRequired:true,allowBookingQuantity:true,bookingCapacityScope:'location',priceAmountCents:50000,priceDisplay:'PHP500',locationServices:[{locationSlug:'main',isActive:true,sortOrder:0,capacity:4,priceAmountCents:123,groupFunded:{enabled:true}}]};
 await api.saveService('token','free',null,body);assert.equal(calls[0].url,'/vendor/tenant/free/services');assert.deepEqual(calls[0].options.body,body);
 await api.saveService('token','pro','court',body,false);assert.equal(calls[1].url,'/vendor/tenant/pro/services/court');assert.equal(calls[1].options.body,body);
});
