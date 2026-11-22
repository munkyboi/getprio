const test = require('node:test');
const assert = require('node:assert/strict');
const { origin, surfaceOrigins, browserAllowedOrigins, authSurface, safeReturnPath } = require('../src/services/browserSurfaceUrls');
const { resolveDeveloperApiEnvironment, localApiRequestGuard } = require('../src/services/developerApiEnvironment');
const config = { nodeEnv: 'development', clientUrl: 'http://127.0.0.1:5191', appBaseUrl: 'http://127.0.0.1:5191', customerAppUrl: 'http://127.0.0.1:5191', vendorAppUrl: 'http://127.0.0.1:5192', marketingUrl: 'http://127.0.0.1:5190', platformDashboardUrl: 'http://127.0.0.1:5193', developerPortalUrl: 'http://127.0.0.1:5194' };
test('purpose origins and exact browser CORS exclude marketing and unconfigured ports', () => {
  assert.equal(surfaceOrigins(config).vendor, 'http://127.0.0.1:5192');
  const allowed = browserAllowedOrigins(config);
  for (const port of [5191,5192,5193,5194]) for (const host of ['localhost','127.0.0.1']) assert.ok(allowed.has(`http://${host}:${port}`));
  assert.ok(!allowed.has('http://127.0.0.1:5190'));
  assert.ok(!allowed.has('http://127.0.0.1:5195'));
  assert.ok(!allowed.has('https://evil.example'));
  const prod = browserAllowedOrigins({...config, nodeEnv:'production', vendorAppUrl:'https://vendor.getprio.online:443'});
  assert.ok(!prod.has('https://localhost:443'));
});
test('reject malformed configured origins and dangerous auth return paths', () => {
  for (const url of ['https://user:pass@example.com','https://example.com/path','https://example.com?next=x','http://example.com','javascript:alert(1)']) assert.throws(()=>origin(url));
  assert.equal(safeReturnPath('/account/bookings/4?q=50%25#details','customer'),'/account/bookings/4?q=50%25#details');
  assert.equal(safeReturnPath('/dashboard/queue?boardPairing=ABC#today','vendor'),'/dashboard/queue?boardPairing=ABC#today');
  for (const path of ['//evil.example','https://evil.example','/account/../dashboard','/account/%252e%252e/dashboard','/account/%255c%255cevil','/account/%252f%252fevil','/account/\nfoo']) assert.equal(safeReturnPath(path,'customer'),null,path);
  assert.equal(safeReturnPath('/dashboard','customer'),null);
  assert.equal(authSurface(undefined,'register_vendor'),'vendor');
  assert.throws(()=>authSurface('https://evil.example'));
});
const local = { nodeEnv:'development', localApiProfile:'core', apiEnvironment:'production', localApiOrigin:'http://127.0.0.1:5091' };
const req = host => ({headers:{host},hostname:'sandbox-api.getprio.online'});
test('local developer environment is explicit runtime plus exact authority, not forwarded host',()=>{
  assert.equal(resolveDeveloperApiEnvironment(req('127.0.0.1:5091'),local),'production');
  assert.equal(resolveDeveloperApiEnvironment(req('localhost:5091'),local),'production');
  for (const host of ['127.0.0.1:5092','evil.example:5091','api.getprio.online','sandbox-api.getprio.online','localhost','localhost:5091@evil.example']) assert.equal(resolveDeveloperApiEnvironment(req(host),local),'unknown',host);
  assert.equal(resolveDeveloperApiEnvironment({...req('evil.example'),headers:{host:'evil.example','x-forwarded-host':'127.0.0.1:5091'}},local),'unknown');
  assert.equal(resolveDeveloperApiEnvironment(req('127.0.0.1:5091'),{...local,nodeEnv:'production'}),'unknown');
  assert.equal(resolveDeveloperApiEnvironment(req('127.0.0.1:5091'),{...local,apiEnvironment:'sandbox'}),'unknown');
  const sandbox={...local,localApiProfile:'sandbox',apiEnvironment:'sandbox',localApiOrigin:'http://localhost:5092'};
  assert.equal(resolveDeveloperApiEnvironment(req('127.0.0.1:5092'),sandbox),'sandbox');
});
test('nonlocal production and sandbox hosts must agree with runtime environment',()=>{
  assert.equal(resolveDeveloperApiEnvironment(req('api.getprio.online'),{apiEnvironment:'production'}),'production');
  assert.equal(resolveDeveloperApiEnvironment(req('sandbox-api.getprio.online'),{apiEnvironment:'production'}),'unknown');
  assert.equal(resolveDeveloperApiEnvironment(req('sandbox-api.getprio.online'),{apiEnvironment:'sandbox'}),'sandbox');
  assert.equal(resolveDeveloperApiEnvironment(req('api.getprio.online'),{apiEnvironment:'sandbox'}),'unknown');
});
test('sandbox permits only key API and health; rejects all browser auth before session cookies',()=>{
  const guard=localApiRequestGuard({...local,localApiProfile:'sandbox',apiEnvironment:'sandbox',localApiOrigin:'http://127.0.0.1:5092'});
  function run(path,host='127.0.0.1:5092') {let next=false,status; const res={status(n){status=n;return this;},json(body){this.body=body;}}; guard({...req(host),originalUrl:path},res,()=>{next=true;});return {next,status};}
  for(const path of ['/v1/queues','/v1/openapi.json','/api/health']) assert.equal(run(path).next,true,path);
  for(const path of ['/api/auth/login','/api/v1/auth/login','/api/platform/users','/api/developer/login','/api/mobile/auth/login','/v10/queues']) assert.equal(run(path).status,404,path);
  assert.equal(run('/v1/queues','127.0.0.1:5091').status,421);
});

