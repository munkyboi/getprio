const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('actual tsx app keeps guarded JS and TypeScript purpose origins and middleware aligned', () => {
 const script = String.raw`
 const assert=require('node:assert/strict'),Module=require('node:module');
 const load=Module._load;let overrides=0,queries=0;
 Module._load=function(name,...args){if(name==='../repositories/platformHelpCenter')return {getPublished:async()=>({topics:[],articles:[],faqs:[]})};if(name==='pg')return {Pool:class{async query(){queries++;return {rows:[]};}async end(){}}};if(name==='dotenv')return {config(options){if(options?.override){overrides++;process.env.VENDOR_APP_URL='https://override.invalid';}return {parsed:{}};}};return load.call(this,name,...args);};
 (async()=>{
 const js=require('./src/config/env.js');
 const application=await import('./src/app.ts');const app=application.default.default||application.default;
 const imported=await import('./src/config/env.ts');const ts=imported.default.default||imported.default;
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 // This ephemeral unit-test transport supplies the configured API authority; no existing API listener is contacted.
 const request=(route,origin,options={})=>new Promise((resolve,reject)=>{const request=require('node:http').request(base+route,{method:options.method||'GET',headers:{host:'127.0.0.1:5091',Origin:origin,...options.headers}},response=>{response.resume();response.on('end',()=>resolve({status:response.statusCode,headers:{get:name=>response.headers[name.toLowerCase()]||null}}));});request.on('error',reject);request.end(options.body);});
 try{
 for(const origin of ['http://127.0.0.1:5191','http://127.0.0.1:5192','http://localhost:5192','http://127.0.0.1:5193']){
  const pre=await request('/api/auth/login',origin,{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST'}});
  assert.equal(pre.status,204,origin);assert.equal(pre.headers.get('access-control-allow-origin'),origin);assert.equal(pre.headers.get('access-control-allow-credentials'),'true');
  const get=await request('/api/health',origin);assert.equal(get.status,200,origin);assert.equal(get.headers.get('access-control-allow-origin'),origin);
 }
 assert.equal(ts.vendorAppUrl,'http://127.0.0.1:5192','actual TS config must contain guarded Vendor origin');
 for(const key of ['customerAppUrl','vendorAppUrl','marketingUrl','localApiProfile','localApiOrigin']){assert.equal(ts[key],js[key],key);assert.equal(require('./src/config/env.ts')[key],js[key],'named '+key);}
 assert.equal(overrides,0,'explicit local profile must not load overriding .env.local');
 const publicGet=await request('/api/public/help-center','http://127.0.0.1:5190');assert.equal(publicGet.status,200);assert.equal(publicGet.headers.get('access-control-allow-origin'),'http://127.0.0.1:5190');assert.equal(publicGet.headers.get('access-control-allow-credentials'),null);
 const publicPost=await request('/api/public/enterprise-inquiries','http://127.0.0.1:5190',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(publicPost.status,400,'public POST reaches field validation');assert.equal(publicPost.headers.get('access-control-allow-credentials'),null);
 const priorQueries=queries;const logout=await request('/api/auth/logout','http://127.0.0.1:5192',{method:'POST',headers:{cookie:'prio_access=old-human-session; prio_refresh=old-human-refresh','content-type':'application/json'},body:'{}'});assert.equal(logout.status,200);assert.equal(queries,priorQueries,'old cookie names must not trigger session lookup');const cleared=logout.headers.get('set-cookie');assert.equal(cleared.length,3);for(const name of ['access','refresh','csrf'])assert.ok(cleared.some(value=>value.startsWith('local_surfaces_prio_'+name+'=')));assert.ok(!cleared.some(value=>value.startsWith('prio_')));
 const browser=require('./src/services/browserSessionService.js'),token=browser.signCsrfToken('offline-session',js.csrfSecret),cookie='local_surfaces_prio_access=test; local_surfaces_prio_csrf='+token;
 const valid=await request('/api/offline-missing','http://127.0.0.1:5192',{method:'POST',headers:{cookie,'content-type':'application/json','x-csrf-token':token},body:'{}'});assert.equal(valid.status,404,'valid Vendor CSRF reaches routing');
 const invalid=await request('/api/offline-missing','http://127.0.0.1:5192',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'});assert.equal(invalid.status,403);
 assert.equal((await request('/api/auth/me','http://127.0.0.1:5190')).status,401);
 assert.equal((await request('/api/auth/login','http://127.0.0.1:5190',{method:'POST'})).status,403);
 const pre=await request('/api/public/enterprise-inquiries','http://127.0.0.1:5190',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST'}});assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),'http://127.0.0.1:5190');assert.equal(pre.headers.get('access-control-allow-credentials'),null);
 assert.equal((await request('/api/health','http://127.0.0.1:5199')).status,403);
 }finally{await new Promise(resolve=>server.close(resolve));await require('./src/config/db.js').pool.end();}
 })().catch(error=>{console.error(error);process.exitCode=1;});`;
 const result=spawnSync(process.execPath,['--import','tsx','-e',script],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:30000,env:{...process.env,NODE_ENV:'test',TURNSTILE_SECRET_KEY:'',PORT:'5091',DATABASE_URL:'postgresql://test:test@127.0.0.1:1/getprio_local_pool_demo_surfaces_core_offline',CLIENT_URL:'http://127.0.0.1:5191',APP_BASE_URL:'http://127.0.0.1:5191',CUSTOMER_APP_URL:'http://127.0.0.1:5191',VENDOR_APP_URL:'http://127.0.0.1:5192',MARKETING_URL:'http://127.0.0.1:5190',PLATFORM_DASHBOARD_URL:'http://127.0.0.1:5193',DEVELOPER_PORTAL_URL:'http://127.0.0.1:5194',LOCAL_API_PROFILE:'core',LOCAL_API_ORIGIN:'http://127.0.0.1:5091',API_ENVIRONMENT:'production',LOCAL_BROWSER_COOKIE_PREFIX:'local_surfaces',AUTH_COOKIE_SECURE:'false',JWT_SECRET:'j'.repeat(40),CSRF_SECRET:'c'.repeat(40),LOCAL_POOL_DEMO_ENABLED:'0'}});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});

 test('actual tsx Sandbox app rejects browser routes and mismatched API authority without Set-Cookie',()=>{
 const script=String.raw`
 const assert=require('node:assert/strict'),Module=require('node:module');const load=Module._load;Module._load=function(name,...args){if(name==='dotenv')return {config(){return {parsed:{}};}};return load.call(this,name,...args);};
 (async()=>{const js=require('./src/config/env.js');const imported=await import('./src/app.ts');const app=imported.default.default||imported.default;const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const request=(route,host)=>new Promise((resolve,reject)=>{const req=require('node:http').request({hostname:'127.0.0.1',port:server.address().port,path:route,headers:{host}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,cookie:res.headers['set-cookie']}));});req.on('error',reject);req.end();});
 try{for(const route of ['/api/auth/login','/api/auth/csrf','/api/platform/users','/api/developer/me']){const res=await request(route,'127.0.0.1:5092');assert.equal(res.status,404,route);assert.equal(res.cookie,undefined);}const bad=await request('/api/health','127.0.0.1:5091');assert.equal(bad.status,421);assert.equal(bad.cookie,undefined);assert.equal((await request('/api/health','127.0.0.1:5092')).status,200);}finally{await new Promise(resolve=>server.close(resolve));await require('./src/config/db.js').pool.end();}})().catch(error=>{console.error(error);process.exitCode=1;});`;
 const result=spawnSync(process.execPath,['--import','tsx','-e',script],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:30000,env:{...process.env,NODE_ENV:'test',PORT:'5092',DATABASE_URL:'postgresql://test:test@127.0.0.1:1/getprio_local_pool_demo_surfaces_sandbox_offline',LOCAL_API_PROFILE:'sandbox',LOCAL_API_ORIGIN:'http://127.0.0.1:5092',API_ENVIRONMENT:'sandbox',LOCAL_BROWSER_COOKIE_PREFIX:'',LOCAL_POOL_DEMO_ENABLED:'0'}});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});

