const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const evidence=path.resolve(__dirname,'../../output/approved-palette-20261025/browser-results.json');
const enabled=process.env.GETPRIO_PALETTE_BROWSER_EVIDENCE==='1';
test('actual palette gallery has readable enabled text, meaningful controls, visible focus, and isolated public surfaces',{skip:!enabled},()=>{
 const {sourceHashes,results,errors}=JSON.parse(fs.readFileSync(evidence,'utf8'));for(const [file,hash] of Object.entries(sourceHashes))assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../..',file))).digest('hex'),hash,`stale browser evidence: ${file}`);assert.deepEqual(errors,[]);assert.equal(results.length,10);
 for(const page of results){
  if(page.isolation){assert.equal(page.isolation.pass,true);continue;}
  assert.ok(page.text.length>0);
  for(const text of page.text){const large=parseFloat(text.font)>=24||(parseFloat(text.font)>=18.66&&+text.weight>=700);assert.ok(text.ratio>=(large?3:4.5),`${page.surface}/${page.theme}: ${text.text} ${text.ratio}`);}
  for(const edge of page.boundaries.filter(e=>e.required))assert.ok(edge.ratio>=3,`${page.surface}/${page.theme} ${edge.tag} boundary ${edge.ratio}`);
  for(const focus of page.focus){assert.ok(parseFloat(focus.width)>=3,`${page.surface}/${page.theme} focus width`);assert.ok(focus.ratio>=3,`${page.surface}/${page.theme} focus contrast ${focus.ratio}`);}
 }
});
