const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), vm = require('node:vm');
const { buildSync } = require('esbuild');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const entry = buildSync({entryPoints:[path.resolve(__dirname,'../src/marketing/PasswordField.tsx')],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',alias:{'@vendor':path.resolve(__dirname,'../src/vendor')},jsx:'automatic'});
const moduleObject={exports:{}};
vm.runInNewContext(entry.outputFiles[0].text,{module:moduleObject,exports:moduleObject.exports,require});
test('password control renders one inset accessible non-submit action and preserves password-manager metadata',()=>{
  const Field=moduleObject.exports.default;
  for(const autoComplete of ['current-password','new-password']){
    const html=renderToStaticMarkup(React.createElement(Field,{name:'password',id:'password',autoComplete,required:true,defaultValue:'Fixture-password'}));
    assert.match(html,/data-slot="input-group"/);
    assert.match(html,/data-align="inline-end"/);
    assert.match(html,/type="password"/);
    assert.match(html,/name="password"/);
    assert.match(html,new RegExp('autoComplete="'+autoComplete+'"','i'));
    assert.match(html,/value="Fixture-password"/);
    assert.match(html,/aria-label="Show password"/);
    assert.match(html,/type="button"/);
    assert.equal((html.match(/<button\b/g)||[]).length,1);
  }
});
