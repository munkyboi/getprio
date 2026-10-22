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
Object.assign(process.env, fixture.env);
const { localPoolDemoConfiguration } = require('../backend/src/services/localPoolDemoScope.js');
if (!localPoolDemoConfiguration()) throw new Error('Disposable loopback fixture required.');
const { generateTotp } = require('../backend/src/services/mfaService.js');
const base = 'http://127.0.0.1:5007/api';
const cookies = new Map();
let csrf = '';
async function request(path, body, expected = 200) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5187',
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
const tenant = fixture.tenantSlug || fixture.fixture.tenantSlug;
const location = fixture.locationSlug || fixture.fixture.locationSlug;
const prefix = `/vendor/tenant/${tenant}`;
const read = () => request(`${prefix}/locations/${location}/resource-operations`);
const command = (id,action,expected=200) => request(`${prefix}/queue/tickets/${id}/service/${action}?location=${location}`,{},expected);
const call = async () => (await request(`${prefix}/queue/call-next?location=${location}`,{counterSlug:fixture.counterSlug || 'reception'})).ticket.id;
if (process.argv.includes('--observe-only')) {
  const snapshot=await read();
  console.log(JSON.stringify({authenticated:true,localDemo:snapshot.localDemo,revision:snapshot.ledgerRevision,activeSessions:snapshot.activeSessions.length,pools:snapshot.pools,reconciliation:snapshot.reconciliation}));
  process.exit(0);
}
const evidence=[];
function capture(label,snapshot) {
  assert.equal(snapshot.localDemo,true);
  assert.equal(snapshot.forecastReadiness,'not_evaluated');
  assert.equal(snapshot.reconciliation.required,false,JSON.stringify(snapshot.reconciliation.issues));
  const pool = snapshot.pools.find(row=>row.id===String(fixture.fixture.poolId));
  assert.ok(pool);
  assert.equal(pool.overCapacity,false);
  assert.ok(pool.allocatedUnits<=pool.capacity);
  evidence.push({label,asOf:snapshot.asOf,revision:snapshot.ledgerRevision,pool,
    activeSessions:snapshot.activeSessions,called:snapshot.called.map(t=>({id:t.id,status:t.status})),
    waiting:snapshot.waiting.length,counterDispatch:snapshot.counterDispatch});
  return snapshot;
}
const initial=capture('fresh',await read());
assert.equal(initial.activeSessions.length,0,'Use a freshly seeded fixture.');
const started=[];
for(let i=0;i<4;i++) { const id=await call(); await command(id,'start'); started.push(id); }
const full=capture('four_concurrent',await read());
assert.equal(full.activeSessions.length,4);
assert.equal(new Set(full.activeSessions.map(s=>s.id)).size,4);
assert.equal(full.pools[0].allocatedUnits,4);
const fifth=await call(); await command(fifth,'start',409);
assert.equal(capture('fifth_rejected',await read()).activeSessions.length,4);
// Exact-ticket retries must not double-release or finish a different session.
await Promise.all([command(started[0],'complete'),command(started[0],'complete')]);
assert.equal(capture('independent_complete',await read()).activeSessions.length,3);
await command(started[1],'interrupt');
assert.equal(capture('independent_interrupt',await read()).activeSessions.length,2);
await command(fifth,'start');
const sixth=await call(); await command(sixth,'start');
const refilled=capture('released_units_reassigned',await read());
assert.equal(refilled.activeSessions.length,4);
assert.ok(refilled.activeSessions.some(s=>s.ticketId===fifth));
assert.ok(refilled.activeSessions.some(s=>s.ticketId===sixth));
const seventh=await call(); await command(seventh,'start',409);
const final=capture('visible_demo_four_active_one_capacity_blocked',await read());
assert.equal(final.activeSessions.length,4);
const { writePrivateEvidence } = require('./helpers/private-evidence.cjs');
const output=writePrivateEvidence({localOnly:true,fixtureDatabase:fixture.databaseName,
  authenticatedWithPasswordAndTotp:true,evidence});
console.log(JSON.stringify({passed:true,steps:evidence.length,activeSessions:4,fifthStartRejected:true,
  independentCompleteInterrupt:true,reassignment:true,evidence:output,
  evidenceSha256:createHash('sha256').update(fs.readFileSync(output)).digest('hex')}));
