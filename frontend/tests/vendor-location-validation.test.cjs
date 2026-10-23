require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {validateLocationEditor}=require('../src/vendor/locationEditorValidation.ts');
test('first invalid field opens its own tab before focus and browser feedback',()=>{
 const previous=global.window,frames=[],actions=[];
 global.window={requestAnimationFrame(fn){frames.push(fn);}};
 const field=tab=>({willValidate:true,validity:{valid:false},isConnected:true,closest(){return {dataset:{locationTab:tab}};},focus(){actions.push('focus:'+tab);},reportValidity(){actions.push('report:'+tab);}});
 try{
  assert.equal(validateLocationEditor({elements:[{willValidate:false},field('general'),field('payments')]},tab=>actions.push('tab:'+tab)),false);
  assert.deepEqual(actions,['tab:general']);frames[0]();assert.deepEqual(actions,['tab:general','focus:general','report:general']);
 }finally{global.window=previous;}
});
test('valid forms proceed and departed invalid fields are never focused',()=>{
 const previous=global.window,frames=[];global.window={requestAnimationFrame(fn){frames.push(fn);}};
 try{
  assert.equal(validateLocationEditor({elements:[{willValidate:true,validity:{valid:true}}]},()=>assert.fail()),true);
  assert.equal(frames.length,0);
  const field={willValidate:true,validity:{valid:false},isConnected:false,closest(){return null;},focus(){assert.fail();}};
  assert.equal(validateLocationEditor({elements:[field]},()=>assert.fail()),false);frames[0]();
 }finally{global.window=previous;}
});
