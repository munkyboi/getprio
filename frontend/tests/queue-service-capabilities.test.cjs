require('tsx/cjs');const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {canAccessVendorSection}=require('../src/lib/vendorDashboardNavigation.js');
const {getPlanHighlights}=require('../src/utils/subscriptionPlans.ts');
test('Free queue service setup is available independently from bookings; neither false means inaccessible',()=>{
 const free={queueSystemAccess:true,serviceBookingAccess:false};assert.equal(canAccessVendorSection('services',free),true);assert.equal(canAccessVendorSection('bookings',free),false);assert.equal(canAccessVendorSection('queue',free),true);assert.equal(canAccessVendorSection('services',{}),false);
 assert.equal(canAccessVendorSection('services',{serviceBookingAccess:true}),true);
});
test('plan highlights derive queue setup and booking allowance independently from stored feature policy',()=>{
 const free={features:{queue:true,booking:false},allowances:{queueTickets:500,serviceBookings:0},entitlements:{}};const highlights=getPlanHighlights(free);assert.ok(highlights.includes('Queue services, resource mappings and policies'));assert.ok(!highlights.some(x=>/service booking/.test(x)));
 assert.ok(getPlanHighlights({...free,features:{queue:true,booking:true},allowances:{queueTickets:500,serviceBookings:1000}}).includes('1,000 service bookings/mo'));
});
test('Vendor queue-only payload excludes paid fields; setup controls are independent from request readiness',()=>{
 const api=fs.readFileSync(path.join(__dirname,'../src/api/vendorDashboardCatalog.ts'),'utf8');assert.match(api,/queueOnly \? "queue\/services" : "services"/);const fields=api.match(/const queueFields = (\[[^\n]+\])/)[1];for(const word of ['price','booking','payment','capacity'])assert.ok(!fields.toLowerCase().includes(word));assert.match(api,/locationSlug,isActive,sortOrder\}\)=>\(\{locationSlug,isActive,sortOrder/);
 const page=fs.readFileSync(path.join(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');assert.match(page,/resourceManagementEnabled\?<ConfigTabsTrigger[^>]+value="queue-policy"/);assert.match(page,/resourceManagementEnabled&&selectedTenantSlug&&selectedLocationSlug\?<ConfigTabsContent value="queue-policy"/);assert.match(page,/bookingEnabled=\{bookingSettingsAllowed\}/);
 const panel=fs.readFileSync(path.join(__dirname,'../src/vendor/NamedQueuePanel.tsx'),'utf8');assert.match(panel,/resourceSetup\?\.services.some\(service=>service.requestable\)/);assert.match(panel,/setupCallback.current\?\.\(configuredForIntake,inventoryScope\)/);assert.doesNotMatch(panel.match(/const configuredForIntake=.*;/)[0],/isFetching|availability/);
});

test('actual catalog client sends strict Free queue fields and full Pro booking fields',async()=>{
 const {loadModuleWithMocks}=require('../../backend/tests/helpers/loadModuleWithMocks.cjs');const calls=[];
 const api=loadModuleWithMocks(require.resolve('../src/api/vendorDashboardCatalog.ts'),{'./client':{apiRequest:async(url,options)=>{calls.push({url,options});return{service:{id:'2'}};}}});
 const body={name:'Court',durationMinutes:30,manualPaymentRequired:true,allowBookingQuantity:true,bookingCapacityScope:'location',priceAmountCents:50000,priceDisplay:'PHP500',locationServices:[{locationSlug:'main',isActive:true,sortOrder:0,capacity:4,priceAmountCents:123,groupFunded:{enabled:true}}]};
 await api.saveService('token','free',null,body,true);assert.equal(calls[0].url,'/vendor/tenant/free/queue/services');assert.deepEqual(calls[0].options.body,{name:'Court',durationMinutes:30,locationServices:[{locationSlug:'main',isActive:true,sortOrder:0}]});
 await api.saveService('token','pro','court',body,false);assert.equal(calls[1].url,'/vendor/tenant/pro/services/court');assert.equal(calls[1].options.body,body);
});
