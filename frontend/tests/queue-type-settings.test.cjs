require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {QueueTypeSettings}=require('../src/vendor/QueueTypeSettings.tsx');
const {queueIntakeMode}=require('../src/vendor/queueIntakeMode.ts');
const configuration={contract:'queue-type-v1',scope:{tenantSlug:'t',locationSlug:'main'},type:'simple',revision:'1',futureAdmissionsOnly:true,capabilities:{simple:true,resource:false,workflow:false},readiness:{simple:{ready:true,reason:null},resource:{ready:true,reason:null},workflow:{ready:false,reason:'Workflow is not activated.'}},notice:'Future requests only.'};
test('actual selector labels three execution types and locks unsupported options',()=>{
 const html=renderToStaticMarkup(React.createElement(QueueTypeSettings,{configuration,canEdit:true,busy:false,onSave:async()=>{}}));
 for(const text of ['Simple queue','Resource-based queue','Queue workflow','Future requests only.','Not included in your current plan.'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/type="radio"/g)||[]).length,3);assert.match(html,/disabled="" value="resource"/);assert.match(html,/type="checkbox" disabled=""/);
});
test('explicit type replaces readiness auto-detection and stale scopes fail closed',()=>{
 const input={optedIn:true,tenantSlug:'t',entitlementTenantSlug:'t',loaded:true,entitlements:{queueSystemAccess:true},locationSlug:'main',setup:{scope:'t:main',ready:true},queueType:configuration};
 assert.equal(queueIntakeMode(input),'legacy');
 assert.equal(queueIntakeMode({...input,queueType:null}),'loading');
 assert.equal(queueIntakeMode({...input,queueType:{...configuration,scope:{tenantSlug:'other',locationSlug:'main'}}}),'loading');
 assert.equal(queueIntakeMode({...input,queueType:{...configuration,type:'resource'}}),'blocked');
 assert.equal(queueIntakeMode({...input,queueType:{...configuration,type:'resource',capabilities:{simple:true,resource:true,workflow:false}}}),'resource');
 assert.equal(queueIntakeMode({...input,queueType:{...configuration,type:'workflow',capabilities:{simple:true,resource:true,workflow:true}}}),'workflow');
});
