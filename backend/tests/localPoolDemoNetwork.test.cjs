/* global require, fetch, Request */
/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
test('local launcher blocks external fetch and socket destinations before connection',async()=>{
 const {installLocalDemoNetworkGuard}=await import('../../scripts/helpers/localDemoNetworkGuard.mjs');
 const restore=installLocalDemoNetworkGuard();
 try{
  await assert.rejects(fetch('https://api.resend.com/emails'),{code:'LOCAL_DEMO_OUTBOUND_DISABLED'});
  await assert.rejects(fetch(new Request('https://api.paymongo.com/v1/checkout_sessions')),{code:'LOCAL_DEMO_OUTBOUND_DISABLED'});
  const socket=new net.Socket();
  assert.throws(()=>socket.connect({host:'smtp.example.com',port:587}),{code:'LOCAL_DEMO_OUTBOUND_DISABLED'});
  assert.throws(()=>socket.connect(443,'203.0.113.1'),{code:'LOCAL_DEMO_OUTBOUND_DISABLED'});
  socket.destroy();
  const server=net.createServer(s=>s.end('local'));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const data=await new Promise((resolve,reject)=>{const s=net.connect(server.address().port,'127.0.0.1');s.once('data',d=>resolve(d.toString()));s.once('error',reject);});assert.equal(data,'local');}
  finally{await new Promise(resolve=>server.close(resolve));}
 }finally{restore();}
});

test('local launcher rejects effective and inherited SMS and storage credentials', async () => {
 const { assertLocalDemoProvidersEmpty } = await import('../../scripts/helpers/localDemoProviderConfiguration.mjs');
 assert.doesNotThrow(() => assertLocalDemoProvidersEmpty({}, {}));
 for (const key of ['smsAccountSid', 'smsAuthToken', 'b2KeyId', 'b2ApplicationKey', 'b2S3Endpoint', 'b2BucketPublicBoard', 'b2BucketPaymentProof', 'b2PublicBaseUrl']) {
  assert.throws(() => assertLocalDemoProvidersEmpty({ [key]: 'populated' }, {}), /Provider credentials must be empty/);
 }
 for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_S3_ENDPOINT', 'B2_BUCKET_PUBLIC_BOARD', 'B2_BUCKET_PAYMENT_PROOF', 'B2_PUBLIC_BASE_URL']) {
  assert.throws(() => assertLocalDemoProvidersEmpty({}, { [key]: 'populated' }), /Provider credentials must be empty/);
 }
});

test('local launcher rejects inherited OAuth configuration', async () => {
 const { assertLocalDemoProvidersEmpty } = await import('../../scripts/helpers/localDemoProviderConfiguration.mjs');
 for (const key of ['googleClientId','googleClientSecret','facebookAppId','facebookAppSecret','appleClientId','appleTeamId','appleKeyId','applePrivateKey']) {
  assert.throws(() => assertLocalDemoProvidersEmpty({[key]:'populated'}, {}), /Provider credentials must be empty/);
 }
 for (const key of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','FACEBOOK_APP_ID','FACEBOOK_APP_SECRET','APPLE_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY']) {
  assert.throws(() => assertLocalDemoProvidersEmpty({}, {[key]:'populated'}), /Provider credentials must be empty/);
 }
});
