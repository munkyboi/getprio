require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {isLocalPoolPreviewEnabled}=require('../src/vendor/localPreviewEligibility.ts');
test('local preview needs explicit demo opt-in, a dev or explicit local build, and exact loopback host',()=>{
 const allowed=['localhost','127.0.0.1','[::1]'];
 const rejected=['','::1','LOCALHOST','localhost.evil.test','127.0.0.2','0.0.0.0','vendor.getprio.online','vendor.localhost'];
 for(const dev of [false,true])for(const localSurfaces of [undefined,'0','1','true'])for(const localPoolDemo of [undefined,'0','1','true'])for(const hostname of [...allowed,...rejected]){
  assert.equal(isLocalPoolPreviewEnabled({dev,localSurfaces,localPoolDemo,hostname}),Boolean((dev||localSurfaces==='1')&&localPoolDemo==='1'&&allowed.includes(hostname)),JSON.stringify({dev,localSurfaces,localPoolDemo,hostname}));
 }
});
test('built production hooks render enabled only in explicit local profile and keep DTO validation',{skip:process.env.GETPRIO_LOCAL_PREVIEW_BROWSER_EVIDENCE!=='1'},()=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const report=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../output/approved-palette-20261025/local-preview-build-results.json'),'utf8'));
 for(const [file,hash] of Object.entries(report.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../..',file))).digest('hex'),hash,`stale evidence ${file}`);
 assert.equal(report.cases.length,4);
 for(const row of report.cases){assert.deepEqual(row.errors,[]);assert.equal(row.buildDev,false);assert.equal(row.enabled,row.expected);assert.equal(row.localMode,row.expected);if(!row.expected)assert.equal(row.resourceRequests,0);else{assert.ok(row.resourceRequests>0);assert.equal(row.status,row.invalidScope?'error':'success');}}
});
