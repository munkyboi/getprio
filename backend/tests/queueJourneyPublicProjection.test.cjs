const test=require('node:test'),assert=require('node:assert/strict');const {loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
const service=loadModuleWithMocks(require.resolve('../src/services/queueJourneyPublicProjection'),{'../config/db':{pool:{}}});
const ticket={_id:'91',tenantId:'1',locationId:'2',ticketNumber:'J001'};
test('customer projection exposes only safe journey fields and dynamic station position',async()=>{
 const calls=[];const client={query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.includes('SELECT p.stage_attempt_id')?[{stage_attempt_id:'private-stage'}]:[{id:'private-stage',ordinal:1,label:'Reception',state:'waiting',queue_position:2,station_queue_sequence:700,assigned_user_id:'secret-staff',resource_member_id:'secret-resource'},{id:'private-results',ordinal:2,label:'Results',state:'awaiting_readiness',queue_position:500,pool_id:'private-pool'}]};}};
 const dto=await service.forTicket(ticket,{client});assert.deepEqual(dto,{contract:'queue-journey-progress-v1',reference:'J001',currentStage:1,stages:[{ordinal:1,label:'Reception',state:'waiting',reference:'J001-1',queuePosition:2},{ordinal:2,label:'Results',state:'awaiting_readiness',reference:'J001-2',queuePosition:null}]});
 assert.ok(!JSON.stringify(dto).includes('private'));assert.ok(!JSON.stringify(dto).includes('700'));assert.ok(calls.every(call=>JSON.stringify(call.args)===JSON.stringify(['1','2','91'])));assert.match(calls[1].sql,/count\(\*\)/);assert.match(calls[1].sql,/wp.stage_attempt_id=w.id/);
});
test('legacy and unfocused public board payloads remain byte-equivalent without journey queries',async()=>{
 const snapshot={focusTicket:{id:'91',position:9,estimatedWaitMinutes:10}};let calls=0;const client={query:async()=>{calls++;return {rows:[]};}};
 assert.equal(await service.attach(snapshot,{...ticket,_id:'other'},{client}),snapshot);assert.equal(calls,0);
 assert.equal(await service.attach(snapshot,ticket,{client}),snapshot);assert.equal(calls,1);
 assert.equal(await service.attach({stats:{}},ticket,{client}).then(x=>JSON.stringify(x)),'{"stats":{}}');assert.equal(calls,1);
});
test('focused workflow SSE payload replaces global parent position with own station rank',async()=>{
 const snapshot={focusTicket:{id:'91',position:99,estimatedWaitMinutes:600},tenant:{id:'1'}};
 const client={query:async sql=>({rows:sql.includes('SELECT p.stage_attempt_id')?[{stage_attempt_id:'s'}]:[{id:'s',ordinal:1,label:'Results',state:'awaiting_arrival',queue_position:12}]})};
 const result=await service.attach(snapshot,ticket,{client});assert.equal(result.focusTicket.position,null);assert.equal(result.focusTicket.estimatedWaitMinutes,0);assert.equal(result.focusTicket.journey.stages[0].queuePosition,null);assert.equal(snapshot.focusTicket.position,99);
});
