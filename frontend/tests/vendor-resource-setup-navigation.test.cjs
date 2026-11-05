require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const {workspacePath}=require('../src/vendor/workspace.js');
const source=ts.createSourceFile('page.tsx',fs.readFileSync('src/pages/VendorDashboardPage.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression;
function visit(node){if(ts.isJsxAttribute(node)&&node.name.text==='onReviewQueueSetup')expression=node.initializer.expression;ts.forEachChild(node,visit);}visit(source);assert.ok(expression);
const code=ts.transpileModule('globalThis.openSetup = '+expression.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function context(role,allowed=true,canLeave=true){const actions=[];const result={isOwner:role==='owner',isAdmin:role==='admin',visibleNavItems:allowed?[{section:'services'}]:[],canLeaveFeature:()=>canLeave,setServicesTab:tab=>actions.push(tab),navigate:url=>actions.push(url),workspacePath,location:{search:'?business=club&location=mandaue'},selectedLocationSlug:'mandaue',setSelectedLocationSlug:()=>assert.fail('setup must retain location')};vm.runInNewContext(code,result);return {...result,actions};}
test('staff and disallowed Services access receive no management action',()=>{assert.equal(context('staff').openSetup,undefined);assert.equal(context('owner',false).openSetup,undefined);});
test('existing unsaved guard blocks setup navigation; allowed action opens real queue-policy tab and retains branch',()=>{
 const blocked=context('owner',true,false);blocked.openSetup();assert.deepEqual(blocked.actions,[]);
 const allowed=context('admin');allowed.openSetup();assert.equal(allowed.actions[0],'queue-policy');assert.match(allowed.actions[1],/^\/dashboard\/services\?/);assert.match(allowed.actions[1],/location=mandaue/);assert.match(allowed.actions[1],/workspace=administration/);assert.equal(allowed.selectedLocationSlug,'mandaue');
});
