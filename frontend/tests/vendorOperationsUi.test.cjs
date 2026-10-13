require('tsx/cjs');
const test=require('node:test');const assert=require('node:assert/strict');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const {OperationScope,OperationButton,OperationInput,OperationPagination,OperationQueryState,OperationDateRange}=require('../src/vendor/OperationsUi.tsx');
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
test('operation busy scope disables controls across a pending task',()=>{
 const html=render(OperationScope,{busy:true,children:[React.createElement(OperationButton,{key:'save'},'Save'),React.createElement(OperationInput,{key:'name',label:'Customer name',value:'Fixture',onChange(){}})]});
 assert.equal((html.match(/ disabled=""/g)||[]).length,2);
});
test('pagination stays bounded for large result sets and identifies current page',()=>{
 const html=render(OperationPagination,{total:100000,value:500,onChange(){}});
 assert.equal((html.match(/<button/g)||[]).length,7);assert.match(html,/aria-current="page"/);assert.match(html,/aria-label="Page 500"/);assert.match(html,/Page 100000/);
 const first=render(OperationPagination,{total:1,value:1,onChange(){}});assert.equal((first.match(/ disabled=""/g)||[]).length,2);
});
test('failed list requests expose retry instead of falsely reporting empty records',()=>{
 const failed=render(OperationQueryState,{loading:false,error:new Error('Denied'),onRetry(){}});assert.match(failed,/Unable to load records/);assert.match(failed,/Retry records/);assert.doesNotMatch(failed,/No records/);
 const loading=render(OperationQueryState,{loading:true,error:null,onRetry(){}});assert.match(loading,/role="status"/);assert.match(loading,/Loading records/);
});
test('date filter retains local calendar dates and lower bound for its end date',()=>{
 const html=render(OperationDateRange,{value:[new Date(2026,9,13),new Date(2026,9,14)],onChange(){}});assert.match(html,/value="2026-10-13"/);assert.match(html,/value="2026-10-14"/);assert.match(html,/min="2026-10-13"/);assert.match(html,/From date/);assert.match(html,/To date/);
});

test('reschedule selection expires when the server removes or fills its slot',()=>{
 const {availableRescheduleSelection}=require('../src/vendor/operationsState.ts');
 const first='2026-10-13T08:00:00Z',second='2026-10-13T09:00:00Z';
 assert.equal(availableRescheduleSelection([{startAt:first,isAvailable:true}],first),first);
 assert.equal(availableRescheduleSelection([{startAt:first,isAvailable:false}],first),'');
 assert.equal(availableRescheduleSelection([{startAt:second,isAvailable:true}],first),'');
 assert.equal(availableRescheduleSelection([],first),'');
});

test('advancing the start date clears an earlier end but preserves equal, later and open bounds',()=>{
 const {dateRangeWithStart}=require('../src/vendor/operationsState.ts');
 const earlier=new Date(2026,9,13),later=new Date(2026,9,14);
 assert.deepEqual(dateRangeWithStart(later,earlier),[later,null]);
 assert.deepEqual(dateRangeWithStart(earlier,later),[earlier,later]);
 assert.deepEqual(dateRangeWithStart(earlier,earlier),[earlier,earlier]);
 assert.deepEqual(dateRangeWithStart(null,earlier),[null,earlier]);
 assert.deepEqual(dateRangeWithStart(later,null),[later,null]);
});
