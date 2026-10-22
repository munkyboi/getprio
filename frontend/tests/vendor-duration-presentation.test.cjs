require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {RequestHoursNotice, requestHoursNoticeKey, requestHoursNoticeVisible, DurationHoursRefresh} = require('../src/vendor/RequestDurationPresentation.tsx');
const {QueueDurationCount} = require('../src/vendor/QueueDurationCount.tsx');
const window = {status:'open',timezone:'Asia/Manila',opensAt:'2026-10-21T00:00:00Z',closesAt:'2026-10-21T12:00:00Z',observedAt:'2026-10-21T03:00:00Z',remainingWholeMinutes:540,provisional:true};
const props = {scope:{tenant:'sports',location:'mandaue'},window,state:'open',closesLabel:'8:00 PM',maximumMinutes:480,duration:480,remainingMs:480*60000};
test('hours notice identity ignores ticking remaining time and repeat observations, but changes with scope, window, state or issue',()=>{
 const key=requestHoursNoticeKey(props);
 assert.equal(requestHoursNoticeKey({...props,maximumMinutes:420,duration:120,remainingMs:479*60000,window:{...window,observedAt:'2026-10-21T03:01:00Z',remainingWholeMinutes:539}}),key);
 for(const changed of [{scope:{tenant:'sports',location:'cebu'}},{state:'closed'},{message:'Duration no longer fits.'},{window:{...window,closesAt:'2026-10-21T13:00:00Z'}}]) assert.notEqual(requestHoursNoticeKey({...props,...changed}),key);
});
test('hours notice has normal info intent, dismiss action and current closing copy; actual problems have warning intent',()=>{
 const normal=renderToStaticMarkup(React.createElement(RequestHoursNotice,props));
 assert.match(normal,/We close at 8:00 PM\. Please choose a duration that finishes before closing\./);assert.doesNotMatch(normal,/Resource availability is checked separately|Based on starting now/);assert.match(normal,/Dismiss store hours notice/);assert.match(normal,/bg-info-surface/);
 const warning=renderToStaticMarkup(React.createElement(RequestHoursNotice,{...props,message:'Duration no longer fits.'}));
 assert.match(warning,/bg-warning-surface/);assert.match(warning,/Duration no longer fits/);
});
test('duration helper remains described and icon sits next to label; refresh is beside summary with separator and exact accessible name',()=>{
 const html=renderToStaticMarkup(React.createElement(QueueDurationCount,{label:'Duration count',value:'2',policy:{revision:'1',mode:'adjustable',visible:true,baseMinutes:60,minCount:1,maxCount:8,stepCount:1,defaultCount:1},capturedRevision:'1',disabled:false,onChange(){},summaryAction:React.createElement(DurationHoursRefresh,{disabled:true,onRefresh(){}})}));
 assert.match(html,/About duration count/);assert.match(html,/class="[^"]*sr-only"[^>]*id="[^"]+-help"/);assert.match(html,/aria-describedby="[^"]+-help"/);assert.match(html,/duration-summary-row/);assert.match(html,/data-orientation="vertical"/);assert.match(html,/aria-label="Refresh hours"/);assert.match(html,/disabled=""/);assert.doesNotMatch(html,/>Refresh hours<\/button>/);
});

test('normal guidance never presents a policy-capped maximum as the time left before closing',()=>{
 const render=overrides=>renderToStaticMarkup(React.createElement(RequestHoursNotice,{...props,...overrides}));
 assert.match(render({maximumMinutes:90}),/Please choose a duration that finishes before closing/);
 assert.doesNotMatch(render({maximumMinutes:90}),/choose up to|1 hour 30 minutes/);
 assert.equal(render({maximumMinutes:480,remainingMs:16*60*60000}), '');
 assert.match(render({closesLabel:'5:00 AM',maximumMinutes:undefined}),/We close at 5:00 AM/);
});
test('closing time display omits the timezone suffix while keeping the configured location timezone conversion',()=>{
 const {requestDurationFit}=require('../src/vendor/requestDurationFit.ts');
 const policy={revision:'1',mode:'adjustable',visible:true,baseMinutes:60,minCount:1,maxCount:8,stepCount:1,defaultCount:1};
 const options={serviceHoursWindow:window,workflow:{mode:'linear'},services:[{id:'court',durationPolicy:policy,extras:[]}]};
 const rows=[{serviceId:'court',courts:[{durationCount:'1'}]}];const fit=requestDurationFit(rows,options,0,0);
 assert.equal(fit.state,'open');assert.equal(fit.countBounds.max,8);assert.equal(fit.maximumMinutes,480);
 assert.equal(fit.closesLabel,new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}).format(new Date(window.closesAt)));
 assert.doesNotMatch(fit.closesLabel,/GMT|UTC/);
});

