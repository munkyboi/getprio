require('tsx/cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const {confirmCurrentTicket}=require('../src/api/vendorDashboardQueue.ts');

test('vendor scanner sends rotating credentials separately and keeps ordinary ticket codes',async()=>{
  const original=global.fetch;const requests=[];
  global.fetch=async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({ticket:{id:'1',status:'called'}}),{status:200,headers:{'Content-Type':'application/json'}});};
  try{const value='QB'+'A'.repeat(32);await confirmCurrentTicket('auth','demo','?location=main',value);await confirmCurrentTicket('auth','demo','?location=main','ABC12345');assert.deepEqual(JSON.parse(requests[0].options.body),{barcodeToken:value});assert.deepEqual(JSON.parse(requests[1].options.body),{lookupCode:'ABC12345'});assert.equal(requests[0].url,requests[1].url);assert.match(requests[0].url,/queue\/current\/confirm\?location=main$/);}
  finally{global.fetch=original;}
});
