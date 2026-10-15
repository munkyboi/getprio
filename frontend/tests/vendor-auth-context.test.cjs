require("tsx/cjs");
const test=require('node:test');
const assert=require('node:assert/strict');
const {isVendorLoginContext,vendorSignInRetryPath}=require('../src/vendor/authContext.ts');
test('vendor Login presentation requires a dashboard return target without widening shared identity',()=>{
 for(const path of ['/dashboard','/dashboard/bookings?workspace=operations','/dashboard/account?next=%2Fqueue-board%2Ffixture'])assert.equal(isVendorLoginContext(path),true);
 for(const path of [null,'/','/account/settings','/dashboard-other','https://external.invalid/dashboard','//external.invalid/dashboard'])assert.equal(isVendorLoginContext(path),false);
});

test("vendor provider retry retains query and hash without using an external target",()=>{
 const next="/dashboard/account?next=%2Fqueue-board%2Ffixture#security";
 const retry=new URL(vendorSignInRetryPath(next),"https://fixture.invalid");
 assert.equal(retry.pathname,"/login");
 assert.equal(retry.searchParams.get("next"),next);
 for(const path of [null,"/account/bookings","https://external.invalid/dashboard","//external.invalid/dashboard","/dashboard-other"])assert.equal(vendorSignInRetryPath(path),"/login");
});

const {vendorPasswordResetRequest}=require('../src/vendor/authContext.ts');
test('reset request forwards a valid vendor pairing target but leaves shared customer recovery unchanged',()=>{
 const target='/dashboard/settings?boardPairing=0123456789abcdef0123456789abcdef#queue-board';
 assert.deepEqual(vendorPasswordResetRequest('vendor@example.invalid',target),{email:'vendor@example.invalid',next:target});
 for(const target of [null,'/account/settings','https://evil.invalid/dashboard','//evil.invalid/dashboard','/dashboard/../../outside','/dashboard/%2f%2fevil.invalid','/dashboard\\evil','/dashboard\n'])assert.deepEqual(vendorPasswordResetRequest('vendor@example.invalid',target),{email:'vendor@example.invalid'});
});