test('normal info follows the selected duration boundary, never the configured maximum',()=>{
 for(const duration of [30,120,360]){
  const threshold=duration*60000;
  for(const [remainingMs,visible] of [[threshold+1,false],[threshold,true],[threshold-1,true],[16*60*60000,false],[undefined,false],[NaN,false],[-1,false]]){
   assert.equal(requestHoursNoticeVisible({remainingMs,duration}),visible);
   assert.equal(Boolean(renderToStaticMarkup(React.createElement(RequestHoursNotice,{...props,remainingMs,duration}))),visible);
  }
 }
 assert.equal(requestHoursNoticeVisible({remainingMs:3*60*60000,duration:120}),false);
 assert.equal(requestHoursNoticeVisible({remainingMs:3*60*60000,duration:360}),true);
 for(const duration of [undefined,NaN,Infinity,0,-1]) assert.equal(requestHoursNoticeVisible({remainingMs:0,duration}),false);
 for(const message of ["We're closed right now.","We couldn't check the opening hours.",'Choose a shorter duration.','These resources need different durations.','Enter a valid duration.']){
  assert.equal(requestHoursNoticeVisible({remainingMs:16*60*60000,message}),true);assert.match(renderToStaticMarkup(React.createElement(RequestHoursNotice,{...props,duration:undefined,remainingMs:16*60*60000,message})),/bg-warning-surface/);
 }
});
test('selected count uses actual minute units and workflow time; clock and SSE hours changes preserve selections',()=>{
 const {requestDurationFit}=require('../src/vendor/requestDurationFit.ts');
 const policy={revision:'1',mode:'adjustable',visible:true,baseMinutes:30,minCount:1,maxCount:20,stepCount:1,defaultCount:1};
 const options={serviceHoursWindow:window,workflow:{mode:'linear'},services:[{id:'court',durationPolicy:policy,extras:[]}]};
 const rows=[{serviceId:'court',courts:[{durationCount:'4'},{durationCount:'4'}]}];const before=JSON.stringify(rows);
 const visible=fit=>requestHoursNoticeVisible(fit);
 for(const [elapsed,expected] of [[0,false],[7*60*60000-1,false],[7*60*60000,true]]){
  const fit=requestDurationFit(rows,options,0,elapsed);assert.equal(fit.state,'open');assert.equal(fit.duration,120);assert.equal(visible(fit),expected);
 }
 const tooLate=requestDurationFit(rows,options,0,7*60*60000+1);assert.match(tooLate.message,/Choose a shorter duration/);assert.equal(visible(tooLate),true);
 const changedWindow={...options,serviceHoursWindow:{...window,closesAt:'2026-10-21T20:00:00Z',remainingWholeMinutes:1020}};const changedFit=requestDurationFit(rows,changedWindow,0,7*60*60000);assert.equal(changedFit.duration,120);assert.equal(visible(changedFit),false);
 const staged={...options,workflow:{mode:'multi_station',stages:[{stageId:'one',serviceIds:['court']},{stageId:'two',serviceIds:['equipment']}]},services:[...options.services,{id:'equipment',durationPolicy:{...policy,baseMinutes:15},extras:[]}]};
 const stagedRows=[...rows,{serviceId:'equipment',courts:[{durationCount:'4'}]}];const stagedBefore=JSON.stringify(stagedRows);
 for(const [elapsed,expected] of [[6*60*60000-1,false],[6*60*60000,true]]){const fit=requestDurationFit(stagedRows,staged,0,elapsed);assert.equal(fit.duration,180);assert.equal(visible(fit),expected);}
 assert.equal(JSON.stringify(rows),before);assert.equal(JSON.stringify(stagedRows),stagedBefore);
});

test('the dialog clock stays pure across a fresh hours anchor and includes response delay after its effect sample',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
 const text=fs.readFileSync(path.join(__dirname,'../src/vendor/NamedQueuePlanDialog.tsx'),'utf8');
 const tree=ts.createSourceFile('dialog.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fitExpression,clockEffect;
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='hoursFit')fitExpression=node.initializer;if(ts.isCallExpression(node)&&node.expression.getText(tree)==='useEffect'&&node.arguments[0]?.getText(tree).includes('setDurationNow'))clockEffect=node.arguments[0];ts.forEachChild(node,visit);}visit(tree);assert.ok(fitExpression&&clockEffect);
 const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const context={mode:'draft',hoursReadFailed:false,v4Options:{},draft:{selections:[{serviceId:'retained'}]},durationNow:1000,hoursRequestStartedAt:1500,requestDurationFit(rows,options,anchor,now){assert.equal(rows,context.draft.selections);return {anchor,now};},performance:{now(){throw Error('render must not sample time');}}};
 vm.createContext(context);const expression=compile('globalThis.fit='+fitExpression.getText(tree));vm.runInContext(expression,context);assert.equal(context.fit.now,1500);assert.equal(context.fit.anchor,1500);
 let tick,cleared;context.performance.now=()=>2100;context.setDurationNow=value=>{context.durationNow=value;};context.window={setInterval(fn){tick=fn;return 7;},clearInterval(id){cleared=id;}};
 vm.runInContext(compile('globalThis.cleanup=('+clockEffect.getText(tree)+')();'),context);assert.equal(context.durationNow,2100);vm.runInContext(expression,context);assert.equal(context.fit.now-context.fit.anchor,600);
 context.performance.now=()=>3100;tick();assert.equal(context.durationNow,3100);context.cleanup();assert.equal(cleared,7);assert.equal(context.draft.selections[0].serviceId,'retained');
});
