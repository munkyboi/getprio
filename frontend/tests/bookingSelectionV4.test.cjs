require('tsx/cjs');require.extensions['.css']=()=>{};
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {MantineProvider}=require('@mantine/core');
const Editor=require('../src/components/BookingSelectionEditorV4.tsx').default;
const service={id:'1',slug:'court',name:'Court rental',assignment:'named',resourceReady:true,quantityMax:1,duration:{baseMinutes:60,minCount:1,maxCount:8,stepCount:1,defaultCount:1,visible:true,version:'a'.repeat(64)},resources:[{id:'court1',name:'Court 1',enabled:true},{id:'court2',name:'Court 2',enabled:false}],extras:[],manualPaymentRequired:false};
test('selected count and resource survive refreshed catalog props; only administrative disabling is represented',()=>{
 const value=[{serviceSelectionId:'root',serviceId:'1',resources:[{resourceSelectionId:'resource',resourceMemberId:'court1',quantity:1,durationCount:3,durationVersion:'a'.repeat(64),extras:[]}]}],before=JSON.stringify(value);let changed=0;
 for(const version of ['v1','v2']){const html=renderToStaticMarkup(React.createElement(MantineProvider,null,React.createElement(Editor,{catalog:{contractVersion:4,enabled:true,catalogVersion:version,services:[service]},value,onChange:()=>changed++})));assert.match(html,/Court 1/);assert.match(html,/value="3"/);assert.match(html,/Duration count/);assert.match(html,/Amount confirmed by vendor/);}
 assert.equal(JSON.stringify(value),before);assert.equal(changed,0);
});
