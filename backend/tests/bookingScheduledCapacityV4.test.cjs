const {test}=require('node:test');const assert=require('node:assert/strict');
const {assertIntervalCapacity,readFuturePromises}=require('../src/services/bookingScheduledCapacityV4');
const row=(from,to,units=1,member=null)=>({starts_at:`2026-11-02T${from}:00Z`,ends_at:`2026-11-02T${to}:00Z`,units,resource_member_id:member});
test('half-open adjacent exact member bookings are independent',()=>{
 assert.doesNotThrow(()=>assertIntervalCapacity([row('10:00','11:00',1,'court1')],[row('09:00','10:00',1,'court1'),row('11:00','12:00',1,'court1')],1));
 assert.throws(()=>assertIntervalCapacity([row('10:00','11:00',1,'court1')],[row('10:59','12:00',1,'court1')],2),{code:'BOOKING_RESOURCE_CONFLICT'});
});
test('exact different members coexist; anonymous demand cannot prove a named member free',()=>{
 assert.doesNotThrow(()=>assertIntervalCapacity([row('10:00','11:00',1,'court1')],[row('10:00','11:00',1,'court2')],2));
 assert.throws(()=>assertIntervalCapacity([row('10:00','11:00',1,'court1')],[row('10:00','11:00')],3));
});
test('pooled overlapping quantities and extras aggregate, unrelated overload ignored',()=>{
 assert.throws(()=>assertIntervalCapacity([row('10:00','11:00',2),row('10:00','10:30',2)],[row('10:15','12:00',1)],4));
 assert.doesNotThrow(()=>assertIntervalCapacity([row('10:00','11:00',2)],[row('08:00','09:00',100)],2));
 assert.doesNotThrow(()=>assertIntervalCapacity([row('10:00','11:00',2)],[row('09:00','10:00',2),row('11:00','12:00',2)],2));
});
test('future slot may follow projected occupancy but overlapping projection conflicts',()=>{
 assert.doesNotThrow(()=>assertIntervalCapacity([row('12:00','13:00',1,'court1')],[row('09:00','11:00',1,'court1')],1));
 assert.throws(()=>assertIntervalCapacity([row('10:00','11:00',1,'court1')],[row('09:00','12:00',1,'court1')],1));
});
test('invalid intervals and demand fail closed',()=>{
 for(const invalid of [row('12:00','11:00'),{...row('10:00','11:00'),units:0},{...row('10:00','11:00',2,'court1')},{...row('10:00','11:00'),ends_at:'bad'}]) assert.throws(()=>assertIntervalCapacity([invalid],[],4));
});
test('promise SQL binds tenant/location, half-open interval and exact authoritative self ownership',async()=>{
 const calls=[];const client={query:async(sql,values)=>{calls.push({sql,values});return{rows:sql.includes('to_regclass')?[{available:true}]:[]};}};
 await readFuturePromises(client,{tenantId:'7',locationId:'8'},'9',new Date('2026-11-02T10:00:00Z'),new Date('2026-11-02T11:00:00Z'),{ticketId:'10',selectionId:'child'});
 const query=calls.find(call=>call.sql.includes('FROM booking_v4_reservations'));
 assert.match(query.sql,/b\.queue_ticket_id=\$7 AND r\.selection_revision=b\.selection_revision AND r\.selection_id=\$8/);assert.match(query.sql,/COALESCE/);assert.deepEqual(query.values.slice(0,3),['7','8','9']);assert.deepEqual(query.values.slice(5),[null,'10','child',null]);
});
