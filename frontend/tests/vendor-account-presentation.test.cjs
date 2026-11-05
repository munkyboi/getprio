process.env.TSX_TSCONFIG_PATH = require("node:path").resolve(__dirname, "../tsconfig.json");
require("tsx/cjs");
const test=require("node:test");
const assert=require("node:assert/strict");
const React=require("react");
const {renderToStaticMarkup}=require("react-dom/server");
const {AccountPresentation}=require("../src/vendor/AccountPresentation.tsx");
const {SimpleGrid}=require("../src/vendor/AccountFields.tsx");
const {draftUnloadHandler}=require("../src/vendor/draftUnloadGuard.ts");

test("executed vendor grid retains responsive two, three and four column requests",()=>{
 for(const cols of [{base:1,sm:2},{base:1,sm:3},{base:1,sm:2,md:4},{base:1,sm:2,lg:4}]) {
  const html=renderToStaticMarkup(React.createElement(AccountPresentation,{onBusyChange(){},onDraftChange(){}},
   React.createElement(SimpleGrid,{cols},React.createElement("span",null,"Account field"))));
  assert.match(html,/account-responsive-grid/);
  for(const [breakpoint,count] of Object.entries(cols))assert.ok(html.includes(`--account-cols-${breakpoint}:${count}`));
 }
});
test("one installed unload handler sees account challenges as they change and stop",()=>{
 const state={form:false,account:false,mfa:false,security:false};
 const warn=draftUnloadHandler(()=>state.form||state.account||state.mfa||state.security);
 const warned=()=>{const event={returnValue:undefined,preventDefault(){this.prevented=true}};warn(event);return event;};
 assert.equal(warned().prevented,undefined);
 for(const kind of ["account","mfa","form","security"]){state[kind]=true;assert.equal(warned().prevented,true);assert.equal(warned().returnValue,"");state[kind]=false;assert.equal(warned().prevented,undefined);}
});
