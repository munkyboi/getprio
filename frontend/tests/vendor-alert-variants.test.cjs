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
test('semantic alert text exceeds normal-text contrast on actual mild surfaces in both themes', {skip:process.env.GETPRIO_PALETTE_BROWSER_EVIDENCE!=='1'},()=>{
 const evidence=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../../output/approved-palette-20261025/browser-results.json'),'utf8'));
 for(const theme of ['light','dark']){
  const page=evidence.results.find(p=>p.surface==='vendor'&&p.theme===theme);
  for(const tone of ['info','success','warning','error']){
   const text=page.text.find(t=>t.text===`${tone} alert message`);
   assert.ok(text,`${theme} ${tone} rendered`);assert.ok(text.ratio>=4.5,`${theme} ${tone}: ${text.ratio}`);
  }
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
