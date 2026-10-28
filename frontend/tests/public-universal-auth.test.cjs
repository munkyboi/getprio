const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),vm=require('node:vm');
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{MemoryRouter}=require('react-router-dom');
const env={VITE_PUBLIC_UNIVERSAL_AUTH:'1',VITE_LOCAL_SURFACES:'1',VITE_APP_SURFACE:'marketing',VITE_API_URL:'http://127.0.0.1:5091/api',VITE_MARKETING_URL:'http://127.0.0.1:5190',VITE_CUSTOMER_APP_URL:'http://127.0.0.1:5191',VITE_VENDOR_APP_URL:'http://127.0.0.1:5192',VITE_PLATFORM_DASHBOARD_URL:'http://127.0.0.1:5193',VITE_DEVELOPER_PORTAL_URL:'http://127.0.0.1:5194'};
function load(file,extra={},globals={}){
 const result=buildSync({entryPoints:[path.resolve(__dirname,'../src',file)],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},define:{'import.meta.env':JSON.stringify({...env,...extra})},jsx:'automatic'}),mod={exports:{}};
 vm.runInNewContext(result.outputFiles[0].text,{module:mod,exports:mod.exports,require:require('node:module').createRequire(path.resolve(__dirname,'../src',file)),URL,URLSearchParams,console,...globals});return mod.exports;
}
test('universal transport cannot credential private APIs and ordinary marketing remains anonymous',async()=>{
 const requests=[],client=load('api/client.ts',{}, {fetch:async(url,options)=>{requests.push({url,options});return{ok:true,status:200,json:async()=>({})};},window:{location:{hostname:'127.0.0.1'},sessionStorage:{getItem:()=> 'csrf',setItem(){}}}});
 await client.publicAuthRequest('/auth/login',{method:'POST',body:{identifier:'test',password:'test'}});assert.equal(requests[0].options.credentials,'include');assert.equal(requests[0].options.headers['X-CSRF-Token'],'csrf');
 for(const target of ['/account/bookings','/auth/login/extra','/auth/register/vendor/complete','https://evil.example'])await assert.rejects(client.publicAuthRequest(target,{method:'POST'}));
 await client.apiRequest('/billing/plans');assert.equal(requests[1].options.credentials,'omit');
 const disabled=load('api/client.ts',{VITE_PUBLIC_UNIVERSAL_AUTH:'0'});await assert.rejects(disabled.publicAuthRequest('/auth/login',{method:'POST'}));
});
test('browser and server auth capability lists stay identical for every advertised action',()=>{
 const {publicAuthRequestAllowed}=require('../../backend/src/services/publicAuthPolicy');
 const {publicAuthPathAllowed,PUBLIC_AUTH_ENDPOINTS}=load('../../shared/publicAuthPolicy.ts');
 const paths=new Set([...Object.values(PUBLIC_AUTH_ENDPOINTS).flat(),'/auth/password-reset/confirm','/auth/register/vendor/complete','/account/bookings','/developer/me']);
 for(const method of ['GET','POST','PUT','PATCH','DELETE'])for(const path of paths)assert.equal(publicAuthPathAllowed(path,method),publicAuthRequestAllowed('/api'+path,method),method+' '+path);
});
test('destination depends on selected app and real membership; rejects hostile and cross-app next',()=>{
 const {authDestination}=load('pages/UniversalAuthPage.tsx');
 const user={name:'Example',tenants:[{isActive:true}],mfaRequired:false,mfaEnabled:false};
 assert.equal(authDestination('customer',user,'/dashboard'),'http://127.0.0.1:5191/account/dashboard');
 assert.equal(authDestination('vendor',{...user,tenants:[]},'/dashboard'),null);
 assert.equal(authDestination('vendor',user,'//evil.example'),'http://127.0.0.1:5192/dashboard');
 assert.equal(authDestination('customer',user,'/account/bookings?q=50%25#details'),'http://127.0.0.1:5191/account/bookings?q=50%25#details');
 assert.equal(authDestination('vendor',{...user,mfaRequired:true},'/dashboard/queue'),'http://127.0.0.1:5192/dashboard/account');
});
test('compatibility forwarding carries allowlisted intent and relative return only',()=>{
 const {publicAuthEntry}=load('surfaces/PublicAuthRedirect.tsx');
 const url=new URL(publicAuthEntry('customer','register','?app=vendor&next=%2Faccount%2Fbookings%3Fx%3D1%23details&token=secret&email=private'));
 assert.equal(url.origin,'http://127.0.0.1:5190');assert.equal(url.pathname,'/register');assert.equal(url.searchParams.get('app'),'customer');assert.equal(url.searchParams.get('next'),'/account/bookings?x=1#details');assert.equal(url.searchParams.has('token'),false);assert.equal(url.searchParams.has('email'),false);
});
test('public login and registration render complete selected forms and accessible tabs',()=>{
 const Page=load('pages/UniversalAuthPage.tsx').default;
 for(const route of ['/login?app=customer','/login?app=vendor','/register?app=customer','/register?app=vendor']){
  const html=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[route]},React.createElement(Page)));
  assert.ok(html.includes('role="tablist"'));assert.ok(html.includes('role="tabpanel"'));assert.ok(html.includes('name="password"'));assert.ok(html.toLowerCase().includes('autocomplete="'+(route.startsWith('/register')?'new-password':'current-password')+'"'));
  assert.equal(html.includes('name="tenantName"'),route==='/register?app=vendor');assert.equal(html.includes('name="categoryId"'),route==='/register?app=vendor');
 }
});
