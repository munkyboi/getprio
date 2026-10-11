const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {loadModuleWithMocks} = require('./helpers/loadModuleWithMocks.cjs');

test('account barcode endpoint authenticates server owner, preserves contract and rejects Sandbox without issuing', async () => {
  const calls=[];
  const response={barcodeToken:'QB'+'A'.repeat(32),issuedAt:'2026-10-11T01:00:00.000Z',expiresAt:'2026-10-11T01:02:00.000Z',serverNow:'2026-10-11T01:00:01.000Z'};
  const router=loadModuleWithMocks(require.resolve('../src/routes/accountRoutes'),{
    '../middleware/auth':{authenticate:(req,res,next)=>{const id=req.get('x-owner');if(!id)return res.status(401).json({message:'Sign in'});req.user={_id:id};next();}},
    '../middleware/moderatePublicText':{moderatePublicText:(_req,_res,next)=>next()},
    '../services/ticketBarcodeService':{issueForOwner:async(id,user)=>{calls.push([id,user]);if(id==='2')throw Object.assign(new Error('Unavailable'),{statusCode:409,code:'TICKET_BARCODE_UNAVAILABLE'});if(id==='3')throw Object.assign(new Error('Not found'),{statusCode:404});return response;}}
  });
  const app=express();app.set('trust proxy',true);app.use(router);app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({message:error.message,code:error.code}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/queue/tickets/1/barcode`)).status,401);
    const success=await fetch(`${base}/queue/tickets/9007199254740993/barcode?userId=spoof`,{headers:{'x-owner':'9007199254740995'}});assert.equal(success.status,200);assert.equal(success.headers.get('cache-control'),'no-store');assert.deepEqual(await success.json(),response);assert.deepEqual(calls,[['9007199254740993','9007199254740995']]);
    for(const [id,status] of [['2',409],['3',404]]){const result=await fetch(`${base}/queue/tickets/${id}/barcode`,{headers:{'x-owner':'1'}});assert.equal(result.status,status);assert.equal(result.headers.get('cache-control'),'no-store');}
    const count=calls.length;const sandbox=await fetch(`${base}/queue/tickets/1/barcode`,{headers:{'x-owner':'1','x-forwarded-host':'sandbox-api.getprio.online'}});assert.equal(sandbox.status,404);assert.equal(calls.length,count);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
