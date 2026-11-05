require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {QueueServiceLines}=require('../src/vendor/QueueServiceLines.tsx');
const lines=[{lineId:'stable-line',serviceId:'court',units:'3',durationMinutes:'180'}];
const options=[{id:'court',name:'Courts',durationMinutes:60,quantityMin:1,quantityMax:4,durationEditable:true}];
const render=props=>renderToStaticMarkup(React.createElement(QueueServiceLines,{lines,options,busy:false,onChange(){},...props}));
test('queue line form keeps three resource units distinct from three-hour duration and preserves labels',()=>{
 const html=render();
 assert.match(html,/value="3"/);assert.match(html,/value="180"/);
 assert.match(html,/min="1" max="4" step="1"/);
 assert.match(html,/Units for line 1/);assert.match(html,/Duration in minutes for line 1/);
 assert.match(html,/do not reserve resources or create a queue position/);
});
test('unavailable catalog and protected plans cannot silently rewrite service lines',()=>{
 const missing=render({options:[]});assert.match(missing,/Unavailable service/);assert.match(missing,/no longer offered/);
 const locked=render({locked:true});assert.match(locked,/Booking-backed plans/);
 for(const input of locked.match(/<input[^>]*>/g))assert.match(input,/disabled=""/);
 const configured=render({options:[{...options[0],durationEditable:false}]});assert.match(configured,/Configured duration/);assert.match(configured,/saved duration differs/);
});

const {hasQuantityReduction}=require('../src/vendor/QueuePlanDialog.tsx');
test('amendment agreement detects removed or reduced stable lines without confusing duration with units',()=>{
 assert.equal(hasQuantityReduction(lines,[{...lines[0],units:'2'}]),true);
 assert.equal(hasQuantityReduction(lines,[]),true);
 assert.equal(hasQuantityReduction(lines,[{...lines[0],durationMinutes:'120'}]),false);
 assert.equal(hasQuantityReduction(lines,[{...lines[0],units:'4'}]),false);
 assert.equal(hasQuantityReduction(lines,[{...lines[0],serviceId:'different'}]),true);
});

test('draft serialization sends quantity and minutes separately and keeps incomplete entries null',()=>{
 const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm');
 const source=fs.readFileSync(path.join(__dirname,'../src/vendor/QueueDraftsPanel.tsx'),'utf8');
 const start=source.indexOf('export function queueDraftInput('),end=source.indexOf('\nfunction formDraft',start);
 const js=ts.transpileModule(source.slice(start,end).replace('export function','function')+'\nqueueDraftInput;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const convert=vm.runInNewContext(js);
 const body=convert({customerName:'Demo',customerEmail:'',customerPhone:'',notes:'',lines:[...lines,{lineId:'incomplete',serviceId:'',units:'',durationMinutes:''}]});
 assert.equal(body.lines[0].quantity,3);assert.equal(body.lines[0].durationMinutes,180);
 assert.equal(body.lines[1].quantity,null);assert.equal(body.lines[1].durationMinutes,null);assert.equal(body.lines[1].serviceId,null);
 assert.equal('units' in body.lines[0],false);
 const repeated=convert({customerName:'Demo',customerEmail:'',customerPhone:'',notes:'',lines:[{lineId:'one-hour',serviceId:'court',units:'1',durationMinutes:'60'},{lineId:'two-hours',serviceId:'court',units:'2',durationMinutes:'120'}]});
 assert.equal(repeated.lines.length,2);
 assert.equal(repeated.lines[0].lineId,'one-hour');assert.equal(repeated.lines[1].lineId,'two-hours');
 assert.equal(repeated.lines[0].serviceId,repeated.lines[1].serviceId);
 assert.equal(repeated.lines[0].quantity,1);assert.equal(repeated.lines[1].quantity,2);
 assert.equal(repeated.lines[0].durationMinutes,60);assert.equal(repeated.lines[1].durationMinutes,120);
});

// Preservation only: current publication policy still rejects this mixed-duration case.
test('repeated catalog service rows keep independent labels and stable amendment identity',()=>{
 const repeated=[{lineId:'one-hour',serviceId:'court',units:'1',durationMinutes:'60'},{lineId:'two-hours',serviceId:'court',units:'2',durationMinutes:'120'}];
 const html=render({lines:repeated,options:[{...options[0],durationEditable:false}]});
 assert.match(html,/Service 1 · Courts/);assert.match(html,/Service 2 · Courts/);
 assert.match(html,/Units for line 1/);assert.match(html,/Units for line 2/);
 assert.match(html,/value="120"/);assert.match(html,/saved duration differs/);
 assert.equal(hasQuantityReduction(repeated,[repeated[1],repeated[0]]),false);
 assert.equal(hasQuantityReduction(repeated,[{...repeated[1],units:'1'},repeated[0]]),true);
 assert.equal(hasQuantityReduction(repeated,[{...repeated[1],units:'3'}]),true);
});
