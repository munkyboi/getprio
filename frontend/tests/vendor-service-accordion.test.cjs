require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {QueueSelectionFieldsV4}=require('../src/vendor/QueueSelectionFieldsV4.tsx');
const {selectionValidationFocus}=require('../src/vendor/queueSelectionValidationFocus.ts');
const policy={revision:'duration-1',mode:'adjustable',visible:true,baseMinutes:60,minCount:1,maxCount:8,stepCount:1,defaultCount:1};
const service={id:'court',name:'Court rental',labels:{resources:'Courts',duration:'Duration'},durationPolicy:policy,assignmentPolicy:{mode:'named'},quantityMin:1,quantityMax:1,resourceMembers:[{id:'member',isActive:true,archivedAt:null,name:'Court 1'}],extras:[]};
const options={services:[service]};
const row=(id,count='1')=>({serviceSelectionId:id,serviceId:'court',courts:[{courtSelectionId:`${id}-resource`,resourceMemberId:'member',resourceQuantity:'1',durationCount:count,durationPolicyRevision:policy.revision,extras:[]}]});
test('accordion panels keep controls mounted and trash is never nested in the trigger',()=>{
 const html=renderToStaticMarkup(React.createElement(QueueSelectionFieldsV4,{rows:[row('stable-one'),row('stable-two')],options,busy:false,onChange(){}}));
 assert.match(html,/data-service-id="stable-one"/);assert.match(html,/data-service-id="stable-two"/);
 assert.match(html,/data-slot="accordion-content"/);assert.match(html,/aria-expanded="true"/);
 const triggers=[...html.matchAll(/<button[^>]*data-slot="accordion-trigger"[^>]*>([\s\S]*?)<\/button>/g)];
 assert.equal(triggers.length,4);for(const [,inside] of triggers)assert.doesNotMatch(inside,/<button|Remove service/);
 assert.match(html,/aria-label="Remove service 1, Court rental"/);
 assert.match(html,/data-resource-id="stable-one-resource"/);assert.match(html,/Resource 1/);
});
test('validation routes to the stable invalid service and correct field/action after reordering',()=>{
 const valid=row('first'),bad={...row('bad','1.5'),serviceId:'other'};
 const other={...service,id:'other',name:'Second service'};
 const catalog={services:[service,other]};
 assert.deepEqual(selectionValidationFocus([valid,bad],catalog),{serviceId:'bad',resourceId:'bad-resource',label:'Duration for service 2, resource 1'});
 assert.deepEqual(selectionValidationFocus([bad,valid],catalog),{serviceId:'bad',resourceId:'bad-resource',label:'Duration for service 1, resource 1'});
 assert.deepEqual(selectionValidationFocus([{...valid,courts:[]}],catalog),{serviceId:'first',action:'add-resource'});
 assert.deepEqual(selectionValidationFocus([{...valid,serviceId:''}],catalog),{serviceId:'first',label:'Choose service for service 1'});
});
