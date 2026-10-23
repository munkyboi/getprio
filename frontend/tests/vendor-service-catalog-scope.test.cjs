require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react'),fs=require('node:fs'),path=require('node:path');
const {renderToStaticMarkup}=require('react-dom/server');
const {ServiceCatalog,serviceCatalogItems}=require('../src/vendor/ServiceCatalog.tsx');
const base={durationMinutes:60,priceAmountCents:0,isActive:true,sortOrder:0};
const services=[{...base,id:'court',slug:'court',name:'Court Rental'},{...base,id:'trainer',slug:'trainer',name:'Trainers'},{...base,id:'inactive',slug:'inactive',name:'Inactive shared service',isActive:false},{...base,id:'unassigned',slug:'unassigned',name:'Unassigned service'}];
const locations=[{id:'4',slug:'mandaue',name:'Mandaue'},{id:'1',slug:'demo-courts',name:'Demo Courts'}];
const assignments=[{serviceId:'court',locationId:'4',isActive:true},{serviceId:'trainer',locationId:'1',isActive:true},{serviceId:'trainer',locationId:'4',isActive:false},{serviceId:'inactive',locationId:'4',isActive:true}];
const props={services,assignments,locations,selectedLocationSlug:'mandaue',catalogReady:true,assignmentsReady:true,canManage:true,busyAction:'',onAdd(){},onToggle(){},onEdit(){},onRemove(){}};
const render=overrides=>renderToStaticMarkup(React.createElement(ServiceCatalog,{...props,...overrides}));
test('selected catalog excludes inactive/absent assignments without confusing shared active status',()=>{
 assert.deepEqual(serviceCatalogItems(services,assignments,'4','location',true).map(item=>item.id),['court','inactive']);
 assert.deepEqual(serviceCatalogItems(services,assignments,'1','location',true).map(item=>item.id),['trainer']);
 assert.deepEqual(serviceCatalogItems(services,assignments,'04','location',true),[]);
});
test('location switches recompute exact offerings and all-business keeps unassigned/inactive shared services',()=>{
 const before=JSON.stringify({services,assignments});
 assert.deepEqual(serviceCatalogItems(services,assignments,'4','business',true),services);
 assert.deepEqual(serviceCatalogItems(services,assignments,'1','location',true).map(item=>item.name),['Trainers']);
 assert.deepEqual(serviceCatalogItems(services,assignments,'4','location',true).map(item=>item.name),['Court Rental','Inactive shared service']);
 assert.equal(JSON.stringify({services,assignments}),before);
});
test('unresolved assignment reads and locations never expose the business catalog implicitly',()=>{
 assert.deepEqual(serviceCatalogItems(services,assignments,'4','location',false),[]);
 assert.deepEqual(serviceCatalogItems(services,assignments,undefined,'location',true),[]);
 for(const overrides of [{assignmentsReady:false},{catalogReady:false},{selectedLocationSlug:'not-yet-loaded',locations:[locations[1]]}]){
  const html=render(overrides);assert.doesNotMatch(html,/<h3>(Court Rental|Trainers|Unassigned service)<\/h3>/);
 }
 assert.match(render({assignmentsReady:false}),/Location assignments are unavailable/);
 assert.match(render({assignmentsReady:false,assignmentsLoading:true}),/Loading location offerings/);
 assert.match(render({selectedLocationSlug:'not-yet-loaded',locations:[locations[1]]}),/Choose a location/);
});
test('real catalog defaults to Mandaue offerings and identifies shared action scope',()=>{
 const html=render();assert.match(html,/<h3>Court Rental<\/h3>/);assert.doesNotMatch(html,/<h3>Trainers<\/h3>/);assert.doesNotMatch(html,/<h3>Unassigned service<\/h3>/);
 for(const text of ['Services offered at Mandaue.','All business services','Selected location','Locations tab','Business active'])assert.ok(html.includes(text),text);
 assert.match(html,/aria-label="Service catalog scope"/);assert.match(html,/aria-label="Enable Court Rental for the entire business"/);assert.match(html,/aria-label="Remove Court Rental service from all locations"/);
});
test('empty location provides assignment guidance rather than claiming the business has no services',()=>{
 const html=render({assignments:[]});assert.match(html,/No services offered at Mandaue/);assert.match(html,/enable this location in its Locations tab/);assert.doesNotMatch(html,/<h3>Trainers<\/h3>/);assert.doesNotMatch(html,/No business services yet/);
});
test('unauthorized or busy catalog management remains disabled',()=>{
 for(const overrides of [{canManage:false},{busyAction:'service-status:court'}]){
  const html=render(overrides);assert.match(html,/<input[^>]* disabled=""/);assert.match(html.match(/<button[^>]*aria-label="Edit Court Rental service"[^>]*>/)?.[0]||'',/disabled=""/);
 }
});
test('dashboard actually wires the scoped catalog to current tenant query and location identity',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/pages/VendorDashboardPage.tsx'),'utf8');
 assert.match(source,/<ServiceCatalog key=\{`\$\{selectedTenantSlug\}:\$\{selectedLocationSlug\}`\} services=\{servicesQuery\.data\?\.services \|\| \[\]\}/);
 assert.match(source,/selectedLocationSlug=\{selectedLocationSlug\} catalogReady=\{catalogReady\}/);
 assert.doesNotMatch(source,/<ManagedCollection key=\{selectedTenantSlug\} items=\{services\}/);
 assert.match(source,/Remove service from all locations\?/);
});
