const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { publicAuthRequestAllowed } = require('../src/services/publicAuthPolicy');

test('public authentication capability accepts only exact method and normalized paths', () => {
  for (const prefix of ['/api', '/api/v1']) {
    assert.equal(publicAuthRequestAllowed(prefix+'/auth/login', 'POST'), true);
    assert.equal(publicAuthRequestAllowed(prefix+'/auth/register/vendor', 'OPTIONS', 'POST'), true);
    for (const route of ['/auth/login/extra', '/auth/../account', '/auth/%6cogin', '/auth/register/vendor/complete', '/account/bookings', '/platform/users', '/vendor/settings', '/developer/me']) assert.equal(publicAuthRequestAllowed(prefix+route, 'POST'), false, route);
    assert.equal(publicAuthRequestAllowed(prefix+'/auth/login', 'GET'), false);
    assert.equal(publicAuthRequestAllowed(prefix+'/auth/me', 'OPTIONS', 'DELETE'), false);
  }
});

test('actual TypeScript application confines public credentialed auth and retains CSRF checks', () => {
  const script = String.raw`
  const assert=require('node:assert/strict'), Module=require('node:module');
  const load=Module._load; let queries=0;
  Module._load=function(name,...args){
    if(name==='../services/securityRateLimitService')return {consume:async()=>({allowed:true})};
    if(name==='pg')return {Pool:class{async query(){queries++;return {rows:[]};}async end(){}}};
    if(name==='dotenv')return {config(){return {parsed:{}};}};
    return load.call(this,name,...args);
  };
  (async()=>{
    const imported=await import('./src/app.ts'),app=imported.default.default||imported.default;
    const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const request=(route,method='GET',extra={},body)=>new Promise((resolve,reject)=>{
      const req=require('node:http').request({hostname:'127.0.0.1',port:server.address().port,path:route,method,headers:{host:'127.0.0.1:5091',origin:'http://127.0.0.1:5190',...extra}},res=>{let payload='';res.on('data',chunk=>payload+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:payload}));});req.on('error',reject);req.end(body);
    });
    try {
      const js=require('./src/config/env.js'),ts=require('./src/config/env.ts');
      assert.equal(js.publicUniversalAuthEnabled,true); assert.equal(ts.publicUniversalAuthEnabled,true);
      for(const route of ['/api/auth/login','/api/v1/auth/register/customer','/api/auth/register/vendor','/api/auth/mfa/verify']){
        const res=await request(route,'OPTIONS',{'access-control-request-method':'POST','access-control-request-headers':'content-type,x-csrf-token'});
        assert.equal(res.status,204,route);assert.equal(res.headers['access-control-allow-credentials'],'true');assert.equal(res.headers['access-control-allow-origin'],'http://127.0.0.1:5190');
      }
      const queryCount=queries;
      for(const route of ['/api/account/bookings','/api/vendor/settings','/api/platform/users','/api/developer/me','/api/auth/register/vendor/complete']) assert.equal((await request(route,'POST',{'content-type':'application/json'},'{}')).status,403,route);
      assert.equal(queries,queryCount,'private routes never reach data access');
      assert.equal((await request('/api/auth/login','OPTIONS',{'access-control-request-method':'DELETE'})).status,403);
      assert.equal((await request('/api/auth/login','OPTIONS',{origin:'http://127.0.0.1:5199','access-control-request-method':'POST'})).status,403);
      const providers=await request('/api/auth/oauth/providers');assert.equal(providers.status,200);assert.equal(providers.headers['access-control-allow-credentials'],'true');
      for(const body of ['{}','{"surface":"platform"}','{"surface":"https://evil.example"}'])assert.equal((await request('/api/auth/login','POST',{'content-type':'application/json'},body)).status,400);
      assert.equal((await request('/api/auth/register/customer','POST',{'content-type':'application/json'},'{"surface":"vendor"}')).status,400);
      const browser=require('./src/services/browserSessionService'),token=browser.signCsrfToken('offline',js.csrfSecret),cookie='local_surfaces_prio_access=test; local_surfaces_prio_csrf='+token;
      assert.equal((await request('/api/auth/logout','POST',{cookie,'content-type':'application/json'},'{}')).status,403);
      const valid=await request('/api/auth/logout','POST',{cookie,'content-type':'application/json','x-csrf-token':token},'{}');assert.equal(valid.status,401,'valid CSRF reaches existing auth validation for deliberately fake session');
      const cleared=await request('/api/auth/logout','POST',{'content-type':'application/json'},'{}');assert.equal(cleared.status,200);
      for(const value of cleared.headers['set-cookie']) { assert.ok(!/Domain=/i.test(value)); assert.ok(value.startsWith('local_surfaces_prio_')); }
      assert.equal((await request('/api/auth/logout','POST',{cookie,'content-type':'application/json','x-csrf-token':token,'sec-fetch-site':'cross-site'},'{}')).status,403);
      assert.equal((await request('/api/auth/login','POST',{cookie,'content-type':'application/json'},'{}')).status,400,'pre-auth login retains bounded exception');
    }finally{await new Promise(resolve=>server.close(resolve));await require('./src/config/db.js').pool.end();}
  })().catch(error=>{console.error(error);process.exitCode=1;});`;
  const result=spawnSync(process.execPath,['--import','tsx','-e',script],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:30000,env:{...process.env,NODE_ENV:'test',PUBLIC_UNIVERSAL_AUTH_ENABLED:'1',TURNSTILE_SECRET_KEY:'',PORT:'5091',DATABASE_URL:'postgresql://test:test@127.0.0.1:1/getprio_local_pool_demo_surfaces_core_offline',CLIENT_URL:'http://127.0.0.1:5191',APP_BASE_URL:'http://127.0.0.1:5191',CUSTOMER_APP_URL:'http://127.0.0.1:5191',VENDOR_APP_URL:'http://127.0.0.1:5192',MARKETING_URL:'http://127.0.0.1:5190',PLATFORM_DASHBOARD_URL:'http://127.0.0.1:5193',DEVELOPER_PORTAL_URL:'http://127.0.0.1:5194',LOCAL_API_PROFILE:'core',LOCAL_API_ORIGIN:'http://127.0.0.1:5091',API_ENVIRONMENT:'production',LOCAL_BROWSER_COOKIE_PREFIX:'local_surfaces',AUTH_COOKIE_SECURE:'false',JWT_SECRET:'j'.repeat(40),CSRF_SECRET:'c'.repeat(40),LOCAL_POOL_DEMO_ENABLED:'0'}});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
