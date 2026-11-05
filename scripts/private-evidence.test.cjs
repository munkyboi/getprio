const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {writePrivateEvidence} = require('./helpers/private-evidence.cjs');
test('evidence uses atomic unique private directories and private regular files', () => {
  const outputs=[];
  try {
    for (let i=0;i<2;i++) {
      const output=writePrivateEvidence({fixture:'synthetic',index:i}); outputs.push(output);
      assert.equal(fs.statSync(path.dirname(output)).mode & 0o777,0o700);
      assert.equal(fs.lstatSync(output).isFile(),true);
      assert.equal(fs.statSync(output).mode & 0o777,0o600);
      assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),{fixture:'synthetic',index:i});
      assert.throws(()=>fs.writeFileSync(output,'overwrite',{flag:'wx'}),{code:'EEXIST'});
    }
    assert.notEqual(path.dirname(outputs[0]),path.dirname(outputs[1]));
  } finally { for(const output of outputs)fs.rmSync(path.dirname(output),{recursive:true,force:true}); }
});
