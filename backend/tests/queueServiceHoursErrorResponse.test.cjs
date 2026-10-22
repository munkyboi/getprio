const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const errorHandler=require('../src/middleware/errorHandler');
const serializer=require('../src/services/queueServiceHoursErrorResponse');
const window={status:'open',observedAt:'2026-10-20T08:30:00.001Z',timezone:'Asia/Manila',opensAt:'2026-10-20T01:00:00.000Z',closesAt:'2026-10-20T09:00:00.000Z',remainingWholeMinutes:29,provisional:true};
function response(){return {statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(body){this.body=JSON.parse(JSON.stringify(body));return this;}};}
test('HTTP hours rejection preserves approved current window and strips arbitrary internal error/window fields',()=>{
 for(const code of ['SERVICE_DURATION_EXCEEDS_STORE_HOURS','STORE_HOURS_UNAVAILABLE']){
  const res=response();errorHandler({code,statusCode:409,message:'Choose a shorter duration',serviceHoursWindow:{...window,secret:'not-for-client'},secret:'not-for-client'},{method:'POST',originalUrl:'/api/vendor/tenant/courts/queue/plans/id/publish'},res,()=>{});
  assert.equal(res.statusCode,409);assert.deepEqual(res.body,{message:'Choose a shorter duration',code,serviceHoursWindow:window});
 }
});
test('unrelated error codes and malformed/unbounded window values cannot expose window metadata',()=>{
 for(const error of [{code:'UNRELATED',serviceHoursWindow:window},{code:'STORE_HOURS_UNAVAILABLE',serviceHoursWindow:{...window,timezone:'x'.repeat(101)}},{code:'STORE_HOURS_UNAVAILABLE',serviceHoursWindow:{...window,remainingWholeMinutes:Infinity}},{code:'STORE_HOURS_UNAVAILABLE',serviceHoursWindow:{...window,observedAt:'not-an-instant'}}])assert.deepEqual(serializer.fields(error),{});
});
test('special command HTTP error.plan response preserves both authoritative plan and bounded hours metadata',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/vendorRoutes.js'),'utf8');const start=source.indexOf("for(const action of ['call','start','complete'");const end=source.indexOf("router.get('/tenant/:tenantSlug/queue/workflow'",start);assert.ok(start>=0&&end>start);
 const handlers=new Map(),plan={id:'plan',planRevision:'7'},error=Object.assign(new Error('Choose a shorter duration'),{code:'SERVICE_DURATION_EXCEEDS_STORE_HOURS',statusCode:409,plan,serviceHoursWindow:{...window,internal:'not-for-client'}});
 vm.runInNewContext(source.slice(start,end),{router:{post:(route,handler)=>handlers.set(route,handler)},asyncHandler:handler=>handler,queuePlanContext:async()=>({}),normalizeRequestText:value=>value,require:id=>id==='../services/queuePlanCommandService'?{execute:async()=>{throw error;}}:serializer});
 const res=response();await handlers.get('/tenant/:tenantSlug/queue/plans/:planId/start')({params:{planId:'plan'},body:{},get:()=> 'normal-key'},res);
 assert.equal(res.statusCode,409);assert.deepEqual(res.body,{code:error.code,message:error.message,plan,serviceHoursWindow:window});
});
