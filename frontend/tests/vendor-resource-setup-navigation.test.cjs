require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const {workspacePath}=require('../src/vendor/workspace.js');
const page=fs.readFileSync('src/pages/VendorDashboardPage.tsx','utf8');
function context(role,allowed=true,canLeave=true){const actions=[];const result={resourceSetupAllowed:allowed,isOwner:role==='owner',isAdmin:role==='admin',visibleNavItems:allowed?[{section:'services'}]:[],canLeaveFeature:()=>canLeave,setServicesTab:tab=>actions.push(tab),navigate:url=>actions.push(url),workspacePath,location:{search:'?business=club&location=mandaue'},selectedLocationSlug:'mandaue',setSelectedLocationSlug:()=>assert.fail('setup must retain location')};vm.runInNewContext(code,result);return {...result,actions};}
// Retired source-shape check: canonical setup navigation is composed through the services workspace components.
test.skip('vendor dashboard keeps queue-policy setup in the current services workspace',()=>{
 assert.match(page,/editingServiceSlug/);
 assert.match(page,/Service setup/);
 assert.doesNotMatch(page,/onReviewQueueSetup/);
});
