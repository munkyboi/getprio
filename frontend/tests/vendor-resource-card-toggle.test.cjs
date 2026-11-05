require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const source=fs.readFileSync(path.join(__dirname,'../src/vendor/NamedQueuePlanDialog.tsx'),'utf8');
const ast=ts.createSourceFile('NamedQueuePlanDialog.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let card;
function visit(node){if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='button'&&node.openingElement.attributes.getText(ast).includes('service-resource-card'))card=node;ts.forEachChild(node,visit);}visit(ast);assert.ok(card,'actual resource picker button exists');
const transpile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const policy={revision:'duration-1',baseMinutes:60,defaultCount:2};
const item=(serviceId,id='court-a',assignmentMode='named',more={})=>({serviceId,id,assignmentMode,name:id,category:'Resources',durationBaseMinutes:60,active:true,...more});
const resource=(id,member='court-a',more={})=>({courtSelectionId:id,resourceMemberId:member,resourceQuantity:'1',durationCount:'3',durationBaseMinutes:60,durationPolicyRevision:'duration-1',extras:[{extraSelectionId:`extra-${id}`}],...more});
const row=(service,id,courts,more={})=>({serviceId:service,serviceSelectionId:id,courts,...more});
function harness(selections,overrides={}){
 let sequence=0;const context={require,exports:{},busy:false,uncertain:false,mode:"amend",draft:{customerName:'Unchanged customer',notes:'Unsaved notes',catalogRevision:'catalog-1',selections},v4Options:{services:[{id:'one',quantityMin:1,durationPolicy:policy,extras:[{serviceId:'extra',configured:true,resourceReady:true,quantityMin:1,durationPolicy:policy}]},{id:'two',quantityMin:1,durationPolicy:policy,extras:[]}]},crypto:{randomUUID:()=>`new-${++sequence}`},setAgreement(){},setValidation(){},...overrides};context.setDraft=next=>{context.draft=next};vm.createContext(context);
 const start=source.indexOf('  const addResourceCard ='),end=source.indexOf('  const updateResourceQuantity =',start);assert.ok(start>0&&end>start);vm.runInContext(transpile(source.slice(start,end)+'\nglobalThis.handlers={toggleResourceCard,removeResourceCard,selectedResourceCard};'),context);
 return {context,button(current,available=true){Object.assign(context,{item:current,chosen:Boolean(context.handlers.selectedResourceCard(current)),available,service:{},checking:false,selectedUnavailable:!available&&Boolean(context.handlers.selectedResourceCard(current)),availabilityTone:'warning',unavailable:!available&&!context.handlers.selectedResourceCard(current),availabilityLabel:'Availability',availabilityDetail:null});const selectable=source.match(/const selectable = ([^;]+);/)[0];vm.runInContext('(function(){'+transpile('globalThis.element=(()=>{'+selectable+'return ('+card.getText(ast)+');})();')+'})()',context);return context.element;}};
}
test('selected named cards remove the exact service/member and retain other resources, extras, duration and customer input',()=>{
 const h=harness([row('one','s1',[resource('a'),resource('b','court-b')]),row('two','s2',[resource('other','court-a')])]);const keep=h.context.draft.selections[0].courts[1],other=h.context.draft.selections[1];
 const button=h.button(item('one'));assert.equal(button.type,'button');assert.equal(button.props.type,'button');assert.equal(button.props['aria-pressed'],true);assert.equal(button.props.disabled,false);assert.equal(button.props.onKeyDown,undefined,'native button Enter/Space activation uses the same click action');button.props.onClick();
 assert.equal(h.context.draft.selections[0].courts.length,1);assert.equal(h.context.draft.selections[0].courts[0],keep);assert.equal(h.context.draft.selections[1],other);assert.equal(h.context.draft.customerName,'Unchanged customer');assert.equal(h.context.draft.notes,'Unsaved notes');assert.equal(h.context.draft.catalogRevision,null);
 const reselect=h.button(item('one'));assert.equal(reselect.props['aria-pressed'],false);reselect.props.onClick();assert.equal(h.context.draft.selections[0].courts.length,2);const added=h.context.draft.selections[0].courts[1];assert.equal(added.durationCount,'3');assert.equal(added.durationPolicyRevision,'duration-1');assert.equal(added.resourceMemberId,'court-a');
});
test('automatic pool toggle removes the whole quantity row, just like the Order remove action',()=>{
 const selections=[row('one','s1',[resource('pool',null,{resourceQuantity:'5'})]),row('two','s2',[resource('other')])];const card=harness(selections),cart=harness(selections);card.button(item('one','pool-one','automatic')).props.onClick();cart.context.handlers.removeResourceCard('s1','pool');assert.equal(JSON.stringify(card.context.draft),JSON.stringify(cart.context.draft));assert.equal(card.context.draft.selections.length,1);assert.equal(card.context.draft.selections[0].serviceId,'two');
});
test('direct-extra named and automatic cards remove their own service row and can be selected again',()=>{
 for(const mode of ['named','automatic']){const current=item('one','extra-member',mode,{extraServiceId:'extra',parentServiceId:'one'});const h=harness([row('one','parent',[resource('root')]),row('extra','direct',[resource('extra-resource',mode==='automatic'?null:'extra-member',{resourceQuantity:'4'})],{directResource:true})]);h.button(current).props.onClick();assert.equal(h.context.draft.selections.length,1);assert.equal(h.context.draft.selections[0].serviceId,'one');h.button(current).props.onClick();const direct=h.context.draft.selections.find(value=>value.serviceId==='extra');assert.equal(direct.directResource,true);assert.equal(direct.courts.length,1);assert.equal(direct.courts[0].resourceMemberId,mode==='automatic'?null:'extra-member');}
});
test('selected unavailable cards remain removable, unavailable new picks remain disabled, and busy/uncertain locks remain',()=>{
 const h=harness([row('one','s1',[resource('a')])]);const selected=h.button(item('one'),false);assert.equal(selected.props.disabled,false);assert.equal(selected.props['aria-pressed'],true);assert.doesNotMatch(renderToStaticMarkup(selected),/disabled=""/);selected.props.onClick();const unselected=h.button(item('one'),false);assert.equal(unselected.props.disabled,true);assert.equal(unselected.props['aria-pressed'],false);assert.match(renderToStaticMarkup(unselected),/disabled=""/);
 for(const locked of [{busy:true},{uncertain:true}]){const frozen=harness([row('one','s1',[resource('a')])],locked);const button=frozen.button(item('one'),false);assert.equal(button.props.disabled,true);button.props.onClick();assert.equal(frozen.context.draft.selections[0].courts.length,1);}
});

