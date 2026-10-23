require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react'),fs=require('node:fs');
const {renderToStaticMarkup}=require('react-dom/server');
const {CountersGrid}=require('../src/vendor/CountersGrid.tsx');
const counter={id:'counter',name:'Court dispatch',slug:'court-dispatch',isActive:true,assignedUserIds:['missing']};
const render=props=>renderToStaticMarkup(React.createElement(CountersGrid,{items:[counter],staff:[],canManage:true,busyAction:'',onToggle(){},onEdit(){},onRemove(){},...props}));
test('counter cards preserve unavailable assignments and named actions without exposing enabled management to unauthorized users',()=>{
 const html=render({canManage:false});
 assert.match(html,/Unavailable staff member/);assert.match(html,/aria-label="Edit Court dispatch counter"/);assert.match(html,/aria-label="Remove Court dispatch counter"/);
 assert.ok((html.match(/disabled=""/g)||[]).length>=3);assert.match(html,/<h3>Court dispatch<\/h3>/);
});
test('pending counter save retains enabled state and locks management actions',()=>{
 const html=render({busyAction:'counter-status:court-dispatch'});
 assert.match(html,/Saving…/);assert.match(html,/aria-busy="true"/);assert.ok((html.match(/disabled=""/g)||[]).length>=3);assert.match(html,/Enabled/);
});

const {ServicesGrid}=require('../src/vendor/ServicesGrid.tsx');
const service={id:'service',slug:'court',name:'Court session',isActive:true,description:'Play time',durationMinutes:30,allowBookingQuantity:true,bookingQuantityLabel:'hours',bookingQuantityMin:2,bookingQuantityMax:6,priceAmountCents:120000,priceDisplay:'PHP 1,200',manualPaymentRequired:true,bookingCapacityScope:'location',sortOrder:3};
const renderServices=props=>renderToStaticMarkup(React.createElement(ServicesGrid,{items:[service],assignments:[{serviceId:'service',locationId:'missing',isActive:true}],locations:[],canManage:true,busyAction:'',assignmentsReady:true,onToggle(){},onEdit(){},onRemove(){},...props}));
test('service cards retain quantity bounds, payment/capacity meaning and unavailable branch assignments',()=>{
 const html=renderServices();
 for(const text of ['2–6 hours','PHP 1,200','Proof required','All services at the branch','Unavailable branch'])assert.ok(html.includes(text),text);
 assert.match(html,/aria-label="Edit Court session service"/);assert.match(html,/aria-label="Remove Court session service from all locations"/);
 assert.match(html,/aria-label="Enable Court session for the entire business"/);assert.match(html,/Business active/);
});
test('service management stays disabled while branch assignments are unavailable or actor lacks permission',()=>{
 for(const props of [{assignmentsReady:false},{canManage:false}]){
  const html=renderServices(props);assert.ok((html.match(/disabled=""/g)||[]).length>=3);
 }
 assert.match(renderServices({assignmentsReady:false}),/Loading branch settings/);
});

const {ResourcePoolsGrid,ServiceRequirementsGrid}=require('../src/vendor/ResourceConfigurationCards.tsx');
test('resource cards retain pool capacity and unavailable service relationships without enabling runtime tracking',()=>{
 const data={version:'v',trackingAvailable:false,pools:[{id:'pool',name:'Courts',capacity:4,revision:2,tracking_enabled:false}],services:[],requirements:[{service_id:'gone',pool_id:'pool',units_required:2,revision:3}]};
 const poolHtml=renderToStaticMarkup(React.createElement(ResourcePoolsGrid,{data,items:data.pools,disabled:true,onEdit(){}}));
 assert.match(poolHtml,/4 units/);assert.match(poolHtml,/not available for activation/);assert.match(poolHtml,/disabled=""/);
 const html=renderToStaticMarkup(React.createElement(ServiceRequirementsGrid,{data,items:data.requirements,disabled:false,onEdit(){},onRemove(){}}));
 assert.match(html,/Assignment unavailable/);assert.match(html,/2 units/);assert.match(html,/Pool: Courts/);assert.match(html,/disabled=""/);
});
test('named resource observation states use inline icons without visible observation badges',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src/vendor/ResourceMembersDialog.tsx'),'utf8');
 assert.match(source,/resource-observation-icon/);
 assert.match(source,/aria-label=\{`\$\{member\.name\}: \$\{status\.label\}`\}/);
 assert.doesNotMatch(source,/variant=\{status\.variant\}/);
 assert.doesNotMatch(source,/\{status\.label\}<\/Badge>/);
});

