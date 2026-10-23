const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
const v4id=require.resolve('../src/services/bookingSelectionServiceV4'),v4cache=require.cache[v4id],v4actual=require(v4id);
test.afterEach(()=>{if(v4cache)require.cache[v4id]=v4cache;else delete require.cache[v4id];});
// Deterministic transaction adapter over the real booking writer. Not PostgreSQL proof.
function fixture({version=1,deny=false,quota=false,failAt=null}={}){
 const tenant={_id:'7',slug:'club',name:'Club',isActive:true,publicProfileEnabled:true,vendorApprovalStatus:'approved',notificationSettings:{bookingIntake:false}},location={_id:'8',tenantId:'7',slug:'main',name:'Main',isActive:true,timezone:'Asia/Manila'},catalog={_id:'9',slug:'court',name:'Court',durationMinutes:60,isActive:true,allowBookingQuantity:false,manualPaymentRequired:false};
 const scheduledStartAt=new Date(Date.now()+86400000).toISOString().slice(0,10)+'T01:00:00.000Z';
 const body={tenantSlug:'club',locationSlug:'main',serviceSlug:'court',scheduledStartAt,bookingQuantity:1,executionMode:'parallel',customerName:'Customer',customerEmail:'',customerPhone:'09171234567',notes:'',bookingVerificationToken:'verified',...(version===4?{selectionContractVersion:4,requestKey:'create:1',catalogVersion:'a'.repeat(64),serviceSelections:[]}: {})};
 const user={_id:'35',name:'Customer',phone:'09171234567'},calls=[];
 let state={bookings:[],allowance:0,consumed:false,captures:[],receipts:[]},tail=Promise.resolve();
 const pool={query:async()=>({rows:[{id:'35'}]})};
 const write=client=>{assert.ok(client?.state,'all durable work needs the scoped transaction');return client.state;};
 const mocks={
 '../config/db':{pool},
 './platformMaintenanceService':{assertNewIntake:async()=>{}},
 './contentModeration':{assertPublicTextFieldsAllowed(){}},
 '../repositories/tenants':{findTenantBySlug:async()=>tenant},
 '../repositories/storeLocations':{findLocationByTenantAndSlug:async()=>location},
 '../repositories/vendorServices':{normalizeServiceSlug:v=>v,findServiceByTenantAndSlug:async()=>catalog},
 '../repositories/locationServices':{findLocationServiceByLocationAndServiceId:async()=>({isActive:true,capacity:99})},
 '../repositories/vendorAvailability':{listAvailabilityByLocation:async()=>({blocks:Array.from({length:7},(_,weekday)=>({weekday,isActive:true,startsAt:'00:00',endsAt:'23:59',capacity:99})),exceptions:[]})},
 '../repositories/bookings':{listPendingBookingExpiryScopes:async()=>[],getPendingBookingExpiryCutoff:async()=>new Date(),countOverlappingActiveBookings:async()=>0,createBooking:async(data,{client})=>{calls.push('create');const row={_id:String(write(client).bookings.length+1),reference:'BKG',...data,customerEmail:'',notifyBySms:false,bundleItems:data.bundleItems.map((item,i)=>({...item,id:String(i+1)}))};write(client).bookings.push(row);return row;}},
 '../repositories/resourceLedger':{withScopeTransaction:async(options,callback)=>{
   let release;const prior=tail;tail=new Promise(resolve=>release=resolve);await prior;
   const client={state:structuredClone(state),query:pool.query};
   try{assert.equal(await options.authorize(client,options),true);const result=await callback(client,{});state=client.state;calls.push('commit');return result;}catch(error){calls.push('rollback');throw error;}finally{release();}
 }},
 './bookingOtpService':{getVerifiedBookingPayload:async({client})=>{calls.push(client?'otp:locked':'otp:preflight');if((client?.state||state).consumed)throw Object.assign(new Error('Verification used'),{code:'OTP_USED'});return{otpId:'1',payload:{...body,notifyBySms:false},contactVerificationChannel:'email',contactVerifiedAt:new Date().toISOString()};},consumeBookingVerificationToken:async(_id,{client}={})=>{calls.push(client?'otp:consume:transaction':'otp:consume:outside');write(client).consumed=true;if(failAt==='consume')throw Error('consume failure');}},
 './entitlementAdmissionService':{admit:async({client,lockPolicy,featureKey})=>{calls.push('admit');assert.ok(client?.state);assert.equal(lockPolicy,true);assert.equal(featureKey,'booking');if(deny)throw Object.assign(new Error('Not included'),{statusCode:403,code:'FEATURE_BOOKING_NOT_INCLUDED'});return{allowed:true,enforced:true};}},
 './allowanceService':{consumeAllowance:async(_data,{client})=>{calls.push('allowance');if(quota)throw Object.assign(new Error('Quota'),{statusCode:409,code:'ALLOWANCE_SERVICE_BOOKINGS_EXHAUSTED'});write(client).allowance++;}},
 './bookingResourceReservationService':{reserveCreatedBooking:async()=>{}},
 './bookingSelectionServiceV4':{enabled:()=>false,assertEnabled(){},assertVerifiedSelections(){},capturePlan:async()=>({paymentRequired:false,captured:{serviceSelections:[{serviceId:'9',serviceSelectionId:'s'}],items:[{serviceSelectionId:'s',selectionKind:'resource',durationMinutes:60}]}}),persist:async(client)=>{calls.push('capture');write(client).captures.push('capture');},commandHash:v4actual.commandHash,readReceipt:async(client,_scope,_actor,key,hash)=>{const row=(client.state||state).receipts.find(r=>r.key===key);if(row&&row.hash!==hash)throw Error('Key conflict');return row?.result;},writeReceipt:async(client,_scope,_actor,key,hash,result)=>{calls.push('receipt');write(client).receipts.push({key,hash,result});if(failAt==='receipt')throw Error('receipt failure');}},
 './bookingSmsAlertPaymentService':{getBookingSmsFeeForTenant:async()=>({}),shouldChargeBookingSmsFee:()=>false},
 './notificationService':{sendEmail:async()=>{},sendSms:async()=>{}},
 './queueService':{publishSnapshot:async()=>{}}
 };
 require.cache[v4id]={id:v4id,filename:v4id,loaded:true,exports:mocks['./bookingSelectionServiceV4']};
 const service=loadModuleWithMocks(require.resolve('../src/services/bookingService'),mocks);service._setQueueServiceForTest({publishSnapshot:async()=>{}});
 return{run:()=>service.createCustomerBooking({user,body}),calls,state:()=>state};
}
for(const version of [1,4]){
 test(`V${version} denied admission leaves booking/quota/OTP/capture/receipt unchanged`,async()=>{const f=fixture({version,deny:true});await assert.rejects(f.run(),{code:'FEATURE_BOOKING_NOT_INCLUDED'});assert.deepEqual(f.state(),{bookings:[],allowance:0,consumed:false,captures:[],receipts:[]});assert.ok(f.calls.includes('admit'));assert.ok(!f.calls.includes('create'));});
 test(`V${version} quota denial rolls back booking and never burns OTP`,async()=>{const f=fixture({version,quota:true});await assert.rejects(f.run(),{code:'ALLOWANCE_SERVICE_BOOKINGS_EXHAUSTED'});assert.deepEqual(f.state(),{bookings:[],allowance:0,consumed:false,captures:[],receipts:[]});});
 test(`V${version} successful Pro admission locks/rereads/consumes token with one allowance transaction`,async()=>{const f=fixture({version});await f.run();assert.equal(f.state().bookings.length,1);assert.equal(f.state().allowance,1);assert.equal(f.state().consumed,true);assert.ok(f.calls.includes('otp:locked'));assert.ok(f.calls.includes('otp:consume:transaction'));assert.ok(!f.calls.includes('otp:consume:outside'));assert.ok(f.calls.indexOf('admit')<f.calls.indexOf('create'));});
 test(`V${version} OTP consumption failure rolls back prior writes`,async()=>{const f=fixture({version,failAt:'consume'});await assert.rejects(f.run(),/consume failure/);assert.deepEqual(f.state(),{bookings:[],allowance:0,consumed:false,captures:[],receipts:[]});});
}
test('competing ordinary commands cannot spend the same verified token twice',async()=>{const f=fixture();const results=await Promise.allSettled([f.run(),f.run()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state().bookings.length,1);assert.equal(f.state().allowance,1);});
test('V4 receipt replay avoids OTP reread, admission and repeat allowance',async()=>{const f=fixture({version:4});const first=await f.run(),calls=f.calls.length;assert.equal((await f.run())._id,first._id);assert.equal(f.state().bookings.length,1);assert.equal(f.state().allowance,1);assert.deepEqual(f.calls.slice(calls),[]);});
test('V4 receipt failure rolls back capture, booking, allowance and token consumption',async()=>{const f=fixture({version:4,failAt:'receipt'});await assert.rejects(f.run(),/receipt failure/);assert.deepEqual(f.state(),{bookings:[],allowance:0,consumed:false,captures:[],receipts:[]});});
test('existing rollout OFF and legacy-authority admission semantics remain deliberate and unchanged',async()=>{
 let reads=0,assertions=0;
 const admission=loadModuleWithMocks(require.resolve('../src/services/entitlementAdmissionService'),{'./entitlementResolver':{resolveTenantPolicy:async()=>{reads++;return{lifecycle:{state:'active'},authority:{served:'legacy'},features:{booking:{enabled:false}}};},assertFeature:()=>{assertions++;throw Error('Feature denied');}}});
 assert.deepEqual(await admission.admit({tenantId:'7',featureKey:'booking',controls:{entitlementBookingEnforcement:false}}),{allowed:true,enforced:false});assert.equal(reads,0);
 const legacy=await admission.admit({tenantId:'7',featureKey:'booking',controls:{entitlementBookingEnforcement:true},client:{},lockPolicy:true});assert.equal(legacy.bypassed,'legacy_authority');assert.equal(legacy.enforced,false);assert.equal(reads,1);assert.equal(assertions,0);
});
