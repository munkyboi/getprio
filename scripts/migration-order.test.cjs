const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {DEPENDENCIES, orderMigrationNames, orderedMigrationFiles} = require('./helpers/migration-order.cjs');

test('unrelated migrations retain lexical order and names are never rewritten', () => {
  const names=['003.sql','001.sql','002.sql'];
  assert.deepEqual(orderMigrationNames(names),['001.sql','002.sql','003.sql']);
  assert.deepEqual(names,['003.sql','001.sql','002.sql']);
});
test('real migration inventory orders every explicit prerequisite before its dependent, including final V4 constraint', () => {
  const directory=path.join(__dirname,'../database/migrations');
  const files=orderedMigrationFiles(directory),names=files.map(file=>path.basename(file));
  assert.equal(names.length,fs.readdirSync(directory).filter(file=>file.endsWith('.sql')).length);
  for(const [name,dependencies] of Object.entries(DEPENDENCIES))for(const dependency of dependencies)assert.ok(names.indexOf(dependency)<names.indexOf(name),`${dependency} precedes ${name}`);
  assert.ok(names.indexOf('20261017_selection_child_execution.sql')<names.indexOf('20261017_queue_service_configuration_v4.sql'));
  const unrelated=names.filter(name=>!Object.hasOwn(DEPENDENCIES,name)&&!Object.values(DEPENDENCIES).flat().includes(name));
  assert.deepEqual(unrelated,[...unrelated].sort());
});
test('missing prerequisite, cycle and duplicate names fail before producing an apply order', () => {
  assert.throws(()=>orderMigrationNames(['dependent.sql'],{'dependent.sql':['missing.sql']}),/requires missing file/);
  assert.throws(()=>orderMigrationNames(['a.sql','b.sql'],{'a.sql':['b.sql'],'b.sql':['a.sql']}),/dependency cycle/);
  assert.throws(()=>orderMigrationNames(['a.sql','a.sql']),/Duplicate migration/);
});
