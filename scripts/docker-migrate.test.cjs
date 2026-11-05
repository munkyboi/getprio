const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const runner=path.join(__dirname,'../database/docker-migrate.sh');

test('Docker runner validates every filename before touching PostgreSQL', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'getprio-migration-order-test-'));
  try {
    const bin=path.join(root,'bin');fs.mkdirSync(bin);
    const calls=path.join(root,'calls');
    fs.writeFileSync(path.join(bin,'psql'),'#!/bin/sh\nprintf "call\\n" >> "$CALLS"\nprintf "t\\n"\n',{mode:0o700});
    const directory=path.join(root,'migrations');fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory,'a.sql'),'-- synthetic');fs.writeFileSync(path.join(directory,'b.sql'),'-- synthetic');
    const env={...process.env,GETPRIO_MIGRATIONS_DIR:directory,PATH:bin+path.delimiter+process.env.PATH,CALLS:calls,POSTGRES_USER:'fixture',POSTGRES_DB:'fixture'};
    const run=()=>spawnSync('sh',[runner],{env,encoding:'utf8'});
    for(const content of [null,'a.sql\na.sql\n','a.sql\n','a.sql\nb.sql\nmissing.sql\n','../a.sql\nb.sql\n','a.sql\n$(touch unsafe).sql\n']) {
      const manifest=path.join(directory,'migration-order.txt');
      if(content===null)fs.rmSync(manifest,{force:true});else fs.writeFileSync(manifest,content);
      assert.notEqual(run().status,0);assert.equal(fs.existsSync(calls),false,'invalid inventory must cause zero database calls');
    }
    fs.writeFileSync(path.join(directory,'migration-order.txt'),'b.sql\na.sql\n');
    fs.symlinkSync(path.join(directory,'a.sql'),path.join(directory,'extra.sql'));
    assert.notEqual(run().status,0);assert.equal(fs.existsSync(calls),false);
    fs.unlinkSync(path.join(directory,'extra.sql'));
    assert.equal(run().status,0);
    assert.equal(fs.readFileSync(calls,'utf8'),'call\ncall\n');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
