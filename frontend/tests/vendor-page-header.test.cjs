require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {MemoryRouter}=require('react-router-dom');
const {VendorPageHeader}=require('../src/vendor/VendorPageHeader.tsx');
const {TaskPage}=require('../src/vendor/TaskPage.tsx');
test('routed page header has navigable ancestors, current breadcrumb, one actual h1 and semantic separator',()=>{
 const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(React.Fragment,null,
 React.createElement(VendorPageHeader,{title:'Edit Demo Courts',description:'Branch details and hours',breadcrumbs:[{label:'Administration',href:'/dashboard/locations?business=club'},{label:'Locations',href:'/dashboard/locations?business=club'},{label:'Edit Demo Courts'}],action:React.createElement('button',null,'Back to locations')}),
 React.createElement(TaskPage,{opened:true,title:'Edit Demo Courts',description:'Branch details and hours',onClose(){},footer:'Save',children:'Fields'}))));
 assert.equal((html.match(/<h1/g)||[]).length,1);assert.match(html,/<h1>Edit Demo Courts<\/h1>/);
 assert.match(html,/aria-label="Page breadcrumb"/);assert.match(html,/href="\/dashboard\/locations\?business=club"/);assert.match(html,/aria-current="page"[^>]*>Edit Demo Courts/);
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 assert.match(html,/role="separator"/);assert.doesNotMatch(html,/<h2/);
 assert.equal((html.match(/Branch details and hours/g)||[]).length,1);
});
