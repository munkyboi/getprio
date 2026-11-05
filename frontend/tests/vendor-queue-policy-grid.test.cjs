require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {QueryClient,QueryClientProvider}=require('@tanstack/react-query');
const {QueuePoliciesGrid}=require('../src/vendor/QueuePoliciesGrid.tsx');
test('queue policy cards default to active service status without treating unconfigured policies as inactive',()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const services=[{id:'one',name:'Configured active',slug:'configured-active',isActive:true},{id:'two',name:'Unconfigured active',slug:'unconfigured-active',isActive:true},{id:'three',name:'Inactive service',slug:'inactive',isActive:false}];
 client.setQueryData(['queue-service-configuration','token','tenant','branch','one'],{configurationRevision:'6',policy:{configuration:{assignment:{mode:'automatic'},duration:{mode:'adjustable',visible:true,baseMinutes:30,minCount:1,maxCount:6,stepCount:1,defaultCount:2},extras:[]}}});
 client.setQueryData(['queue-service-configuration','token','tenant','branch','two'],{configurationRevision:'0',policy:null});
 const html=renderToStaticMarkup(React.createElement(QueryClientProvider,{client},React.createElement(QueuePoliciesGrid,{services,token:'token',tenant:'tenant',location:'branch',canManage:true,busy:false,onEdit:()=>{}})));
 assert.match(html,/Configured active/);assert.match(html,/Unconfigured active/);assert.doesNotMatch(html,/Inactive service/);
 assert.match(html,/Not configured/);assert.match(html,/30/);assert.match(html,/60/);
 assert.match(html,/Edit Configured active queue policy/);assert.match(html,/Search queue policies/);
 assert.match(html,/role="tab"[^>]*aria-selected="true"[^>]*>Active/);
 assert.doesNotMatch(html,/Choose service|Queue policy service|All statuses/);
 client.clear();
});
