require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react'),fs=require('node:fs'),path=require('node:path');
const {renderToStaticMarkup}=require('react-dom/server');
const {CounterRequestCards}=require('../src/vendor/CounterRequestCards.tsx');
const {Select,SelectItem,SelectGroup,SelectContent}=require('../src/vendor/components/ui/select.tsx');
const {Badge}=require('../src/vendor/components/ui/badge.tsx');
const base={current:null,nextTarget:null,nextPlan:null,pickerPlans:[],selected:false,loading:false,disabled:false,openDisabled:false,startEnabled:false,callEnabled:false,eligible:false,onSelect(){},onOpen(){},onStart(){},onCall(){}};
const plan=(id,state='waiting',conflict=false)=>({id,ticketId:'ticket-'+id,ticketNumber:'VD-'+id,customer:{name:'Customer '+id},state,resourceWait:conflict?{code:'RESOURCE_OCCUPIED',message:'In use'}:null});
function find(node,predicate,out=[]){if(!React.isValidElement(node))return out;if(predicate(node))out.push(node);React.Children.forEach(node.props.children,child=>find(child,predicate,out));return out;}
test('request options render separate semantic outline badges with complete accessible/typeahead labels',()=>{
 const tree=CounterRequestCards({...base,pickerPlans:[plan('001','in_service'),plan('002','waiting',true),plan('003')]});const items=find(tree,e=>e.type===SelectItem);assert.equal(items.length,3);assert.equal(find(tree,e=>e.type===SelectGroup)[0].props['aria-label'],'Requests');
 for(const [index,text,variant] of [[0,'In service','info'],[1,'Resource conflict','warning']]){const item=items[index],badges=find(item,e=>e.type===Badge);assert.equal(badges.length,1);assert.equal(badges[0].props.variant,variant);assert.equal(badges[0].props.children,text);assert.equal(item.props.label,item.props['aria-label']);assert.match(item.props.label,new RegExp(text));assert.equal(item.props.disabled,undefined);const html=renderToStaticMarkup(item.props.children);assert.match(html,/queue-counter-picker-option-label/);assert.match(html,/data-slot="badge"/);assert.match(html,/bg-transparent/);assert.doesNotMatch(html,/bg-destructive/);}
 assert.equal(find(items[2],e=>e.type===Badge).length,0,'waiting rows do not acquire an invented available badge');assert.equal(items[2].props['aria-label'],'VD-003 · Customer 003');
});
test('conflicted requests remain inspectable and selection keeps exact value without invoking call/open',()=>{
 const calls=[],selected=plan('002','waiting',true),tree=CounterRequestCards({...base,nextPlan:selected,selected:true,pickerPlans:[selected,plan('003')],onSelect:id=>calls.push(['select',id]),onCall:()=>calls.push(['call']),onOpen:id=>calls.push(['open',id])});const select=find(tree,e=>e.type===Select)[0];assert.equal(select.props.value,'002');select.props.onValueChange('003');select.props.onValueChange(null);assert.deepEqual(calls,[['select','003']]);const conflict=find(tree,e=>e.type===SelectItem&&e.props.value==='002')[0];assert.equal(conflict.props.disabled,undefined);assert.equal(conflict.props.label,'VD-002 · Customer 002 · Resource conflict');
});
test('unhydrated backend target options use human labels and matching status badge without exposing IDs',()=>{
 const target={planId:'private-plan-uuid',ticketId:'private-ticket-uuid',ticketNumber:'VD006',customerName:'Charles',state:'called',resourceWait:null},tree=CounterRequestCards({...base,nextTarget:target});const item=find(tree,e=>e.type===SelectItem)[0];assert.equal(item.props.value,target.planId);assert.equal(item.props.label,'VD006 · Charles · Called');const html=renderToStaticMarkup(item.props.children);assert.match(html,/VD006 · Charles/);assert.match(html,/>Called</);assert.doesNotMatch(html,/private-plan|private-ticket/);
});
test('picker retains the approved popup/selected-check primitives and scoped mobile wrapping without parent hook changes',()=>{
 const tree=CounterRequestCards({...base,pickerPlans:[plan('001')]}),popup=find(tree,e=>e.type===SelectContent)[0];assert.equal(popup.props.alignItemWithTrigger,false);assert.equal(popup.props.className,'queue-counter-request-popup');assert.equal(popup.props.children.type,SelectGroup);
 const source=fs.readFileSync(path.join(__dirname,'../src/vendor/components/ui/select.tsx'),'utf8');assert.match(source,/SelectPrimitive.ItemIndicator/);assert.match(source,/v:min-h-11/);const css=fs.readFileSync(path.join(__dirname,'../src/vendor/styles.css'),'utf8');assert.match(css,/queue-counter-request-popup \{ width:min\(400px,calc\(100vw - 24px\),var\(--available-width/);assert.match(css,/queue-counter-picker-item > span:has\(> \.queue-counter-picker-option\) \{ min-width:0; flex:1 1 0; white-space:normal/);assert.match(css,/queue-counter-picker-option-label \{[^}]*overflow-wrap:anywhere/);
});
