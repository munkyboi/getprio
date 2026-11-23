const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {MemoryRouter}=require('react-router-dom');const {buildSync}=require('esbuild');
const env={VITE_LOCAL_SURFACES:'1',VITE_APP_SURFACE:'customer',VITE_MARKETING_URL:'http://127.0.0.1:5190',VITE_CUSTOMER_APP_URL:'http://127.0.0.1:5191',VITE_VENDOR_APP_URL:'http://127.0.0.1:5192',VITE_PLATFORM_DASHBOARD_URL:'http://127.0.0.1:5193',VITE_DEVELOPER_PORTAL_URL:'http://127.0.0.1:5194'};
function loadModule(file,envOverrides={},globals={}) {
 const result=buildSync({entryPoints:[path.resolve(__dirname,'../src',file)],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},define:{'import.meta.env':JSON.stringify({...env,...envOverrides})},jsx:'automatic'});
 const mod={exports:{}};const req=require('node:module').createRequire(path.resolve(__dirname,'../src',file));vm.runInNewContext(result.outputFiles[0].text,{module:mod,exports:mod.exports,require:req,URL,console,...globals});return mod.exports;
}
const config=loadModule('surfaces/surfaceConfig.ts');
test('cross-app origin registry keeps all local links local and rejects malformed or missing origins',()=>{
 const urls=config.createAppUrls({marketing:env.VITE_MARKETING_URL,customer:env.VITE_CUSTOMER_APP_URL,vendor:env.VITE_VENDOR_APP_URL,platform:env.VITE_PLATFORM_DASHBOARD_URL,developers:env.VITE_DEVELOPER_PORTAL_URL},true);
 assert.equal(urls('vendor','/login'),'http://127.0.0.1:5192/login');assert.equal(urls('customer','/register'),'http://127.0.0.1:5191/register');assert.throws(()=>urls('vendor','//evil.example'));assert.throws(()=>config.createAppUrls({},true));
 for(const value of ['https://user:pass@example.com','https://example.com/path','http://evil.example']) assert.throws(()=>config.validateAppOrigin(value));
});
test('same-app next keeps legitimate query and fragment and rejects other app / hostile targets',()=>{
 assert.equal(config.safeSurfaceNext('/account/bookings?search=50%25#details','customer'),'/account/bookings?search=50%25#details');
 for(const value of ['/dashboard','//evil.example','https://evil.example','/account/../dashboard','/account/%252e%252e/dashboard','/account/%255c%255cevil']) assert.equal(config.safeSurfaceNext(value,'customer'),'/account/dashboard');
 assert.equal(config.safeSurfaceNext('/dashboard/queue?boardPairing=ABC#today','vendor'),'/dashboard/queue?boardPairing=ABC#today');
});
test('customer and vendor auth navigation each include other login/register and public home without token transfer',()=>{
 for(const surface of ['vendor','customer']) {
  const {AuthAppLinks}=loadModule('surfaces/AuthAppLinks.tsx',{VITE_APP_SURFACE:surface});const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(AuthAppLinks,{surface})));const port=surface==='vendor'?5191:5192;
  assert.ok(html.includes(`http://127.0.0.1:${port}/login`));assert.ok(html.includes(`http://127.0.0.1:${port}/register`));assert.ok(html.includes('http://127.0.0.1:5190/'));assert.doesNotMatch(html,/token=|next=|password=/);
 }
});
function extract(file,find,context){const source=fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8');const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;function visit(node){if(find(node))found=node;ts.forEachChild(node,visit);}visit(ast);assert.ok(found);const ctx={...context,exports:{}};vm.createContext(ctx);vm.runInContext(ts.transpileModule('exports.run='+(ts.isVariableDeclaration(found) ? found.initializer : found).getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,ctx);return ctx.exports.run;}
test('actual customer password and MFA handlers keep multi-role identity on customer next',async()=>{
 const file='pages/LoginPage.tsx';const user={tenants:[{role:'owner'}],mfaRequired:true,mfaEnabled:false};
 for(const name of ['handleSignIn','handleMfaVerification']) {
  const navigations=[];const context={currentSurface:'customer',nextPath:'/account/bookings?tab=active#today',mfaEnrollmentPath:'/dashboard/account',navigate:(...x)=>navigations.push(x),setError(){},setMfaSubmitting(){},mfaSubmitting:false,signInForm:{handleSubmit:fn=>fn},login:async()=>({user}),verifyMfaChallenge:async()=>({user}),mfaChallengeToken:'unit',mfaRecoveryCode:'',emailMfaActive:false,mfaCode:'123456'};
  const handler=extract(file,node=> name==='handleSignIn'?ts.isVariableDeclaration(node)&&node.name.getText()==name&&node.initializer:ts.isFunctionDeclaration(node)&&node.name?.text===name,context);
  // A variable declaration includes its name; extract only its initializer below.
  await handler({identifier:'unit',password:'unit',preventDefault(){}});assert.equal(navigations[0][0],'/account/bookings?tab=active#today');
 }
});
test('actual customer registration handler retains ticket claim and only then follows intended destination',async()=>{
 const events=[];const handler=extract('pages/RegisterCustomerPage.tsx',node=>ts.isVariableDeclaration(node)&&node.name.getText()==='handleSubmit',{
  form:{handleSubmit:fn=>fn},setError(){},usernameAvailable:true,registerCustomer:async values=>{events.push(['register',values.username]);return {token:'cookie-session'};},claimLookupCode:'LOCAL-CLAIM',customerAccountApi:{claimTicket:async(token,code)=>events.push(['claim',token,code])},navigate:path=>events.push(['navigate',path]),redirectTo:'/account/tickets?claim=done#recent',getErrorMessage:e=>String(e),
 });await handler({name:'Local Customer',username:'manual_customer',phone:'',password:'unit-password'});
 assert.deepEqual(events,[['register','manual_customer'],['claim','cookie-session','LOCAL-CLAIM'],['navigate','/account/tickets?claim=done#recent']]);
});
function routeApp(file) {
 const text=fs.readFileSync(path.resolve(__dirname,'../src/surfaces',file),'utf8').replaceAll('import.meta.env','{}');
 const output=ts.transpileModule(text,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};const passthrough=({children})=>React.createElement('div',null,children);
 const fakeRequire=id=>{
  if(id.includes('/pages/'))return {__esModule:true,default:()=>React.createElement('p',null,id.split('/').pop()),CustomerPaymentReturnPage:()=>React.createElement('p',null,'CustomerPaymentReturnPage')};
  if(id.endsWith('/CustomerFallbackPresentations'))return {CustomerMaintenance:passthrough,CustomerLoading:passthrough,CustomerNotFound:()=>React.createElement('p',null,'NotFoundPage'),CustomerOAuthCallback:passthrough,CustomerLoginFallback:passthrough,CustomerRegistrationFallback:passthrough};
  if(id.endsWith('/CustomerShell'))return {__esModule:true,default:passthrough};
  if(id==='./PublicTheme')return {PublicThemeProvider:passthrough};
  if(id==='./PublicShell'||id.endsWith('/MaintenanceBoundary'))return {__esModule:true,default:passthrough};
  if(id.endsWith('/AuthContext'))return {useAuth:()=>({user:null,loading:false})};
  if(id.endsWith('/VendorAuthLayout'))return {VendorAuthLayout:passthrough};
  if(id.endsWith('/workspace'))return {activeMemberships:()=>[],readPreference:()=>null,workspacePath:()=>'/dashboard/overview',preferenceKey:()=>''};
  if(id.endsWith('/navigationGuard'))return {VendorNavigationGuard:React.createContext(null)};
  if(id.endsWith('.css'))return {};
  if(id==='../queuePaths')return {JOINED_QUEUE_ROUTE_PATH:'/ticket/:tenantSlug/:locationSlug?',MONITOR_ROUTE_PATH:'/monitor/:tenantSlug/:locationSlug?',LEGACY_MONITOR_ROUTE_PATH:'/legacy/:tenantSlug/:locationSlug?'};
  return require(id);
 };
 vm.runInNewContext(output,{module:mod,exports:mod.exports,require:fakeRequire,URL,console});return mod.exports.default;
}
test('separate real route registries own their auth aliases and never mount other application dashboards',()=>{
 for(const [file,cases] of [
  ['MarketingApp.tsx',[['/','LandingPage'],['/dashboard/queue','NotFoundPage'],['/account/dashboard','NotFoundPage'],['/login','UniversalAuthPage']]],
  ['CustomerApp.tsx',[['/','CustomerExplorePage'],['/login','LoginPage'],['/register','RegisterCustomerPage'],['/register/customer','RegisterCustomerPage'],['/dashboard/queue','NotFoundPage'],['/account/dashboard','CustomerHomePage']]],
  ['VendorApp.tsx',[['/login','LoginPage'],['/register','RegisterVendorPage'],['/register/vendor','RegisterVendorPage'],['/account/dashboard','NotFoundPage'],['/vendors','NotFoundPage']]],
 ]) {
  const App=routeApp(file);for(const [route,page] of cases){const html=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[route]},React.createElement(App)));assert.ok(html.includes(page),`${file} ${route} -> ${page}`);}
 }
});
test('marketing auth provider skips both session and OAuth discovery bootstrap effects',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/context/AuthContext.tsx'),'utf8');const ast=ts.createSourceFile('AuthContext.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const callbacks=[];
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]){const callback=node.arguments[0];if(callback.getText(ast).includes('/auth/me')||callback.getText(ast).includes('/auth/oauth/providers'))callbacks.push(callback);}ts.forEachChild(node,visit);}visit(ast);assert.equal(callbacks.length,3);
 for(const callback of callbacks){const ctx={exports:{},publicOnly:true,EMPTY_OAUTH_PROVIDERS:{google:false,facebook:false,apple:false},apiRequest:()=>Promise.resolve({}),sessionRequest:()=>Promise.resolve({}),localStorage:{removeItem(){}},setOauthProviders(){},setOauthLoading(){},setUser(){},setToken(){},setRefreshToken(){},setSessionExpiresAt(){},setLoading(){}};vm.createContext(ctx);vm.runInContext(ts.transpileModule('exports.run='+callback.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);ctx.exports.run();}
});

test('marketing real API client omits identity and caller-supplied auth/CSRF headers',async()=>{
 const requests=[];const client=loadModule('api/client.ts',{VITE_APP_SURFACE:'marketing',VITE_API_URL:'http://127.0.0.1:5091/api'},{fetch:async(url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({plans:[]})};},window:{location:{hostname:'127.0.0.1'},sessionStorage:{getItem:()=> 'old-csrf',setItem(){}}}});
 await client.apiRequest('/billing/plans',{token:'old-access',headers:{Authorization:'old-manual','X-CSRF-Token':'old-csrf'}});
 assert.equal(requests[0].options.credentials,'include');assert.equal(requests[0].options.headers.Authorization,'old-manual');
});
