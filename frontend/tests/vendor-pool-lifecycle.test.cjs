require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {ResourcePoolsGrid}=require('../src/vendor/ResourceConfigurationCards.tsx');
const {validResourceEditor}=require('../src/components/VendorResourceConfigurationForms.tsx');
const {saveResourceMember}=require('../src/api/resourceMembers.ts');
test('pool actions follow authoritative dependency and archive metadata',()=>{
 const pools=[{id:'unused',name:'Unused',capacity:2,archived_at:null,deletion:{allowed:true,message:'Unused pool can be deleted.',dependencies:[],archiveAllowed:true}},{id:'linked',name:'Linked',capacity:2,archived_at:null,deletion:{allowed:false,message:'A named resource references this pool.',dependencies:[{code:'named_members',count:1,label:'named resource'}],archiveAllowed:true}},{id:'archived',name:'Historical',capacity:2,archived_at:'2026-10-17',deletion:{allowed:false,message:'History retained.',dependencies:[],archiveAllowed:true}}];
 const data={pools,requirements:[],services:[]};
 const html=renderToStaticMarkup(React.createElement(ResourcePoolsGrid,{data,items:pools,disabled:false,onEdit(){},onMembers(){},onArchive(){},onDelete(){}}));
 const button=label=>html.match(new RegExp('<button[^>]*aria-label="'+label+'"[^>]*>'))?.[0];
 assert.doesNotMatch(button('Delete Unused pool'),/\sdisabled(?:=|\s|>)/);
 assert.match(button('Delete Linked pool'),/\sdisabled(?:=|\s|>)/);assert.doesNotMatch(html,/<p>A named resource references this pool/);assert.ok(button('Why Linked pool cannot be deleted'));assert.equal(button('Why Unused pool cannot be deleted'),undefined);
 assert.doesNotMatch(button('Archive Linked pool'),/\sdisabled(?:=|\s|>)/);
 assert.match(button('Edit Historical pool'),/\sdisabled(?:=|\s|>)/);assert.doesNotMatch(button('Manage Historical resources'),/\sdisabled(?:=|\s|>)/);
 assert.equal(button('Archive Historical pool'),undefined);
 assert.equal(validResourceEditor({kind:'requirement',serviceId:'service',poolId:'archived',units:1},{pools,services:[{id:'service'}]}),false);
});
test('member edits retain expected revision and identical retry key',async()=>{
 const old=global.fetch,calls=[];global.fetch=async(url,options)=>{calls.push({url:String(url),options});return {ok:true,status:200,json:async()=>({member:{id:'member',revision:'2'},holdsCreated:false})};};
 try{const body={name:'Resource alias',isActive:true,expectedRevision:'1'};for(let i=0;i<2;i++)await saveResourceMember('cookie-session','tenant','branch','member',body,'same-key');for(const call of calls){assert.equal(call.options.method,'PATCH');assert.equal(call.options.headers['Idempotency-Key'],'same-key');assert.deepEqual(JSON.parse(call.options.body),body);assert.match(call.url,/resource-members\/member\?location=branch/);}}finally{global.fetch=old;}
});
test('resource toggles preserve identity revision and exact command key without releasing capacity',()=>{
 const {memberToggleCommand,memberToggleBlockedReason}=require('../src/vendor/ResourceMembersDialog.tsx');
 const member={id:'stable-member',name:'Court alias',revision:'7',isActive:true,archivedAt:null,availability:{state:'provisional_free'}};
 assert.deepEqual(memberToggleCommand(member,false,'retry-key'),{id:'stable-member',body:{name:'Court alias',isActive:false,displayOrder:undefined,expectedRevision:'7'},key:'retry-key'});
 assert.equal(memberToggleBlockedReason(member,false),undefined);
 for(const state of ['occupied','protected'])assert.match(memberToggleBlockedReason({...member,availability:{state}},false),/normal queue action/);
 assert.equal(memberToggleBlockedReason({...member,isActive:false},false),undefined);
 assert.match(require('node:fs').readFileSync('src/vendor/ResourceMembersDialog.tsx','utf8'),/the server checks current capacity and holds/);
 assert.match(memberToggleBlockedReason(member,true),/archived/);
 assert.match(memberToggleBlockedReason({...member,archivedAt:'2026-10-17T00:00:00Z'},false),/archived/);
 assert.equal(memberToggleBlockedReason({...member,isActive:false},false),undefined);
});
test('archival is a separate versioned command and does not overwrite the maintenance flag',async()=>{
 const {archiveResourceMember}=require('../src/api/resourceMembers.ts');const original=global.fetch;let request;
 global.fetch=async(url,options)=>{request={url,options};return {ok:true,json:async()=>({member:{id:'same-member',isActive:true,archivedAt:'2026-10-17T00:00:00Z',revision:'4'},holdsCreated:false})};};
 try{const response=await archiveResourceMember('cookie-session','tenant','branch','same-member',{expectedRevision:'3'},'archive-key');assert.match(request.url,/resource-members\/same-member\/archive\?location=branch$/);assert.equal(request.options.method,'POST');assert.equal(request.options.headers['Idempotency-Key'],'archive-key');assert.deepEqual(JSON.parse(request.options.body),{expectedRevision:'3'});assert.equal(response.member.isActive,true);assert.ok(response.member.archivedAt);}finally{global.fetch=original;}
});
test('temporary inactivity stays in Active while only explicit archival moves to Archived',()=>{
 const {memberCollectionStatus}=require('../src/vendor/ResourceMembersDialog.tsx');
 assert.equal(memberCollectionStatus({isActive:true,archivedAt:null}),'active');
 assert.equal(memberCollectionStatus({isActive:false,archivedAt:null}),'active');
 assert.equal(memberCollectionStatus({isActive:true,archivedAt:'2026-10-17T00:00:00Z'}),'archived');
});
