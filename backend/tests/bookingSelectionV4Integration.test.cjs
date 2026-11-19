const {test}=require('node:test');const assert=require('node:assert/strict');
const v4=require('../src/services/bookingSelectionServiceV4');const otp=require('../src/services/bookingOtpService');
const member='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const value=()=>({tenantSlug:'sports',locationSlug:'courts',serviceSlug:'rental',scheduledStartAt:'2026-11-02T09:00:00+08:00',bookingQuantity:1,executionMode:'parallel',customerName:'Test Customer',customerEmail:'customer@example.test',customerPhone:'',notes:'',notifyBySms:false,selectionContractVersion:4,catalogVersion:'a'.repeat(64),serviceSelections:[{serviceSelectionId:'service',serviceId:'1',resources:[{resourceSelectionId:'court',resourceMemberId:member,quantity:1,durationCount:2,durationVersion:'b'.repeat(64),extras:[]}]}]});
test('normal legacy booking OTP payload remains unchanged',()=>{
 const input=value();delete input.selectionContractVersion;delete input.catalogVersion;delete input.serviceSelections;
 assert.deepEqual(otp.sanitizeBookingPayload(input),input);
});
test('V4 OTP sanitizes strict entire selection and catalog; actual verifier rejects post-verification member/count/extra/catalog mutations',()=>{
 const before=process.env.BOOKING_SELECTION_V4_ENABLED;process.env.BOOKING_SELECTION_V4_ENABLED='1';
 try{const original=value(),verified=otp.sanitizeBookingPayload(original);assert.deepEqual(verified,original);assert.doesNotThrow(()=>v4.assertVerifiedSelections(verified,structuredClone(original)));
 for(const edit of [v=>v.customerName='Another Person',v=>v.customerEmail='other@example.test',v=>v.customerPhone='09171234567',v=>v.scheduledStartAt='2026-11-02T10:00:00+08:00',v=>v.locationSlug='other',v=>v.serviceSelections[0].resources[0].resourceMemberId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',v=>v.serviceSelections[0].resources[0].durationCount=3,v=>v.catalogVersion='c'.repeat(64),v=>v.serviceSelections[0].resources[0].extras.push({extraSelectionId:'extra',serviceId:'2',quantity:1,durationCount:1,durationVersion:'d'.repeat(64),resourceMemberIds:[]})]){const changed=value();edit(changed);assert.throws(()=>v4.assertVerifiedSelections(verified,changed),{code:'BOOKING_VERIFICATION_MISMATCH'});}
 }finally{if(before===undefined)delete process.env.BOOKING_SELECTION_V4_ENABLED;else process.env.BOOKING_SELECTION_V4_ENABLED=before;}
});
test('invalid/private fields and recursive/pooled member mismatch are not silently dropped',()=>{
 for(const edit of [v=>v[0].resources[0].durationVersion='-'.repeat(64),v=>v[0].resources[0].poolId='injected',v=>v[0].resources[0].extras.push({extraSelectionId:'x',serviceId:'2',quantity:1,durationCount:1,durationVersion:'d'.repeat(64),resourceMemberIds:[],extras:[]})]){const selections=value().serviceSelections;edit(selections);assert.throws(()=>v4.sanitizePublicSelections(selections));}
});
test('actor scoped command replay preserves original result and conflicting payload refuses reuse',async()=>{
 const original={booking:{_id:'1',status:'confirmed'}},calls=[],client={query:async(sql,values)=>{calls.push({sql,values});return{rows:[{payload_hash:'a'.repeat(64),result:original}]};}};
 assert.deepEqual(await v4.readReceipt(client,{tenantId:'7',locationId:'8'},'9','confirm:1','a'.repeat(64)),original);
 await assert.rejects(v4.readReceipt(client,{tenantId:'7',locationId:'8'},'10','confirm:1','b'.repeat(64)),{code:'IDEMPOTENCY_CONFLICT'});
 assert.deepEqual(calls[0].values,['7','8','9','confirm:1']);assert.match(calls[0].sql,/actor_user_id=\$3/);
});
test('unsupported sequential scheduled selections and disabled capability fail before any query',async()=>{
 const before=process.env.BOOKING_SELECTION_V4_ENABLED;let calls=0;const client={query:async()=>{calls++;throw Error('Unexpected query');}};
 try{delete process.env.BOOKING_SELECTION_V4_ENABLED;await assert.rejects(v4.capturePlan(client,{tenantId:'1',locationId:'2'},value()),{code:'BOOKING_V4_NOT_ENABLED'});process.env.BOOKING_SELECTION_V4_ENABLED='1';await assert.rejects(v4.capturePlan(client,{tenantId:'1',locationId:'2'},{...value(),executionMode:'sequential'}),{code:'UNSUPPORTED_BOOKING_SELECTION'});assert.equal(calls,0);}finally{if(before===undefined)delete process.env.BOOKING_SELECTION_V4_ENABLED;else process.env.BOOKING_SELECTION_V4_ENABLED=before;}
});
test('manual payment selected anywhere requires paid proof and staff verification, ordinary legacy unchanged',()=>{
 for(const payment of [{paymentStatus:'unpaid'},{paymentStatus:'pending',paymentVerifiedAt:null},{paymentStatus:'paid',paymentVerifiedAt:null},{paymentStatus:'unpaid',paymentVerifiedAt:'2026-11-01'}])assert.throws(()=>v4.assertPaymentVerified({selectionContractVersion:4,serviceManualPaymentRequired:true,...payment}),{code:'BOOKING_PAYMENT_VERIFICATION_REQUIRED'});
 assert.doesNotThrow(()=>v4.assertPaymentVerified({selectionContractVersion:4,serviceManualPaymentRequired:true,paymentStatus:'paid',paymentVerifiedAt:'2026-11-01'}));assert.doesNotThrow(()=>v4.assertPaymentVerified({selectionContractVersion:1,serviceManualPaymentRequired:true,paymentStatus:'unpaid'}));
});
test('future local split/overnight windows use selected time and exact end boundary; changed hours do not mutate capture or release reservations',async()=>{
 const input=[{serviceId:'1',durationMinutes:60}],before=JSON.stringify(input),queries=[];let close='02:00:00';
 const client={query:async(sql)=>{queries.push(sql);if(sql.includes('FROM store_locations'))return{rows:[{timezone:'America/New_York',is_active:true,observed_at:'2026-11-01T12:00:00Z'}]};if(sql.includes('FROM store_hours'))return{rows:[{weekday:1,opensAt:'22:00:00',closesAt:close,isClosed:false}]};if(sql.includes('vendor_availability_exceptions')||sql.includes('vendor_availability_blocks'))return{rows:[]};throw Error(sql);}};
 // Nov 3 01:00 New York is the previous Monday's overnight window; current date is Sunday.
 await v4.assertSchedule(client,{tenantId:'7',locationId:'8'},input,'2026-11-03T06:00:00Z');
 close='01:30:00';await assert.rejects(v4.assertSchedule(client,{tenantId:'7',locationId:'8'},input,'2026-11-03T06:00:00Z'),{code:'BOOKING_DURATION_EXCEEDS_STORE_HOURS'});
 assert.equal(JSON.stringify(input),before);assert.ok(queries.every(sql=>!/^\s*(UPDATE|DELETE|INSERT)/iu.test(sql)));
});
test('V4 reuses identity/payment metadata without inheriting legacy quantity minima or mixed-payment prohibition',async()=>{
 const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
 const services={court:{_id:'1',slug:'court',isActive:true,durationMinutes:30,allowBookingQuantity:true,bookingQuantityMin:2,bookingQuantityMax:4,manualPaymentRequired:false},extra:{_id:'2',slug:'extra',isActive:true,durationMinutes:30,allowBookingQuantity:false,manualPaymentRequired:true}};
 const service=loadModuleWithMocks(require.resolve('../src/services/bookingService'),{'../repositories/vendorServices':{normalizeServiceSlug:require('../src/repositories/vendorServices').normalizeServiceSlug,findServiceByTenantAndSlug:async(_id,slug)=>services[slug]},'../repositories/locationServices':{findLocationServiceByLocationAndServiceId:async()=>({isActive:true})}});
 const args={tenant:{_id:'7'},location:{_id:'8',paymentQrActive:true,paymentMethodLabel:'GCash',paymentAccountDisplayName:'Test',paymentQrImageUrl:'https://example.test/qr.png'},items:[{serviceSlug:'court',bookingQuantity:1},{serviceSlug:'extra',bookingQuantity:1}],executionMode:'parallel'};
 const plan=await service.createComposedBookingPlan({...args,resourceSelectionV4:true});assert.deepEqual(plan.items.map(item=>item.bookingQuantity),[1,1]);assert.equal(plan.items[1].service.manualPaymentRequired,true);
 await assert.rejects(service.createComposedBookingPlan(args));
});

test('booking command hash preserves canonical UTF-16 key order for existing receipts', () => {
 const {createHash}=require('node:crypto');
 const oldCanonical=value=>Array.isArray(value)?value.map(oldCanonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,oldCanonical(value[key])])):value;
 const body={z:1,é:2,Z:{'😀':3,a:4},a:5};
 const expected=createHash('sha256').update(JSON.stringify(oldCanonical({action:'amend',body}))).digest('hex');
 assert.equal(v4.commandHash('amend',body),expected);
});
