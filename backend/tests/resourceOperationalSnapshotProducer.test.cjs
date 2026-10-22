const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createResourceOperationalSnapshotProducer } = require('../src/services/resourceOperationalSnapshotProducer');
const { validateResourceOperationalSnapshot } = require('../src/services/resourceOperationalSnapshot');
const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
const scope = { tenantId: '1', locationId: '10', queueKind: 'location', sourceBinding: 'isolated-runtime' };

test('snapshot producer requires explicit configuration and canonical scope before connecting', async () => {
  assert.throws(() => createResourceOperationalSnapshotProducer({}), /configuration/);
  const read = createResourceOperationalSnapshotProducer({ pool: { connect: () => assert.fail('must not connect') },
    sourceBinding: scope.sourceBinding, authorize: async () => true });
  await assert.rejects(read({ ...scope, tenantId: '01' }), /scope/);
  await assert.rejects(read({ ...scope, locationId: '9223372036854775808' }), /scope/);
});

test('PostgreSQL not-ready snapshot producer', { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['/getprio_ledger_test', '/getprio_test'].includes(url.pathname));
  const { Pool } = require('pg');
  const schema = `snapshot_test_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  try {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT);
      CREATE TABLE resource_ledger_scopes(tenant_id BIGINT,location_id BIGINT,writer_coverage_complete BOOLEAN);
      CREATE TABLE location_resource_pools(tenant_id BIGINT,location_id BIGINT,tracking_enabled BOOLEAN);
      INSERT INTO store_locations VALUES(10,1),(20,2);
      INSERT INTO resource_ledger_scopes VALUES(1,10,FALSE),(2,20,TRUE);
      INSERT INTO location_resource_pools VALUES(1,10,FALSE),(2,20,TRUE)`);
    const read = createResourceOperationalSnapshotProducer({ pool, sourceBinding: scope.sourceBinding, authorize: async (client, authorizedScope) => {
      assert.deepEqual(authorizedScope, scope);
      assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on');
      assert.equal((await client.query('SHOW transaction_isolation')).rows[0].transaction_isolation, 'repeatable read');
      return true;
    } });
    await t.test('disabled/uncovered scope emits immutable accepted v1 envelope without inventory', async () => {
      const value = await read(scope);
      assert.equal(value.readiness, 'not_ready');
      assert.equal(value.snapshot, null);
      assert.deepEqual(value.reasons, ['tracking_disabled','writer_coverage_incomplete']);
      assert.ok(Object.isFrozen(value) && Object.isFrozen(value.scope) && Object.isFrozen(value.reasons));
      assert.deepEqual(validateResourceOperationalSnapshot(Buffer.from(JSON.stringify(value)), {
        expectedScope: scope, nowMs: Date.now(), forecastUntilMs: Date.now()+60000, maximumAgeMs: 5000
      }), value);
    });
    await t.test('wrong location scope and denied actor cannot retrieve diagnostics', async () => {
      await assert.rejects(read({ ...scope, locationId: '20' }), { statusCode: 404 });
      const denied = createResourceOperationalSnapshotProducer({ pool, sourceBinding: scope.sourceBinding, authorize: async () => false });
      await assert.rejects(denied(scope), { statusCode: 403 });
    });
    await t.test('readiness gates come from the same repeatable-read snapshot as authorization', async () => {
      const coherent = createResourceOperationalSnapshotProducer({ pool, sourceBinding: scope.sourceBinding,
        authorize: async () => {
          // The location read has established this reader's snapshot. Another
          // transaction changes both gates before the reader inspects them.
          await pool.query('UPDATE resource_ledger_scopes SET writer_coverage_complete=TRUE WHERE tenant_id=1');
          await pool.query('UPDATE location_resource_pools SET tracking_enabled=TRUE WHERE tenant_id=1');
          return true;
        } });
      assert.deepEqual((await coherent(scope)).reasons, ['tracking_disabled','writer_coverage_incomplete']);
    });
    await t.test('hypothetical enabled/covered flags never produce ready without inventory', async () => {
      await pool.query('UPDATE resource_ledger_scopes SET writer_coverage_complete=TRUE WHERE tenant_id=1');
      await pool.query('UPDATE location_resource_pools SET tracking_enabled=TRUE WHERE tenant_id=1');
      assert.deepEqual((await read(scope)).reasons, ['inventory_incomplete']);
    });
    await t.test('missing scoped control is unavailable despite another covered location', async () => {
      await pool.query('DELETE FROM resource_ledger_scopes WHERE tenant_id=1');
      assert.deepEqual((await read(scope)).reasons, ['ledger_unavailable','writer_coverage_incomplete']);
    });
    await t.test('missing ledger schema returns unavailable after rollback without mutation', async () => {
      await pool.query('DROP TABLE resource_ledger_scopes');
      assert.deepEqual((await read(scope)).reasons, ['ledger_unavailable']);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM store_locations')).rows[0].count, 2);
    });
  } finally { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); }
});
