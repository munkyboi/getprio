require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {QueueRecoveryTable,recoveryRows}=require('../src/vendor/QueueRecoveryTable.tsx');
const rows=[{id:'internal-secret-id',ticketNumber:'VD010',customerName:'Alice Smith',status:'pending_carry_over',createdAt:'2026-10-20T01:00:00Z',joinChannel:'vendor',carriedOverAt:null},{id:'second-internal',ticketNumber:'VD002',customerName:'Bob Jones',status:'skipped',createdAt:'2026-10-20T02:00:00Z',rejoinDeadlineAt:'2026-10-20T03:00:00Z'}];
const props={tickets:rows,view:'overflow',includeCurrent:false,onViewChange:()=>{},formatDateTime:value=>String(value),isPriorityRecovery:()=>true,carryOverStatus:()=> 'Carry-over',renderRestore:ticket=>React.createElement('button',{'data-test-restore':ticket.ticketNumber},'Restore')};
const render=change=>renderToStaticMarkup(React.createElement(QueueRecoveryTable,{...props,...change}));
test('recovery rows search human labels and sort loaded data without mutating snapshot order',()=>{
 assert.deepEqual(recoveryRows(rows,' Alice ','loaded').map(x=>x.ticketNumber),['VD010']);
 assert.deepEqual(recoveryRows(rows,'','ticket').map(x=>x.ticketNumber),['VD002','VD010']);
 assert.deepEqual(recoveryRows(rows,'','newest').map(x=>x.ticketNumber),['VD002','VD010']);
 assert.deepEqual(recoveryRows(rows,'','oldest').map(x=>x.ticketNumber),['VD010','VD002']);
 assert.deepEqual(rows.map(x=>x.ticketNumber),['VD010','VD002']);
 assert.equal(recoveryRows(rows,'internal-secret-id','loaded').length,0);
});
test('carry-over reuses request datatable surfaces and renders readable requests without recovery commands',()=>{
 const html=render();
 for(const name of ['request-data-table','request-table-surface','request-filter-surface','request-table-toolbar','request-table-pagination'])assert.ok(html.includes(name));
 assert.match(html,/<table[^>]*aria-label="Carry-over queue"/);assert.match(html,/<th[^>]*scope="col"[^>]*>Request<\/th>/);assert.match(html,/Alice Smith/);assert.match(html,/VD010/);
 assert.doesNotMatch(html,/internal-secret-id|second-internal|>ID<|data-test-restore|Current queue|queue-empty/);
 assert.match(html,/0?[–-]?2 of 2 loaded tickets|1–2 of 2 loaded tickets/);
});
test('missed view retains recovery timing and supplied legacy Restore only',()=>{
 const html=render({view:'recovery',tickets:[rows[1]]});
 assert.match(html,/Recovery priority/);assert.match(html,/Priority until 2026-10-20T03:00:00Z/);assert.match(html,/data-test-restore="VD002"/);assert.doesNotMatch(html,/Recall|data-label="Channel"/);
});
test('empty states stay inside semantic table row and counts describe only loaded rows',()=>{
 const html=render({tickets:[]});
 assert.match(html,/<td[^>]*colSpan="5"[^>]*><p>No carried-over tickets\.<\/p>/i);assert.match(html,/0–0 of 0 loaded tickets/);assert.doesNotMatch(html,/queue-empty|dashed/);
 const missed=render({tickets:[],view:'recovery'});assert.match(missed,/No missed tickets to recover/);assert.match(missed,/colSpan="4"/i);
});
test('page integration preserves legacy Restore guards and separate plan Recall presentation',()=>{
 const fs=require('node:fs'),path=require('node:path');const source=fs.readFileSync(path.join(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');
 const action=source.slice(source.indexOf('renderRestore={(ticket, priorityRecovery)'),source.indexOf('renderRestore={(ticket, priorityRecovery)')+3100);
 for(const guard of ['busyAction === `restore-${ticket.id}`','!ticket.lookupCode','queueDayClosed','queueDayPaused','restoreBlockedByThreshold','restoreSkippedTicket','ticket.lookupCode || ""'])assert.ok(action.includes(guard),guard);
 assert.ok(source.includes('<SkippedQueueRequests'));assert.ok(source.includes('<AccordionContent keepMounted className="queue-public-access-layout">'));
 assert.ok(source.includes('onBusyChange={setBoardScannerBusy}'));assert.ok(source.includes('unsavedForm.current.discardId("queue-board-pairing-form")'));
 const css=fs.readFileSync(path.join(__dirname,'../src/vendor/styles.css'),'utf8');assert.match(css,/\.queue-public-access-grid \{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*align-items:start/);assert.match(css,/@container queue-public-access \(min-width:60rem\)/);assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
