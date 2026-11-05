const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtemp, writeFile, readFile, stat, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const key = value => createHash('sha256').update(`synthetic:${value}`).digest('hex');
const at = minute => new Date(Date.UTC(2026,0,1,0,minute)).toISOString();
const predictorVersion = 'resource-service-start-shadow-v1';
function row(sequence = 1, changes = {}) {
  return { observationKey:key(`attempt${sequence}`),workKey:key('work'),scopeKey:key('scope'),poolKey:key('pool'),channel:'vendor',predictorVersion,
    attemptSequence:sequence,kind:sequence===1?'initial':'refresh',disposition:'accepted',reason:null,
    attemptedAt:at(sequence),observedAt:at(sequence),forecastedAt:at(sequence),acceptedAt:at(sequence),predictedServiceStartAt:at(20),
    queueRevision:String(sequence),snapshotObservedAt:at(sequence),delivery:{state:'private',at:null},outcome:{state:'started',at:at(25)}, ...changes };
}
function dataset(attempts) {
  return { datasetVersion:'resource-shadow-refresh-dataset-v2',provenance:'synthetic',from:at(0),to:at(60),outcomesAsOf:at(120),
    budgets:{maximumAdmittedPerWork:3,maximumAdmittedPerWindow:10,maximumDeliveryAgeMs:60000},attempts };
}
const fallback = changes => row(1,{disposition:'fallback',reason:'snapshot_provider_timeout',forecastedAt:null,acceptedAt:null,predictedServiceStartAt:null,queueRevision:null,snapshotObservedAt:null,delivery:{state:'not_delivered',at:null},...changes});
const dropped = changes => fallback({disposition:'dropped',reason:'work_budget',observedAt:null,...changes});
async function evaluator() { return (await import('../../scripts/resource-shadow-refresh-evaluation.mjs')).evaluateResourceRefreshes; }