const {WeeklyAvailabilityGrid}=require('../src/vendor/WeeklyAvailabilityGrid.tsx');
const weeklyBlock={id:'weekly',serviceId:null,weekday:1,startsAt:'22:00',endsAt:'02:00',endsNextDay:true,capacity:4,isActive:true,notes:'Late sessions'};
const renderWeekly=props=>renderToStaticMarkup(React.createElement(WeeklyAvailabilityGrid,{items:[weeklyBlock],branchName:'Demo Courts',timezone:'Asia/Manila',weekdayLabel:()=> 'Monday',serviceLabel:id=>id ? 'Unavailable service' : 'All services',serviceAvailable:()=>false,canManage:true,busyAction:'',onToggle(){},onEdit(){},onRemove(){},...props}));
test('weekly cards preserve overnight recurrence, timezone, branch, shared capacity and notes',()=>{
 const html=renderWeekly();
 for(const text of ['22:00 – 02:00 next day','Every Monday','Asia/Manila','Demo Courts','All services','Bookings at the same time','Late sessions'])assert.ok(html.includes(text),text);
 assert.match(html,/aria-label="Edit Monday 22:00 – 02:00 next day All services weekly rule"/);
});
test('weekly cards protect missing service editing while retaining permitted removal and lock busy or unauthorized controls',()=>{
 const missing=renderWeekly({items:[{...weeklyBlock,serviceId:'gone',isActive:false}]});
 assert.match(missing,/Service unavailable/);assert.match(missing,/Disabled/);
 assert.match(missing, /<input[^>]* disabled=""/);
 const missingButtons=missing.match(/<button[^>]*>/g);
 assert.match(missingButtons.find(button=>button.includes('aria-label="Edit')), / disabled=""/);
 assert.doesNotMatch(missingButtons.find(button=>button.includes('aria-label="Remove')), / disabled=""/);
 for(const props of [{canManage:false},{busyAction:'availability-block-status:weekly'}]){
  const html=renderWeekly(props);assert.match(html, /<input[^>]* disabled=""/);
  for(const button of html.match(/<button[^>]*>/g))assert.match(button, / disabled=""/);
 }
 assert.match(renderWeekly({busyAction:'availability-block-status:weekly'}),/Saving…/);
});

const {DateExceptionsGrid}=require('../src/vendor/DateExceptionsGrid.tsx');
const exception={id:'exception',serviceId:null,exceptionDate:'2026-10-19',startsAt:'',endsAt:'',isAvailable:false,capacity:null,reason:'Holiday'};
const renderExceptions=props=>renderToStaticMarkup(React.createElement(DateExceptionsGrid,{items:[exception],branchName:'Demo Courts',timezone:'Asia/Manila',dateLabel:date=>String(date),serviceLabel:id=>id ? 'Court session' : 'All services',serviceAvailable:()=>true,canManage:true,busyAction:'',onToggle(){},onEdit(){},onRemove(){},...props}));
test('date exception cards preserve exact date, all-day closure, timezone, scope, fallback capacity and reason',()=>{
 const html=renderExceptions();
 for(const text of ['2026-10-19','Whole day','Blocked','One-off','Asia/Manila','Demo Courts','All services','Usual limit','Holiday'])assert.ok(html.includes(text),text);
 assert.match(html,/aria-label="Allow bookings for 2026-10-19 Whole day All services date exception"/);
 const custom=renderExceptions({items:[{...exception,serviceId:'service',startsAt:'10:00',endsAt:'12:00',isAvailable:true,capacity:2}]});
 for(const text of ['10:00 – 12:00','Bookings allowed','Court session','>2<'])assert.ok(custom.includes(text),text);
});
test('date exception controls retain missing-service recovery and lock pending or unauthorized edits',()=>{
 const html=renderExceptions({items:[{...exception,serviceId:'gone'}],serviceAvailable:()=>false});
 assert.match(html,/Service unavailable/);
 const buttons=html.match(/<button[^>]*>/g);
 assert.match(buttons.find(button=>button.includes('aria-label="Edit')), / disabled=""/);
 assert.doesNotMatch(buttons.find(button=>button.includes('aria-label="Remove')), / disabled=""/);
 for(const props of [{canManage:false},{busyAction:'availability-exception-status:exception'}]){
  const markup=renderExceptions(props);assert.match(markup, /<input[^>]* disabled=""/);
  for(const button of markup.match(/<button[^>]*>/g))assert.match(button, / disabled=""/);
 }
 assert.match(renderExceptions({busyAction:'availability-exception-status:exception'}),/Saving…/);
});