test('distinct marketing receives public CORS only; private reads/writes and wrong preflights deny',async()=>{
 const express=require('express'),cors=require('cors');const {createBrowserCorsMiddleware}=require('../src/services/browserSurfaceUrls');
 const app=express();app.use(createBrowserCorsMiddleware(config,cors));app.use((req,res)=>res.json({ok:true}));app.use((error,req,res,next)=>res.status(error.statusCode||500).json({message:error.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const [method,path,preflight,status] of [['GET','/api/billing/plans',null,200],['GET','/api/public/help-center',null,200],['POST','/api/public/enterprise-inquiries',null,200],['OPTIONS','/api/public/enterprise-inquiries','POST',204],['GET','/api/auth/me',null,403],['POST','/api/auth/login',null,403],['PATCH','/api/vendor/settings',null,403],['OPTIONS','/api/billing/plans','DELETE',403],['POST','/api/public/help-center',null,403]]){
   const response=await fetch(base+path,{method,headers:{Origin:config.marketingUrl,...(preflight?{'Access-Control-Request-Method':preflight}:{})}});assert.equal(response.status,status,`${method} ${path}`);if(status<400){assert.equal(response.headers.get('access-control-allow-origin'),config.marketingUrl);assert.equal(response.headers.get('access-control-allow-credentials'),null);}
  }
  const vendor=await fetch(base+'/api/auth/me',{headers:{Origin:config.vendorAppUrl}});assert.equal(vendor.headers.get('access-control-allow-credentials'),'true');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('legacy shared marketing/client origin retains its existing authenticated CORS policy',()=>{
 const {createBrowserCorsMiddleware}=require('../src/services/browserSurfaceUrls');const configs=[];const cors=options=>{configs.push(options);return(req,res,next)=>next();};
 const middleware=createBrowserCorsMiddleware({...config,marketingUrl:config.clientUrl},cors);let next=false;middleware({method:'GET',url:'/api/auth/me',headers:{origin:config.clientUrl}},{},()=>next=true);assert.equal(next,true);assert.equal(configs[0].credentials,true);
});
test('Apple form-post callback accepts only Apple origin on the callback route', async()=>{
 const express=require('express'),cors=require('cors');const {createBrowserCorsMiddleware}=require('../src/services/browserSurfaceUrls');
 const app=express();app.use(createBrowserCorsMiddleware(config,cors));app.post('/api/auth/oauth/apple/callback',(req,res)=>res.sendStatus(204));app.use((error,req,res,next)=>res.status(error.statusCode||500).json({message:error.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}`;
 try {
  const apple=await fetch(base+'/api/auth/oauth/apple/callback',{method:'POST',headers:{Origin:'https://appleid.apple.com'}});
  assert.equal(apple.status,204);assert.equal(apple.headers.get('access-control-allow-origin'),'https://appleid.apple.com');
  const rejected=await fetch(base+'/api/auth/oauth/apple/callback',{method:'POST',headers:{Origin:'https://evil.example'}});
  assert.equal(rejected.status,403);
 } finally { await new Promise(resolve=>server.close(resolve)); }
});
test('local Vendor pairing and Marketing aliases remain scoped to their own configured port',()=>{
 const {surfaceOriginSet}=require('../src/services/browserSurfaceUrls');const vendor=surfaceOriginSet(config,'vendor');assert.ok(vendor.has('http://localhost:5192'));assert.ok(!vendor.has(config.customerAppUrl));assert.ok(!vendor.has('http://evil.example:5192'));
 const marketing=surfaceOriginSet(config,'marketing');assert.ok(marketing.has('http://localhost:5190'));assert.ok(!marketing.has('http://localhost:5191'));
});
test('OAuth can retain explicit Vendor onboarding without widening ordinary Vendor return paths',()=>{
 assert.equal(safeReturnPath('/register/vendor?oauth=google','vendor'),null);
 assert.equal(safeReturnPath('/register/vendor?oauth=google','vendor',{allowOnboarding:true}),'/register/vendor?oauth=google');
 assert.equal(safeReturnPath('/register/customer','vendor',{allowOnboarding:true}),null);
});
