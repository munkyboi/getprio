const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModuleWithMocks } = require('./helpers/loadModuleWithMocks.cjs');
const env = { nodeEnv: 'development', clientUrl: 'http://127.0.0.1:5191', appBaseUrl: 'http://127.0.0.1:5191', customerAppUrl: 'http://127.0.0.1:5191', vendorAppUrl: 'http://127.0.0.1:5192', paymongoSecretKey: 'unit-test-only', paymongoApiUrl: 'https://provider.invalid', paymongoPaymentMethodTypes: ['card'] };
test('staff reconciliation targets Vendor and customer ticket links stay customer', () => {
 const service = loadModuleWithMocks(require.resolve('../src/services/queueEmailTemplates'), { '../config/env': env });
 const tenant = { name: 'Test Vendor', slug: 'test-vendor' };
 const email = service.queueReconciliationEmail({ tenant, location: { name: 'Test Location' } });
 for (const content of [email.text,email.html]) assert.match(content, /http:\/\/127\.0\.0\.1:5192\/dashboard\/queue/);
 assert.equal(service.buildQueueTicketUrl(tenant,{lookupCode:'TEST'}),'http://127.0.0.1:5191/ticket/test-vendor?ticket=TEST');
});
test('credit checkout restricts Vendor returns with safe fallback and legacy compatibility', async () => {
 const originalFetch=global.fetch; let sent;
 global.fetch=async (_url,request)=>{sent=JSON.parse(request.body).data.attributes;return {ok:true,json:async()=>({data:{id:'checkout',attributes:{checkout_url:'https://provider.invalid/session'}}})};};
 const pack={id:'pack',state:'enabled',ticket_units:100,journey_units:0,revision_id:'revision',price_cents:9900,currency:'PHP',name:'Test Pack',code:'P100'};
 const service=loadModuleWithMocks(require.resolve('../src/services/usageCreditService'),{
 '../config/env':env,'../config/releaseControls':{usageCreditCheckout:true},
 './entitlementResolver':{resolveTenantPolicy:async()=>({lifecycle:{state:'active'}})},
 '../repositories/usageCredits':{findPack:async()=>pack,createPurchase:async()=>({id:'purchase',pack_id:'pack',pack_revision_id:'revision',amount_cents:9900,currency:'PHP',ticket_units:100}),attachProviderCheckout:async()=>{}}
 });
 const checkout=requestOrigin=>service.createCheckout({tenant:{_id:'tenant',name:'Test Vendor'},user:{_id:'user'},packCode:'P100',purchaseKey:'test',requestOrigin});
 try {
  for(const [requestOrigin,expected] of [[env.vendorAppUrl,env.vendorAppUrl],['http://localhost:5192/','http://localhost:5192'],[env.customerAppUrl,env.vendorAppUrl],['https://evil.invalid',env.vendorAppUrl],['http://127.0.0.1:5192.evil.invalid',env.vendorAppUrl],[undefined,env.vendorAppUrl]]) {
   await checkout(requestOrigin);assert.equal(sent.success_url,`${expected}/dashboard?credits=success&purchase=purchase`);assert.equal(sent.cancel_url,`${expected}/dashboard?credits=cancelled`);
  }
  const vendor=env.vendorAppUrl;delete env.vendorAppUrl;
  try {await checkout('https://evil.invalid');assert.equal(sent.cancel_url,`${env.clientUrl}/dashboard?credits=cancelled`);}finally{env.vendorAppUrl=vendor;}
 }finally{global.fetch=originalFetch;}
});
