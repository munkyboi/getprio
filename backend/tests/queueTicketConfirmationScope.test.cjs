const test=require('node:test'),assert=require('node:assert/strict');
const {assertConfirmationScope}=require('../src/services/queueTicketConfirmationScope');
const ticket={_id:'7',tenantId:'1',locationId:'2',status:'called',serviceStartedAt:null};
test('plan arrival confirmation permits only an unstarted called stage and performs no resource writes',async()=>{
 let row={contract_version:4,stage_state:'called',started_at:null};const queries=[];const client={query:async(sql,args)=>{queries.push(sql);assert.deepEqual(args,['1','2','7']);return {rows:row?[row]:[]};}};
 await assertConfirmationScope(client,ticket);
 row.started_at=new Date();await assert.rejects(assertConfirmationScope(client,ticket),{code:'INVALID_STATE'});
 row={contract_version:4,stage_state:'waiting',started_at:null};await assert.rejects(assertConfirmationScope(client,ticket),{code:'INVALID_STATE'});
 row=null;await assertConfirmationScope(client,ticket);assert.ok(queries.every(sql=>!/^\s*(UPDATE|INSERT|DELETE)/i.test(sql)));
});
test('remote plan Start rejects before allocating until the scanned ticket is confirmed',async()=>{
 const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');let allocations=0;
 const service=loadModuleWithMocks(require.resolve('../src/services/queueSelectionCommandService'),{'../repositories/queueSelectionLedger':{allocate:async()=>{allocations++;throw new Error('allocation reached');}}});
 const args={scope:{tenantId:'1',locationId:'2'},ticket:{...ticket,joinChannel:'online',customerConfirmedAt:null},p:{},stage:{},action:'start',body:{}};
 const client={query:async()=>({rows:[{is_active:true,tenant_active:true,service_timing_enabled:true}]})};
 await assert.rejects(service.execute(client,{},args),{code:'CUSTOMER_CONFIRMATION_REQUIRED'});assert.equal(allocations,0);
 args.ticket.customerConfirmedAt=new Date();await assert.rejects(service.execute(client,{},args),/allocation reached/);assert.equal(allocations,1);
});
