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

const {pool}=require('../backend/src/config/db');
const prefix='/vendor/tenant/vd-sports-club/queue';
const controls=()=>request(prefix+'/counter-controls?location=demo-courts&counterSlug=court-dispatch&requestKey='+randomUUID());
const call=async(command,status=200)=>request(prefix+'/plans/'+command.planId+'/call?location=demo-courts',command.body,status);
try {
 let c=await controls();
 assert.equal(c.fifoNext.ticketNumber,'VD004');assert.equal(c.next.ticketNumber,'VD006');
 assert.equal(c.actions.callNext.command.planId,c.fifoNext.planId);assert.equal(c.actions.callNextEligible.command.planId,c.next.planId);
 await call(c.actions.callNext.command,409);
 console.log('PASS: FIFO attempts VD004 and reports conflict without skipping');
 await pool.query("UPDATE tickets SET join_channel='online' WHERE ticket_number='VD006'");
 c=await controls();let p=(await call(c.actions.callNextEligible.command)).plan;
 c=await controls();assert.equal(c.current.ticketNumber,'VD006');assert.equal(c.actions.confirm.command.kind,'scan');assert.equal(c.actions.start.blockReason.code,'CUSTOMER_CONFIRMATION_REQUIRED');
 console.log('PASS: eligible action calls VD006; remote ticket requires confirmation');
 const startBody={expectedTicketRevision:p.ticketRevision,expectedPlanRevision:p.planRevision,currentStageId:p.currentStage.id,expectedStageRevision:p.currentStage.revision,reservationGroupId:p.reservationGroups.find(g=>g.state==='protected').id};
 const premature=await request(prefix+'/plans/'+p.id+'/start?location=demo-courts',startBody,409);assert.equal(premature.code,'CUSTOMER_CONFIRMATION_REQUIRED');
 const binding={ticketId:c.current.ticketId,counterSlug:'court-dispatch',expectedCounterId:c.scope.counterId};
 await request(prefix+'/current/confirm?location=demo-courts',{...binding,lookupCode:'00000000'},409);
 const t=(await pool.query("SELECT lookup_code FROM tickets WHERE ticket_number='VD006'")).rows[0];
 await request(prefix+'/current/confirm?location=demo-courts',{...binding,lookupCode:t.lookup_code});
 c=await controls();assert.equal(c.actions.confirm.enabled,false);assert.equal(c.actions.start.enabled,true);assert.equal(c.current.serviceStartedAt,null);
 console.log('PASS: wrong code rejected; matching code confirms arrival without starting service');
 p=(await request(prefix+'/plans/'+p.id+'?location=demo-courts')).plan;
 await request(prefix+'/plans/'+p.id+'/start?location=demo-courts',{...startBody,expectedTicketRevision:p.ticketRevision,expectedPlanRevision:p.planRevision,expectedStageRevision:p.currentStage.revision});
 console.log('PASS: confirmed remote ticket can start service');
} finally {await pool.end();}
