require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const filename=require.resolve('../src/components/CampaignDescriptionEditor.tsx');
function fixture(){
 let html='<p></p>',selection={offset:4},history=['previous business'],updates=0,clears=0;const effects=[],tags=[];
 const editor={getEditorState:()=>({read:fn=>fn()}),update(fn,options){updates++;fn();tags.push(options.tag);options.onUpdate?.();},dispatchCommand(){clears++;history=[];}};
 const load=Module._load,previous=require.cache[filename],oldParser=global.DOMParser;
 Module._load=function(id,parent,...rest){if(parent?.filename===filename){if(id==='react')return {...load.call(this,id,parent,...rest),useEffect:effect=>effects.push(effect)};if(id==='@lexical/react/LexicalComposerContext')return {useLexicalComposerContext:()=>[editor]};if(id==='@lexical/html')return {$generateHtmlFromNodes:()=>html,$generateNodesFromDOM:(_editor,dom)=>[dom.html]};if(id==='lexical')return {...load.call(this,id,parent,...rest),$getRoot:()=>({clear:()=>({append(...nodes){html=nodes.join('');}})}),$setSelection:value=>{selection=value;}};}return load.call(this,id,parent,...rest);};
 let Sync,tag;
 try{delete require.cache[filename];({DescriptionValueSync:Sync,DESCRIPTION_EXTERNAL_VALUE_TAG:tag}=require(filename));}finally{Module._load=load;if(previous)require.cache[filename]=previous;else delete require.cache[filename];}
 assert.equal(typeof Sync,'function');
 return {editor,tag,tags,get html(){return html;},get selection(){return selection;},get history(){return history;},get updates(){return updates;},get clears(){return clears;},edit(value){html=value;selection={offset:7};history=['local undo'];},sync(value){try{global.DOMParser=class{parseFromString(html){return {html};}};Sync({value});effects.splice(0).forEach(effect=>effect());}finally{if(oldParser===undefined)delete global.DOMParser;else global.DOMParser=oldParser;}}};
}
test('asynchronous external description loads replace the document once and clear history from the previous business',()=>{
 const f=fixture();f.sync('');assert.equal(f.updates,0);f.sync('Saved description');assert.equal(f.html,'<p>Saved description</p>');assert.equal(f.updates,1);assert.equal(f.tags[0],f.tag);assert.equal(f.selection,null);assert.deepEqual(f.history,[]);assert.equal(f.clears,1);f.sync('<p>Saved description</p>');assert.equal(f.updates,1);
});
test('a parent echo preserves local content, selection and undo history; explicit external clearing still works',()=>{
 const f=fixture();f.edit('<p>Typed <strong>draft</strong></p>');const selection=f.selection,history=f.history;f.sync(f.html);assert.equal(f.updates,0);assert.equal(f.selection,selection);assert.equal(f.history,history);f.sync('');assert.equal(f.html,'<p></p>');assert.equal(f.updates,1);assert.equal(f.selection,null);assert.deepEqual(f.history,[]);
});
test('external hydration cannot call the parent onChange; normal bounded user edits still do',()=>{
 const source=ts.createSourceFile('editor.tsx',fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
 function visit(node){if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(source)==='OnChangePlugin')callback=node.attributes.properties.find(attribute=>attribute.name?.getText(source)==='onChange')?.initializer.expression;ts.forEachChild(node,visit);}visit(source);assert.ok(callback);
 const writes=[],context={DESCRIPTION_EXTERNAL_VALUE_TAG:'description-external-value',$generateHtmlFromNodes:()=>'<p>Saved text</p>',getPlainText:html=>html.replace(/<[^>]*>/g,''),maxCharacters:100,onChange:value=>writes.push(value)};const code=ts.transpileModule('globalThis.changed='+callback.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,context);const state={read:fn=>fn()};context.changed(state,{},new Set([context.DESCRIPTION_EXTERNAL_VALUE_TAG]));assert.deepEqual(writes,[]);context.changed(state,{},new Set());assert.deepEqual(writes,['<p>Saved text</p>']);context.maxCharacters=2;context.changed(state,{},new Set());assert.equal(writes.length,1);
});

test('business identity changes remount the editor even when both businesses have identical descriptions',()=>{
 const page=path=>fs.readFileSync(require('node:path').join(__dirname,path),'utf8');const source=ts.createSourceFile('page.tsx',page('../src/pages/VendorDashboardPage.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let editor;
 function visit(node){if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(source)==='CampaignDescriptionEditor')editor=node;ts.forEachChild(node,visit);}visit(source);assert.ok(editor);
 const context={require,exports:{},CampaignDescriptionEditor:()=>null,selectedTenantSlug:'first-business',settings:{publicProfileDescription:'Same description'},profileDisabled:false,settingsBusy:false,markSettingsForm(){},setSettings(){}};vm.createContext(context);const code=ts.transpileModule('globalThis.editor=('+editor.getText(source)+');',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInContext('(function(){'+code+'})()',context);const first=context.editor;context.selectedTenantSlug='second-business';vm.runInContext('(function(){'+code+'})()',context);assert.equal(first.key,'first-business');assert.equal(context.editor.key,'second-business');assert.equal(first.props.value,context.editor.props.value);
});
