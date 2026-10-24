import {createServer} from 'vite';
import {createServer as createHttpServer} from 'node:http';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=process.cwd();
const server=await createServer({configFile:false,root,publicDir:resolve(root,'frontend/public'),server:{middlewareMode:true,hmr:false},resolve:{alias:{'/fonts/aleo/aleo.css':resolve(root,'developer-portal/public/fonts/aleo/aleo.css'),'@':resolve(root,'platform-dashboard-shadcn/src'),'react':resolve(root,'node_modules/react'),'react-dom':resolve(root,'node_modules/react-dom')}},plugins:[(await import('@vitejs/plugin-react')).default(),(await import('@tailwindcss/vite')).default(),{name:'palette-gallery',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url?.startsWith('/palette-gallery?')){res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<div id="root"></div><script type="module" src="/tools/qa/approved-palette-gallery.tsx"></script>'));}else next();});}}]});
const http=createHttpServer(server.middlewares); await new Promise(r=>http.listen(0,'127.0.0.1',r));
const port=http.address().port;
const browser=await chromium.launch({headless:true});
const results=[]; const errors=[];
const paths=['frontend/src/vendor/styles.css','platform-dashboard-shadcn/src/index.css','platform-dashboard-shadcn/src/components/ui/button.tsx','platform-dashboard-shadcn/src/components/ui/input.tsx','platform-dashboard-shadcn/src/components/ui/badge.tsx','platform-dashboard-shadcn/src/App.tsx','platform-dashboard-shadcn/src/components/platform-help-center.tsx','platform-dashboard-shadcn/src/components/platform-account-settings.tsx','platform-dashboard-shadcn/src/components/platform-settings-editor.tsx','developer-portal/src/DeveloperPortalPage.css','developer-portal/src/DeveloperWorkspace.css'];
const sourceHashes=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
try{
 for(const surface of ['vendor','platform','developer','customer','marketing']) for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:1000,height:800}});
  page.on('pageerror',e=>{errors.push({surface,theme,error:e.message});console.error(e);}); page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
  await page.goto(`http://127.0.0.1:${port}/palette-gallery?surface=${surface}&theme=${theme}`);
  await page.waitForSelector('html[data-ready=true]',{state:'attached'}); await page.waitForTimeout(500);
  const measurements=await page.evaluate(()=>{
   const cv=document.createElement('canvas'),ctx=cv.getContext('2d');
   function rgba(c){ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);}
   const blend=(a,b)=>[0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3])).concat(1);
   function bg(el){if(!el)return [255,255,255,1];return blend(rgba(getComputedStyle(el).backgroundColor),bg(el.parentElement));}
   const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
   const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
   const text=[],boundaries=[];
   for(const el of document.querySelectorAll('main *')){
    const st=getComputedStyle(el); if(!el.getBoundingClientRect().width||st.visibility==='hidden'||el.closest('[disabled]'))continue;
    if([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())){const back=bg(el),fg=blend(rgba(st.color),back);text.push({tag:el.tagName,text:el.textContent.trim().slice(0,100),ratio:ratio(fg,back),color:st.color,bg:back,font:st.fontSize,weight:st.fontWeight});}
    if(el.matches('input,button')&&parseFloat(st.borderTopWidth)>0){const parent=bg(el.parentElement),back=bg(el),border=blend(rgba(st.borderTopColor),back);boundaries.push({tag:el.tagName,text:el.textContent.slice(0,40),required:el.tagName==='INPUT'||rgba(st.borderTopColor)[3]>0||rgba(st.backgroundColor)[3]>0,ratio:ratio(border,parent),border:st.borderTopColor});}
   }
   return {text,boundaries,snapshot:[...document.querySelectorAll('main,main h1,main p,main button,main input,main a')].map(el=>{const s=getComputedStyle(el);return {tag:el.tagName,color:s.color,bg:s.backgroundColor,border:s.borderColor,font:s.fontFamily,size:s.fontSize};})};
  });
  let isolation=null; if(['customer','marketing'].includes(surface)){ const before=measurements.snapshot; await page.evaluate(async()=>{await import('/frontend/src/vendor/styles.css');}); await page.waitForTimeout(100); const after=await page.evaluate(()=>[...document.querySelectorAll('main,main h1,main p,main button,main input,main a')].map(el=>{const s=getComputedStyle(el);return {tag:el.tagName,color:s.color,bg:s.backgroundColor,border:s.borderColor,font:s.fontFamily,size:s.fontSize};}));isolation={before,after,pass:JSON.stringify(before)===JSON.stringify(after)};}
  const focus=[];
  for(const button of await page.locator('main button,main input,main a').all()) {await button.focus();await page.waitForTimeout(250);focus.push(await button.evaluate(el=>{const s=getComputedStyle(el);const c=document.createElement('canvas'),x=c.getContext('2d');const rgba=v=>{x.clearRect(0,0,1,1);x.fillStyle=v;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v)};const blend=(a,b)=>[0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3])).concat(1);function bg(e){return e?blend(rgba(getComputedStyle(e).backgroundColor),bg(e.parentElement)):[255,255,255,1]};const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const b=bg(el.parentElement),a=blend(rgba(s.outlineColor),b);return {tag:el.tagName,visible:el.matches(':focus-visible'),foreground:s.getPropertyValue('--foreground'),ring:s.getPropertyValue('--ring'),outline:s.outlineColor,width:s.outlineWidth,offset:s.outlineOffset,ratio:(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05)};}));}
  await page.screenshot({path:`output/approved-palette-20261025/${surface}-${theme}.png`,fullPage:true});
  results.push({surface,theme,...measurements,focus,isolation}); await page.close();
 }
 await mkdir('output/approved-palette-20261025',{recursive:true});
 await writeFile('output/approved-palette-20261025/browser-results.json',JSON.stringify({sourceHashes,results,errors},null,2));
 const failures=results.filter(r=>!['customer','marketing'].includes(r.surface)).flatMap(r=>r.text.filter(t=>t.ratio<((parseFloat(t.font)>=24||(parseFloat(t.font)>=18.66&&+t.weight>=700))?3:4.5)).map(t=>({surface:r.surface,theme:r.theme,...t})));
 console.log(JSON.stringify({pages:results.length,errors,failures},null,2)); if(errors.length||failures.length||results.some(r=>r.isolation&&!r.isolation.pass))process.exitCode=1;
}finally{await browser.close();await server.close();await new Promise(r=>http.close(r));}