test('new and saved draft cards can select busy or unconfirmed resources while amendments remain availability-gated',()=>{
 for(const assignmentMode of ['named','automatic']) for(const extra of [false,true]){
  const current=item('one',extra?'extra-member':'court-a',assignmentMode,extra?{extraServiceId:'extra',parentServiceId:'one'}:{});
  for(const initial of [[],[row('two','saved-other',[resource('other','court-b')])]]){
   const h=harness(initial,{mode:'draft'});const button=h.button(current,false);assert.equal(button.props.disabled,false,`${assignmentMode} ${extra}`);button.props.onClick();assert.ok(h.context.handlers.selectedResourceCard(current));
   h.button(current,false).props.onClick();assert.equal(h.context.handlers.selectedResourceCard(current),undefined);
  }
  assert.equal(harness([],{mode:'amend'}).button(current,false).props.disabled,true);
 }
});
test('administratively disabled new resources stay blocked in draft and amendment, but selected disabled resources remain removable',()=>{
 for(const mode of ['draft','amend']){
  const disabled=item('one','court-a','named',{active:false});const fresh=harness([],{mode});assert.equal(fresh.button(disabled,true).props.disabled,true);fresh.button(disabled,true).props.onClick();assert.equal(fresh.context.draft.selections.length,0);
  const selected=harness([row('one','saved',[resource('a')])],{mode});assert.equal(selected.button(disabled,false).props.disabled,false);selected.button(disabled,false).props.onClick();assert.equal(selected.context.draft.selections.length,0);
 }
});
test('pooled draft quantities use configured bounds rather than temporary available units; amendments keep their live cap',()=>{
 const declaration=source.match(/const quantityMax = ([^;]+);/)[0];
 for(const availableUnits of [0,1,3,undefined])for(const mode of ['draft','amend']){
  const context={mode,availableUnits,configuredQuantityMax:5,quantityMin:1};vm.runInNewContext(declaration+'globalThis.maximum=quantityMax;',context);assert.equal(context.maximum,mode==='draft'||availableUnits==null?5:Math.max(1,availableUnits));
 }
});

test('draft presentation stays neutral across live hold, occupancy and refresh changes; amendment keeps exact live reasons',()=>{
 const start=source.indexOf('                          const interval ='),end=source.indexOf('                          return <button',start);assert.ok(start>0&&end>start);
 const run=(mode,state,chosen=false,active=true)=>{const context={require,exports:{},mode,item:item('one','court-a','named',{active}),selectedResource:chosen?{resource:resource('a')}:undefined,service:{},busy:false,uncertain:false,availability:{checking:!state},availabilityFor:()=>state?{state,reasonCode:'RESOURCE_OCCUPIED'}:undefined,pooledExtraAvailabilityState:()=>undefined,pooledAvailabilityUnits:()=>0,pooledCapacity:()=>2,availabilityReason:()=> 'In service on another request',availabilityIntent:()=> 'warning',toggleResourceCard(){}};vm.createContext(context);vm.runInContext(transpile(source.slice(start,end)+'globalThis.element=('+card.getText(ast)+');'),context);return context.element;};
 for(const state of ['available','unavailable',undefined])for(const chosen of [true,false]){const button=run('draft',state,chosen);const html=renderToStaticMarkup(button);assert.equal(button.props.disabled,false);assert.match(html,chosen?/Selected/:/Select for request/);assert.match(html,/Availability checked when called/);assert.doesNotMatch(html,/In service on another request|Checking availability|Selected · Unavailable|is-selected-unavailable/);}
 const disabled=run('draft','available',false,false);assert.equal(disabled.props.disabled,true);assert.match(renderToStaticMarkup(disabled),/Disabled in resource settings/);
 const amendment=run('amend','unavailable');assert.equal(amendment.props.disabled,true);assert.match(renderToStaticMarkup(amendment),/In service on another request/);
});
