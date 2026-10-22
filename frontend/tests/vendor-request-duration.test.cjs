require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {durationInterval,requestOutcomeCounts,childIntervals}=require('../src/vendor/requestDuration.ts');
const start=Date.parse('2026-10-18T00:00:00Z');
const member={id:'a',childAttemptId:'child',startedAt:new Date(start).toISOString(),expectedEndAt:new Date(start+60000).toISOString(),releasedAt:null};
test('planned time elapsed caps at100 without finishing and overdue is strictly after end',()=>{
 assert.equal(durationInterval(member,start+30000).percent,50);
 assert.equal(durationInterval(member,start+60000).overdue,false);
 assert.deepEqual(durationInterval(member,start+120000),{elapsed:120000,planned:60000,percent:100,overdue:true,finished:false});
});
test('completed and interrupted intervals freeze at actual early release regardless of future clock',()=>{
 for(const outcome of ['completed','terminated']){const interval={...member,outcome,releasedAt:new Date(start+15000).toISOString()};assert.equal(durationInterval(interval,start+900000).percent,25);assert.equal(durationInterval(interval,start+900000).overdue,false);}
});
test('invalid and missing timestamps never produce a made-up progress value',()=>{
 for(const invalid of [{startedAt:'bad'},{expectedEndAt:member.startedAt},{releasedAt:'bad'},{releasedAt:new Date(start-1).toISOString()}])assert.equal(durationInterval({...member,...invalid},start+20000),null);
 assert.equal(durationInterval(member,start-1),null);
});
test('retry joins exact allocation group and attempt; counts use unique current leaves',()=>{
 const child={childAttemptId:'child',allocationGroupId:'group',allocationMemberIds:['a'],state:'in_service',isCurrent:true};
 const old={...child,childAttemptId:'old',isCurrent:false,state:'interrupted'};
 const plan={allocationGroups:[{id:'group',members:[member,{...member,id:'wrong',childAttemptId:'old'}]}],childAttempts:[child,old,child],serviceSelections:[]};
 assert.deepEqual(childIntervals(plan,child),[member]);assert.deepEqual(requestOutcomeCounts(plan,start+90000),{total:1,completed:0,overdue:1});
});
test('waiting or protected work has no allocation interval and cannot become overdue',()=>{
 const child={childAttemptId:'waiting',isCurrent:true,state:'protected',allocationGroupId:null,allocationMemberIds:[]};
 assert.deepEqual(requestOutcomeCounts({allocationGroups:[],childAttempts:[child],serviceSelections:[]},start+900000),{total:1,completed:0,overdue:0});
});

test('released history stays measurable without a live receipt while active timing fails unknown',()=>{
 assert.equal(durationInterval(member,Number.NaN),null);
 assert.equal(durationInterval({...member,releasedAt:new Date(start+15000).toISOString()},Number.NaN).percent,25);
});
