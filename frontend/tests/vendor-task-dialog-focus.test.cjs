require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {scrollTaskControlIntoView}=require('../src/vendor/taskDialogFocus.ts');
function check(field,scroll=100){const control={getBoundingClientRect:()=>field};const main={scrollTop:scroll,contains:x=>x===control,getBoundingClientRect:()=>({top:150,bottom:378,height:228})};scrollTaskControlIntoView(main,control);return main.scrollTop;}
test('short dialog focus scrolls a control clear of the persistent footer',()=>{assert.equal(check({top:469,bottom:513,height:44}),243);});
test('focus above the scroll region clears the fixed guidance and visible focus stays still',()=>{assert.equal(check({top:120,bottom:164,height:44}),62);assert.equal(check({top:180,bottom:224,height:44}),100);});
test('oversized focus targets align to the start and unrelated controls never move the dialog',()=>{assert.equal(check({top:170,bottom:470,height:300}),112);const main={scrollTop:5,contains:()=>false};scrollTaskControlIntoView(main,{});assert.equal(main.scrollTop,5);});

test('focusing a scrolled structural tabpanel never reveals its start or resets the dialog to the top',()=>{
 const panel={getAttribute:name=>name==='role'?'tabpanel':null,getBoundingClientRect:()=>({top:-850,bottom:1950,height:2800})};
 let scroll=1000;
 const main={contains:node=>node===panel,getBoundingClientRect:()=>({top:150,bottom:378,height:228}),get scrollTop(){return scroll;},set scrollTop(value){scroll=Math.max(0,value);}};
 scrollTaskControlIntoView(main,panel);assert.equal(main.scrollTop,1000);
 scrollTaskControlIntoView(main,panel);assert.equal(main.scrollTop,1000);
});
test('Enable location text retains its native label association with the actual checkbox',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const {ConfigurationCheck}=require('../src/vendor/ConfigurationUi.tsx');
 const html=renderToStaticMarkup(React.createElement(ConfigurationCheck,{name:'isActiveLocation',label:'Enable location',checked:true,onChange:()=>{}}));
 const labelFor=html.match(/<label[^>]*for="([^"]+)"/),input=html.match(/<input[^>]*id="([^"]+)"[^>]*>/);
 assert.ok(labelFor);assert.ok(input);assert.equal(labelFor[1],input[1]);assert.match(input[0],/type="checkbox"/);assert.match(input[0],/name="isActiveLocation"/);assert.match(html,/<label[^>]*>[\s\S]*<input[\s\S]*Enable location[\s\S]*<\/label>/);
});

test('controls inside a tabpanel still reveal below the footer, including oversized textareas',()=>{
 const panel={getAttribute:()=> 'tabpanel'};
 for(const tagName of ['INPUT','SELECT','TEXTAREA']){
  const control={tagName,getAttribute:()=>null,closest:()=>panel,getBoundingClientRect:()=>tagName==='TEXTAREA'?{top:170,bottom:470,height:300}:{top:469,bottom:513,height:44}};
  const main={scrollTop:100,contains:node=>node===control,getBoundingClientRect:()=>({top:150,bottom:378,height:228})};
  scrollTaskControlIntoView(main,control);assert.equal(main.scrollTop,tagName==='TEXTAREA'?112:243);
 }
});
