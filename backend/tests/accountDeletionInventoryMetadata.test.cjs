const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');
const databaseUrl = process.env.ACCOUNT_DELETION_TEST_DATABASE_URL;

const legacyQuery = `
  SELECT tc.table_schema,tc.table_name,kcu.column_name,rc.delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_catalog=tc.constraint_catalog AND kcu.constraint_schema=tc.constraint_schema
    AND kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema AND kcu.table_name=tc.table_name
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_catalog=tc.constraint_catalog AND ccu.constraint_schema=tc.constraint_schema AND ccu.constraint_name=tc.constraint_name
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_catalog=tc.constraint_catalog AND rc.constraint_schema=tc.constraint_schema AND rc.constraint_name=tc.constraint_name
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema=current_schema()
    AND ccu.table_schema=current_schema() AND ccu.table_name='users' AND ccu.column_name='id'`;
const source = fs.readFileSync(path.join(__dirname,'../src/services/accountDeletionInventoryService.js'),'utf8');
const optimizedQuery = source.match(/const \{ rows: foreignKeys \} = await client.query\(`([\s\S]*?)`\);/)[1];
const sortedRows = rows => rows.map(row=>JSON.stringify(row)).sort((a,b)=>a<b?-1:Number(a>b));

test('scoped FK inventory retains metadata and caller visibility without expanded view joins', {skip:!databaseUrl}, async () => {
  const url = new URL(databaseUrl);
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  assert.equal(url.pathname,'/getprio_deletion_test');
  const token = randomUUID().replaceAll('-','');
  const schema = `inventory_fk_${token}`, other = `inventory_other_${token}`;
  const reader = `inventory_read_${token}`, writer = `inventory_write_${token}`, owner = `inventory_owner_${token}`;
  const {Client} = require('pg');
  const client = new Client({connectionString:databaseUrl});
  await client.connect();
  try {
    await client.query(`CREATE ROLE ${reader} NOLOGIN; CREATE ROLE ${writer} NOLOGIN; CREATE ROLE ${owner} NOLOGIN;
      CREATE SCHEMA ${schema}; CREATE SCHEMA ${other}; SET search_path=${schema};
      CREATE TABLE users(id BIGINT PRIMARY KEY,scope_id BIGINT,UNIQUE(id,scope_id),UNIQUE(scope_id,id));
      CREATE TABLE composite_link(id BIGINT PRIMARY KEY,actor_id BIGINT,scope_id BIGINT,
        FOREIGN KEY(actor_id,scope_id) REFERENCES users(id,scope_id) ON DELETE RESTRICT);
      CREATE TABLE reversed_link(id BIGINT PRIMARY KEY,actor_id BIGINT,scope_id BIGINT,
        FOREIGN KEY(scope_id,actor_id) REFERENCES users(scope_id,id) ON DELETE CASCADE);
      CREATE TABLE first_link(id BIGINT PRIMARY KEY,actor_id BIGINT,CONSTRAINT shared_reference FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE CASCADE);
      CREATE TABLE second_link(id BIGINT PRIMARY KEY,actor_id BIGINT,CONSTRAINT shared_reference FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL);
      CREATE TABLE unrelated(id BIGINT PRIMARY KEY);
      CREATE TABLE other_target(id BIGINT PRIMARY KEY,actor_id BIGINT REFERENCES unrelated(id));
      CREATE TABLE ${other}.cross_schema_link(id BIGINT PRIMARY KEY,actor_id BIGINT,CONSTRAINT shared_reference FOREIGN KEY(actor_id) REFERENCES users(id));
      INSERT INTO users VALUES(1,10);
      INSERT INTO composite_link VALUES(1,1,10); INSERT INTO reversed_link VALUES(1,1,10);
      INSERT INTO first_link VALUES(1,1); INSERT INTO second_link VALUES(1,1);
      GRANT USAGE ON SCHEMA ${schema} TO ${reader},${writer},${owner};
      GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${reader};
      GRANT SELECT ON users TO ${writer}; GRANT UPDATE(actor_id) ON first_link TO ${writer};
      ALTER TABLE users OWNER TO ${owner};
      GRANT SELECT ON first_link TO ${owner};`);
    const compare = async () => {
      const oldRows=(await client.query(legacyQuery)).rows, newRows=(await client.query(optimizedQuery)).rows;
      assert.deepEqual(sortedRows(newRows),sortedRows(oldRows));
      return newRows;
    };
    await client.query("SET statement_timeout='10s'");
    const all = await compare();
    assert.ok(all.some(row=>row.table_name==='composite_link' && row.column_name==='actor_id'));
    assert.ok(all.some(row=>row.table_name==='reversed_link' && row.column_name==='actor_id'));
    assert.ok(all.some(row=>row.table_name==='first_link' && row.delete_rule==='CASCADE'));
    assert.ok(all.some(row=>row.table_name==='second_link' && row.delete_rule==='SET NULL'));
    assert.ok(all.every(row=>row.table_schema===schema && !['other_target','cross_schema_link'].includes(row.table_name)));
    const oldModule={exports:{}};
    vm.runInNewContext(source.replace(optimizedQuery,legacyQuery),{module:oldModule,require});
    const oldReport=await oldModule.exports.collectRelationalInventory(client,1);
    const newReport=await require('../src/services/accountDeletionInventoryService').collectRelationalInventory(client,1);
    delete oldReport.generatedAt; delete newReport.generatedAt;
    // The metadata SELECT has no ORDER BY; each source's deletion rules form a set.
    const normalizeReport=report=>JSON.parse(JSON.stringify({...report,sources:report.sources.map(item=>
      ({...item,deleteRules:[...item.deleteRules].sort((a,b)=>a<b?-1:Number(a>b))}))}));
    assert.deepEqual(normalizeReport(newReport),normalizeReport(oldReport),
      'inventory counts, reference identities, delete-rule sets and completeness remain unchanged');
    // Preserve legacy composite/duplicate-name multiplicity; this change only bounds planning.
    await client.query(`SET ROLE ${reader}`); assert.deepEqual(await compare(),[]); await client.query('RESET ROLE');
    await client.query(`SET ROLE ${writer}`); assert.deepEqual(await compare(),[]); await client.query('RESET ROLE');
    await client.query(`SET ROLE ${owner}`); assert.deepEqual(await compare(),[]); await client.query('RESET ROLE');
    await client.query(`GRANT UPDATE(actor_id) ON first_link TO ${owner}; SET ROLE ${owner}`);
    const visible = await compare();
    assert.ok(visible.length>0); assert.ok(visible.every(row=>row.table_name==='first_link' && row.column_name==='actor_id'));
    await client.query('RESET ROLE');
    const plan=(await client.query('EXPLAIN (ANALYZE, FORMAT JSON) '+optimizedQuery)).rows[0]['QUERY PLAN'][0];
    assert.ok(Number.isFinite(plan['Planning Time']) && Number.isFinite(plan['Execution Time']));
  } finally {
    await client.query('RESET ROLE');
    await client.query(`DROP SCHEMA IF EXISTS ${other} CASCADE; DROP SCHEMA IF EXISTS ${schema} CASCADE;
      DROP ROLE IF EXISTS ${reader}; DROP ROLE IF EXISTS ${writer}; DROP ROLE IF EXISTS ${owner}`);
    await client.end();
  }
});
