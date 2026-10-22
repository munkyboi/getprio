require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {renderToStaticMarkup}=require('react-dom/server');
const {serviceRequestRows,serviceRequestPage}=require('../src/vendor/serviceRequestRows.ts');
const {SavedRequestDraftRow}=require('../src/vendor/SavedRequestDraftRow.tsx');
const {NamedQueueOperations}=require('../src/vendor/NamedQueueOperations.tsx');
const {savedDraftWrite,confirmedDeletedDraft}=require('../src/vendor/savedDraftCommands.ts');
const {serviceHoursRecovery}=require('../src/vendor/linearQueueErrors.ts');const {ApiError}=require('../src/api/client.ts');
const names={court:'Pickleball Court Rental',equipment:'Basic Equipment'};
const draft=(id='uuid-hidden',more={})=>({id,draftId:id,contractVersion:4,state:'draft',planRevision:'7',catalogRevision:'catalog-3',customer:{name:'Hannah'},serviceSelections:[{serviceId:'court',serviceSelectionId:'selection-id',resources:[]}],allowedActions:['edit','publish','delete'],publishReadiness:{ready:true,blockReasons:[],provisional:true},observedAt:'2026-10-22T03:00:00Z',...more});
const plan=(id='published',more={})=>({id,draftId:`origin-${id}`,contractVersion:4,ticketNumber:'VD001',customer:{name:'Zed'},state:'waiting',serviceSelections:[],allocationGroups:[],reservationGroups:[],capabilities:{execution:true,childOutcomes:true},currentStage:{id:'stage',ordinal:1,state:'waiting'},workflow:{mode:'linear',configurationRevision:'1'},allowedActions:[],serviceHoursEligibility:{status:'not_enforced'},publishedAt:'2026-10-21T03:00:00Z',observedAt:'2026-10-21T03:00:00Z',...more});
const actions={busy:false,onEdit(){},onPublish(){},onDelete(){}};
test('combined loaded rows deduplicate drafts/pages and prefer a published request over its stale origin draft',()=>{
 const original=draft('origin');const rows=serviceRequestRows([plan('p',{draftId:'origin'}),plan('p',{draftId:'origin'})],[original,original,draft('other'),draft('other')],'','all','fifo',names);assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.kind),['published','draft']);assert.equal(rows[1].draft.id,'other');assert.equal(original.state,'draft');
});
test('Draft filter and service/customer search share the combined model without searching IDs or inventing draft dates',()=>{
 const drafts=[draft('second',{customer:{name:'Beth'},observedAt:'2020-01-01T00:00:00Z'}),draft('first',{customer:{name:'Amy'},observedAt:'2030-01-01T00:00:00Z'})];
 for(const sort of ['fifo','newest','ticket'])assert.deepEqual(serviceRequestRows([plan()],drafts,'','draft',sort,names).map(row=>row.draft.id),['second','first']);
 assert.deepEqual(serviceRequestRows([plan()],drafts,'','draft','customer',names).map(row=>row.draft.customer.name),['Amy','Beth']);
 assert.equal(serviceRequestRows([plan()],drafts,'pickleball','all','fifo',names).length,2);assert.equal(serviceRequestRows([plan()],drafts,'Amy','draft','fifo',names).length,1);assert.equal(serviceRequestRows([],drafts,'second','all','fifo',names).length,0);assert.equal(serviceRequestRows([plan()],drafts,'','waiting','fifo',names).length,1);
});
test('combined pagination counts all filtered loaded rows and clamps after a filter shrinks the list',()=>{
 const rows=serviceRequestRows([plan()],Array.from({length:12},(_,i)=>draft(`draft-${i}`)),'','all','fifo',names);assert.equal(rows.length,13);const first=serviceRequestPage(rows,0),second=serviceRequestPage(rows,1);assert.equal(first.pages,2);assert.equal(first.visibleRows.length,10);assert.equal(second.visibleRows.length,3);assert.equal(new Set([...first.visibleRows,...second.visibleRows].map(row=>row.key)).size,13);assert.equal(serviceRequestPage(rows.slice(0,1),9).currentPage,0);
});
function renderRow(value=draft(),overrides={}){return renderToStaticMarkup(React.createElement('table',null,React.createElement('tbody',null,React.createElement(SavedRequestDraftRow,{draft:value,actions,expanded:true,detailId:'draft-detail',onToggle(){},serviceNames:names,...overrides}))));}
const button=(html,label)=>[...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]).find(tag=>tag.includes(`aria-label="${label}"`));
test('draft table row uses a Draft badge, neutral styling, no ticket/progress claim and exact icon-only accessible actions',()=>{
 const html=renderRow();assert.match(html,/request-draft-row/);assert.match(html,/>Draft</);assert.match(html,/Not queued/);assert.match(html,/Pickleball Court Rental/);assert.doesNotMatch(html,/uuid-hidden|selection-id|Draft revision|progressbar|Call request|queue position [0-9]/);
 for(const label of ['Publish request for Hannah','Edit service request for Hannah','Delete draft for Hannah']){assert.ok(button(html,label));assert.doesNotMatch(button(html,label),/disabled=/);}
 assert.match(html,/tabler-icon-send/);assert.match(html,/tabler-icon-edit/);assert.match(html,/tabler-icon-trash/);assert.doesNotMatch(html,/>Publish request</);assert.match(html,/Saved time is unavailable/);
});
test('publication readiness, server actions and owner locks stay authoritative; disabled reasons remain focusable',()=>{
 const html=renderRow(draft('x',{allowedActions:['edit'],publishReadiness:{ready:false,blockReasons:[{code:'STORE_HOURS_UNAVAILABLE',message:'internal diagnostic'}]}}));assert.match(button(html,'Publish request for Hannah'),/disabled=/);assert.doesNotMatch(html,/Delete draft for Hannah|internal diagnostic/);assert.match(html,/We couldn&#x27;t check the opening hours/);assert.match(html,/tabindex="0"[^>]*aria-label="Publish request for Hannah\./);
 const locked=renderRow(draft(),{actions:{...actions,busy:true}});for(const label of ['Publish request for Hannah','Edit service request for Hannah','Delete draft for Hannah'])assert.match(button(locked,label),/disabled=/);
 const noEdit=renderRow(draft('x',{allowedActions:[]}));assert.match(button(noEdit,'Edit service request for Hannah'),/disabled=/);
});
test('the actual unified datatable renders both kinds once and reports loaded counts, with no separate card list',()=>{
 const html=renderToStaticMarkup(React.createElement(NamedQueueOperations,{plans:[plan()],drafts:[draft()],draftActions:actions,draftServiceNames:names,busy:false,onPlanAction(){},onChildAction(){}}));assert.match(html,/VD001/);assert.match(html,/Hannah/);assert.match(html,/1–2 of 2 loaded requests/);assert.equal((html.match(/class="[^"]*\brequest-draft-row\b[^"]*"/g)||[]).length,1);assert.doesNotMatch(html,/entity-grid|Saved service request drafts/);
 const readonly=renderToStaticMarkup(React.createElement(NamedQueueOperations,{plans:[],drafts:[draft()],busy:false,onPlanAction(){},onChildAction(){}}));assert.match(readonly,/Hannah/);assert.match(button(readonly,'Publish request for Hannah'),/disabled=/);
});
test('existing draft owner keeps its frozen command through list changes, unknown result and exact retry',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/vendor/SavedRequestDrafts.tsx'),'utf8');const pending={current:null},writes=[];let attempt=0;
 const context={pending,inFlight:{current:false},focusTarget:{current:null},token:'token',tenant:'club',location:'mandaue',busy:false,locked:false,working:false,uncertain:false,hasUnsavedEdits:()=>false,crypto:{randomUUID:()=>`key-${++attempt}`},ApiError,savedDraftWrite,confirmedDeletedDraft,serviceHoursRecovery,useEffect(){},client:{invalidateQueries(){}},window:{dispatchEvent(){}},Event:class{},setParams(){},clearConfirmedDraftSelection:()=>'',queueMicrotask(){},onNotice(){},executeQueueWrite:async write=>{writes.push(JSON.parse(JSON.stringify(write)));if(writes.length===1)throw new ApiError('Lost',503);return {plan:{id:'saved',state:'waiting',ticketNumber:'VD009'}};}};
 for(const [setter,key] of [['setWorking','working'],['setUncertain','uncertain'],['setError','error'],['setDeleting','deleting']])context[setter]=value=>context[key]=value;
 vm.createContext(context);const start=source.indexOf(' function refresh()'),end=source.indexOf(' return <section',start);vm.runInContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nglobalThis.sendDraft=send;',context);
 const current=draft('saved');await context.sendDraft(current,'publish');assert.equal(context.uncertain,true);const frozen=pending.current.write;serviceRequestRows([],[],'no-match','draft','newest');await context.sendDraft({...current,planRevision:'99'},'delete');assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(writes[1].key,frozen.key);assert.equal(writes[1].body.expectedPlanRevision,'7');assert.equal(context.uncertain,false);assert.equal(pending.current,null);
 const panel=fs.readFileSync(path.join(__dirname,'../src/vendor/NamedQueuePanel.tsx'),'utf8');assert.equal((panel.match(/<SavedRequestDrafts\b/g)||[]).length,1);assert.match(panel,/<SavedRequestDrafts[\s\S]*?draftActions=>\([\s\S]*?<NamedQueueOperations/);
});