test('offline refresh evaluation keeps initial fallback and refresh accuracy separate',async()=>{
  const evaluate=await evaluator();const report=evaluate(dataset([row(2),fallback()]));
  const initial=report.groups.find(group=>group.kind==='initial'),refresh=report.groups.find(group=>group.kind==='refresh');
  assert.equal(initial.fallback,1);assert.equal(initial.scoredAcceptedStarts,0);assert.equal(initial.acceptedAttemptCoveragePercent,0);
  assert.equal(refresh.accepted,1);assert.equal(refresh.acceptedAccuracy.maeMinutes,5);
  assert.equal(report.distinctWork,1);assert.equal(report.productionPerformanceEstablished,false);assert.equal(report.captureCoverageVerified,false);
});
test('drops budgets sequence gaps and missing initial windows remain visible without selecting by accuracy',async()=>{
  const evaluate=await evaluator();const data=dataset([dropped(),row(3),row(5)]);
  data.budgets.maximumAdmittedPerWork=1;data.budgets.maximumAdmittedPerWindow=1;
  const report=evaluate(data);assert.equal(report.unrecordedSequenceSlotsWithinWindow,2);assert.equal(report.workOverDeclaredAdmissionBudget,1);assert.equal(report.windowOverDeclaredAdmissionBudget,true);
  assert.equal(report.groups.find(group=>group.kind==='initial').dropped,1);
  const cropped=evaluate(dataset([row(3)]));assert.equal(cropped.workWithoutInitialInWindow,1);assert.equal(cropped.groups[0].kind,'refresh');
  assert.equal(evaluate(dataset([])).groups.length,0);
});
test('accepted delivered private stale and unknown-age forecasts have distinct diagnostic metrics',async()=>{
  const evaluate=await evaluator();const events=[row(1,{delivery:{state:'delivered',at:at(1)}}),row(2,{snapshotObservedAt:at(0),delivery:{state:'delivered',at:at(4)}}),row(3,{snapshotObservedAt:null,queueRevision:null,delivery:{state:'delivered',at:at(3)}}),row(4,{delivery:{state:'unknown',at:null}})];
  const refresh=evaluate(dataset(events)).groups.find(group=>group.kind==='refresh');
  assert.equal(refresh.delivered,2);assert.equal(refresh.staleDeliveries,1);assert.equal(refresh.unknownSnapshotAgeDeliveries,1);assert.equal(refresh.unknownDelivery,1);assert.equal(refresh.scoredDeliveredBeforeStart,2);assert.equal(refresh.scoredTimelyDeliveredStarts,0);assert.equal(refresh.unknownRevisionAdmittedAttempts,1);assert.equal(refresh.snapshotToDeliveryAge.maximumMs,240000);assert.equal(refresh.acceptanceToDeliveryAge.maximumMs,120000);
});
test('unaccepted forecasts late acceptance and post-start refreshes never become timely scored predictions',async()=>{
  const evaluate=await evaluator();const before={state:'started',at:at(2)};
  const refresh=evaluate(dataset([row(2,{acceptedAt:at(3),delivery:{state:'delivered',at:at(4)},outcome:before}),fallback({attemptSequence:3,kind:'refresh',observationKey:key('late'),attemptedAt:at(3),observedAt:at(3),forecastedAt:at(4),predictedServiceStartAt:at(20),outcome:before})])).groups[0];
  assert.equal(refresh.startsBeforeAcceptance,1);assert.equal(refresh.startsBeforeDelivery,1);assert.equal(refresh.unacceptedForecasts,1);assert.equal(refresh.scoredAcceptedStarts,0);assert.equal(refresh.scoredTimelyDeliveredStarts,0);
});
test('pending and censored attempts never acquire fabricated accuracy or promotion',async()=>{
  const evaluate=await evaluator();for(const outcome of [{state:'pending',at:null},{state:'censored',at:at(30)}]){
    const report=evaluate(dataset([row(1,{outcome})]));assert.equal(report.groups[0].scoredAcceptedStarts,0);assert.equal(report.rolloutApproved,false);assert.equal(report.privacyApprovalEstablished,false);assert.equal(report.deliveryVerified,false);
  }
});
test('strict shape identity chronology outcome sequence provenance and revision validation fail closed',async()=>{
  const evaluate=await evaluator();
  const mutations=[data=>data.customer='PII',data=>data.provenance='verified-production',data=>data.to=at(0),data=>data.budgets.maximumAdmittedPerWork=0,
    data=>data.attempts[0].workKey='raw-ticket-123',data=>data.attempts[0].queueRevision=1,data=>data.attempts[0].queueRevision='9223372036854775808',
    data=>data.attempts[0].kind='refresh',data=>data.attempts[0].attemptedAt=at(60),data=>data.attempts[0].acceptedAt=at(0),data=>data.attempts[0].outcome.at=at(121),
    data=>data.attempts[0].delivery={state:'delivered',at:at(0)},data=>data.attempts[0].snapshotObservedAt=at(2),data=>data.attempts[0].observedAt='2026-02-30T00:00:00Z'];
  for(const mutate of mutations){const data=dataset([row()]);mutate(data);assert.throws(()=>evaluate(data),/Invalid private/);}
  for(const second of [row(2,{observationKey:key('attempt1')}),row(2,{attemptSequence:1,kind:'initial'}),row(2,{channel:'online'}),row(2,{outcome:{state:'censored',at:at(25)}}),row(2,{attemptedAt:at(0)})])assert.throws(()=>evaluate(dataset([row(),second])),/Invalid private/);
  assert.throws(()=>evaluate(dataset([dropped({forecastedAt:at(1)})])),/Invalid private/);
});
test('event and group limits reject oversized inputs rather than truncate coverage',async()=>{
  const evaluate=await evaluator();assert.throws(()=>evaluate(dataset(Array(10001).fill(row()))),/Invalid private/);
  const events=Array.from({length:1001},(_,index)=>row(1,{observationKey:key(`observation${index}`),workKey:key(`work${index}`),scopeKey:key(`scope${index}`)}));
  assert.throws(()=>evaluate(dataset(events)),/Invalid private/);
});
test('equivalent outcome timestamps and input order preserve metrics without mutating supplied arrays',async()=>{
  const evaluate=await evaluator();const a=row(),b=row(2,{outcome:{at:'2026-01-01T00:25:00Z',state:'started'}});
  const data=dataset([b,a]);const before=JSON.stringify(data);assert.deepEqual(evaluate(data),evaluate(dataset([a,b])));assert.equal(JSON.stringify(data),before);
});
test('v1 initial-only dataset and scoring remain supported and are not silently treated as v2',async()=>{
  const {evaluateResourceServiceStarts}=await import('../../scripts/resource-shadow-evaluation.mjs');const evaluate=await evaluator();const event=row();
  const observation=Object.fromEntries(['observationKey','workKey','scopeKey','poolKey','channel','predictorVersion','observedAt','forecastedAt','acceptedAt','predictedServiceStartAt','outcome'].map(name=>[name,event[name]]));observation.fallbackReason=null;
  const old={datasetVersion:'resource-shadow-evaluation-dataset-v1',provenance:'synthetic',from:at(0),to:at(60),outcomesAsOf:at(120),observations:[observation]};
  assert.equal(evaluateResourceServiceStarts(old).groups[0].serviceStartAccuracy.maeMinutes,5);assert.throws(()=>evaluate(old),/Invalid private/);
});
test('CLI creates private bounded reports without identities in stdout and never overwrites files',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'resource-refresh-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const input=path.join(directory,'data.json'),output=path.join(directory,'report.json');await writeFile(input,JSON.stringify(dataset([row()])));
  const command=path.resolve(__dirname,'../../scripts/resource-shadow-refresh-evaluate.mjs');const args=[command,'--dataset',input,'--output',output];
  const result=await execFile(process.execPath,args);assert.equal(result.stdout.includes(key('work')),false);assert.equal((await stat(output)).mode&0o777,0o600);
  const bytes=await readFile(output);const report=JSON.parse(bytes);assert.equal(report.inputAttempts,1);assert.equal(report.datasetSha256.length,64);
  await assert.rejects(execFile(process.execPath,args));assert.deepEqual(await readFile(output),bytes);
  await writeFile(input,Buffer.alloc(8*1024*1024+1));await assert.rejects(execFile(process.execPath,[command,'--dataset',input,'--output',path.join(directory,'large.json')]));
  await writeFile(input,Buffer.from([0xff]));await assert.rejects(execFile(process.execPath,[command,'--dataset',input,'--output',path.join(directory,'bad.json')]));
});
