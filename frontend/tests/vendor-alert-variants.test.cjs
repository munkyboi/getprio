require('tsx/cjs');
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {Alert,AlertDescription}=require('../src/vendor/components/ui/alert.tsx');
const {IconInfoCircle,IconCircleCheck,IconAlertTriangle,IconAlertCircle}=require('@tabler/icons-react');
const examples=[['info',IconInfoCircle,'Services remain within their selected service.'],['success',IconCircleCheck,'The server confirmed your changes.'],['warning',IconAlertTriangle,'Review the details before continuing.'],['error',IconAlertCircle,'The request could not be saved.']];
test('semantic alerts render readable meaning and retain caller-controlled announcement behavior',()=>{
 for(const [variant,Icon,text] of examples){
  const html=renderToStaticMarkup(React.createElement(Alert,{variant},React.createElement(Icon,{'aria-hidden':true}),React.createElement(AlertDescription,null,text)));
  assert.match(html,new RegExp(`role="${variant==='error'?'alert':'status'}"`));
  assert.ok(html.includes(text));assert.match(html,/aria-hidden="true"/);
 }
 for(const variant of ['default','destructive']) assert.match(renderToStaticMarkup(React.createElement(Alert,{variant},'Existing message')),/role="alert"/);
 assert.match(renderToStaticMarkup(React.createElement(Alert,{variant:'destructive',role:'region','aria-label':'Queue auto-close status'},'Existing status')),/role="region"/);
 assert.match(renderToStaticMarkup(React.createElement(Alert,{variant:'info',role:'note'},'Static guidance')),/role="note"/);
});
test('semantic alert text and icons exceed normal-text contrast on mild surfaces in both themes',()=>{
 const css=fs.readFileSync(require('node:path').join(__dirname,'../src/vendor/styles.css'),'utf8');
 const light=css.match(/\.vendor-workspace \{([\s\S]*?)\n\}/)[1], dark=css.match(/\.vendor-workspace\[data-vendor-theme=dark\] \{([\s\S]*?)\n\}/)[1];
 const token=(scope,name)=>scope.match(new RegExp(`--${name}: (#[a-fA-F0-9]{6})`))?.[1];
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 const lum=c=>c.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[0.2126,0.7152,0.0722][i],0);
 for(const [theme,scope] of [['light',light],['dark',dark]])for(const tone of ['info','success','warning','error']){
  const fg=rgb(token(scope,tone==='error'?'destructive':tone)),bg=rgb(token(scope,'background'));
  const surface=fg.map((v,i)=>v*.07+bg[i]*.93),a=lum(fg),b=lum(surface),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  assert.ok(ratio>=4.5,`${theme} ${tone}: ${ratio}`);
 }
});
test('vendor toasts retain Base UI stacked geometry above dialogs',()=>{
 const css=fs.readFileSync(require('node:path').join(__dirname,'../src/vendor/styles.css'),'utf8');
 assert.match(css,/vendor-toast-viewport \{ z-index: 1400;/);
 assert.match(css,/vendor-toast-viewport \{[^}]*bottom: max\(16px, env\(safe-area-inset-bottom\)\)/);
 assert.match(css,/vendor-toast-viewport \{[^}]*right: max\(16px, env\(safe-area-inset-right\)\)/);
 assert.match(css,/vendor-toast \{ pointer-events: auto;/);
 assert.doesNotMatch(css,/vendor-toast \{ position: relative; inset: auto; transform: none;/);
 assert.doesNotMatch(css,/vendor-toast-viewport \{[^}]*display: flex; flex-direction: column;/);
 const toast=fs.readFileSync(require('node:path').join(__dirname,'../src/vendor/components/ui/toast.tsx'),'utf8');
 assert.match(toast,/data-expanded/);
 assert.match(toast,/data-behind/);
 assert.match(toast,/ToastClose/);
});
