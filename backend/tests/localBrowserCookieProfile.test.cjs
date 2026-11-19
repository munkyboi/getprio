const test=require('node:test');const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');
const {localBrowserCookiePrefix}=require('../src/services/localBrowserCookieProfile');
const profile={NODE_ENV:'test',LOCAL_API_PROFILE:'core',LOCAL_API_ORIGIN:'http://127.0.0.1:5091',AUTH_COOKIE_SECURE:'false',LOCAL_BROWSER_COOKIE_PREFIX:'split_preview'};
test('default cookie names stay unchanged and local override fails closed',()=>{
 assert.equal(localBrowserCookiePrefix({}), '');assert.equal(localBrowserCookiePrefix(profile),'split_preview_');
 for(const patch of [{NODE_ENV:'production'},{LOCAL_API_PROFILE:'sandbox'},{LOCAL_API_ORIGIN:'https://api.getprio.online'},{LOCAL_API_ORIGIN:'http://evil.example:5091'},{AUTH_COOKIE_SECURE:'true'},{LOCAL_BROWSER_COOKIE_PREFIX:'bad;name'}]) assert.throws(()=>localBrowserCookiePrefix({...profile,...patch}));
});
test('local namespace issues, restores and clears only new cookies; old cookies cannot authenticate or pass CSRF',()=>{
 const script=`const a=require('./backend/src/services/browserSessionService');const {createCsrfProtection}=require('./backend/src/middleware/csrfProtection');
 const headers=[];const res={append(k,v){headers.push(v);}};const result={session:{_id:'test-session',expiresAt:new Date(Date.now()+600000)},accessToken:'test-access',refreshToken:'test-refresh'};
 const {csrfToken}=a.issueBrowserSession(res,result,{secure:false,csrfSecret:'unit-secret'});
 const names=a.getSessionCookieNames(false);const developer=a.getSessionCookieNames(false,'developer');
 const newCookie=headers.map(x=>x.split(';')[0]).join('; ');const oldCookie='prio_access=old;prio_refresh=old;prio_csrf=old';
 const checks=[];const guard=createCsrfProtection({allowedOrigins:new Set(['http://127.0.0.1:5192']),csrfSecret:'unit-secret',authCookieSecure:false});
 for(const [cookie,token,origin] of [[newCookie,csrfToken,'http://127.0.0.1:5192'],[newCookie,'old','http://127.0.0.1:5192'],[newCookie,csrfToken,'http://evil.example']]) {let code=null;guard({method:'PATCH',originalUrl:'/api/vendor/settings',headers:{cookie,'x-csrf-token':token,origin,'content-type':'application/json','sec-fetch-site':'same-site'}},{},e=>{code=e?.code||null});checks.push(code);}
 const oldAccess=a.getAccessCookie(a.parseCookies(oldCookie),false);const cleared=[];a.clearBrowserSession({append(k,v){cleared.push(v)}},{secure:false});
 process.stdout.write(JSON.stringify({names,developer,csrf:a.CSRF_COOKIE,oldAccess,checks,issued:headers.map(x=>x.split('=')[0]),cleared:cleared.map(x=>x.split('=')[0]),noDomain:headers.every(x=>!x.includes('Domain=')),httpOnly:headers.slice(0,2).every(x=>x.includes('HttpOnly'))}));`;
 const run=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').resolve(__dirname,'../..'),env:{...process.env,...profile},encoding:'utf8'});assert.equal(run.status,0,run.stderr);const data=JSON.parse(run.stdout);
 assert.deepEqual(data.names,{access:'split_preview_prio_access',refresh:'split_preview_prio_refresh'});assert.equal(data.developer.access,'split_preview_prio_developer_access');assert.equal(data.csrf,'split_preview_prio_csrf');assert.equal(data.oldAccess,null);assert.deepEqual(data.checks,[null,'CSRF_VALIDATION_FAILED','CSRF_VALIDATION_FAILED']);assert.deepEqual(data.issued,data.cleared);assert.ok(data.issued.every(name=>name.startsWith('split_preview_')));assert.ok(data.noDomain);assert.ok(data.httpOnly);
});
