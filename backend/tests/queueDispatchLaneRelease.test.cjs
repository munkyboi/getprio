const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');
const tickets = require('../src/repositories/tickets');
const { startedResourceServicePredicate } = require('../src/services/queueDispatchRules');

const scope = { tenantId:'1', locationId:'10', dateKey:'20261021' };
const options = { serviceCounter:{_id:'3'}, expectedCounterId:'3', counterSlug:'dispatch' };

test('one dispatch SQL predicate requires actual start, no end and a same-scope live allocation', async () => {
  for (const alias of ['tickets','w']) {
    const sql = startedResourceServicePredicate(alias);
    assert.ok(sql.includes(`${alias}.service_started_at IS NOT NULL`));
    assert.ok(sql.includes(`${alias}.service_ended_at IS NULL`));
    for (const [column, parent] of [['ticket_id','id'],['tenant_id','tenant_id'],['location_id','location_id']]) {
      assert.ok(sql.includes(`allocation.${column}=${alias}.${parent}`));
    }
    assert.match(sql,/allocation\.released_at IS NULL/);
    assert.doesNotMatch(sql,/expected_end_at|reservation|contract_version/);
  }
  assert.throws(()=>startedResourceServicePredicate('tickets; UPDATE tickets'),/Invalid dispatch SQL alias/);
  const queries=[];
  const client={query:async(sql,values)=>{queries.push({sql,values});return {rows:[]};}};
  await tickets.findCurrentCalledTicket('1',{client,locationId:'10',serviceCounterId:'3',forUpdate:true,excludeAllocatedService:true});
  assert.ok(queries[0].sql.includes(`NOT ${startedResourceServicePredicate()}`));
  assert.match(queries[0].sql,/service_counter_id IS NOT DISTINCT FROM \$3::bigint/);
  assert.match(queries[0].sql,/LIMIT 1 FOR UPDATE/);
  assert.deepEqual(queries[0].values,[1,'10','3']);
  await tickets.listCalledTickets('1',{client,locationId:'10'});
  assert.doesNotMatch(queries[1].sql,/FROM resource_allocations/);
  assert.ok(queries.every(query=>!/^\s*(UPDATE|INSERT|DELETE)/iu.test(query.sql)));
});

function fixture(current, allocations=[]) {
  const reads=[],claims=[],counterQueries=[];
  const client={query:async(sql,values)=>{counterQueries.push({sql,values});return {rows:[{id:'3'}]};}};
  const dispatch=loadModuleWithMocks(require.resolve('../src/services/counterDispatchService'),{
    '../repositories/tickets':{
      findCurrentCalledTicket:async(tenantId,query)=>{
        reads.push({tenantId,...query});
        if(!current)return null;
        const live=allocations.some(row=>row.ticketId===current._id && row.tenantId===tenantId && row.locationId===query.locationId && !row.releasedAt);
        if(query.excludeAllocatedService && current.serviceStartedAt && !current.serviceEndedAt && live)return null;
        return current;
      },
      callNextWaitingTicket:async(tenantId,query)=>{claims.push({tenantId,...query});return {_id:'next',status:'called'};},
      listWaitingTickets:async()=>[]
    }
  });
  return {dispatch,client,reads,claims,counterQueries};
}
const started={_id:'7',status:'called',serviceStartedAt:'2026-10-21T01:00:00Z',serviceEndedAt:null};
const held={ticketId:'7',tenantId:'1',locationId:'10',releasedAt:null};

test('ordinary resource-backed service permits the next claim without releasing its allocations',async()=>{
  // No fixture configuration or fixture identity is provided to this adapter.
  const allocations=[held,{...held,ticketId:'8'}],before=structuredClone(allocations);
  const f=fixture(started,allocations);
  const result=await f.dispatch.claimNext(f.client,scope,{...options,targetTicketId:'next'});
  assert.equal(result._id,'next');assert.deepEqual(allocations,before);assert.equal(started.status,'called');
  assert.equal(f.reads[0].excludeAllocatedService,true);assert.equal(f.reads[0].forUpdate,true);
  assert.equal(f.reads[0].serviceCounterId,'3');assert.equal(f.reads[0].locationId,'10');
  assert.equal(f.claims[0].targetTicketId,'next');assert.equal(f.claims[0].dateKey,'20261021');
  assert.match(f.counterQueries[0].sql,/FOR SHARE/);
  assert.deepEqual(f.counterQueries[0].values,['3','1','10','dispatch']);
  // Explicit outcomes still address the exact started ticket with a row lock.
  const current=await f.dispatch.lockCurrent(f.client,scope,{...options,ticketId:'7'});
  assert.equal(current,started);assert.equal(f.reads[1].excludeAllocatedService,undefined);
  assert.equal(f.reads[1].ticketId,'7');assert.equal(f.reads[1].forUpdate,true);
});

test('called, unallocated, ended, foreign and released allocation cases retain 409 occupancy',async()=>{
  const cases=[
    [{...started,serviceStartedAt:null},[held]],
    [started,[]],
    [started,[{...held,tenantId:'2'}]],
    [started,[{...held,locationId:'20'}]],
    [started,[{...held,ticketId:'8'}]],
    [started,[{...held,releasedAt:'2026-10-21T01:30:00Z'}]],
    [{...started,serviceEndedAt:'2026-10-21T01:30:00Z'},[held]]
  ];
  for(const [current,allocations] of cases){
    const f=fixture(current,allocations);
    await assert.rejects(f.dispatch.claimNext(f.client,scope,options),{statusCode:409,code:'COUNTER_OCCUPIED'});
    assert.equal(f.claims.length,0);
  }
});

test('a partially released service frees dispatch while its remaining allocation stays held',async()=>{
  const allocations=[{...held,releasedAt:'2026-10-21T01:30:00Z'},held];
  const before=structuredClone(allocations),f=fixture(started,allocations);
  assert.equal((await f.dispatch.claimNext(f.client,scope,options))._id,'next');
  assert.deepEqual(allocations,before);
});