test('legacy configuration retains worktree overrides without explicit local profile',()=>{
 const script=String.raw`const assert=require('node:assert/strict'),Module=require('node:module');let overrides=0;const load=Module._load;Module._load=function(name,...args){if(name==='dotenv')return {config(options){if(options?.override){overrides++;process.env.CLIENT_URL='https://legacy-override.invalid';}return {parsed:{}};}};return load.call(this,name,...args);};const js=require('./src/config/env.js');const ts=require('./src/config/env.ts');assert.ok(overrides>=2);assert.equal(js.clientUrl,'https://legacy-override.invalid');assert.equal(ts.default.clientUrl,js.clientUrl);assert.equal(js.localApiProfile,'');assert.equal(ts.localApiProfile,'');assert.equal(js.nodeEnv,'production');assert.equal(ts.nodeEnv,'production');`;
 const result=spawnSync(process.execPath,['--import','tsx','-e',script],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:30000,env:{...process.env,NODE_ENV:'production',DEVELOPER_WEBHOOK_ENCRYPTION_KEY:'w'.repeat(64),APP_BASE_URL:'https://app.example.test',MOBILE_QR_BASE_URL:'https://app.example.test',LOCAL_API_PROFILE:'',LOCAL_BROWSER_COOKIE_PREFIX:''}});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});

test('plain CommonJS configuration has the same guarded purpose fields and rejects overriding local files',()=>{
 const script=String.raw`const assert=require('node:assert/strict'),Module=require('node:module');let overrides=0;const load=Module._load;Module._load=function(name,...args){if(name==='dotenv')return {config(options){if(options?.override){overrides++;process.env.VENDOR_APP_URL='https://override.invalid';}return {parsed:{}};}};return load.call(this,name,...args);};const js=require('./src/config/env.js');assert.equal(overrides,0);for(const [key,value]of Object.entries({vendorAppUrl:'http://127.0.0.1:5192',customerAppUrl:'http://127.0.0.1:5191',marketingUrl:'http://127.0.0.1:5190',localApiProfile:'core',localApiOrigin:'http://127.0.0.1:5091'}))assert.equal(js[key],value,key);`;
 const result=spawnSync(process.execPath,['-e',script],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:30000,env:{...process.env,NODE_ENV:'test',LOCAL_API_PROFILE:'core',LOCAL_API_ORIGIN:'http://127.0.0.1:5091',VENDOR_APP_URL:'http://127.0.0.1:5192',CUSTOMER_APP_URL:'http://127.0.0.1:5191',MARKETING_URL:'http://127.0.0.1:5190'}});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
