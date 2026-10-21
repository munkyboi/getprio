require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {readQueueSelection}=require('../src/api/queueSelectionsV3.ts');
test('selected request reads forward cancellation so obsolete refresh responses cannot replace newer reads',async()=>{
 const original=global.fetch,controller=new AbortController();let observed;
 global.fetch=async(_url,options)=>{observed=options.signal;return {ok:true,json:async()=>({plan:{state:'served'}})};};
 try{const result=await readQueueSelection('cookie-session','tenant','location','request',controller.signal);assert.deepEqual(result.plan,{state:'served'});assert.ok(Number.isFinite(result.clientReceivedAt));assert.ok(Object.keys(result).includes('clientReceivedAt')); assert.equal(observed,controller.signal);}finally{global.fetch=original;}
});
test('manual refresh invalidates the active request table and keeps details inline',()=>{
 const source=fs.readFileSync('src/vendor/NamedQueuePanel.tsx','utf8');
 assert.match(source,/<NamedQueueOperations headerActions=\{<OperationButton[^>]*onClick=\{refresh\}>[\s\S]*?Refresh requests<\/OperationButton>\}/);
 assert.match(fs.readFileSync('src/vendor/NamedQueueOperations.tsx','utf8'),/props\.headerActions\?<div className="request-card-actions">\{props\.headerActions\}/);
 assert.match(source,/function refresh\(\).*'named-queue-active'.*queryKey:\[key,token,tenant,location\]/);
 assert.match(source,/setInterval\(\(\)=>\{if\(!streamHealthyRef\.current\)onRefresh\(\);\},15000\)/);
 assert.match(source,/addEventListener\('focus',onRefresh\)/);
 assert.match(source,/addEventListener\('online',onRefresh\)/);
 assert.match(source,/addEventListener\('queue-plans-updated',onRefresh\)/);
 assert.match(source,/activeRefreshing\.current\?\.update\(\)/);
 assert.doesNotMatch(source,/Request review/);
 assert.doesNotMatch(fs.readFileSync('src/vendor/NamedQueueOperations.tsx','utf8'),/Open request review/);
});
