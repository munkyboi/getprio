require("tsx/cjs");
const test=require("node:test"),assert=require("node:assert/strict");
const {scopedLocalPoolData,localPoolDispatchSnapshot}=require("../src/vendor/localPoolState.ts");
const snapshot={tenant:{id:"1",slug:"vd-sports-club"},location:{id:"2",slug:"demo-courts"},calledTickets:[{id:"active"},{id:"pending"}],counterDispatch:[{currentTicketId:"active",canCallNext:false}]};
const operations={scope:{tenantId:"1",locationId:"2"},called:[{id:"pending"}],pools:[{availableUnits:4}],counterDispatch:[{counterSlug:"counter",currentTicketId:"pending",canCallNext:false}]};
test("only exact tenant/location operational evidence is consumed",()=>{
 assert.equal(scopedLocalPoolData(snapshot,operations,"vd-sports-club","demo-courts"),operations);
 assert.equal(scopedLocalPoolData(snapshot,operations,"other","demo-courts"),null);
 assert.equal(scopedLocalPoolData(snapshot,{...operations,scope:{tenantId:"1",locationId:"wrong"}},"vd-sports-club","demo-courts"),null);
});
test('failed, unknown and previous-scope reads cannot report healthy resource status',()=>{
 const {localPoolReadState}=require('../src/vendor/localPoolState.ts');
 const state=(data,pending=false,failed=false,tenant='vd-sports-club',location='demo-courts',current=snapshot)=>localPoolReadState(current,data,tenant,location,pending,failed);
 assert.equal(state(operations),'ready');assert.equal(state(operations,false,true),'unavailable');
 assert.equal(state(undefined,true),'checking');assert.equal(state(undefined),'unavailable');
 assert.equal(state({...operations,scope:{tenantId:'old',locationId:'2'}}),'unavailable');
 assert.equal(state(operations,false,false,'other'),'unavailable');
 assert.equal(state(operations,false,false,'vd-sports-club','other-location'),'unavailable');
 const next={tenant:{id:'new-tenant',slug:'new-business'},location:{id:'new-location',slug:'new-branch'}};
 assert.equal(state(operations,true,false,'new-business','new-branch',next),'checking');
 assert.equal(state(operations,false,false,'new-business','new-branch',next),'unavailable');
 assert.equal(state(operations,false,true,'new-business','new-branch',next),'unavailable');
});
test("local dispatch uses explicit server pending calls, not free capacity or legacy active lane",()=>{
 const selected=localPoolDispatchSnapshot(snapshot,operations);
 assert.deepEqual(selected.calledTickets,[snapshot.calledTickets[1]]);
 assert.equal(selected.counterDispatch[0].canCallNext,false);
 assert.equal(selected.counterDispatch,operations.counterDispatch);
 const blocked=localPoolDispatchSnapshot(snapshot,null);
 assert.deepEqual(blocked.counterDispatch,[]);assert.deepEqual(blocked.calledTickets,[]);
 assert.equal(snapshot.calledTickets.length,2);
});
test("tracked start requires a single frozen executable service plan",()=>{
 const {hasExecutableLocalPlan}=require("../src/vendor/localPoolState.ts");
 const plan={itemCount:1,serviceId:"3",poolId:"1",resourceKnown:true,durationMinutes:60,unitsRequired:1};
 assert.equal(hasExecutableLocalPlan({plan}),true);
 for(const override of [null,{...plan,itemCount:2},{...plan,serviceId:null},{...plan,poolId:null},{...plan,resourceKnown:false},{...plan,durationMinutes:0},{...plan,durationMinutes:481},{...plan,unitsRequired:0}])assert.equal(hasExecutableLocalPlan({plan:override}),false);
 assert.equal(hasExecutableLocalPlan(undefined),false);
});
test('only the exact server not-applicable 404 has neutral status; auth, generic404 and network remain errors',()=>{
 const {localPoolReadState}=require('../src/vendor/localPoolState.ts'),{ApiError}=require('../src/api/client.ts');
 const state=error=>localPoolReadState(null,undefined,'club','branch',false,true,error);
 assert.equal(state(new ApiError('outside fixture',404,'LOCAL_RESOURCE_OPERATIONS_NOT_APPLICABLE')),'not_applicable');
 for(const error of [new ApiError('denied',403,'LOCAL_RESOURCE_OPERATIONS_NOT_APPLICABLE'),new ApiError('missing',404),new Error('network')])assert.equal(state(error),'unavailable');
});
