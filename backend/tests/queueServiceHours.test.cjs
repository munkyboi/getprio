const test=require('node:test'),assert=require('node:assert/strict');
const hours=require('../src/services/queueServiceHoursService');
const weekly=(weekday,opensAt,closesAt)=>[{weekday,opensAt,closesAt,isClosed:false}];
const at=(now,schedule=weekly(2,'09:00','17:00'),timezone='Asia/Manila')=>hours.windowAt({now,timezone,hours:schedule});
const resource=(id,minutes,fields={})=>({selectionId:id,selectionKind:'resource',serviceSelectionId:'service-'+id,serviceId:id,durationMinutes:minutes,...fields});
test('location timezone and exact closing bound use server observation including milliseconds',()=>{
 const window=at('2026-10-20T08:30:00.000Z');assert.equal(window.closesAt,'2026-10-20T09:00:00.000Z');assert.equal(window.remainingWholeMinutes,30);
 assert.equal(hours.assertFits(window,30),window);assert.throws(()=>hours.assertFits(window,31),{code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS'});
 const late=at('2026-10-20T08:30:00.001Z');assert.equal(late.remainingWholeMinutes,29);assert.throws(()=>hours.assertFits(late,30),{code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS'});
});
test('split hours stay within the active window and never jump or merge the break',()=>{
 const schedule=[...weekly(2,'09:00','12:00'),...weekly(2,'13:00','17:00')];
 assert.throws(()=>hours.assertFits(at('2026-10-20T03:45:00Z',schedule),30),{code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS'});
 assert.equal(at('2026-10-20T04:30:00Z',schedule).status,'closed');
 assert.equal(at('2026-10-20T05:00:00Z',schedule).status,'open');
});
test('overnight and canonical 24-hour interval retain current per-window boundaries',()=>{
 const overnight=at('2026-10-20T17:30:00Z',weekly(2,'22:00','02:00'));assert.equal(overnight.remainingWholeMinutes,30);hours.assertFits(overnight,30);
 const always=at('2026-10-20T15:30:00Z',Array.from({length:7},(_,weekday)=>({weekday,opensAt:'00:00',closesAt:'00:00',isClosed:false})));
 assert.equal(always.closesAt,'2026-10-20T16:00:00.000Z');assert.throws(()=>hours.assertFits(always,60),{code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS'});
});
test('missing/closed hours close admission and invalid timezone is unavailable',()=>{
 assert.equal(at('2026-10-20T08:00:00Z',[]).status,'closed');assert.equal(at('2026-10-20T08:00:00Z',[], 'Invalid/Zone').status,'unavailable');
 assert.throws(()=>hours.assertFits(at('2026-10-20T08:00:00Z',[]),1),{code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS'});
 assert.throws(()=>hours.assertFits(at('2026-10-20T08:00:00Z',[],'Invalid/Zone'),1),{code:'STORE_HOURS_UNAVAILABLE'});
});
test('parallel resources use max duration; quantity and contained extras never multiply or sum elapsed time',()=>{
 const items=[resource('one',30,{quantity:99}),resource('two',45,{quantity:8}),{selectionId:'extra',selectionKind:'extra',parentResourceSelectionId:'one',serviceSelectionId:'service-one',serviceId:'unmapped-extra',durationMinutes:20}];
 assert.equal(hours.durationMinutes(items,{mode:'linear',stages:[]}),45);
});
test('ordered selected stages sum their parallel maxima; extras inherit root stage rather than own service mapping',()=>{
 const workflow={mode:'multi_station',stages:[{stageId:'a',serviceIds:['one','two']},{stageId:'unused',serviceIds:['unused']},{stageId:'b',serviceIds:['three']}]};
 const items=[resource('one',30,{stageId:'a'}),resource('two',45,{stageId:'a'}),resource('three',20,{stageId:'b'}),{selectionId:'extra',selectionKind:'extra',parentResourceSelectionId:'one',serviceSelectionId:'service-one',serviceId:'unmapped-extra',stageId:'a',durationMinutes:15}];
 assert.equal(hours.durationMinutes(items,workflow),65);
});
test('unknown/ambiguous stages, malformed duration and uncontained extras fail closed',()=>{
 for(const [items,workflow] of [
  [[resource('one',30)],{mode:'DAG',stages:[]}],
  [[resource('one',30,{stageId:'missing'})],{mode:'multi_station',stages:[{stageId:'a',serviceIds:['one']}]}],
  [[resource('one',30,{stageId:'a'})],{mode:'multi_station',stages:[{stageId:'a',serviceIds:['one']},{stageId:'b',serviceIds:['one']}]}],
  [[resource('one',30.5)],{mode:'linear'}],
  [[resource('one',30),{selectionId:'extra',selectionKind:'extra',parentResourceSelectionId:'one',serviceSelectionId:'service-one',durationMinutes:31}],{mode:'linear'}],
 ])assert.throws(()=>hours.durationMinutes(items,workflow),{code:'STORE_HOURS_UNAVAILABLE'});
});
test('provenance never downgrades mixed or unsupported markers to historical',()=>{
 assert.equal(hours.provenance([resource('one',30)]),'historical');assert.equal(hours.provenance(null),'historical');
 const items=[resource('one',30),resource('two',45)];hours.tagItems(items);assert.equal(hours.provenance(items),'enforced');
 for(const invalid of [[{...items[0]},resource('two',45)],[{...items[0],storeHoursEnforcementVersion:'1'}],[{...items[0],storeHoursEnforcementVersion:2}]])assert.throws(()=>hours.provenance(invalid),{code:'STORE_HOURS_UNAVAILABLE'});
});
test('remaining ordered stages exclude completed history and retry uses only restarted root plus future stage bound',()=>{
 const workflow={mode:'multi_station',stages:[{stageId:'a',serviceIds:['one']},{stageId:'b',serviceIds:['two','other']},{stageId:'c',serviceIds:['three']}]};
 const items=[resource('one',120,{stageId:'a'}),resource('two',30,{stageId:'b'}),resource('other',45,{stageId:'b'}),resource('three',20,{stageId:'c'})];
 const attempts=[{id:'aa',stage_id:'a',ordinal:1,state:'completed'},{id:'bb',stage_id:'b',ordinal:2,state:'called'},{id:'cc',stage_id:'c',ordinal:3,state:'pending'}];
 const before=JSON.stringify({items,attempts});assert.equal(hours.remainingDuration(items,workflow,attempts,attempts[1]),65);
 assert.equal(hours.remainingDuration(items,workflow,attempts,{...attempts[1],state:'in_service'},{retrySelectionId:'two'}),50);
 assert.equal(JSON.stringify({items,attempts}),before);
 assert.throws(()=>hours.remainingDuration(items,workflow,[{...attempts[0],state:'waiting'},...attempts.slice(1)],attempts[1]),{code:'STORE_HOURS_UNAVAILABLE'});
 assert.throws(()=>hours.remainingDuration(items,workflow,attempts.slice(1),attempts[1]),{code:'STORE_HOURS_UNAVAILABLE'});
});
test('a different location timezone resolves its own closing instant without browser timezone assumptions',()=>{
 const window=at('2026-10-20T20:30:00Z',weekly(2,'09:00','17:00'),'America/New_York');assert.equal(window.closesAt,'2026-10-20T21:00:00.000Z');assert.equal(window.remainingWholeMinutes,30);hours.assertFits(window,30);
});
