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
if (!/^getprio_local_pool_demo_sse_\d+$/.test(fixture.databaseName) || new URL(fixture.env.DATABASE_URL).pathname !== '/' + fixture.databaseName) throw new Error('Use a fresh isolated SSE database clone; never the active demo.');
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

const prefix='/vendor/tenant/vd-sports-club/queue';
const query='?location=demo-courts';
const readControls=()=>request(prefix+'/counter-controls'+query+'&counterSlug=court-dispatch&requestKey='+randomUUID());
const readPlan=async id=>(await request(prefix+'/plans/'+id+query)).plan;
const guarded=(plan,extra={})=>({expectedTicketRevision:plan.ticketRevision,expectedPlanRevision:plan.planRevision,currentStageId:plan.currentStage.id,expectedStageRevision:plan.currentStage.revision,...extra});
const streamAbort=new AbortController();
const stream=await fetch(base+prefix+'/stream'+query,{headers:{Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),Origin:'http://127.0.0.1:5188'},signal:streamAbort.signal});
assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/text\/event-stream/);
let waiting=null,readyResolve;const ready=new Promise(r=>readyResolve=r);const evidence=[];
const consume=(async()=>{const reader=stream.body.getReader();let buffer='';try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=new TextDecoder().decode(value);let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(frame.includes('event: ready'))readyResolve();if(frame.includes('event: queue-plans-updated')&&waiting){const payload=JSON.parse(frame.split('data: ')[1]);if(payload.planId===waiting.id){const w=waiting;waiting=null;readControls().then(controls=>w.resolve({controls,elapsedMs:Date.now()-w.at})).catch(w.reject);}}}}}catch(e){if(e.name!=='AbortError')throw e;}})();
await ready;
async function command(plan,action,extra={}){
 let timer;const event=new Promise((resolve,reject)=>{waiting={id:plan.id,resolve,reject,at:Date.now()};timer=setTimeout(()=>reject(new Error('Missing SSE for '+action)),4000);});
 try{const result=await request(prefix+'/plans/'+plan.id+'/'+action+query,guarded(plan,extra));const observed=await event;console.log(JSON.stringify({action,event:true,next:observed.controls.next?.ticketNumber,elapsedMs:observed.elapsedMs}));return {plan:result.plan,...observed};}finally{clearTimeout(timer);waiting=null;}
}
try{
 const initial=await readControls();assert.equal(initial.next.ticketNumber,'VD006');
 const active=(await request(prefix+'/plans'+query+'&state=active')).plans;
 let current=active.find(p=>p.ticketNumber==='VD003');
 let result=await command(current,'complete',{completeAll:true,allocationGroupId:current.allocationGroups.find(g=>!g.releasedAt).id});
 assert.equal(result.controls.next.ticketNumber,'VD004');evidence.push({action:'complete',from:'VD006',to:'VD004',event:true,elapsedMs:result.elapsedMs});
 let blocker=await readPlan(result.controls.next.planId);
 result=await command(blocker,'call',{counterSlug:'court-dispatch'});blocker=result.plan;
 result=await command(blocker,'start',{reservationGroupId:blocker.reservationGroups.find(g=>g.state==='protected').id});blocker=result.plan;
 const beforeInterrupt=result.controls.next?.ticketNumber;
 while(blocker.childAttempts.some(c=>c.isCurrent&&c.state==='in_service')){
  const child=blocker.childAttempts.find(c=>c.isCurrent&&c.state==='in_service'&&c.selectionKind==='resource')||blocker.childAttempts.find(c=>c.isCurrent&&c.state==='in_service');
  const extras=blocker.childAttempts.filter(c=>c.isCurrent&&c.state==='in_service'&&c.parentChildAttemptId===child.childAttemptId).map(c=>({childAttemptId:c.childAttemptId,expectedChildRevision:c.revision}));
  result=await command(blocker,'interrupt',{childAttemptId:child.childAttemptId,expectedChildRevision:child.revision,allocationGroupId:child.allocationGroupId,interruptedExtras:extras,reason:'Isolated SSE verification'});blocker=result.plan;
 }
 assert.notEqual(result.controls.next?.ticketNumber,beforeInterrupt);evidence.push({action:'interrupt',from:beforeInterrupt,to:result.controls.next?.ticketNumber,event:true,elapsedMs:result.elapsedMs});
 let held=await readPlan(result.controls.next.planId);const heldNumber=held.ticketNumber;
 result=await command(held,'call',{counterSlug:'counter2'});held=result.plan;const beforeRelease=result.controls.next?.ticketNumber;
 result=await command(held,'cancelProtection',{reservationGroupId:held.reservationGroups.find(g=>g.state==='protected').id,reason:'Isolated SSE verification: release queue hold'});
 assert.equal(result.controls.next?.ticketNumber,heldNumber);assert.notEqual(beforeRelease,heldNumber);evidence.push({action:'queue-hold release',from:beforeRelease,to:heldNumber,event:true,elapsedMs:result.elapsedMs});
 fs.writeFileSync('.local-preview/sse-verification-results.json',JSON.stringify({polling:false,evidence},null,2));console.log(JSON.stringify({passed:true,polling:false,evidence}));
}finally{streamAbort.abort();await consume;}
