/* global process, console, fetch */
// HTTP acceptance against a fresh disposable fixture, never a public deployment.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const artifactPath = process.argv[2];
if (!artifactPath || (fs.statSync(artifactPath).mode & 0o077) !== 0) throw new Error('Private fixture artifact required.');
const fixture = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
if (!/^getprio_local_pool_demo_sse_\d+$/.test(fixture.databaseName)) throw Error('Isolated test clone required');
Object.assign(process.env, fixture.env);
const { localPoolDemoConfiguration } = require('../backend/src/services/localPoolDemoScope.js');
if (!localPoolDemoConfiguration()) throw new Error('Disposable loopback fixture required.');
const { generateTotp } = require('../backend/src/services/mfaService.js');
const base = 'http://127.0.0.1:5008/api';
const cookies = new Map();
let csrf = '';
async function request(path, body, expected = 200) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5188',
      'Idempotency-Key': randomUUID(), ...(csrf ? {'X-CSRF-Token':csrf} : {}),
      ...(cookies.size ? {Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')} : {}) },
    ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(';',1)[0]; const index = pair.indexOf('=');
    cookies.set(pair.slice(0,index),pair.slice(index+1));
  }
  const data = await response.json();
  assert.equal(response.status,expected, `${path}: ${response.status}: ${data.message || 'unexpected response'}`);
  if (data.csrfToken) csrf=data.csrfToken;
  return data;
}
const credentials = fixture.admin || fixture.credentials;
const login = await request('/auth/login',{identifier:credentials.email,password:credentials.password});
assert.equal(login.mfaRequired,true,'Normal privileged MFA must remain enabled.');
await request('/auth/mfa/verify',{challengeToken:login.challengeToken,method:'totp',code:generateTotp(credentials.totpSecret)});


const prefix='/vendor/tenant/vd-sports-club/queue',query='?location=demo-courts';
const controls=()=>request(prefix+'/counter-controls'+query+'&counterSlug=court-dispatch&requestKey='+randomUUID());
const read=async id=>(await request(prefix+'/plans/'+id+query)).plan;
const guarded=(p,extra={})=>({expectedTicketRevision:p.ticketRevision,expectedPlanRevision:p.planRevision,currentStageId:p.currentStage.id,expectedStageRevision:p.currentStage.revision,...extra});
const initial=await controls();assert.equal(initial.fifoNext.ticketNumber,'VD004');assert.equal(initial.next.ticketNumber,'VD006');
const active=(await request(prefix+'/plans'+query+'&state=active')).plans;
const current=active.find(p=>p.ticketNumber==='VD003');
await request(prefix+'/plans/'+current.id+'/complete'+query,guarded(current,{completeAll:true,allocationGroupId:current.allocationGroups.find(g=>!g.releasedAt).id}));
const available=await controls();assert.equal(available.next.ticketNumber,'VD004');
let selected=await read(active.find(p=>p.ticketNumber==='VD006').id);
selected=(await request(prefix+'/plans/'+selected.id+'/call'+query,guarded(selected,{counterSlug:'court-dispatch',expectedCounterId:available.scope.counterId,dispatchMode:'selectedRequest'}))).plan;
assert.equal(selected.ticketNumber,'VD006');assert.equal(selected.state,'called');
assert.equal((await read(available.next.planId)).state,'waiting');
console.log('PASS: selected-request call calls VD006 while automatic candidate VD004 stays waiting');
