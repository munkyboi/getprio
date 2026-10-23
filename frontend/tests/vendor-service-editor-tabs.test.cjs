require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {ServiceEditorTabs}=require('../src/vendor/ServiceEditorTabs.tsx');
test('all three service panels keep their controls mounted with one stable identity per field',()=>{
 const field=name=>React.createElement('input',{name,id:name,defaultValue:'kept-'+name});
 const html=renderToStaticMarkup(React.createElement(ServiceEditorTabs,{general:field('name'),booking:field('quantity'),locations:field('location'),busy:false}));
 for(const name of ['name','quantity','location']){assert.equal((html.match(new RegExp('id="'+name+'"','g'))||[]).length,1);assert.ok(html.includes('value="kept-'+name+'"'));}
 for(const tab of ['general','booking','locations'])assert.ok(html.includes('data-service-tab="'+tab+'"'));
 assert.match(html,/General/);assert.match(html,/Booking/);assert.match(html,/Locations/);
});
